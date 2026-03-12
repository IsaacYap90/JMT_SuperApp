import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
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
import { getCoachColorByEmail } from '../../../shared/constants/CoachColors';

import { DetailModal } from '../components/schedule/DetailModal';
import { CalendarModal } from '../components/schedule/CalendarModal';
import { TodayView } from '../components/schedule/TodayView';
import { WeeklyView } from '../components/schedule/WeeklyView';
import {
  ClassItem,
  PTSession,
  TimelineItem,
  DAY_COLUMN_WIDTH,
} from '../components/schedule/types';
import {
  getSingaporeDate,
  getDayOfWeek,
  formatDate,
  formatPTDateTime,
  generateWeekDays,
  groupBuddySessions,
} from '../components/schedule/utils';

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
          lead_coach: Array.isArray(cls.lead_coach) ? cls.lead_coach[0] : cls.lead_coach,
          isMyClass: myClassIds.has(cls.id),
          assignedCoaches,
          myRole: (myAssignment ? (myAssignment.is_lead ? 'lead' : 'assistant') : null) as 'lead' | 'assistant' | null,
        };
      })
    );

    console.log('[fetchClasses] Final classes count:', classesWithAssignments.length);
    console.log('[fetchClasses] My classes:', classesWithAssignments.filter(c => c.isMyClass).map(c => c.name));
    console.log(`[fetchClasses] ===== END =====`);

    setClasses(classesWithAssignments);
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

  // Get today in Singapore timezone
  const today = getSingaporeDate();
  const todayDayOfWeek = getDayOfWeek(today);
  const todayClasses = classes
    .filter(c => c.day_of_week === todayDayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const weekDays = generateWeekDays(today);

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

  const coachColor = user?.email ? getCoachColorByEmail(user.email) : Colors.jaiBlue;

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

        {view === 'today' ? (
          <TodayView
            todayClasses={todayClasses}
            todayPTSessions={todayPTSessions}
            upcomingPTSessions={upcomingPTSessions}
            today={today}
            coachColor={coachColor}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onCardPress={handleCardPress}
            onMarkAttended={handleMarkAttended}
            formatCoachRole={formatCoachRole}
          />
        ) : (
          <WeeklyView
            weekDays={weekDays}
            classes={classes}
            weeklyPTSessions={weeklyPTSessions}
            scrollViewRef={scrollViewRef}
            onCardPress={handleCardPress}
            getPTSessionsForDay={getPTSessionsForDay}
          />
        )}

        {/* Detail Modal */}
        <DetailModal
          visible={detailModalVisible}
          selectedItem={selectedItem}
          userId={user?.id}
          enrolledCount={classEnrolledCount}
          onClose={() => setDetailModalVisible(false)}
          onMarkAttended={handleMarkAttended}
        />

        {/* Calendar Sync Modal */}
        <CalendarModal
          visible={calendarModalVisible}
          calendarToken={calendarToken}
          calendarLoading={calendarLoading}
          copied={copied}
          onClose={() => setCalendarModalVisible(false)}
          onCopy={copyCalendarUrl}
          onShare={shareCalendarUrl}
          onGenerate={generateCalendarToken}
        />
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
});
