import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { GlassCard, SectionHeader, Badge } from '../../../shared/components/FuturisticUI';

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
  enrolled_count?: number;
  assigned_coaches?: string[];
}

interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  member_id: string; // ✅ FIX: Added for notifications
  member_name: string;
  coach_name: string;
  coach_id: string;
  session_type: string;
  session_rate: number | null;
  commission_amount: number | null;
  coach_verified: boolean;
  member_verified: boolean;
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

// Helper function to get coach color by ID
const getCoachColor = (coachId: string, coaches: Coach[]): string => {
  const coach = coaches.find(c => c.id === coachId);
  if (!coach?.email) return Colors.jaiBlue; // fallback to Jai Blue
  return COACH_COLORS[coach.email.toLowerCase()] || Colors.jaiBlue;
};

// PT Commission Rates (at 50% commission)
const PT_RATES = {
  solo_package: { session_rate: 80, commission: 40 },
  solo_single: { session_rate: 80, commission: 40 },
  buddy: { session_rate: 120, commission: 60 },
  house_call: { session_rate: 140, commission: 70 },
};

// Helper to get commission amount based on session type
const getCommissionForSessionType = (sessionType: string): number => {
  return PT_RATES[sessionType as keyof typeof PT_RATES]?.commission || 40;
};

// Helper to get session rate based on session type
const getSessionRateForType = (sessionType: string): number => {
  return PT_RATES[sessionType as keyof typeof PT_RATES]?.session_rate || 80;
};

// Helper to format session type label with rate
const formatSessionTypeLabel = (sessionType: string): string => {
  const commission = getCommissionForSessionType(sessionType);
  const label = sessionType.replace('_', ' ').replace('solo package', 'Solo').replace('solo single', 'Solo').replace('buddy', 'Buddy').replace('house call', 'House Call');
  return `${label} - S$${commission}`;
};

export const AdminOverviewScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    classesToday: 0,
    ptToday: 0,
  });
  const [todayClasses, setTodayClasses] = useState<ClassItem[]>([]);
  const [todayPTSessions, setTodayPTSessions] = useState<PTSession[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const ptSectionY = useRef<number>(0);

  // Modal state
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [selectedPT, setSelectedPT] = useState<PTSession | null>(null);
  const [classDetailVisible, setClassDetailVisible] = useState(false);
  const [ptDetailVisible, setPTDetailVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [ptEditModalVisible, setPTEditModalVisible] = useState(false);

  // Edit Class form state (simplified)
  const [editClassType, setEditClassType] = useState<'All-Levels' | 'Advanced' | 'Sparring'>('All-Levels');
  const [editTime, setEditTime] = useState('');
  const [editDayOfWeek, setEditDayOfWeek] = useState('');
  const [assignedCoaches, setAssignedCoaches] = useState<{ id: string; full_name: string; order: number }[]>([]);

  // Edit PT form state
  const [editPTCoachId, setEditPTCoachId] = useState('');
  const [editPTMemberId, setEditPTMemberId] = useState('');
  const [editPTScheduledAt, setEditPTScheduledAt] = useState('');
  const [editPTDuration, setEditPTDuration] = useState('');
  const [editPTSessionType, setEditPTSessionType] = useState('');
  const [editPTSessionRate, setEditPTSessionRate] = useState('');
  const [editPTCommission, setEditPTCommission] = useState('');
  const [selectedCoachRates, setSelectedCoachRates] = useState<{
    solo_rate: number;
    buddy_rate: number;
    house_call_rate: number;
    pt_commission_rate: number;
  } | null>(null);
  const [members, setMembers] = useState<any[]>([]);

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

  // PT Session helpers
  const formatPTDateTime = (isoString: string) => {
    const date = new Date(isoString);
    const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const hours = sgDate.getUTCHours();
    const minutes = sgDate.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const isPTSessionPassed = (isoString: string) => {
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000;
    const sessionDate = new Date(isoString);
    const sessionInSG = new Date(sessionDate.getTime() + singaporeOffset);
    const nowInSG = new Date(now.getTime() + singaporeOffset);
    return sessionInSG < nowInSG;
  };

  const fetchData = async () => {
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

    // Fetch ALL classes for today (no coach filter - admin sees everything)
    const { data: classes } = await supabase
      .from('classes')
      .select(`
        *,
        lead_coach:lead_coach_id (full_name)
      `)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .order('start_time', { ascending: true });

    if (classes) {
      // Fetch enrollment counts and assigned coaches for each class
      const enrichedClasses = await Promise.all(
        classes.map(async (classItem) => {
          // Get enrollment count
          const { count: enrolledCount } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', classItem.id)
            .neq('status', 'cancelled');

          // Get assigned coaches
          const { data: coachData } = await supabase
            .from('class_coaches')
            .select('coach_id, users:coach_id(full_name)')
            .eq('class_id', classItem.id);

          const assignedCoachNames = (coachData || [])
            .map((item: any) => item.users?.full_name || '')
            .filter(Boolean);

          return {
            ...classItem,
            enrolled_count: enrolledCount || 0,
            assigned_coaches: assignedCoachNames,
          };
        })
      );

      setTodayClasses(enrichedClasses);
      setStats(prev => ({ ...prev, classesToday: enrichedClasses.length }));
    }

    // Fetch ALL PT sessions for today (no coach filter - admin sees everything)
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000;
    const todayInSG = new Date(now.getTime() + singaporeOffset);
    const year = todayInSG.getUTCFullYear();
    const month = todayInSG.getUTCMonth();
    const day = todayInSG.getUTCDate();
    const startOfTodayUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const endOfTodayUTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

    // DEBUG: Log PT session query details
    console.log('🔍 [OverviewScreen] Fetching PT sessions for admin');
    console.log('📅 Date range:', {
      start: startOfTodayUTC.toISOString(),
      end: endOfTodayUTC.toISOString(),
      userRole: user?.role,
      userId: user?.id,
    });

    const { data: ptData, error: ptError } = await supabase
      .from('pt_sessions')
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        status,
        session_type,
        session_rate,
        commission_amount,
        coach_verified,
        member_verified,
        coach_id,
        member_id,
        member:member_id (full_name),
        coach:coach_id (full_name)
      `)
      .gte('scheduled_at', startOfTodayUTC.toISOString())
      .lte('scheduled_at', endOfTodayUTC.toISOString())
      .order('scheduled_at', { ascending: true });

    // DEBUG: Log results
    console.log('✅ PT Sessions fetched:', {
      count: ptData?.length || 0,
      data: ptData,
      error: ptError,
    });

    if (ptError) {
      console.error('❌ PT Sessions fetch error:', ptError);
    }

    if (ptData) {
      const sessions: PTSession[] = ptData.map(item => ({
        id: item.id,
        scheduled_at: item.scheduled_at,
        duration_minutes: item.duration_minutes,
        status: item.status,
        session_type: item.session_type,
        session_rate: item.session_rate,
        commission_amount: item.commission_amount,
        coach_verified: item.coach_verified,
        member_verified: item.member_verified,
        coach_id: item.coach_id,
        member_id: item.member_id,
        member_name: (item.member as any)?.full_name || 'Unknown Member',
        coach_name: (item.coach as any)?.full_name || 'Unknown Coach',
      }));
      console.log('📊 Mapped PT sessions:', sessions);
      setTodayPTSessions(sessions);
      setStats(prev => ({ ...prev, ptToday: sessions.length }));
    }

    // Fetch all active coaches for color mapping (include master_admin - Jeremy)
    const { data: coachesData } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('role', ['coach', 'master_admin'])
      .eq('is_active', true)
      .not('full_name', 'is', null)
      .neq('full_name', '')
      .not('email', 'is', null)
      .neq('email', '');

    if (coachesData) {
      setCoaches(coachesData);
    }

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user?.id)
      .eq('is_read', false);

    setUnreadCount(count || 0);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('admin-notifications')
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Auto-update session_rate and commission when session type or coach changes
  useEffect(() => {
    if (editPTSessionType && selectedCoachRates) {
      // Get session rate based on session type and coach's rates
      let sessionRate = 80; // default
      if (editPTSessionType === 'solo_package' || editPTSessionType === 'solo_single') {
        sessionRate = selectedCoachRates.solo_rate;
      } else if (editPTSessionType === 'buddy') {
        sessionRate = selectedCoachRates.buddy_rate;
      } else if (editPTSessionType === 'house_call') {
        sessionRate = selectedCoachRates.house_call_rate;
      }

      setEditPTSessionRate(sessionRate.toString());

      // Calculate commission: session_rate × pt_commission_rate
      const commission = sessionRate * selectedCoachRates.pt_commission_rate;
      setEditPTCommission(commission.toFixed(0));
    }
  }, [editPTSessionType, selectedCoachRates]);

  // Recalculate commission when session_rate is manually changed
  useEffect(() => {
    if (editPTSessionRate && selectedCoachRates) {
      const sessionRate = parseFloat(editPTSessionRate);
      if (!isNaN(sessionRate)) {
        const commission = sessionRate * selectedCoachRates.pt_commission_rate;
        setEditPTCommission(commission.toFixed(0));
      }
    }
  }, [editPTSessionRate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Handle Edit Class
  const handleEditClass = async () => {
    if (!selectedClass) return;

    // Determine class type from name
    const name = selectedClass.name.toLowerCase();
    let classType: 'All-Levels' | 'Advanced' | 'Sparring' = 'All-Levels';
    if (name.includes('advanced')) classType = 'Advanced';
    else if (name.includes('sparring')) classType = 'Sparring';

    setEditClassType(classType);
    setEditTime(selectedClass.start_time);
    setEditDayOfWeek(selectedClass.day_of_week);

    // Fetch assigned coaches
    const { data: coachData } = await supabase
      .from('class_coaches')
      .select('coach_id, users:coach_id(full_name)')
      .eq('class_id', selectedClass.id);

    // Sort so lead coach is first, then others
    const assigned = (coachData || [])
      .map((item: any) => ({
        id: item.coach_id,
        full_name: item.users?.full_name || 'Unknown',
      }))
      .sort((a: any, b: any) => {
        // Lead coach first
        if (a.id === selectedClass.lead_coach_id) return -1;
        if (b.id === selectedClass.lead_coach_id) return 1;
        return 0;
      })
      .map((coach: any, index: number) => ({
        ...coach,
        order: index + 1,
      }));

    setAssignedCoaches(assigned);
    setEditModalVisible(true);
  };

  // Toggle coach assignment
  const toggleCoachAssignment = (coach: Coach) => {
    setAssignedCoaches(prev => {
      const exists = prev.find(c => c.id === coach.id);
      if (exists) {
        // Unchecking - remove this coach and reorder remaining
        const filtered = prev.filter(c => c.id !== coach.id);
        return filtered.map((c, index) => ({ ...c, order: index + 1 }));
      } else {
        // Checking - add with next order number
        const nextOrder = prev.length + 1;
        return [...prev, { id: coach.id, full_name: coach.full_name, order: nextOrder }];
      }
    });
  };

  // Save edited class
  const handleSaveClass = async () => {
    if (!selectedClass) return;

    try {
      if (assignedCoaches.length === 0) {
        Alert.alert('Error', 'Please assign at least one coach');
        return;
      }

      // Build class name from type
      const className = editClassType === 'Sparring' ? 'Sparring' : `${editClassType} Muay Thai`;

      // Calculate end time (start + 60 minutes)
      const [hours, minutes] = editTime.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + 60;
      const endHours = Math.floor(endMinutes / 60) % 24;
      const endMins = endMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

      // First assigned coach is automatically the lead coach
      const leadCoachId = assignedCoaches[0].id;

      // Update class
      const { error: classError } = await supabase
        .from('classes')
        .update({
          name: className,
          capacity: 12, // Default capacity
          start_time: editTime,
          end_time: endTime,
          day_of_week: editDayOfWeek,
          description: '', // No description
          lead_coach_id: leadCoachId,
        })
        .eq('id', selectedClass.id);

      if (classError) throw classError;

      // Update coach assignments
      await supabase.from('class_coaches').delete().eq('class_id', selectedClass.id);

      await supabase.from('class_coaches').insert(
        assignedCoaches.map(c => ({
          class_id: selectedClass.id,
          coach_id: c.id,
        }))
      );

      Alert.alert('Success', 'Class updated successfully!');
      setEditModalVisible(false);
      setClassDetailVisible(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update class');
    }
  };

  // Handle Edit PT
  const handleEditPT = async () => {
    if (!selectedPT) return;

    setEditPTCoachId(selectedPT.coach_id);
    setEditPTMemberId(selectedPT.member_id);
    setEditPTScheduledAt(selectedPT.scheduled_at);
    setEditPTDuration(selectedPT.duration_minutes.toString());
    setEditPTSessionType(selectedPT.session_type);
    setEditPTSessionRate(selectedPT.session_rate?.toString() || '80');
    setEditPTCommission(selectedPT.commission_amount?.toString() || '40');

    // Fetch coach's rates
    const { data: coachData } = await supabase
      .from('users')
      .select('solo_rate, buddy_rate, house_call_rate, pt_commission_rate')
      .eq('id', selectedPT.coach_id)
      .single();

    if (coachData) {
      setSelectedCoachRates({
        solo_rate: coachData.solo_rate || 80,
        buddy_rate: coachData.buddy_rate || 120,
        house_call_rate: coachData.house_call_rate || 140,
        pt_commission_rate: coachData.pt_commission_rate || 0.5,
      });
    }

    // Fetch members if not already loaded
    if (members.length === 0) {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'member')
        .eq('is_active', true)
        .order('full_name');
      setMembers(data || []);
    }

    setPTEditModalVisible(true);
  };

  // Save edited PT
  const handleSavePT = async () => {
    if (!selectedPT) return;

    try {
      const duration = parseInt(editPTDuration);
      if (duration < 15 || duration > 180) {
        Alert.alert('Error', 'Duration must be between 15 and 180 minutes');
        return;
      }

      // Parse and convert scheduled_at
      const date = new Date(editPTScheduledAt);

      const { error } = await supabase
        .from('pt_sessions')
        .update({
          coach_id: editPTCoachId,
          member_id: editPTMemberId,
          scheduled_at: date.toISOString(),
          duration_minutes: duration,
          session_type: editPTSessionType,
          session_rate: parseFloat(editPTSessionRate),
          commission_amount: parseFloat(editPTCommission),
        })
        .eq('id', selectedPT.id);

      if (error) throw error;

      Alert.alert('Success', 'PT session updated successfully!');
      setPTEditModalVisible(false);
      setPTDetailVisible(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update PT session');
    }
  };


  return (
    <View style={styles.container}>
      {/* Background Gradient */}
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
            <Text style={styles.userName}>{user?.full_name || 'Admin'}</Text>
          </View>

          <View style={styles.headerRight}>
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
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('Broadcast' as never)}
            >
              <Ionicons name="megaphone-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
          }
        >
          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            {/* Classes Today Card → Navigate to Schedule */}
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('AdminTabs', { screen: 'Schedule' })}
            >
              <View style={[styles.statGlow, { backgroundColor: Colors.jaiBlue }]} />
              <Text style={[styles.statNumber, { color: Colors.jaiBlue }]}>{stats.classesToday}</Text>
              <Text style={styles.statLabel}>Classes Today</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.jaiBlue} style={styles.statIcon} />
            </TouchableOpacity>

            {/* PT Today Card → Scroll to PT sessions */}
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => {
                if (ptSectionY.current > 0) {
                  scrollViewRef.current?.scrollTo({ y: ptSectionY.current, animated: true });
                }
              }}
            >
              <View style={[styles.statGlow, { backgroundColor: Colors.success }]} />
              <Text style={[styles.statNumber, { color: Colors.success }]}>{stats.ptToday}</Text>
              <Text style={styles.statLabel}>PT Today</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.success} style={styles.statIcon} />
            </TouchableOpacity>
          </View>

          {/* Today's Schedule */}
          <SectionHeader title="Today's Schedule" />

          {todayClasses.length === 0 && todayPTSessions.length === 0 ? (
            <GlassCard>
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={Colors.darkGray} />
                <Text style={styles.emptyText}>No sessions scheduled for today</Text>
              </View>
            </GlassCard>
          ) : (
            <>
              {/* Classes Section */}
              {todayClasses.length > 0 && (
                <>
                  <View style={styles.sectionSubHeader}>
                    <Text style={styles.sectionSubTitle}>CLASSES</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{todayClasses.length}</Text>
                    </View>
                  </View>
                  {todayClasses.map((classItem) => {
                    const isPassed = isTimePassed(classItem.start_time);
                    const coachColor = classItem.lead_coach_id ? getCoachColor(classItem.lead_coach_id, coaches) : Colors.jaiBlue;

                    // Format coach names (first names only, lead coach first)
                    const coachNames = (classItem.assigned_coaches || [])
                      .map(name => name.split(' ')[0]) // Get first name only
                      .join(', ');

                    return (
                      <TouchableOpacity
                        key={classItem.id}
                        style={[
                          styles.compactCard,
                          {
                            borderLeftWidth: 4,
                            borderLeftColor: coachColor,
                          },
                          isPassed && styles.cardDimmed
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedClass(classItem);
                          setClassDetailVisible(true);
                        }}
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
                        <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                          {classItem.enrolled_count || 0}/{classItem.capacity || 12} pax • {coachNames || 'No coaches'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* PT Sessions Section */}
              {todayPTSessions.length > 0 && (
                <>
                  <View
                    style={[styles.sectionSubHeader, { marginTop: Spacing.md }]}
                    onLayout={(e) => { ptSectionY.current = e.nativeEvent.layout.y; }}
                  >
                    <View style={[styles.sectionAccent, { backgroundColor: Colors.success }]} />
                    <Text style={[styles.sectionSubTitle, { color: Colors.success }]}>PT SESSIONS</Text>
                    <View style={[styles.countBadge, { backgroundColor: Colors.success }]}>
                      <Text style={styles.countBadgeText}>{todayPTSessions.length}</Text>
                    </View>
                  </View>
                  {todayPTSessions.map((session) => {
                    const time = formatPTDateTime(session.scheduled_at);
                    const isPassed = isPTSessionPassed(session.scheduled_at);
                    const isBuddy = session.session_type === 'buddy';
                    const isHouseCall = session.session_type === 'house_call';
                    const sessionTypeLabel = isBuddy ? 'Buddy' : isHouseCall ? 'House Call' : 'Solo';
                    const commission = session.commission_amount || getCommissionForSessionType(session.session_type);
                    const coachColor = getCoachColor(session.coach_id, coaches);

                    return (
                      <TouchableOpacity
                        key={session.id}
                        style={[
                          styles.compactCard,
                          {
                            borderLeftWidth: 4,
                            borderLeftColor: coachColor,
                          },
                          isPassed && styles.cardDimmed
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedPT(session);
                          setPTDetailVisible(true);
                        }}
                      >
                        <View style={styles.compactCardHeader}>
                          <View style={[styles.colorDot, { backgroundColor: coachColor }]} />
                          <Text style={[styles.compactTime, isPassed && styles.textDimmed]}>
                            {time}
                          </Text>
                          <Text style={[styles.compactTitle, isPassed && styles.textDimmed]}>
                            {session.member_name}
                          </Text>
                        </View>
                        <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                          {session.coach_name} • {sessionTypeLabel} • S${commission}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Class Detail Modal */}
        <Modal
          visible={classDetailVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setClassDetailVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setClassDetailVisible(false)}
          >
            <TouchableOpacity
              style={styles.detailModal}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              {selectedClass && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Class Details</Text>
                    <TouchableOpacity onPress={() => setClassDetailVisible(false)}>
                      <Ionicons name="close" size={24} color={Colors.white} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Class Name</Text>
                      <Text style={styles.detailValue}>{selectedClass.name}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Day</Text>
                      <Text style={styles.detailValue}>
                        {selectedClass.day_of_week.charAt(0).toUpperCase() + selectedClass.day_of_week.slice(1)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Time</Text>
                      <Text style={styles.detailValue}>
                        {formatTime(selectedClass.start_time)} - {formatTime(selectedClass.end_time)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Capacity</Text>
                      <Text style={styles.detailValue}>{selectedClass.capacity}</Text>
                    </View>
                    {selectedClass.lead_coach && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Lead Coach</Text>
                        <Text style={styles.detailValue}>{selectedClass.lead_coach.full_name}</Text>
                      </View>
                    )}
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        setClassDetailVisible(false);
                        handleEditClass();
                      }}
                    >
                      <Ionicons name="create-outline" size={18} color={Colors.jaiBlue} />
                      <Text style={[styles.actionButtonText, { color: Colors.jaiBlue }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        Alert.alert(
                          'Cancel Class',
                          'Are you sure you want to cancel this class?',
                          [
                            { text: 'No', style: 'cancel' },
                            {
                              text: 'Yes, Cancel',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await supabase
                                    .from('classes')
                                    .update({ is_active: false })
                                    .eq('id', selectedClass.id);
                                  Alert.alert('Success', 'Class cancelled');
                                  setClassDetailVisible(false);
                                  fetchData();
                                } catch (error: any) {
                                  Alert.alert('Error', error.message);
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={Colors.error} />
                      <Text style={[styles.actionButtonText, { color: Colors.error }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* PT Detail Modal */}
        <Modal
          visible={ptDetailVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setPTDetailVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPTDetailVisible(false)}
          >
            <TouchableOpacity
              style={styles.detailModal}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              {selectedPT && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>PT Session Details</Text>
                    <TouchableOpacity onPress={() => setPTDetailVisible(false)}>
                      <Ionicons name="close" size={24} color={Colors.white} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Member</Text>
                      <Text style={styles.detailValue}>{selectedPT.member_name}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Coach</Text>
                      <Text style={styles.detailValue}>{selectedPT.coach_name}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Date & Time</Text>
                      <Text style={styles.detailValue}>{formatPTDateTime(selectedPT.scheduled_at)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Duration</Text>
                      <Text style={styles.detailValue}>{selectedPT.duration_minutes} minutes</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Session Type</Text>
                      <Text style={styles.detailValue}>
                        {selectedPT.session_type.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Commission</Text>
                      <Text style={styles.detailValue}>
                        S${(selectedPT.commission_amount || 40).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={[
                        styles.detailValue,
                        { color: selectedPT.status === 'cancelled' ? Colors.error : Colors.success }
                      ]}>
                        {selectedPT.status.toUpperCase()}
                      </Text>
                    </View>
                  </ScrollView>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        setPTDetailVisible(false);
                        handleEditPT();
                      }}
                    >
                      <Ionicons name="create-outline" size={18} color={Colors.jaiBlue} />
                      <Text style={[styles.actionButtonText, { color: Colors.jaiBlue }]}>Edit</Text>
                    </TouchableOpacity>

                    {selectedPT.status !== 'cancelled' && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => {
                          Alert.alert(
                            'Cancel PT Session',
                            'Are you sure?',
                            [
                              { text: 'No', style: 'cancel' },
                              {
                                text: 'Yes',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    console.log('[Admin Overview] Cancelling PT session:', selectedPT.id);
                                    console.log('[Admin Overview] Admin user ID:', user?.id);
                                    console.log('[Admin Overview] Admin role:', user?.role);

                                    const { data, error } = await supabase
                                      .from('pt_sessions')
                                      .update({
                                        status: 'cancelled',
                                        cancelled_by: user?.id,
                                        cancelled_at: new Date().toISOString(),
                                      })
                                      .eq('id', selectedPT.id)
                                      .select();

                                    console.log('[Admin Overview] Update response:', { data, error });

                                    if (error) {
                                      console.error('[Admin Overview] Update error:', error);
                                      throw error;
                                    }

                                    // Format date in Singapore timezone
                                    const scheduledDate = new Date(selectedPT.scheduled_at);
                                    const sgDate = new Date(scheduledDate.getTime() + 8 * 60 * 60 * 1000);
                                    const dateStr = sgDate.toISOString().split('T')[0];

                                    console.log('=== NOTIFICATION DEBUG START ===');
                                    console.log('[NOTIF DEBUG] PT session cancelled, preparing notification for coach');
                                    console.log('[NOTIF DEBUG] Coach ID:', selectedPT.coach_id);
                                    console.log('[NOTIF DEBUG] Date string:', dateStr);
                                    console.log('[NOTIF DEBUG] Member name:', selectedPT.member_name);

                                    // Send notification to coach ONLY (matching working notification format)
                                    // REMOVED: reference_id, reference_type (causing insert failures)
                                    // REMOVED: member notification (member portal not built yet)
                                    const notifications = [
                                      {
                                        user_id: selectedPT.coach_id,
                                        title: 'PT Session Cancelled',
                                        message: `PT session with ${selectedPT.member_name || 'member'} on ${dateStr} has been cancelled`,
                                        notification_type: 'pt_cancelled',
                                        is_read: false,
                                      },
                                    ];

                                    console.log('[NOTIF DEBUG] Notification payload:', JSON.stringify(notifications, null, 2));
                                    console.log('[NOTIF DEBUG] About to insert notification (coach only)...');

                                    const { error: notifError } = await supabase
                                      .from('notifications')
                                      .insert(notifications);

                                    console.log('[NOTIF DEBUG] Insert complete');
                                    console.log('[NOTIF DEBUG] Notification error:', notifError);

                                    if (notifError) {
                                      console.error('[NOTIF DEBUG] ❌ NOTIFICATION INSERT FAILED');
                                      console.error('[NOTIF DEBUG] Full error object:', JSON.stringify(notifError, null, 2));
                                      console.error('[NOTIF DEBUG] Error code:', notifError.code);
                                      console.error('[NOTIF DEBUG] Error message:', notifError.message);
                                      console.error('[NOTIF DEBUG] Error details:', notifError.details);
                                      console.error('[NOTIF DEBUG] Error hint:', notifError.hint);
                                      Alert.alert('Warning', `PT cancelled but notification failed: ${notifError.message}`);
                                      // Don't throw - notification failure shouldn't block the cancel
                                    } else {
                                      console.log('[NOTIF DEBUG] ✅ Notification sent successfully to coach!');
                                    }
                                    console.log('=== NOTIFICATION DEBUG END ===');

                                    Alert.alert('Success', 'PT session cancelled');
                                    setPTDetailVisible(false);
                                    fetchData();
                                  } catch (error: any) {
                                    console.error('[Admin Overview] Cancel PT failed:', error);
                                    Alert.alert('Error', error.message || 'Failed to cancel PT session');
                                  }
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="close-circle-outline" size={18} color={Colors.error} />
                        <Text style={[styles.actionButtonText, { color: Colors.error }]}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Edit Class Modal */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          >
            <TouchableOpacity style={styles.editModalContent} activeOpacity={1}>
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>Edit Class</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.white} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.editModalBody}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Class Type Selector */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>CLASS TYPE</Text>
                  <View style={styles.classTypeButtons}>
                    {(['All-Levels', 'Advanced', 'Sparring'] as const).map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.classTypeButton,
                          editClassType === type && styles.classTypeButtonActive
                        ]}
                        onPress={() => setEditClassType(type)}
                      >
                        <Text style={[
                          styles.classTypeButtonText,
                          editClassType === type && styles.classTypeButtonTextActive
                        ]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Time */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>TIME</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editTime}
                    onChangeText={setEditTime}
                    placeholder="18:30"
                    placeholderTextColor={Colors.darkGray}
                    keyboardType="numbers-and-punctuation"
                  />
                  <Text style={styles.formHelper}>24-hour format (e.g., 18:30 for 6:30 PM)</Text>
                </View>

                {/* Coaches */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>ASSIGN COACHES</Text>
                  <Text style={styles.formHelper}>Tap to assign. First tap = Lead</Text>
                  <View style={styles.coachSimpleList}>
                    {coaches.map(coach => {
                      const assigned = assignedCoaches.find(c => c.id === coach.id);
                      const isLead = assigned && assigned.order === 1;
                      return (
                        <TouchableOpacity
                          key={coach.id}
                          style={styles.coachSimpleItem}
                          onPress={() => toggleCoachAssignment(coach)}
                        >
                          <View style={styles.coachSimpleLeft}>
                            <View style={[
                              styles.coachDot,
                              assigned && (isLead ? styles.coachDotLead : styles.coachDotAssistant)
                            ]} />
                            <Text style={[styles.coachSimpleName, assigned && styles.coachSimpleNameActive]}>
                              {assigned ? `${assigned.order}. ` : ''}{coach.full_name}
                            </Text>
                          </View>
                          {isLead && (
                            <View style={styles.leadBadgeSmall}>
                              <Text style={styles.leadBadgeSmallText}>LEAD</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Buttons */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalSaveButton}
                    onPress={handleSaveClass}
                  >
                    <Text style={styles.modalSaveButtonText}>Save</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Edit PT Modal */}
        <Modal
          visible={ptEditModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setPTEditModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPTEditModalVisible(false)}
          >
            <TouchableOpacity style={styles.editModalContent} activeOpacity={1}>
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>Edit PT Session</Text>
                <TouchableOpacity onPress={() => setPTEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.white} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.editModalBody}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Member</Text>
                  <ScrollView style={styles.memberList}>
                    {members.map(member => (
                      <TouchableOpacity
                        key={member.id}
                        style={styles.memberOption}
                        onPress={() => setEditPTMemberId(member.id)}
                      >
                        <View>
                          <Text style={styles.memberName}>{member.full_name}</Text>
                          <Text style={styles.memberEmail}>{member.email}</Text>
                        </View>
                        <Ionicons
                          name={editPTMemberId === member.id ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={editPTMemberId === member.id ? Colors.success : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Coach</Text>
                  <ScrollView style={styles.coachList}>
                    {coaches.map(coach => (
                      <TouchableOpacity
                        key={coach.id}
                        style={styles.coachRow}
                        onPress={() => setEditPTCoachId(coach.id)}
                      >
                        <Ionicons
                          name={editPTCoachId === coach.id ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={editPTCoachId === coach.id ? Colors.jaiBlue : Colors.lightGray}
                        />
                        <Text style={styles.coachName}>{coach.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Duration (minutes)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editPTDuration}
                    onChangeText={setEditPTDuration}
                    placeholder="60"
                    keyboardType="number-pad"
                    placeholderTextColor={Colors.darkGray}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Session Type</Text>
                  <View style={styles.sessionTypePicker}>
                    {['solo_package', 'buddy', 'house_call'].map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.sessionTypeOption,
                          editPTSessionType === type && styles.sessionTypeOptionActive
                        ]}
                        onPress={() => setEditPTSessionType(type)}
                      >
                        <Text style={[
                          styles.sessionTypeText,
                          editPTSessionType === type && styles.sessionTypeTextActive
                        ]}>
                          {formatSessionTypeLabel(type)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Session Rate (S$) - What Client Pays</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editPTSessionRate}
                    onChangeText={(value) => {
                      setEditPTSessionRate(value);
                      // Recalculate commission when session rate changes
                      if (selectedCoachRates && value) {
                        const rate = parseFloat(value);
                        const commission = rate * selectedCoachRates.pt_commission_rate;
                        setEditPTCommission(commission.toFixed(0));
                      }
                    }}
                    placeholder="80"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.darkGray}
                  />
                  <Text style={styles.formHint}>
                    Auto-filled based on coach's rates. You can override for special pricing.
                  </Text>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Commission (S$) - What Coach Earns</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editPTCommission}
                    onChangeText={setEditPTCommission}
                    placeholder="40"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.darkGray}
                  />
                  {editPTSessionRate && editPTCommission && selectedCoachRates && (
                    <View style={styles.commissionBreakdown}>
                      <Text style={styles.breakdownText}>
                        Client Pays: <Text style={styles.highlightAmount}>S${parseFloat(editPTSessionRate).toFixed(0)}</Text>
                        {' → '}
                        Coach Earns: <Text style={styles.highlightAmount}>S${parseFloat(editPTCommission).toFixed(0)}</Text>
                        {' '}
                        <Text style={styles.percentageText}>
                          ({(selectedCoachRates.pt_commission_rate * 100).toFixed(0)}%)
                        </Text>
                      </Text>
                      <Text style={styles.gymRevenue}>
                        Gym Revenue: S${(parseFloat(editPTSessionRate) - parseFloat(editPTCommission)).toFixed(0)}
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity style={styles.modalSaveButton} onPress={handleSavePT}>
                  <Text style={styles.modalSaveButtonText}>Save Changes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setPTEditModalVisible(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

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
  headerRight: {
    flexDirection: 'row',
    gap: 8,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    overflow: 'hidden',
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
    fontSize: 32,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  },
  classTime: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.jaiBlue,
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
  sectionSubHeader: {
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
  sectionSubTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.jaiBlue,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  countBadge: {
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  classMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coachText: {
    fontSize: 12,
    color: Colors.jaiBlue,
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
    padding: Spacing.md,
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
  ptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  ptDuration: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  ptCommission: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  ptCoachName: {
    fontSize: 12,
    color: Colors.success,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailModal: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '70%',
    marginBottom: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.lightGray,
    marginLeft: 12,
    width: 100,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'column',
    gap: 12,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  // Edit Modal Styles
  editModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '75%',
    alignSelf: 'center',
    marginBottom: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  editModalBody: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  formInput: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  coachList: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: Spacing.sm,
  },
  coachCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    borderRadius: 8,
  },
  coachCheckboxSelected: {
    backgroundColor: Colors.success + '10',
  },
  orderBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.jaiBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  coachName: {
    fontSize: 14,
    color: Colors.white,
    flex: 1,
  },
  coachNameSelected: {
    fontWeight: '600',
  },
  leadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFD700',
  },
  leadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
  },
  assistantText: {
    fontSize: 11,
    color: Colors.lightGray,
    fontStyle: 'italic',
  },
  formHelper: {
    fontSize: 11,
    color: Colors.darkGray,
    marginBottom: Spacing.xs,
    fontStyle: 'italic',
  },
  memberList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  memberOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  memberEmail: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 2,
  },
  sessionTypePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sessionTypeOption: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  sessionTypeOptionActive: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  sessionTypeText: {
    fontSize: 12,
    color: Colors.lightGray,
  },
  sessionTypeTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  // Simplified edit modal styles
  classTypeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  classTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  classTypeButtonActive: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  classTypeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  classTypeButtonTextActive: {
    color: Colors.white,
  },
  coachSimpleList: {
    gap: 0,
  },
  coachSimpleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  coachSimpleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  coachDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.darkGray,
  },
  coachDotLead: {
    backgroundColor: '#FFD700',
  },
  coachDotAssistant: {
    backgroundColor: Colors.lightGray,
  },
  coachSimpleName: {
    fontSize: 15,
    color: Colors.lightGray,
  },
  coachSimpleNameActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  leadBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#FFD700',
  },
  leadBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.lg,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: Colors.success,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  formHint: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
  commissionBreakdown: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
  },
  breakdownText: {
    fontSize: 14,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  highlightAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.success,
  },
  percentageText: {
    fontSize: 12,
    color: Colors.jaiBlue,
    fontWeight: '600',
  },
  gymRevenue: {
    fontSize: 13,
    color: Colors.darkGray,
    marginTop: Spacing.xs,
  },
});
