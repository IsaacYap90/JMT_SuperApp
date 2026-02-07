import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface ClassItem {
  id: string;
  name: string;
  description: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  capacity: number;
  lead_coach_id: string;
  lead_coach?: {
    full_name: string;
  };
  isMyClass?: boolean; // Flag to indicate if this coach is assigned to this class
  assignedCoaches?: Array<{
    coach_id: string;
    full_name: string;
    is_lead: boolean;
  }>;
  myRole?: 'lead' | 'assistant' | null;
}

interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  member_name: string;
  session_type?: string;
  commission_amount?: number | null;
  coach_verified?: boolean;
}

// Unified timeline item
interface TimelineItem {
  id: string;
  type: 'class' | 'pt';
  time: string;
  title: string;
  subtitle: string;
  details: string;
  isPassed: boolean;
  isAssistant?: boolean;
  sessionType?: string;
  commission?: number;
  data: ClassItem | PTSession;
}

const DAY_COLUMN_WIDTH = 120;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Coach Color Mapping - Each coach gets a unique color for visual distinction
const COACH_COLORS: Record<string, string> = {
  'jeremy@jmt.com': '#00BFFF',  // Jai Blue (the boss)
  'isaac@jmt.com': '#FFD700',   // Yellow/Gold
  'shafiq@jmt.com': '#9B59B6',  // Purple
  'sasi@jmt.com': '#2ECC71',    // Green
  'heng@jmt.com': '#FF8C00',    // Orange
  'larvin@jmt.com': '#FF69B4',  // Pink
};

// Helper function to get coach color by email
const getCoachColorByEmail = (email: string): string => {
  if (!email) return Colors.jaiBlue; // fallback to Jai Blue
  return COACH_COLORS[email.toLowerCase()] || Colors.jaiBlue;
};

export const CoachScheduleScreen: React.FC = () => {
  const { user } = useAuth();
  const [view, setView] = useState<'today' | 'weekly'>('today');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [todayPTSessions, setTodayPTSessions] = useState<PTSession[]>([]);
  const [upcomingPTSessions, setUpcomingPTSessions] = useState<PTSession[]>([]);
  const [weeklyPTSessions, setWeeklyPTSessions] = useState<PTSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [classEnrolledCount, setClassEnrolledCount] = useState<number>(0);

  // Calendar sync state
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch assigned coaches for a class
  const fetchAssignedCoaches = async (classId: string) => {
    const { data } = await supabase
      .from('class_coaches')
      .select('coach_id, is_lead, users:coach_id(full_name)')
      .eq('class_id', classId);

    return (data || []).map(item => ({
      coach_id: item.coach_id,
      full_name: (item.users as any)?.full_name || 'Unknown',
      is_lead: item.is_lead || false,
    }));
  };

  // Format coach role display
  const formatCoachRole = (cls: ClassItem): string => {
    if (!cls.assignedCoaches || cls.assignedCoaches.length === 0) {
      return 'No coaches assigned';
    }

    const myCoach = cls.assignedCoaches.find(c => c.coach_id === user?.id);
    if (!myCoach) {
      // Not assigned to this class - show lead coach
      const leadCoach = cls.assignedCoaches.find(c => c.is_lead);
      return leadCoach ? `Lead: ${leadCoach.full_name.split(' ')[0]}` : 'TBC';
    }

    // Get other coaches
    const otherCoaches = cls.assignedCoaches.filter(c => c.coach_id !== user?.id);

    if (myCoach.is_lead) {
      // I'm the lead
      if (otherCoaches.length === 0) {
        return 'Lead (Solo)';
      }
      const otherNames = otherCoaches.map(c => c.full_name.split(' ')[0]).join(', ');
      return `Lead • with ${otherNames}`;
    } else {
      // I'm an assistant
      const leadCoach = cls.assignedCoaches.find(c => c.is_lead);
      if (!leadCoach) {
        return 'Assistant';
      }
      const leadName = leadCoach.full_name.split(' ')[0];
      const otherAssistants = otherCoaches.filter(c => !c.is_lead);

      if (otherAssistants.length === 0) {
        return `Assistant • with ${leadName} (Lead)`;
      }
      const otherNames = otherAssistants.map(c => c.full_name.split(' ')[0]).join(', ');
      return `Assistant • with ${leadName} (Lead), ${otherNames}`;
    }
  };

  const fetchClasses = async () => {
    if (!user?.id) {
      console.log('[fetchClasses] No user ID, returning early');
      return;
    }

    console.log(`[fetchClasses] ===== START =====`);
    console.log(`[fetchClasses] User ID: ${user.id}`);

    // Step 1: Fetch ALL classes from the classes table (no coach filter)
    console.log('[fetchClasses] Step 1: Fetch ALL classes from gym schedule');
    const { data: allClassesData, error: allClassesError } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        description,
        day_of_week,
        start_time,
        end_time,
        capacity,
        is_active,
        lead_coach_id,
        lead_coach:lead_coach_id (full_name)
      `)
      .eq('is_active', true)
      .order('start_time', { ascending: true });

    if (allClassesError) {
      console.log('[fetchClasses] Error fetching all classes:', allClassesError);
      return;
    }

    console.log('[fetchClasses] Total classes in gym:', allClassesData?.length || 0);

    // Step 2: Fetch which classes THIS coach is assigned to (from junction table)
    console.log('[fetchClasses] Step 2: Fetch coach assignments from class_coaches');
    const { data: coachAssignments, error: assignmentError } = await supabase
      .from('class_coaches')
      .select('class_id')
      .eq('coach_id', user.id);

    if (assignmentError) {
      console.log('[fetchClasses] Error fetching coach assignments:', assignmentError);
    }

    // Create a Set of class IDs that this coach is assigned to
    const myClassIds = new Set(coachAssignments?.map(cc => cc.class_id) || []);
    console.log('[fetchClasses] Coach is assigned to:', myClassIds.size, 'classes');
    console.log('[fetchClasses] My class IDs:', Array.from(myClassIds));

    // Step 3: Mark which classes belong to this coach and fetch assigned coaches
    const classesWithAssignments = await Promise.all(
      (allClassesData || []).map(async (cls) => {
        const assignedCoaches = await fetchAssignedCoaches(cls.id);
        const myAssignment = assignedCoaches.find(coach => coach.coach_id === user.id);

        return {
          ...cls,
          isMyClass: myClassIds.has(cls.id),
          assignedCoaches,
          myRole: myAssignment ? (myAssignment.is_lead ? 'lead' : 'assistant') : null,
        };
      })
    );

    console.log('[fetchClasses] Final classes count:', classesWithAssignments.length);
    console.log('[fetchClasses] My classes:', classesWithAssignments.filter(c => c.isMyClass).map(c => c.name));
    console.log(`[fetchClasses] ===== END =====`);

    setClasses(classesWithAssignments);
  };

  // Helper: Group buddy sessions - show only ONE card per time slot
  const groupBuddySessions = (sessions: any[]): PTSession[] => {
    const sessionMap = new Map<string, any>();

    sessions.forEach(item => {
      // Use scheduled_at + session_type as key to group buddy sessions
      const key = `${item.scheduled_at}_${item.session_type}`;

      if (item.session_type === 'buddy') {
        // For buddy sessions, only keep the first member's entry
        if (!sessionMap.has(key)) {
          sessionMap.set(key, {
            id: item.id,
            scheduled_at: item.scheduled_at,
            duration_minutes: item.duration_minutes,
            status: item.status,
            member_name: (item.member as any)?.full_name || 'Unknown Member',
            session_type: item.session_type,
            commission_amount: item.commission_amount,
          });
        }
        // Skip duplicate buddy sessions at same time slot
      } else {
        // Non-buddy sessions: use just scheduled_at as key
        const soloKey = item.scheduled_at;
        if (!sessionMap.has(soloKey)) {
          sessionMap.set(soloKey, {
            id: item.id,
            scheduled_at: item.scheduled_at,
            duration_minutes: item.duration_minutes,
            status: item.status,
            member_name: (item.member as any)?.full_name || 'Unknown Member',
            session_type: item.session_type,
            commission_amount: item.commission_amount,
          });
        }
      }
    });

    return Array.from(sessionMap.values())
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  };

  const fetchPTSessions = async () => {
    if (!user?.id) return;

    // Get today's date range in Singapore timezone
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000; // UTC+8 in milliseconds

    // Get current time in Singapore
    const nowInSingapore = new Date(now.getTime() + singaporeOffset);
    const year = nowInSingapore.getUTCFullYear();
    const month = nowInSingapore.getUTCMonth();
    const day = nowInSingapore.getUTCDate();

    // Start of today in Singapore = midnight Singapore time
    // We need to convert this back to UTC for the database query
    const startOfTodaySingapore = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const startOfTodayUTC = new Date(startOfTodaySingapore.getTime() - singaporeOffset);

    // End of today in Singapore = 23:59:59 Singapore time
    const endOfTodaySingapore = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    const endOfTodayUTC = new Date(endOfTodaySingapore.getTime() - singaporeOffset);

    // End of week in Singapore (6 days from today)
    const endOfWeekSingapore = new Date(Date.UTC(year, month, day + 6, 23, 59, 59, 999));
    const endOfWeekUTC = new Date(endOfWeekSingapore.getTime() - singaporeOffset);

    console.log('========================================');
    console.log('[PT QUERY] Date range:', startOfTodayUTC.toISOString(), 'to', endOfWeekUTC.toISOString());
    console.log('[PT QUERY] Coach ID:', user.id);
    console.log('========================================');

    // Fetch ALL PT sessions for the week (single query)
    const { data: weekData, error: weekError } = await supabase
      .from('pt_sessions')
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        status,
        session_type,
        commission_amount,
        coach_verified,
        member:member_id (full_name)
      `)
      .eq('coach_id', user.id)
      .gte('scheduled_at', startOfTodayUTC.toISOString())
      .lte('scheduled_at', endOfWeekUTC.toISOString())
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true });

    console.log('[PT RAW] Total rows fetched:', weekData?.length || 0);
    console.log('[PT RAW] Full data:');
    weekData?.forEach((d, i) => {
      console.log(`  [${i + 1}] id=${d.id}`);
      console.log(`      scheduled_at=${d.scheduled_at}`);
      console.log(`      member_id=${d.member_id}`);
      console.log(`      member_name=${(d.member as any)?.full_name}`);
      console.log(`      session_type=${d.session_type}`);
      console.log(`      commission_amount=${d.commission_amount}`);
    });

    if (weekError) {
      console.log('[PT ERROR]', weekError);
      return;
    }

    // Now process the data - first split into today and upcoming
    const todayCutoff = endOfTodayUTC.toISOString();
    const todayRaw = (weekData || []).filter(d => d.scheduled_at <= todayCutoff);
    const upcomingRaw = (weekData || []).filter(d => d.scheduled_at > todayCutoff);

    console.log('[PT PROCESS] Today sessions:', todayRaw.length);
    console.log('[PT PROCESS] Upcoming sessions:', upcomingRaw.length);

    // Group buddy sessions for each view
    const todayGrouped = groupBuddySessions(todayRaw);
    const upcomingGrouped = groupBuddySessions(upcomingRaw);

    console.log('[PT RESULT] Today after grouping:', todayGrouped.length);
    todayGrouped.forEach((s, i) => {
      console.log(`  [${i + 1}] ${s.scheduled_at} - ${s.member_name} (${s.session_type})`);
    });

    console.log('[PT RESULT] Upcoming after grouping:', upcomingGrouped.length);
    upcomingGrouped.forEach((s, i) => {
      console.log(`  [${i + 1}] ${s.scheduled_at} - ${s.member_name} (${s.session_type})`);
    });

    setTodayPTSessions(todayGrouped);
    setUpcomingPTSessions(upcomingGrouped);
    // Store grouped sessions for weekly view to avoid duplicates
    const allGrouped = groupBuddySessions(weekData || []);
    setWeeklyPTSessions(allGrouped);
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchClasses(), fetchPTSessions()]);
    setLoading(false);
  };

  // Fetch calendar token for the user
  const fetchCalendarToken = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('calendar_token')
        .eq('id', user.id)
        .single();

      if (error) {
        // If no calendar_token, generate one
        if (error.code === 'PGRST116') {
          await generateCalendarToken();
        }
        return;
      }

      if (data?.calendar_token) {
        setCalendarToken(data.calendar_token);
      } else {
        await generateCalendarToken();
      }
    } catch (err) {
      console.log('[Calendar] Error fetching token:', err);
    }
  };

  // Generate a new calendar token
  const generateCalendarToken = async () => {
    if (!user?.id) return;

    setCalendarLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('generate_calendar_token', { user_uuid: user.id });

      if (error) throw error;

      if (data) {
        setCalendarToken(data);
      }
    } catch (err) {
      console.log('[Calendar] Error generating token:', err);
      Alert.alert('Error', 'Failed to generate calendar token');
    } finally {
      setCalendarLoading(false);
    }
  };

  // Copy calendar URL to clipboard
  const copyCalendarUrl = async () => {
    if (!calendarToken) return;

    const calendarUrl = `https://xioimcyqglfxqumvbqsg.supabase.co/functions/v1/calendar/${calendarToken}.ics`;

    try {
      await Clipboard.setStringAsync(calendarUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      Alert.alert('Error', 'Failed to copy URL to clipboard');
    }
  };

  // Share calendar URL via native share sheet
  const shareCalendarUrl = async () => {
    if (!calendarToken) return;

    const calendarUrl = `https://xioimcyqglfxqumvbqsg.supabase.co/functions/v1/calendar/${calendarToken}.ics`;

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(calendarUrl, {
          dialogTitle: 'Share Calendar Subscription URL',
        });
      } else {
        // Fallback to clipboard
        await copyCalendarUrl();
      }
    } catch (error) {
      console.error('Failed to share:', error);
      Alert.alert('Error', 'Failed to share calendar URL');
    }
  };

  // Open calendar URL
  const openCalendarUrl = async () => {
    if (!calendarToken) return;

    const calendarUrl = `https://xioimcyqglfxqumvbqsg.supabase.co/functions/v1/calendar/${calendarToken}.ics`;
    try {
      const supported = await Linking.canOpenURL(calendarUrl);
      if (supported) {
        await Linking.openURL(calendarUrl);
      } else {
        // Fallback - show in alert
        Alert.alert('Calendar URL', calendarUrl);
      }
    } catch (err) {
      console.log('[Calendar] Error opening URL:', err);
    }
  };

  // Handle sync button press
  const handleCalendarSyncPress = () => {
    if (!calendarToken) {
      fetchCalendarToken().then(() => {
        setCalendarModalVisible(true);
      });
    } else {
      setCalendarModalVisible(true);
    }
  };

  // Format date for alert
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    // Convert to Singapore timezone
    const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return sgDate.toLocaleDateString('en-SG', {
      timeZone: 'UTC', // Since we already adjusted the time, use UTC to avoid double conversion
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  // Handle Mark Attended for PT session
  const handleMarkAttended = async (session: PTSession) => {
    console.log('[MarkAttended] Session data:', {
      id: session.id,
      scheduled_at: session.scheduled_at,
      coach_verified: session.coach_verified,
      status: session.status,
      currentTime: new Date().toISOString(),
    });

    Alert.alert(
      'Mark as Attended',
      `Confirm that you conducted the PT session with ${session.member_name} on ${formatDate(session.scheduled_at)} at ${formatPTDateTime(session.scheduled_at).time}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('pt_sessions')
                .update({
                  coach_verified: true,
                  verification_date: new Date().toISOString(),
                })
                .eq('id', session.id);

              if (error) throw error;

              Alert.alert('Success', 'Session marked as attended!');
              fetchPTSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update session');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  useEffect(() => {
    if (view === 'weekly' && scrollViewRef.current) {
      setTimeout(() => {
        const todayOffset = 7 * (DAY_COLUMN_WIDTH + 8);
        scrollViewRef.current?.scrollTo({ x: Math.max(0, todayOffset), animated: false });
      }, 100);
    }
  }, [view]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchClasses(), fetchPTSessions()]);
    setRefreshing(false);
  };

  // Helper to get current date/time in Singapore timezone
  const getSingaporeDate = () => {
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000; // UTC+8
    return new Date(now.getTime() + singaporeOffset);
  };

  const getDayOfWeek = (date: Date): string => {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()];
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const isTimePassed = (startTime: string, date: Date) => {
    if (!startTime) return false;
    const nowSG = getSingaporeDate();
    const [hours, minutes] = startTime.split(':').map(Number);
    const classDateTime = new Date(date);
    classDateTime.setUTCHours(hours, minutes, 0, 0);
    return nowSG > classDateTime;
  };

  // Get today in Singapore timezone
  const today = getSingaporeDate();
  const todayDayOfWeek = getDayOfWeek(today);
  const todayClasses = classes
    .filter(c => c.day_of_week === todayDayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const generateWeekDays = () => {
    const days = [];
    for (let i = -7; i <= 13; i++) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() + i);
      days.push({
        date,
        dayOfWeek: getDayOfWeek(date),
        isToday: i === 0,
        isPast: i < 0,
      });
    }
    return days;
  };

  const weekDays = generateWeekDays();

  // Get PT sessions for a specific day (using Singapore timezone UTC+8)
  // weeklyPTSessions is already grouped, just filter by day
  const getPTSessionsForDay = (dayOfWeek: string): PTSession[] => {
    return weeklyPTSessions
      .filter(session => {
        const sessionDate = new Date(session.scheduled_at);
        const sgDate = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000);
        const sessionDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][sgDate.getUTCDay()];
        return sessionDay === dayOfWeek;
      })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  };

  // Format datetime for PT sessions in Singapore timezone (UTC+8)
  const formatPTDateTime = (isoString: string) => {
    const date = new Date(isoString);
    const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

    const hours = sgDate.getUTCHours();
    const minutes = sgDate.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;

    return {
      time: `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`,
      date: sgDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }),
    };
  };

  // Check if PT session is passed (using Singapore timezone)
  const isPTSessionPassed = (isoString: string) => {
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000;
    const sessionDate = new Date(isoString);
    const sessionInSG = new Date(sessionDate.getTime() + singaporeOffset);
    const nowInSG = new Date(now.getTime() + singaporeOffset);
    return sessionInSG < nowInSG;
  };

  // Get class level from name
  const getClassLevel = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('kids')) return 'Kids';
    if (lower.includes('pre-teen')) return 'Pre-Teen';
    if (lower.includes('beginner')) return 'Beginner';
    if (lower.includes('advanced')) return 'Advanced';
    if (lower.includes('pro fighter')) return 'Pro Fighter';
    return 'All Levels';
  };

  // Fetch enrolled count for a class
  const fetchEnrolledCount = async (classId: string): Promise<number> => {
    const { count } = await supabase
      .from('class_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'active');
    return count || 0;
  };

  // Handle card press - show details modal
  const handleCardPress = async (item: TimelineItem) => {
    if (item.type === 'class') {
      const cls = item.data as ClassItem;
      const enrolledCount = await fetchEnrolledCount(cls.id);
      setClassEnrolledCount(enrolledCount);
    }
    setSelectedItem(item);
    setDetailModalVisible(true);
  };

  // Render detail modal
  const renderDetailModal = () => {
    if (!selectedItem) return null;

    const isClass = selectedItem.type === 'class';
    const isPT = selectedItem.type === 'pt';
    const cls = isClass ? selectedItem.data as ClassItem : null;
    const session = isPT ? selectedItem.data as PTSession : null;

    return (
      <Modal
        transparent
        visible={detailModalVisible}
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDetailModalVisible(false)}
        >
          <TouchableOpacity style={styles.detailModalContent} activeOpacity={1}>
            {/* Header */}
            <View style={styles.detailModalHeader}>
              <Text style={styles.detailModalTitle}>
                {isClass ? 'Class Details' : 'PT Session Details'}
              </Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailModalBody}>
              {/* Time */}
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Time</Text>
                <Text style={styles.detailValue}>{selectedItem.time}</Text>
              </View>

              {isClass && cls && (
                <>
                  {/* Class Name */}
                  <View style={styles.detailRow}>
                    <Ionicons name="fitness-outline" size={18} color={Colors.jaiBlue} />
                    <Text style={styles.detailLabel}>Class</Text>
                    <Text style={styles.detailValue}>{cls.name}</Text>
                  </View>

                  {/* Level */}
                  <View style={styles.detailRow}>
                    <Ionicons name="barbell-outline" size={18} color={Colors.jaiBlue} />
                    <Text style={styles.detailLabel}>Level</Text>
                    <Text style={styles.detailValue}>{getClassLevel(cls.name)}</Text>
                  </View>

                  {/* Duration */}
                  <View style={styles.detailRow}>
                    <Ionicons name="hourglass-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Duration</Text>
                    <Text style={styles.detailValue}>{cls.start_time} - {cls.end_time}</Text>
                  </View>

                  {/* Lead Coach */}
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Lead Coach</Text>
                    <Text style={styles.detailValue}>{cls.lead_coach?.full_name || 'Unknown'}</Text>
                  </View>

                  {/* Enrollment */}
                  <View style={styles.detailRow}>
                    <Ionicons name="people-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Enrolled</Text>
                    <Text style={styles.detailValue}>{classEnrolledCount} / {cls.capacity}</Text>
                  </View>

                  {/* Role indicator */}
                  {cls.isMyClass ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
                      <Text style={styles.detailLabel}>Role</Text>
                      <Text style={[styles.detailValue, { color: Colors.success }]}>Your Class</Text>
                    </View>
                  ) : cls.lead_coach_id !== user?.id ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="person-add-outline" size={18} color={Colors.warning} />
                      <Text style={styles.detailLabel}>Role</Text>
                      <Text style={[styles.detailValue, { color: Colors.warning }]}>Assistant</Text>
                    </View>
                  ) : null}
                </>
              )}

              {isPT && session && (
                <>
                  {/* Member Name */}
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={18} color={Colors.success} />
                    <Text style={styles.detailLabel}>Member</Text>
                    <Text style={styles.detailValue}>{session.member_name}</Text>
                  </View>

                  {/* Duration */}
                  <View style={styles.detailRow}>
                    <Ionicons name="hourglass-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Duration</Text>
                    <Text style={styles.detailValue}>{session.duration_minutes} min</Text>
                  </View>

                  {/* Session Type */}
                  <View style={styles.detailRow}>
                    <Ionicons name="walk-outline" size={18} color={Colors.success} />
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>
                      {session.session_type === 'buddy' && '👥 Buddy'}
                      {session.session_type === 'house_call' && '🏠 House Call'}
                      {session.session_type === 'solo_package' && 'Solo Package'}
                      {session.session_type === 'solo_single' && 'Solo Single'}
                    </Text>
                  </View>

                  {/* Commission */}
                  <View style={styles.detailRow}>
                    <Ionicons name="cash-outline" size={18} color={Colors.success} />
                    <Text style={styles.detailLabel}>Commission</Text>
                    <Text style={[styles.detailValue, { color: Colors.success }]}>
                      S${(session.commission_amount || 40).toFixed(2)}
                    </Text>
                  </View>

                  {/* Status */}
                  <View style={styles.detailRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={[styles.detailValue, { textTransform: 'capitalize' }]}>
                      {session.status}
                    </Text>
                  </View>

                  {/* Mark Attended Button */}
                  {isPTSessionPassed(session.scheduled_at) && !session.coach_verified && session.status === 'scheduled' && (
                    <TouchableOpacity
                      style={styles.modalMarkAttendedButton}
                      onPress={() => {
                        setDetailModalVisible(false);
                        handleMarkAttended(session);
                      }}
                    >
                      <Ionicons name="checkmark-done" size={18} color={Colors.white} />
                      <Text style={styles.modalMarkAttendedButtonText}>Mark as Attended</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Format time for timeline (12-hour format)
  const formatTimelineTime = (timeStr: string): string => {
    if (timeStr.includes(':')) {
      // Class time format: HH:MM:SS
      const [hours, minutes] = timeStr.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    }
    // ISO string format for PT
    return formatPTDateTime(timeStr).time;
  };

  // Create unified timeline for a day
  const createUnifiedTimeline = (dayClasses: ClassItem[], dayPTSessions: PTSession[], dayDate: Date): TimelineItem[] => {
    const items: TimelineItem[] = [];

    // Add classes
    dayClasses.forEach(cls => {
      items.push({
        id: `class-${cls.id}`,
        type: 'class',
        time: formatTimelineTime(cls.start_time),
        title: cls.name,
        subtitle: getClassLevel(cls.name),
        details: `${cls.start_time} - ${cls.end_time}`,
        isPassed: dayDate < new Date() || isTimePassed(cls.start_time, dayDate),
        isAssistant: !cls.isMyClass, // Not my class means assistant role
        data: cls,
      });
    });

    // Add PT sessions
    dayPTSessions.forEach(session => {
      const { time } = formatPTDateTime(session.scheduled_at);
      const isBuddy = session.session_type === 'buddy';
      const isHouseCall = session.session_type === 'house_call';
      const icon = isBuddy ? '👥' : isHouseCall ? '🏠' : '';

      items.push({
        id: `pt-${session.id}`,
        type: 'pt',
        time: time,
        title: `${icon} ${session.member_name}`.trim(),
        subtitle: `${session.duration_minutes} min`,
        details: `${session.duration_minutes} min`,
        isPassed: dayDate < new Date() || isPTSessionPassed(session.scheduled_at),
        sessionType: session.session_type,
        commission: session.commission_amount || 40,
        data: session,
      });
    });

    // Sort by time
    return items.sort((a, b) => {
      const timeA = a.time.replace(/([0-9]+):([0-9]+)\s*(AM|PM)/i, (_, h, m, ampm) => {
        let hour = parseInt(h);
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        return `${hour.toString().padStart(2, '0')}:${m}`;
      });
      const timeB = b.time.replace(/([0-9]+):([0-9]+)\s*(AM|PM)/i, (_, h, m, ampm) => {
        let hour = parseInt(h);
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        return `${hour.toString().padStart(2, '0')}:${m}`;
      });
      return timeA.localeCompare(timeB);
    });
  };

  const renderTodayView = () => {
    return (
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
        }
      >
        <View style={styles.dateHeaderRow}>
          <Ionicons name="calendar" size={18} color={Colors.jaiBlue} />
          <Text style={styles.dateHeader}>{formatDate(today.toISOString())}</Text>
        </View>

        {/* Group Classes Section */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: Colors.jaiBlue }]} />
          <Text style={styles.sectionTitle}>GROUP CLASSES</Text>
        </View>

        {todayClasses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={Colors.darkGray} />
            <Text style={styles.emptyText}>No classes scheduled for today</Text>
          </View>
        ) : (
          todayClasses.map((classItem) => {
            const isPassed = isTimePassed(classItem.start_time, today);
            const isMyClass = classItem.isMyClass;
            const coachColor = user?.email ? getCoachColorByEmail(user.email) : Colors.jaiBlue;

            return (
              <TouchableOpacity
                key={classItem.id}
                style={[
                  styles.compactCard,
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: coachColor,
                  },
                  isPassed && styles.cardDimmed,
                ]}
                onPress={() => {
                  const timelineItem: TimelineItem = {
                    id: `class-${classItem.id}`,
                    type: 'class',
                    time: formatTime(classItem.start_time),
                    title: classItem.name,
                    subtitle: getClassLevel(classItem.name),
                    details: `${classItem.start_time} - ${classItem.end_time}`,
                    isPassed,
                    isAssistant: !isMyClass,
                    data: classItem,
                  };
                  handleCardPress(timelineItem);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.compactCardHeader}>
                  <View style={[styles.colorDot, { backgroundColor: coachColor }]} />
                  <Text style={[styles.compactTime, isPassed && styles.textDimmed]}>
                    {formatTime(classItem.start_time)}
                  </Text>
                  <Text style={[styles.compactTitle, isPassed && styles.textDimmed]}>
                    {classItem.name}
                  </Text>
                </View>
                <Text
                  style={[styles.compactCoach, isPassed && styles.textDimmed]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {formatCoachRole(classItem)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {/* PT Sessions Section */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: Colors.success }]} />
          <Text style={styles.sectionTitle}>PT SESSIONS</Text>
        </View>

        {todayPTSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="person-outline" size={40} color={Colors.darkGray} />
            <Text style={styles.emptyText}>No PT sessions for today</Text>
          </View>
        ) : (
          todayPTSessions.map((session) => {
            const isPassed = isPTSessionPassed(session.scheduled_at);
            const { time } = formatPTDateTime(session.scheduled_at);
            const isBuddy = session.session_type === 'buddy';
            const isHouseCall = session.session_type === 'house_call';
            const sessionTypeLabel = isBuddy ? 'Buddy' : isHouseCall ? 'House Call' : 'Solo Package';
            const commission = session.commission_amount || 40;
            const canMarkAttended = isPassed && !session.coach_verified && session.status === 'scheduled';
            const coachColor = user?.email ? getCoachColorByEmail(user.email) : Colors.jaiBlue;

            return (
              <TouchableOpacity
                key={session.id}
                style={[
                  styles.compactCard,
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: coachColor,
                  },
                  isPassed && styles.cardDimmed,
                ]}
                onPress={() => {
                  if (canMarkAttended) {
                    handleMarkAttended(session);
                  } else {
                    const timelineItem: TimelineItem = {
                      id: `pt-${session.id}`,
                      type: 'pt',
                      time,
                      title: session.member_name,
                      subtitle: `${session.duration_minutes} min`,
                      details: `${session.duration_minutes} min`,
                      isPassed,
                      sessionType: session.session_type,
                      commission: session.commission_amount || 40,
                      data: session,
                    };
                    handleCardPress(timelineItem);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.compactCardHeader}>
                  <View style={[styles.colorDot, { backgroundColor: coachColor }]} />
                  <Text style={[styles.compactTime, isPassed && styles.textDimmed]}>
                    {time}
                  </Text>
                  <Text style={[styles.compactTitle, isPassed && styles.textDimmed]}>
                    PT - {session.member_name}
                  </Text>
                </View>
                <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                  You • {sessionTypeLabel} • S${commission.toFixed(0)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {/* Upcoming PT Sessions (rest of the week) */}
        {upcomingPTSessions.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: Colors.warning }]} />
              <Text style={styles.sectionTitle}>UPCOMING PT SESSIONS</Text>
            </View>

            {upcomingPTSessions.slice(0, 5).map((session) => {
              const { time, date } = formatPTDateTime(session.scheduled_at);
              const isBuddy = session.session_type === 'buddy';
              const isHouseCall = session.session_type === 'house_call';
              const icon = isBuddy ? '👥' : isHouseCall ? '🏠' : '';

              return (
                <View key={session.id} style={styles.upcomingPTCard}>
                  <View style={styles.upcomingPTLeft}>
                    <Text style={styles.upcomingPTDate}>{date}</Text>
                    <Text style={styles.upcomingPTTime}>{time}</Text>
                  </View>
                  <View style={styles.upcomingPTRight}>
                    <Text style={styles.upcomingPTMember}>
                      {icon} {session.member_name}
                    </Text>
                    <Text style={styles.upcomingPTDuration}>{session.duration_minutes} min</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  const renderWeeklyView = () => (
    <ScrollView
      ref={scrollViewRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.weeklyContainer}
      contentContainerStyle={styles.weeklyContent}
    >
      {weekDays.map((day, index) => {
        const dayClasses = classes
          .filter(c => c.day_of_week === day.dayOfWeek)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));

        const dayPTSessions = getPTSessionsForDay(day.dayOfWeek);
        const timeline = createUnifiedTimeline(dayClasses, dayPTSessions, day.date);
        const hasContent = timeline.length > 0;

        return (
          <View
            key={index}
            style={[
              styles.dayColumn,
              day.isPast && styles.dayColumnPast
            ]}
          >
            <View style={[
              styles.dayHeaderContainer,
              day.isToday && styles.dayHeaderToday
            ]}>
              <Text style={[
                styles.dayHeaderDay,
                day.isToday && styles.dayHeaderTodayText,
                day.isPast && styles.dayHeaderPast
              ]}>
                {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
              </Text>
              <Text style={[
                styles.dayHeaderDate,
                day.isToday && styles.dayHeaderTodayText,
                day.isPast && styles.dayHeaderPast
              ]}>
                {day.date.getDate()}
              </Text>
            </View>

            <ScrollView
              style={styles.dayClassList}
              contentContainerStyle={{ paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Unified Timeline */}
              {timeline.map((item) => {
                const isClass = item.type === 'class';
                const isPT = item.type === 'pt';
                const isBuddy = item.sessionType === 'buddy';
                const isHouseCall = item.sessionType === 'house_call';

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.timelineCard,
                      item.isPassed && styles.timelineCardDimmed,
                      isClass && styles.timelineCardClass,
                      isPT && styles.timelineCardPT,
                      isBuddy && styles.timelineCardBuddy,
                      isHouseCall && styles.timelineCardHouseCall,
                    ]}
                    onPress={() => handleCardPress(item)}
                    activeOpacity={0.7}
                  >
                    {/* Time */}
                    <Text style={styles.timelineTime}>{item.time}</Text>

                    {/* Main Content */}
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.timelineSubtitle} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    </View>

                    {/* Type Badge */}
                    <View style={[
                      styles.timelineBadge,
                      isClass && styles.timelineBadgeClass,
                      isPT && styles.timelineBadgePT,
                    ]}>
                      <Text style={[
                        styles.timelineBadgeText,
                        isClass && styles.timelineBadgeTextClass,
                        isPT && styles.timelineBadgeTextPT,
                      ]}>
                        {isClass ? 'Class' : 'PT'}
                      </Text>
                    </View>

                    {/* Commission for PT */}
                    {isPT && (
                      <Text style={styles.timelineCommission}>
                        💰S${(item.commission || 40).toFixed(0)}
                      </Text>
                    )}

                    {/* Assistant indicator */}
                    {isClass && item.isAssistant && (
                      <Text style={styles.timelineAssistant}>Assistant</Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              {!hasContent && (
                <View style={styles.noClassCard}>
                  <Text style={styles.noClassText}>No sessions</Text>
                </View>
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );

  // Render calendar sync modal
  const renderCalendarModal = () => (
    <Modal
      transparent
      visible={calendarModalVisible}
      animationType="fade"
      onRequestClose={() => setCalendarModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setCalendarModalVisible(false)}
      >
        <TouchableOpacity style={styles.calendarModalContent} activeOpacity={1}>
          {/* Header */}
          <View style={styles.calendarModalHeader}>
            <View style={styles.calendarIconContainer}>
              <Ionicons name="calendar-outline" size={28} color={Colors.jaiBlue} />
            </View>
            <Text style={styles.calendarModalTitle}>Sync Your Schedule</Text>
            <Text style={styles.calendarModalSubtitle}>
              Subscribe to your calendar to see all your classes and PT sessions
            </Text>
          </View>

          {/* Calendar URL Section */}
          <View style={styles.calendarUrlSection}>
            <Text style={styles.calendarUrlLabel}>Your Calendar URL</Text>
            <View style={styles.calendarUrlContainer}>
              <Text style={styles.calendarUrlText} numberOfLines={2}>
                {calendarToken
                  ? `https://xioimcyqglfxqumvbqsg.supabase.co/functions/v1/calendar/${calendarToken}.ics`
                  : 'Generating...'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={copyCalendarUrl}
              disabled={!calendarToken}
              activeOpacity={0.8}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={Colors.white} />
              <Text style={styles.copyButtonText}>
                {copied ? 'Copied!' : 'Copy URL'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.copyButton, { marginTop: 10 }]}
              onPress={shareCalendarUrl}
              disabled={!calendarToken}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.copyButtonText}>Share URL</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={styles.calendarInstructions}>
            <Text style={styles.calendarInstructionsTitle}>How to Subscribe</Text>

            <View style={styles.instructionRow}>
              <View style={styles.instructionIcon}>
                <Text style={styles.instructionIconText}>iPhone</Text>
              </View>
              <View style={styles.instructionContent}>
                <Text style={styles.instructionStep}>1. Open Settings → Calendar → Accounts</Text>
                <Text style={styles.instructionStep}>2. Tap "Add Account" → Other → Add Subscribed Calendar</Text>
                <Text style={styles.instructionStep}>3. Paste the URL above and tap Subscribe</Text>
              </View>
            </View>

            <View style={styles.instructionRow}>
              <View style={styles.instructionIcon}>
                <Text style={styles.instructionIconText}>Android</Text>
              </View>
              <View style={styles.instructionContent}>
                <Text style={styles.instructionStep}>1. Open Calendar app</Text>
                <Text style={styles.instructionStep}>2. Menu → Settings → Add calendar</Text>
                <Text style={styles.instructionStep}>3. Select "From URL" and paste the URL</Text>
              </View>
            </View>
          </View>

          {/* Warning */}
          <View style={styles.calendarWarning}>
            <Ionicons name="warning-outline" size={16} color={Colors.warning} />
            <Text style={styles.calendarWarningText}>
              Keep this URL private - it's unique to you
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.calendarActions}>
            <TouchableOpacity
              style={[styles.calendarButton, styles.calendarRegenerateButton]}
              onPress={generateCalendarToken}
              disabled={calendarLoading}
            >
              <Ionicons name="refresh-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.calendarRegenerateButtonText}>
                {calendarLoading ? 'Generating...' : 'Regenerate URL'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.calendarButton, styles.calendarDoneButton]}
              onPress={() => setCalendarModalVisible(false)}
            >
              <Text style={styles.calendarDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>Schedule</Text>

          {/* Calendar Sync Button */}
          <TouchableOpacity
            style={styles.calendarSyncButton}
            onPress={handleCalendarSyncPress}
          >
            <Ionicons name="calendar-outline" size={22} color={Colors.jaiBlue} />
          </TouchableOpacity>
        </View>

        {/* View Toggle */}
        <View style={styles.viewToggleContainer}>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleButton, view === 'today' && styles.toggleButtonActive]}
              onPress={() => setView('today')}
            >
              <Ionicons
                name="today-outline"
                size={16}
                color={view === 'today' ? Colors.white : Colors.lightGray}
              />
              <Text style={[styles.toggleText, view === 'today' && styles.toggleTextActive]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, view === 'weekly' && styles.toggleButtonActive]}
              onPress={() => setView('weekly')}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={view === 'weekly' ? Colors.white : Colors.lightGray}
              />
              <Text style={[styles.toggleText, view === 'weekly' && styles.toggleTextActive]}>Weekly</Text>
            </TouchableOpacity>
          </View>
        </View>

        {view === 'today' ? renderTodayView() : renderWeeklyView()}

        {/* Detail Modal */}
        {renderDetailModal()}

        {/* Calendar Sync Modal */}
        {renderCalendarModal()}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.white,
  },
  viewToggleContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  toggleButtonActive: {
    backgroundColor: Colors.jaiBlue,
  },
  toggleText: {
    fontWeight: '600',
    fontSize: 14,
    color: Colors.lightGray,
  },
  toggleTextActive: {
    color: Colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  dateHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    color: Colors.darkGray,
    marginTop: 12,
    fontSize: 14,
  },
  classCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  classCardMyClass: {
    borderColor: Colors.success,
    borderWidth: 2,
    backgroundColor: Colors.success + '10',
  },
  classCardOtherCoach: {
    borderColor: Colors.border,
    opacity: 0.85,
  },
  cardDimmed: {
    opacity: 0.5,
  },
  classTimeBadge: {
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 12,
  },
  classTimeBadgeMyClass: {
    backgroundColor: Colors.success,
  },
  classTimeBadgeOther: {
    backgroundColor: Colors.darkGray,
  },
  classTimeBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  classNameOther: {
    color: Colors.lightGray,
  },
  classNameDimmed: {
    opacity: 0.5,
  },
  myClassIndicator: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.success,
  },
  textDimmed: {
    opacity: 0.6,
  },
  classCapacity: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  leadCoachText: {
    fontSize: 12,
    color: Colors.jaiBlue,
    marginTop: 2,
  },
  doneBadge: {
    backgroundColor: Colors.darkGray,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  doneBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white,
  },
  weeklyContainer: {
    flex: 1,
  },
  weeklyContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  dayColumn: {
    width: DAY_COLUMN_WIDTH,
    marginRight: 8,
  },
  dayColumnPast: {
    opacity: 0.5,
  },
  dayHeaderContainer: {
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    paddingVertical: 8,
    marginBottom: Spacing.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayHeaderToday: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  dayHeaderDay: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  dayHeaderDate: {
    fontSize: 11,
    color: Colors.lightGray,
    marginTop: 2,
  },
  dayHeaderTodayText: {
    color: Colors.white,
  },
  dayHeaderPast: {
    color: Colors.darkGray,
  },
  dayClassList: {
    flex: 1,
  },
  noClassCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noClassText: {
    fontSize: 11,
    color: Colors.darkGray,
  },
  miniClassCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniCardDimmed: {
    opacity: 0.5,
    borderLeftColor: Colors.darkGray,
  },
  miniClassName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  miniClassTime: {
    fontSize: 11,
    color: Colors.lightGray,
    marginTop: 3,
  },
  miniAssistantBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.warning,
    marginTop: 3,
  },
  // PT Session Styles in Weekly View
  miniPTSessionCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buddySessionCard: {
    borderLeftColor: Colors.neonPurple,
    backgroundColor: Colors.neonPurple + '10',
  },
  houseCallSessionCard: {
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.warning + '10',
  },
  miniPTSessionTime: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.success,
  },
  miniPTSessionName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
    marginTop: 2,
  },
  miniPTSessionDuration: {
    fontSize: 10,
    color: Colors.lightGray,
    marginTop: 2,
  },
  buddyBadge: {
    backgroundColor: Colors.neonPurple + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  buddyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.neonPurple,
  },
  houseCallBadge: {
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  houseCallBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.warning,
  },
  // Unified Timeline Card Styles
  timelineCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineCardDimmed: {
    opacity: 0.5,
  },
  timelineCardClass: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
    backgroundColor: Colors.cardBg,
  },
  timelineCardPT: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.warning + '10',
  },
  timelineCardBuddy: {
    borderLeftColor: Colors.neonPurple,
    backgroundColor: Colors.neonPurple + '15',
  },
  timelineCardHouseCall: {
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.warning + '15',
  },
  timelineTime: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
    width: 60,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 8,
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  timelineSubtitle: {
    fontSize: 10,
    color: Colors.lightGray,
    marginTop: 2,
  },
  timelineBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  timelineBadgeClass: {
    backgroundColor: Colors.jaiBlue + '20',
  },
  timelineBadgePT: {
    backgroundColor: Colors.warning + '20',
  },
  timelineBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  timelineBadgeTextClass: {
    color: Colors.jaiBlue,
  },
  timelineBadgeTextPT: {
    color: Colors.warning,
  },
  timelineCommission: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.success,
    marginRight: 4,
  },
  timelineAssistant: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.warning,
    marginLeft: 'auto',
  },
  // Detail Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  detailModalContent: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  detailModalBody: {
    padding: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.lightGray,
    marginLeft: 12,
    width: 80,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  modalMarkAttendedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  modalMarkAttendedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  // PT Session Styles
  ptCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ptTimeBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 12,
  },
  ptTimeBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  ptInfo: {
    flex: 1,
  },
  ptMemberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  ptDuration: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  ptStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ptStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ptCommissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ptCommission: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  markAttendedButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  markAttendedButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  // Upcoming PT Sessions Styles
  upcomingPTCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  upcomingPTLeft: {
    alignItems: 'flex-start',
  },
  upcomingPTDate: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  upcomingPTTime: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
    marginTop: 2,
  },
  upcomingPTRight: {
    alignItems: 'flex-end',
  },
  upcomingPTMember: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  upcomingPTDuration: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 2,
  },
  // Calendar Sync Styles
  calendarSyncButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: 0,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  calendarModalHeader: {
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  calendarIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.jaiBlue + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  calendarModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 4,
  },
  calendarModalSubtitle: {
    fontSize: 14,
    color: Colors.lightGray,
    textAlign: 'center',
  },
  calendarUrlSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  calendarUrlLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calendarUrlContainer: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarUrlText: {
    fontSize: 12,
    color: Colors.jaiBlue,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingVertical: 12,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  calendarInstructions: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  calendarInstructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing.md,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  instructionIcon: {
    width: 70,
    paddingVertical: 4,
    backgroundColor: Colors.darkGray,
    borderRadius: 6,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  instructionIconText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white,
  },
  instructionContent: {
    flex: 1,
  },
  instructionStep: {
    fontSize: 12,
    color: Colors.lightGray,
    marginBottom: 4,
    lineHeight: 18,
  },
  calendarWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '15',
    borderRadius: 8,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  calendarWarningText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
  },
  calendarActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  calendarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  calendarRegenerateButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarRegenerateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  calendarDoneButton: {
    backgroundColor: Colors.jaiBlue,
  },
  calendarDoneButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  // Compact Card Styles
  compactCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.jaiBlue,
    minWidth: 60,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  compactCoach: {
    fontSize: 12,
    color: Colors.lightGray,
    marginLeft: 16,
  },
  textDimmed: {
    opacity: 0.5,
  },
});
