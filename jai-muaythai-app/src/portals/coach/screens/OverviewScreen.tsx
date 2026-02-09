import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { SectionHeader, Badge, GlassCard } from '../../../shared/components/FuturisticUI';

interface TodayClass {
  id: string;
  name: string;
  description: string;
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

interface TodayPT {
  id: string;
  member_name: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number;
  session_type: string;
  commission_amount: number | null;
  coach_verified?: boolean;
}

interface WorkingHoursData {
  dailyHours: number;
  weeklyHours: number;
  dailyClassHours: number;
  dailyPTHours: number;
  weeklyClassHours: number;
  weeklyPTHours: number;
}

interface Coach {
  id: string;
  email: string;
  full_name: string;
}

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

export const CoachOverviewScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [todayPT, setTodayPT] = useState<TodayPT[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stats, setStats] = useState({
    weeklyClasses: 0,
    weeklyPTSessions: 0,
  });
  const [workingHours, setWorkingHours] = useState<WorkingHoursData | null>(null);

  // Modal state
  const [selectedClass, setSelectedClass] = useState<TodayClass | null>(null);
  const [selectedPT, setSelectedPT] = useState<TodayPT | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [classEnrolledCount, setClassEnrolledCount] = useState(0);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const isTimePassed = (startTime: string) => {
    if (!startTime) return false;
    const now = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    const classTime = new Date();
    classTime.setHours(hours, minutes, 0, 0);
    return now > classTime;
  };

  const isPTSessionPassed = (isoString: string) => {
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000; // UTC+8
    const sessionDate = new Date(isoString);
    const sessionInSG = new Date(sessionDate.getTime() + singaporeOffset);
    const nowInSG = new Date(now.getTime() + singaporeOffset);
    return sessionInSG < nowInSG;
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatPTDateTime = (isoString: string) => {
    const date = new Date(isoString);
    const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000); // UTC+8
    const hours = sgDate.getUTCHours();
    const minutes = sgDate.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-SG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
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

  // Format coach role display
  const formatCoachRole = (cls: TodayClass): string => {
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

  // Fetch enrolled count for a class
  const fetchEnrolledCount = async (classId: string): Promise<number> => {
    const { count } = await supabase
      .from('class_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'active');
    return count || 0;
  };

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

  // Handle class card press
  const handleClassPress = async (cls: TodayClass) => {
    const enrolledCount = await fetchEnrolledCount(cls.id);
    setClassEnrolledCount(enrolledCount);
    setSelectedClass(cls);
    setSelectedPT(null);
    setDetailModalVisible(true);
  };

  // Handle PT card press
  const handlePTPress = (pt: TodayPT) => {
    setSelectedPT(pt);
    setSelectedClass(null);
    setDetailModalVisible(true);
  };

  // Render detail modal
  const renderDetailModal = () => {
    if (!selectedClass && !selectedPT) return null;

    const isClass = selectedClass !== null;
    const isPT = selectedPT !== null;
    const cls = selectedClass;
    const pt = selectedPT;

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

                  {/* Time */}
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Time</Text>
                    <Text style={styles.detailValue}>{formatTime(cls.start_time)} - {formatTime(cls.end_time)}</Text>
                  </View>

                  {/* Capacity */}
                  <View style={styles.detailRow}>
                    <Ionicons name="people-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Capacity</Text>
                    <Text style={styles.detailValue}>{cls.capacity}</Text>
                  </View>

                  {/* Enrolled */}
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Enrolled</Text>
                    <Text style={styles.detailValue}>{classEnrolledCount} / {cls.capacity}</Text>
                  </View>

                  {/* Lead Coach */}
                  <View style={styles.detailRow}>
                    <Ionicons name="person-add-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Lead Coach</Text>
                    <Text style={styles.detailValue}>{cls.lead_coach?.full_name || 'Unknown'}</Text>
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

              {isPT && pt && (
                <>
                  {/* Member Name */}
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={18} color={Colors.success} />
                    <Text style={styles.detailLabel}>Member</Text>
                    <Text style={styles.detailValue}>{pt.member_name}</Text>
                  </View>

                  {/* Date & Time */}
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{formatDate(pt.scheduled_at)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Time</Text>
                    <Text style={styles.detailValue}>{formatPTDateTime(pt.scheduled_at)}</Text>
                  </View>

                  {/* Duration */}
                  <View style={styles.detailRow}>
                    <Ionicons name="hourglass-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Duration</Text>
                    <Text style={styles.detailValue}>{pt.duration_minutes} min</Text>
                  </View>

                  {/* Session Type */}
                  <View style={styles.detailRow}>
                    <Ionicons name="walk-outline" size={18} color={Colors.success} />
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>
                      {pt.session_type === 'buddy' && '👥 Buddy'}
                      {pt.session_type === 'house_call' && '🏠 House Call'}
                      {pt.session_type === 'solo_package' && 'Solo Package'}
                      {pt.session_type === 'solo_single' && 'Solo Single'}
                    </Text>
                  </View>

                  {/* Commission */}
                  <View style={styles.detailRow}>
                    <Ionicons name="cash-outline" size={18} color={Colors.success} />
                    <Text style={styles.detailLabel}>Commission</Text>
                    <Text style={[styles.detailValue, { color: Colors.success }]}>
                      S${(pt.commission_amount || 40).toFixed(2)}
                    </Text>
                  </View>

                  {/* Status */}
                  <View style={styles.detailRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.lightGray} />
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={[styles.detailValue, { textTransform: 'capitalize' }]}>
                      {pt.status}
                    </Text>
                  </View>

                  {/* Edit PT Button - Only for scheduled, unverified sessions */}
                  {!pt.coach_verified && pt.status === 'scheduled' && !isPTSessionPassed(pt.scheduled_at) && (
                    <TouchableOpacity
                      style={styles.modalEditButton}
                      onPress={() => {
                        setDetailModalVisible(false);
                        Alert.alert(
                          'Edit PT Session',
                          'To edit this PT session, go to the PT Sessions tab where you can modify the date, time, and duration.',
                          [{ text: 'OK' }]
                        );
                      }}
                    >
                      <Ionicons name="create-outline" size={18} color={Colors.white} />
                      <Text style={styles.modalEditButtonText}>Edit PT Session</Text>
                    </TouchableOpacity>
                  )}

                  {/* Mark Attended Button */}
                  {isPTSessionPassed(pt.scheduled_at) && !pt.coach_verified && pt.status === 'scheduled' && (
                    <TouchableOpacity
                      style={styles.modalMarkAttendedButton}
                      onPress={() => {
                        setDetailModalVisible(false);
                        handleMarkAttended(pt);
                      }}
                    >
                      <Ionicons name="checkmark-done" size={18} color={Colors.white} />
                      <Text style={styles.modalMarkAttendedButtonText}>Mark as Attended</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* Note for classes - Read Only */}
              {isClass && (
                <View style={styles.readOnlyNote}>
                  <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
                  <Text style={styles.readOnlyNoteText}>
                    Coaches cannot edit classes. Contact admin for changes.
                  </Text>
                </View>
              )}

              {/* Close Button */}
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  const handleMarkAttended = async (pt: TodayPT) => {
    console.log('[MarkAttended] Session data:', {
      id: pt.id,
      scheduled_at: pt.scheduled_at,
      coach_verified: pt.coach_verified,
      status: pt.status,
      currentTime: new Date().toISOString(),
    });

    Alert.alert(
      'Mark as Attended',
      `Confirm that you conducted the PT session with ${pt.member_name} on ${formatDate(pt.scheduled_at)} at ${formatPTDateTime(pt.scheduled_at)}?`,
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
                .eq('id', pt.id);

              if (error) throw error;

              Alert.alert('Success', 'Session marked as attended!');
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update session');
            }
          },
        },
      ]
    );
  };

  const getClassDuration = (className: string): number => {
    const lowerName = className.toLowerCase();
    const duration = lowerName.includes('kids') || lowerName.includes('pre-teen') ? 0.75 : 1;
    console.log(`[WorkingHours] Class "${className}" -> ${duration} hours`);
    return duration;
  };

  const calculateWorkingHours = (classes: TodayClass[], ptSessions: TodayPT[], weeklyClasses: TodayClass[], weeklyPT: TodayPT[]) => {
    console.log('[WorkingHours] === CALCULATING WORKING HOURS ===');
    console.log('[WorkingHours] Today classes count (all):', classes.length);
    console.log('[WorkingHours] Today PT sessions count:', ptSessions.length);

    // Filter to ONLY count classes where this coach is assigned (isMyClass === true)
    const myClasses = classes.filter(cls => cls.isMyClass);
    console.log('[WorkingHours] My assigned classes count:', myClasses.length);
    myClasses.forEach(cls => {
      console.log(`[WorkingHours]   - ${cls.name} (${cls.start_time}-${cls.end_time})`);
    });

    // Calculate daily hours - only from MY classes
    let dailyClassHours = 0;
    myClasses.forEach(cls => {
      const duration = getClassDuration(cls.name);
      dailyClassHours += duration;
    });
    console.log('[WorkingHours] Daily class hours:', dailyClassHours);

    const dailyPTHours = ptSessions.reduce((sum, pt) => {
      const hours = pt.duration_minutes / 60;
      console.log(`[WorkingHours] PT Session "${pt.member_name}" -> ${pt.duration_minutes} min = ${hours.toFixed(2)} hours`);
      return sum + hours;
    }, 0);
    console.log('[WorkingHours] Daily PT hours:', dailyPTHours);

    const dailyTotal = dailyClassHours + dailyPTHours;
    console.log('[WorkingHours] DAILY TOTAL:', dailyTotal, 'hours');

    // Calculate weekly hours - only from MY classes
    const myWeeklyClasses = weeklyClasses.filter(cls => cls.isMyClass);
    console.log('[WorkingHours] My weekly classes count:', myWeeklyClasses.length);

    let weeklyClassHours = 0;
    myWeeklyClasses.forEach(cls => {
      const duration = getClassDuration(cls.name);
      weeklyClassHours += duration;
      console.log(`[WorkingHours] Weekly class: ${cls.name} -> ${duration} hours`);
    });
    console.log('[WorkingHours] Weekly class hours:', weeklyClassHours);

    const weeklyPTHours = weeklyPT.reduce((sum, pt) => sum + (pt.duration_minutes / 60), 0);
    console.log('[WorkingHours] Weekly PT hours:', weeklyPTHours);

    const weeklyTotal = weeklyClassHours + weeklyPTHours;
    console.log('[WorkingHours] WEEKLY TOTAL:', weeklyTotal, 'hours');

    if (dailyTotal === 0 && weeklyTotal === 0) {
      console.log('[WorkingHours] No hours to display, hiding card');
      setWorkingHours(null);
    } else {
      console.log('[WorkingHours] Setting workingHours state');
      setWorkingHours({
        dailyHours: dailyTotal,
        weeklyHours: weeklyTotal,
        dailyClassHours,
        dailyPTHours,
        weeklyClassHours,
        weeklyPTHours,
      });
    }
  };

  const fetchData = async () => {
    if (!user?.id) {
      console.log('[fetchData] No user ID, returning early');
      return;
    }

    // Get current day in Singapore timezone (UTC+8)
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000; // UTC+8
    const todayInSG = new Date(now.getTime() + singaporeOffset);
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][todayInSG.getUTCDay()];
    const todayDate = todayInSG.toISOString().split('T')[0];
    console.log(`[fetchData] ===== START =====`);
    console.log(`[fetchData] Today is "${dayOfWeek}", date: ${todayDate} (Singapore Time)`);
    console.log(`[fetchData] User ID: ${user.id}`);
    console.log(`[fetchData] User email: ${user.email}`);

    // Step 1: Fetch ALL classes from the classes table (no coach filter)
    console.log('[fetchData] Step 1: Fetch ALL classes from gym schedule');
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
      .eq('is_active', true);

    if (allClassesError) {
      console.log('[fetchData] Error fetching all classes:', allClassesError);
      return;
    }

    console.log('[fetchData] Total classes in gym:', allClassesData?.length || 0);

    // Step 2: Fetch which classes THIS coach is assigned to (from junction table)
    console.log('[fetchData] Step 2: Fetch coach assignments from class_coaches');
    const { data: coachAssignments, error: assignmentError } = await supabase
      .from('class_coaches')
      .select('class_id')
      .eq('coach_id', user.id);

    if (assignmentError) {
      console.log('[fetchData] Error fetching coach assignments:', assignmentError);
    }

    // Create a Set of class IDs that this coach is assigned to
    const myClassIds = new Set(coachAssignments?.map(cc => cc.class_id) || []);
    console.log('[fetchData] Coach is assigned to:', myClassIds.size, 'classes');

    // Step 3: Mark which classes belong to this coach and fetch assigned coaches
    const classesWithAssignments = await Promise.all(
      (allClassesData || [])
        .filter(cls => {
          const matchesDay = cls.day_of_week === dayOfWeek;
          return matchesDay && cls.is_active;
        })
        .map(async (cls) => {
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

    const allClasses: TodayClass[] = classesWithAssignments.sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );

    console.log('[fetchData] Final today classes count:', allClasses.length);
    console.log('[fetchData] My classes today:', allClasses.filter(c => c.isMyClass).map(c => c.name));
    console.log(`[fetchData] ===== END =====`);

    setTodayClasses(allClasses);

    // Fetch today's PT sessions with Singapore timezone (reuse variables from above)
    const year = todayInSG.getUTCFullYear();
    const month = todayInSG.getUTCMonth();
    const day = todayInSG.getUTCDate();

    // Start of today in Singapore = 00:00 Singapore time = 16:00 UTC previous day
    const startOfTodayUTC = new Date(Date.UTC(year, month, day - 1, 16, 0, 0, 0));
    // End of today in Singapore = 23:59:59 Singapore time = 15:59:59 UTC same day
    const endOfTodayUTC = new Date(Date.UTC(year, month, day, 15, 59, 59, 999));

    console.log(`[fetchData] PT query range: ${startOfTodayUTC.toISOString()} to ${endOfTodayUTC.toISOString()}`);

    const { data: ptData } = await supabase
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
      .eq('status', 'scheduled')
      .gte('scheduled_at', startOfTodayUTC.toISOString())
      .lte('scheduled_at', endOfTodayUTC.toISOString())
      .order('scheduled_at', { ascending: true });

    console.log('[fetchData] PT sessions found:', ptData?.length || 0);
    ptData?.forEach(item => {
      console.log(`[fetchData]   - ${item.scheduled_at} ${item.duration_minutes}min - ${(item.member as any)?.full_name}`);
    });

    const ptSessions: TodayPT[] = (ptData || []).map(item => ({
      id: item.id,
      scheduled_at: item.scheduled_at,
      duration_minutes: item.duration_minutes,
      status: item.status,
      session_type: item.session_type,
      commission_amount: item.commission_amount,
      coach_verified: item.coach_verified,
      member_name: (item.member as any)?.full_name || 'Unknown Member',
    }));

    setTodayPT(ptSessions);

    // Fetch all classes for the week (ALL gym classes, not just Isaac's)
    const { data: allWeekClassesData, error: weekClassesError } = await supabase
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
      .eq('is_active', true);

    if (weekClassesError) {
      console.log('[fetchData] Error fetching week classes:', weekClassesError);
    }

    // Mark all week classes with isMyClass flag
    const allWeekClasses: TodayClass[] = (allWeekClassesData || [])
      .map(cls => ({
        ...cls,
        lead_coach: Array.isArray(cls.lead_coach) ? cls.lead_coach[0] : cls.lead_coach,
        isMyClass: myClassIds.has(cls.id),
      }))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    // Fetch all PT sessions for the week
    const { data: weekPTData } = await supabase
      .from('pt_sessions')
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        status,
        session_type,
        commission_amount
      `)
      .eq('coach_id', user.id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString());

    const allWeekPT: TodayPT[] = (weekPTData || []).map(item => ({
      id: item.id,
      scheduled_at: item.scheduled_at,
      duration_minutes: item.duration_minutes,
      status: item.status,
      session_type: item.session_type,
      commission_amount: item.commission_amount,
      member_name: '',
    }));

    // Calculate working hours (use ptSessions local variable, not todayPT state)
    calculateWorkingHours(allClasses, ptSessions, allWeekClasses, allWeekPT);

    setStats({
      weeklyClasses: allWeekClasses.length,
      weeklyPTSessions: allWeekPT.length,
    });

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setUnreadCount(count || 0);
  };

  useEffect(() => {
    fetchData();

    // Subscribe to notifications
    const notificationsChannel = supabase
      .channel('coach-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    // Subscribe to PT sessions changes (for realtime updates when admin cancels/edits)
    const ptSessionsChannel = supabase
      .channel('coach-pt-sessions')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'pt_sessions',
          filter: `coach_id=eq.${user?.id}`,
        },
        (payload) => {
          console.log('PT Session change detected in OverviewScreen:', payload);
          // Refresh data when any PT session change is detected
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(ptSessionsChannel);
    };
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Combine classes and PT sessions for timeline view
  const getTimelineItems = () => {
    const items: { type: 'class' | 'pt'; data: TodayClass | TodayPT; time: string }[] = [];

    todayClasses.forEach(cls => {
      items.push({ type: 'class', data: cls, time: cls.start_time });
    });

    todayPT.forEach(pt => {
      items.push({ type: 'pt', data: pt, time: new Date(pt.scheduled_at).toTimeString().split(' ')[0] });
    });

    return items.sort((a, b) => a.time.localeCompare(b.time));
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('Profile' as never)}
          >
            <LinearGradient
              colors={[Colors.jaiBlue, Colors.neonPurple]}
              style={styles.profileGradient}
            >
              <Text style={styles.profileInitial}>
                {user?.full_name?.charAt(0).toUpperCase() || '?'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>{user?.full_name || 'Coach'}</Text>
          </View>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Notifications' as never)}
          >
            <Ionicons name="notifications-outline" size={22} color={Colors.white} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
          }
        >
          {/* Weekly Stats */}
          <View style={styles.statsRow}>
            {/* Classes This Week Card → Navigate to Schedule */}
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => (navigation as any).navigate('CoachTabs', { screen: 'Schedule' })}
            >
              <View style={[styles.statGlow, { backgroundColor: Colors.jaiBlue }]} />
              <Text style={[styles.statNumber, { color: Colors.jaiBlue }]}>{stats.weeklyClasses}</Text>
              <Text style={styles.statLabel}>Classes This Week</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.jaiBlue} style={styles.statIcon} />
            </TouchableOpacity>

            {/* PT Sessions Card → Navigate to Schedule */}
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => (navigation as any).navigate('CoachTabs', { screen: 'Schedule' })}
            >
              <View style={[styles.statGlow, { backgroundColor: Colors.success }]} />
              <Text style={[styles.statNumber, { color: Colors.success }]}>{stats.weeklyPTSessions}</Text>
              <Text style={styles.statLabel}>PT Sessions</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.success} style={styles.statIcon} />
            </TouchableOpacity>
          </View>

          {/* Today's Schedule Timeline */}
          <SectionHeader title="Today's Schedule" />

          {todayClasses.length === 0 && todayPT.length === 0 ? (
            <GlassCard>
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={Colors.darkGray} />
                <Text style={styles.emptyText}>No sessions scheduled for today</Text>
              </View>
            </GlassCard>
          ) : (
            getTimelineItems().map((item) => {
              if (item.type === 'class') {
                const cls = item.data as TodayClass;
                const isPassed = isTimePassed(cls.start_time);
                const isMyClass = cls.isMyClass;

                const coachColor = user?.email ? getCoachColorByEmail(user.email) : Colors.jaiBlue;
                const borderColor = isMyClass ? coachColor : Colors.border;

                return (
                  <TouchableOpacity
                    key={`class-${cls.id}`}
                    style={[
                      styles.compactCard,
                      {
                        borderLeftWidth: 4,
                        borderLeftColor: borderColor,
                      },
                      isPassed && styles.cardDimmed,
                    ]}
                    onPress={() => handleClassPress(cls)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.compactCardHeader}>
                      <View style={[styles.colorDot, { backgroundColor: borderColor }]} />
                      <Text style={[styles.compactTime, isPassed && styles.textDimmed]}>
                        {formatTime(cls.start_time)}
                      </Text>
                      <Text style={[styles.compactTitle, isPassed && styles.textDimmed]}>
                        {cls.name}
                      </Text>
                    </View>
                    <Text
                      style={[styles.compactCoach, isPassed && styles.textDimmed]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {formatCoachRole(cls)}
                    </Text>
                  </TouchableOpacity>
                );
              } else {
                const pt = item.data as TodayPT;
                const isPassed = isPTSessionPassed(pt.scheduled_at);
                const time = formatPTDateTime(pt.scheduled_at);
                const commission = pt.commission_amount ?? 40; // Default to S$40 if not set
                const canMarkAttended = isPassed && !pt.coach_verified && pt.status === 'scheduled';

                // Debug log
                console.log('[PTCard Debug]', {
                  id: pt.id,
                  scheduled_at: pt.scheduled_at,
                  isPassed,
                  coach_verified: pt.coach_verified,
                  status: pt.status,
                  canMarkAttended,
                });

                const isBuddy = pt.session_type === 'buddy';
                const isHouseCall = pt.session_type === 'house_call';
                const sessionTypeLabel = isBuddy ? 'Buddy' : isHouseCall ? 'House Call' : 'Solo';
                const coachColor = user?.email ? getCoachColorByEmail(user.email) : Colors.success;

                return (
                  <TouchableOpacity
                    key={`pt-${pt.id}`}
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
                        handleMarkAttended(pt);
                      } else {
                        handlePTPress(pt);
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
                        PT - {pt.member_name}
                      </Text>
                    </View>
                    <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                      You • {sessionTypeLabel}
                    </Text>
                  </TouchableOpacity>
                );
              }
            })
          )}

          {/* Working Hours */}
          {workingHours && (
            <View style={styles.workingHoursCard}>
              <View style={styles.workingHoursHeader}>
                <Ionicons name="time-outline" size={18} color={Colors.jaiBlue} />
                <Text style={styles.workingHoursTitle}>Working Hours Today</Text>
              </View>
              <View style={styles.workingHoursDivider} />
              <View style={styles.workingHoursRow}>
                <Text style={styles.workingHoursLabel}>Classes:</Text>
                <Text style={styles.workingHoursValue}>{workingHours.dailyClassHours.toFixed(1)} hours</Text>
              </View>
              <View style={styles.workingHoursRow}>
                <Text style={styles.workingHoursLabel}>PT Sessions:</Text>
                <Text style={styles.workingHoursValue}>{workingHours.dailyPTHours.toFixed(1)} hours</Text>
              </View>
              <View style={styles.workingHoursTotalRow}>
                <Text style={styles.workingHoursTotalLabel}>Total:</Text>
                <Text style={styles.workingHoursTotalValue}>{workingHours.dailyHours.toFixed(1)} hours</Text>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Detail Modal */}
        {renderDetailModal()}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  profileGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  greeting: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
  },
  statGlow: {
    position: 'absolute',
    top: -15,
    right: -15,
    width: 50,
    height: 50,
    borderRadius: 25,
    opacity: 0.2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: Colors.lightGray,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    color: Colors.darkGray,
    marginTop: 12,
    fontSize: 14,
  },
  classCard: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  classCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  cardDimmed: {
    opacity: 0.6,
  },
  classTimeContainer: {
    backgroundColor: 'rgba(0,212,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 12,
    alignItems: 'center',
  },
  classTime: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.jaiBlue,
  },
  classTimeEnd: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.lightGray,
    marginTop: 2,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  classCapacity: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 2,
  },
  textDimmed: {
    color: Colors.darkGray,
  },
  // PT Card Styles
  ptCard: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ptCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  ptCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  ptCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  ptTime: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
  },
  ptCommission: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.success,
    marginTop: 2,
  },
  markAttendedButton: {
    backgroundColor: Colors.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  markAttendedButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  // Working Hours Styles
  workingHoursCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  workingHoursHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workingHoursTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  workingHoursDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  workingHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  workingHoursLabel: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  workingHoursValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  workingHoursTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '40',
  },
  workingHoursTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  workingHoursTotalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.success,
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
  modalEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  modalEditButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '15',
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },
  readOnlyNoteText: {
    fontSize: 13,
    color: Colors.warning,
    flex: 1,
  },
  modalCloseButton: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  // Other coach's class styles
  classCardOtherCoach: {
    borderWidth: 1,
    borderColor: Colors.border,
    opacity: 0.85,
  },
  classCardGradientOther: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textOtherCoach: {
    color: Colors.lightGray,
  },
  myClassBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.success,
  },
  leadCoachLabel: {
    fontSize: 11,
    color: Colors.jaiBlue,
    marginTop: 4,
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
});
