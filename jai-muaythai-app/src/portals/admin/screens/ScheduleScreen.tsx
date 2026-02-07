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
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
  enrolled_count?: number;
  assigned_coaches?: string[];
}

interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  member_id: string;
  coach_id: string;
  member_name: string;
  coach_name: string;
  session_type: string;
  session_rate: number | null;
  commission_amount: number | null;
  coach_verified: boolean;
  member_verified: boolean;
  payment_approved: boolean;
  edited_by: string | null;
  edited_at: string | null;
  edit_count: number;
  notes: string | null;
}

interface Member {
  id: string;
  full_name: string;
  email: string;
}

interface Coach {
  id: string;
  full_name: string;
  email: string;
  employment_type: 'full_time' | 'part_time' | null;
}

interface AssignedCoach {
  coach_id: string;
  full_name: string;
  order: number;
}

// PT Commission Rates (at 50% commission)
const PT_RATES = {
  solo_package: { session_rate: 80, commission: 40 },
  solo_single: { session_rate: 80, commission: 40 },
  buddy: { session_rate: 120, commission: 60 },
  house_call: { session_rate: 140, commission: 70 },
};

// Session types with commission rates displayed
const SESSION_TYPES = [
  { value: 'solo_package', label: 'Solo - S$40' },
  { value: 'buddy', label: 'Buddy - S$60' },
  { value: 'house_call', label: 'House Call - S$70' },
];

// Helper to get commission amount based on session type
const getCommissionForSessionType = (sessionType: string): number => {
  return PT_RATES[sessionType as keyof typeof PT_RATES]?.commission || 40;
};

// Helper to get session rate based on session type
const getSessionRateForType = (sessionType: string): number => {
  return PT_RATES[sessionType as keyof typeof PT_RATES]?.session_rate || 80;
};

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

const DAY_COLUMN_WIDTH = 100;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Calendar helper: get days grid for a month (Mon-start)
const getCalendarDays = (month: Date): (Date | null)[] => {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, m, d));
  return days;
};

// Format date string for display: "Fri, 7 Feb"
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${day} ${month}`;
};

// Get today's date string in YYYY-MM-DD
const getTodayStr = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Class levels
const CLASS_LEVELS = [
  'All-Levels',
  'Advanced',
  'Kids',
  'Pre-Teen',
  'Beginner',
  'Fundamental',
  'Pro Fighter',
];

// Days of week
const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

// Helper to get class level from name
const getClassLevel = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('kids')) return 'Kids';
  if (lower.includes('pre-teen')) return 'Pre-Teen';
  if (lower.includes('beginner')) return 'Beginner';
  if (lower.includes('advanced')) return 'Advanced';
  if (lower.includes('pro fighter')) return 'Pro Fighter';
  return 'All Levels';
};

export const AdminScheduleScreen: React.FC = () => {
  const { user } = useAuth();
  const [view, setView] = useState<'today' | 'weekly'>('today');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Filter state
  const [viewType, setViewType] = useState<'all' | 'classes' | 'pt'>('all');
  const [coachFilter, setCoachFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Add modals state
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showAddPTModal, setShowAddPTModal] = useState(false);

  // Add Class form state
  const [newClassName, setNewClassName] = useState('');
  const [newClassLevel, setNewClassLevel] = useState('All-Levels');
  const [newClassDay, setNewClassDay] = useState('monday');
  const [newClassStartTime, setNewClassStartTime] = useState('');
  const [newClassEndTime, setNewClassEndTime] = useState('');
  const [newClassCapacity, setNewClassCapacity] = useState('20');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [newClassCoaches, setNewClassCoaches] = useState<string[]>([]);
  const [newClassLeadCoach, setNewClassLeadCoach] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);

  // Add PT form state
  const [newPTCoachId, setNewPTCoachId] = useState('');
  const [newPTClientName, setNewPTClientName] = useState(''); // Text input instead of member selector
  const [newPTMemberId, setNewPTMemberId] = useState(''); // Keep for backward compatibility
  const [newPTDate, setNewPTDate] = useState('');
  const [newPTTime, setNewPTTime] = useState('');
  const [newPTDuration, setNewPTDuration] = useState('60');
  const [newPTSessionType, setNewPTSessionType] = useState('solo_single');
  const [newPTNotes, setNewPTNotes] = useState('');
  const [creatingPT, setCreatingPT] = useState(false);
  const [newPTCoachRates, setNewPTCoachRates] = useState<{
    solo_rate: number;
    buddy_rate: number;
    pt_commission_rate: number;
    isSenior: boolean;
  } | null>(null);
  const [newPTSessionRate, setNewPTSessionRate] = useState(0);
  const [newPTCommission, setNewPTCommission] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);

  // Modal state
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [assignedCoaches, setAssignedCoaches] = useState<AssignedCoach[]>([]);

  // Edit form state (simplified)
  const [editClassType, setEditClassType] = useState<'All-Levels' | 'Advanced' | 'Sparring'>('All-Levels');
  const [editTime, setEditTime] = useState('');
  const [editDayOfWeek, setEditDayOfWeek] = useState('');
  const [saving, setSaving] = useState(false);

  // PT Session state
  const [ptSessions, setPTSessions] = useState<PTSession[]>([]);
  const [selectedPT, setSelectedPT] = useState<PTSession | null>(null);
  const [ptDetailModalVisible, setPTDetailModalVisible] = useState(false);
  const [ptEditModalVisible, setPTEditModalVisible] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  // PT Edit form state
  const [editPTMemberId, setEditPTMemberId] = useState('');
  const [editPTCoachId, setEditPTCoachId] = useState('');
  const [editPTScheduledAt, setEditPTScheduledAt] = useState('');
  const [editPTDuration, setEditPTDuration] = useState('');
  const [editPTCommission, setEditPTCommission] = useState('');
  const [editPTSessionType, setEditPTSessionType] = useState('');
  const [editPTSessionRate, setEditPTSessionRate] = useState('');
  const [selectedCoachRates, setSelectedCoachRates] = useState<{
    solo_rate: number;
    buddy_rate: number;
    house_call_rate: number;
    pt_commission_rate: number;
  } | null>(null);

  // Auto-calculate commission when session type or rates change
  useEffect(() => {
    if (editPTSessionType && selectedCoachRates) {
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

  // Fetch coach rates for new PT session when coach is selected
  useEffect(() => {
    const fetchNewPTCoachRates = async () => {
      if (!newPTCoachId) {
        setNewPTCoachRates(null);
        return;
      }

      const { data: coachData, error } = await supabase
        .from('users')
        .select('solo_rate, buddy_rate, pt_commission_rate, email')
        .eq('id', newPTCoachId)
        .single();

      if (error) {
        console.error('Error fetching coach rates:', error);
        return;
      }

      if (coachData) {
        // Determine if coach is Senior or Assistant based on solo_rate
        // Senior Coaches (Jeremy, Shafiq, Sasi, Larvin): solo_rate = 120
        // Assistant Coaches (Isaac, Heng): solo_rate = 100
        const isSenior = (coachData.solo_rate || 100) >= 120;

        setNewPTCoachRates({
          solo_rate: coachData.solo_rate || 100,
          buddy_rate: coachData.buddy_rate || 0,
          pt_commission_rate: coachData.pt_commission_rate || 0.5,
          isSenior,
        });

        // Reset session type to solo_single when coach changes
        setNewPTSessionType('solo_single');
      }
    };

    fetchNewPTCoachRates();
  }, [newPTCoachId]);

  // Calculate session rate and commission for new PT session
  useEffect(() => {
    if (!newPTCoachRates || !newPTSessionType) {
      setNewPTSessionRate(0);
      setNewPTCommission(0);
      return;
    }

    let sessionRate = 0;

    // Calculate session rate based on session type
    if (newPTSessionType === 'solo_single') {
      sessionRate = newPTCoachRates.solo_rate;
    } else if (newPTSessionType === 'solo_10pack') {
      sessionRate = newPTCoachRates.solo_rate - 10; // $10 discount
    } else if (newPTSessionType === 'solo_20pack') {
      sessionRate = newPTCoachRates.solo_rate - 20; // $20 discount
    } else if (newPTSessionType === 'buddy_single') {
      // Senior coaches only - full buddy rate
      sessionRate = newPTCoachRates.buddy_rate;
    } else if (newPTSessionType === 'buddy_12pack') {
      // For Senior: $180 - $30 = $150
      // For Assistant: $120 (no discount, this is the package rate)
      if (newPTCoachRates.isSenior) {
        sessionRate = newPTCoachRates.buddy_rate - 30; // $30 discount for seniors
      } else {
        sessionRate = newPTCoachRates.buddy_rate; // No discount for assistants
      }
    }

    const commission = Math.round(sessionRate * newPTCoachRates.pt_commission_rate);

    setNewPTSessionRate(sessionRate);
    setNewPTCommission(commission);
  }, [newPTSessionType, newPTCoachRates]);

  // Fetch all coaches (include master_admin - Jeremy)
  const fetchCoaches = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, employment_type')
      .in('role', ['coach', 'admin', 'master_admin'])
      .eq('is_active', true)
      .not('full_name', 'is', null)
      .neq('full_name', '')
      .not('email', 'is', null)
      .neq('email', '')
      .order('full_name', { ascending: true });

    if (data) {
      setCoaches(data);
    }
  };

  // Fetch all members
  const fetchMembers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'member')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (data) {
      setMembers(data);
    }
  };

  // Fetch assigned coaches for a class
  const fetchAssignedCoaches = async (classId: string) => {
    const { data } = await supabase
      .from('class_coaches')
      .select(`
        coach_id,
        coach:coach_id (full_name)
      `)
      .eq('class_id', classId);

    if (data && selectedClass) {
      // Sort so lead coach is first, then others
      const coachesList: AssignedCoach[] = data
        .map(item => ({
          coach_id: item.coach_id,
          full_name: (item.coach as any)?.full_name || 'Unknown',
        }))
        .sort((a: any, b: any) => {
          // Lead coach first
          if (a.coach_id === selectedClass.lead_coach_id) return -1;
          if (b.coach_id === selectedClass.lead_coach_id) return 1;
          return 0;
        })
        .map((coach: any, index: number) => ({
          ...coach,
          order: index + 1,
        }));
      setAssignedCoaches(coachesList);
    } else {
      setAssignedCoaches([]);
    }
  };

  const fetchClasses = async () => {
    // Skip if filtering to PT only
    if (viewType === 'pt') {
      setClasses([]);
      return;
    }

    let query = supabase
      .from('classes')
      .select(`
        *,
        lead_coach:lead_coach_id (full_name),
        class_coaches (coach_id)
      `)
      .eq('is_active', true);

    // Apply coach filter - show classes where coach is lead or assigned
    if (coachFilter !== 'all') {
      // We'll filter in memory after fetch since we need to check both lead and assigned coaches
    }

    const { data } = await query.order('start_time', { ascending: true });

    if (data) {
      let filteredData = data;

      // Filter by coach if selected
      if (coachFilter !== 'all') {
        filteredData = data.filter(cls => {
          // Check if coach is lead coach
          if (cls.lead_coach_id === coachFilter) return true;
          // Check if coach is in assigned coaches
          if (cls.class_coaches?.some((cc: any) => cc.coach_id === coachFilter)) return true;
          return false;
        });
      }

      // Fetch enrollment counts and assigned coaches for each class
      const enrichedClasses = await Promise.all(
        filteredData.map(async (classItem) => {
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

      setClasses(enrichedClasses);
    }
  };

  const fetchPTSessions = async () => {
    // Skip if filtering to classes only
    if (viewType === 'classes') {
      setPTSessions([]);
      return;
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    // For weekly view, fetch wider range
    const startOfRangeUTC = new Date(Date.UTC(year, month, day - 7, 0, 0, 0, 0));
    const endOfRangeUTC = new Date(Date.UTC(year, month, day + 13, 23, 59, 59, 999));

    // DEBUG: Log PT session query details
    console.log('🔍 [ScheduleScreen] Fetching PT sessions for admin');
    console.log('📅 Date range:', {
      start: startOfRangeUTC.toISOString(),
      end: endOfRangeUTC.toISOString(),
      userRole: user?.role,
      userId: user?.id,
      coachFilter,
    });

    let query = supabase
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
        payment_approved,
        member_id,
        coach_id,
        edited_by,
        edited_at,
        edit_count,
        notes,
        member:member_id (full_name),
        coach:coach_id (full_name)
      `)
      .gte('scheduled_at', startOfRangeUTC.toISOString())
      .lte('scheduled_at', endOfRangeUTC.toISOString());

    // Apply coach filter
    if (coachFilter !== 'all') {
      query = query.eq('coach_id', coachFilter);
    }

    const { data, error } = await query.order('scheduled_at', { ascending: true });

    // DEBUG: Log results
    console.log('✅ PT Sessions fetched:', {
      count: data?.length || 0,
      error: error,
    });

    if (error) {
      console.error('❌ PT Sessions fetch error:', error);
    }

    if (data) {
      const sessions: PTSession[] = data.map(item => ({
        id: item.id,
        scheduled_at: item.scheduled_at,
        duration_minutes: item.duration_minutes,
        status: item.status,
        session_type: item.session_type,
        session_rate: item.session_rate,
        commission_amount: item.commission_amount,
        coach_verified: item.coach_verified,
        member_verified: item.member_verified,
        payment_approved: item.payment_approved || false,
        member_id: item.member_id,
        coach_id: item.coach_id,
        member_name: (item.member as any)?.full_name || 'Unknown Member',
        coach_name: (item.coach as any)?.full_name || 'Unknown Coach',
        edited_by: item.edited_by || null,
        edited_at: item.edited_at || null,
        edit_count: item.edit_count || 0,
        notes: item.notes || null,
      }));
      console.log('📊 Mapped PT sessions:', sessions.length);
      setPTSessions(sessions);
    }
  };

  // Combined fetch
  const fetchAll = async () => {
    await Promise.all([fetchClasses(), fetchPTSessions(), fetchCoaches(), fetchMembers()]);
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

  // Handle class card press
  const handleClassPress = async (cls: ClassItem) => {
    const count = await fetchEnrolledCount(cls.id);
    await fetchAssignedCoaches(cls.id);
    setEnrolledCount(count);
    setSelectedClass(cls);
    setDetailModalVisible(true);
  };

  // Handle Edit Class
  const handleEditClass = () => {
    if (!selectedClass) return;

    // Determine class type from name
    const name = selectedClass.name.toLowerCase();
    let classType: 'All-Levels' | 'Advanced' | 'Sparring' = 'All-Levels';
    if (name.includes('advanced')) classType = 'Advanced';
    else if (name.includes('sparring')) classType = 'Sparring';

    setEditClassType(classType);
    setEditTime(selectedClass.start_time);
    setEditDayOfWeek(selectedClass.day_of_week);
    setEditModalVisible(true);
  };

  // Toggle coach assignment
  const toggleCoachAssignment = (coachId: string) => {
    setAssignedCoaches(prev => {
      const exists = prev.find(c => c.coach_id === coachId);
      if (exists) {
        // Unchecking - remove this coach and reorder remaining
        const filtered = prev.filter(c => c.coach_id !== coachId);
        return filtered.map((c, index) => ({ ...c, order: index + 1 }));
      } else {
        // Checking - add with next order number
        const coach = coaches.find(c => c.id === coachId);
        const nextOrder = prev.length + 1;
        return [...prev, { coach_id: coachId, full_name: coach?.full_name || 'Unknown', order: nextOrder }];
      }
    });
  };

  // Save class changes
  const saveClassChanges = async () => {
    if (!selectedClass) return;
    setSaving(true);

    try {
      // Validate required fields
      if (assignedCoaches.length === 0) {
        Alert.alert('Error', 'Please assign at least one coach');
        setSaving(false);
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
      const leadCoachId = assignedCoaches[0].coach_id;

      // Fetch existing assignments to compare
      const { data: existingAssignments } = await supabase
        .from('class_coaches')
        .select('coach_id')
        .eq('class_id', selectedClass.id);

      const existingCoachIds = existingAssignments?.map(a => a.coach_id) || [];
      const newCoachIds = assignedCoaches.map(c => c.coach_id);

      // Determine newly assigned and unassigned coaches
      const newlyAssigned = newCoachIds.filter(id => !existingCoachIds.includes(id));
      const unassigned = existingCoachIds.filter(id => !newCoachIds.includes(id));

      // Update class
      const { error } = await supabase
        .from('classes')
        .update({
          name: className,
          description: '', // No description
          day_of_week: editDayOfWeek,
          start_time: editTime,
          end_time: endTime,
          capacity: 12, // Default capacity
          lead_coach_id: leadCoachId,
        })
        .eq('id', selectedClass.id);

      if (error) throw error;

      // Update coach assignments
      // First delete existing assignments
      await supabase.from('class_coaches').delete().eq('class_id', selectedClass.id);

      // Then insert new assignments
      if (assignedCoaches.length > 0) {
        const coachAssignments = assignedCoaches.map(coach => ({
          class_id: selectedClass.id,
          coach_id: coach.coach_id,
          is_lead: coach.is_lead,
        }));
        await supabase.from('class_coaches').insert(coachAssignments);
      }

      // Send notifications to newly assigned coaches
      if (newlyAssigned.length > 0) {
        const assignmentNotifications = newlyAssigned.map(coachId => {
          const coach = assignedCoaches.find(c => c.coach_id === coachId);
          const isLead = coach?.is_lead || false;
          return {
            user_id: coachId,
            title: isLead ? 'Assigned as Lead Coach' : 'Assigned to Class',
            message: `You've been assigned to ${editName.trim()} on ${editDayOfWeek.charAt(0).toUpperCase() + editDayOfWeek.slice(1)}s at ${editStartTime}${isLead ? ' as Lead Coach' : ''}`,
            notification_type: 'system',
            is_read: false,
          };
        });
        await supabase.from('notifications').insert(assignmentNotifications);
      }

      // Send notifications to unassigned coaches
      if (unassigned.length > 0) {
        const unassignmentNotifications = unassigned.map(coachId => ({
          user_id: coachId,
          title: 'Removed from Class',
          message: `You've been removed from ${selectedClass.name} on ${selectedClass.day_of_week.charAt(0).toUpperCase() + selectedClass.day_of_week.slice(1)}s`,
          notification_type: 'system',
          is_read: false,
        }));
        await supabase.from('notifications').insert(unassignmentNotifications);
      }

      Alert.alert('Success', 'Class updated successfully!');
      setEditModalVisible(false);
      setDetailModalVisible(false);
      fetchClasses();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update class');
    } finally {
      setSaving(false);
    }
  };

  // Handle Cancel Class
  const handleCancelClass = () => {
    if (!selectedClass) return;

    Alert.alert(
      'Cancel Class',
      'Are you sure you want to cancel this class? Coaches will be notified.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('classes')
                .update({ is_active: false })
                .eq('id', selectedClass.id);

              if (error) throw error;

              // Get all assigned coaches for this class
              const { data: assignedCoaches } = await supabase
                .from('class_coaches')
                .select('coach_id')
                .eq('class_id', selectedClass.id);

              if (assignedCoaches && assignedCoaches.length > 0) {
                // Send notifications to all assigned coaches
                const notifications = assignedCoaches.map(ac => ({
                  user_id: ac.coach_id,
                  title: 'Class Cancelled',
                  message: `${selectedClass.name} on ${selectedClass.day_of_week.charAt(0).toUpperCase() + selectedClass.day_of_week.slice(1)}s at ${selectedClass.start_time} has been cancelled`,
                  notification_type: 'class_cancelled',
                  reference_id: selectedClass.id,
                  reference_type: 'class',
                  is_read: false,
                }));

                await supabase.from('notifications').insert(notifications);
              }

              Alert.alert('Success', 'Class has been cancelled.');
              setDetailModalVisible(false);
              fetchClasses();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel class');
            }
          },
        },
      ]
    );
  };

  // Handle Delete Class (Master Admin only)
  const handleDeleteClass = () => {
    if (!selectedClass) return;

    Alert.alert(
      'Delete Class',
      'This will permanently delete this class. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              // Get all assigned coaches BEFORE deleting
              const { data: assignedCoaches } = await supabase
                .from('class_coaches')
                .select('coach_id')
                .eq('class_id', selectedClass.id);

              if (assignedCoaches && assignedCoaches.length > 0) {
                // Send notifications to all assigned coaches
                const notifications = assignedCoaches.map(ac => ({
                  user_id: ac.coach_id,
                  title: 'Class Deleted',
                  message: `${selectedClass.name} on ${selectedClass.day_of_week.charAt(0).toUpperCase() + selectedClass.day_of_week.slice(1)}s at ${selectedClass.start_time} has been permanently deleted`,
                  notification_type: 'class_cancelled',
                  reference_id: selectedClass.id,
                  reference_type: 'class',
                  is_read: false,
                }));

                await supabase.from('notifications').insert(notifications);
              }

              // First delete related enrollments
              await supabase
                .from('class_enrollments')
                .delete()
                .eq('class_id', selectedClass.id);

              // Delete class coach assignments
              await supabase
                .from('class_coaches')
                .delete()
                .eq('class_id', selectedClass.id);

              // Then delete the class
              const { error } = await supabase
                .from('classes')
                .delete()
                .eq('id', selectedClass.id);

              if (error) throw error;

              Alert.alert('Success', 'Class has been permanently deleted.');
              setDetailModalVisible(false);
              fetchClasses();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete class');
            }
          },
        },
      ]
    );
  };

  // Check if user is Master Admin
  const isMasterAdmin = user?.role === 'master_admin';

  // PT Session helper functions
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

  const isPTSessionPassed = (isoString: string) => {
    const now = new Date();
    const singaporeOffset = 8 * 60 * 60 * 1000;
    const sessionDate = new Date(isoString);
    const sessionInSG = new Date(sessionDate.getTime() + singaporeOffset);
    const nowInSG = new Date(now.getTime() + singaporeOffset);
    return sessionInSG < nowInSG;
  };

  const getVerificationStatus = (session: PTSession) => {
    if (session.coach_verified && session.member_verified) return 'Both Verified';
    if (session.coach_verified) return 'Coach Verified';
    if (session.member_verified) return 'Member Verified';
    return 'Pending';
  };

  // Handle PT card press
  const handlePTPress = (session: PTSession) => {
    setSelectedPT(session);
    setPTDetailModalVisible(true);
  };

  // Handle Edit PT
  const handleEditPT = async () => {
    if (!selectedPT) return;

    // Fetch coach's rates
    const { data: coachData, error: coachError } = await supabase
      .from('users')
      .select('solo_rate, buddy_rate, house_call_rate, pt_commission_rate')
      .eq('id', selectedPT.coach_id)
      .single();

    if (coachError) {
      console.error('Error fetching coach rates:', coachError);
    } else if (coachData) {
      setSelectedCoachRates({
        solo_rate: coachData.solo_rate || 80,
        buddy_rate: coachData.buddy_rate || 120,
        house_call_rate: coachData.house_call_rate || 140,
        pt_commission_rate: coachData.pt_commission_rate || 0.5,
      });
    }

    setEditPTMemberId(selectedPT.member_id);
    setEditPTCoachId(selectedPT.coach_id);
    setEditPTScheduledAt(selectedPT.scheduled_at);
    setEditPTDuration(selectedPT.duration_minutes.toString());
    setEditPTCommission(selectedPT.commission_amount?.toString() || '40');
    setEditPTSessionType(selectedPT.session_type);
    setEditPTSessionRate(selectedPT.session_rate?.toString() || '80');
    setPTEditModalVisible(true);
  };

  // Handle session type change - auto-fill commission
  const handleSessionTypeChange = (type: string) => {
    setEditPTSessionType(type);
    const sessionType = SESSION_TYPES.find(st => st.value === type);
    if (sessionType) {
      setEditPTCommission(sessionType.defaultCommission.toString());
    }
  };

  // Save PT changes
  const savePTChanges = async () => {
    if (!selectedPT) return;

    // Validate required fields
    if (!editPTMemberId) {
      Alert.alert('Error', 'Please select a member');
      return;
    }
    if (!editPTCoachId) {
      Alert.alert('Error', 'Please select a coach');
      return;
    }
    if (!editPTScheduledAt) {
      Alert.alert('Error', 'Please select date and time');
      return;
    }
    const duration = parseInt(editPTDuration) || 60;
    if (duration < 15 || duration > 180) {
      Alert.alert('Error', 'Duration must be between 15 and 180 minutes');
      return;
    }

    try {
      // Check if date/time or coach changed
      const dateTimeChanged = editPTScheduledAt !== selectedPT.scheduled_at;
      const coachChanged = editPTCoachId !== selectedPT.coach_id;

      const { error } = await supabase
        .from('pt_sessions')
        .update({
          member_id: editPTMemberId,
          coach_id: editPTCoachId,
          scheduled_at: editPTScheduledAt,
          duration_minutes: duration,
          session_rate: parseFloat(editPTSessionRate),
          commission_amount: parseFloat(editPTCommission) || 40,
          session_type: editPTSessionType,
          edited_by: user?.id,
          edited_at: new Date().toISOString(),
          edit_count: (selectedPT.edit_count || 0) + 1,
        })
        .eq('id', selectedPT.id);

      if (error) throw error;

      // Send notifications
      const notifications = [];

      // Format new date/time for notification
      const newDate = new Date(editPTScheduledAt);
      const sgDate = new Date(newDate.getTime() + 8 * 60 * 60 * 1000);
      const dateStr = sgDate.toISOString().split('T')[0];
      const hours = sgDate.getUTCHours();
      const minutes = sgDate.getUTCMinutes();
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      // Get member name
      const { data: memberData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', editPTMemberId)
        .single();
      const memberName = memberData?.full_name || 'Member';

      // Notify coach if time/date changed or coach changed
      if (dateTimeChanged || coachChanged) {
        const coachMessage = dateTimeChanged
          ? `Your PT session with ${memberName} has been rescheduled to ${dateStr} at ${timeStr}`
          : `You've been assigned a PT session with ${memberName} on ${dateStr} at ${timeStr}`;

        notifications.push({
          user_id: editPTCoachId,
          title: 'PT Session Updated',
          message: coachMessage,
          notification_type: 'pt_updated',
          is_read: false,
        });
      }

      // Notify member if time/date changed
      if (dateTimeChanged) {
        notifications.push({
          user_id: editPTMemberId,
          title: 'PT Session Rescheduled',
          message: `Your PT session has been rescheduled to ${dateStr} at ${timeStr}`,
          notification_type: 'pt_updated',
          is_read: false,
        });
      }

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }

      Alert.alert('Success', 'PT session updated successfully!');
      setPTEditModalVisible(false);
      setPTDetailModalVisible(false);
      fetchPTSessions();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update PT session');
    }
  };

  // Handle Approve Payment
  const handleApprovePayment = () => {
    if (!selectedPT) return;

    Alert.alert(
      'Approve Payment',
      `Approve payment of S$${(selectedPT.commission_amount || 40).toFixed(2)} for ${selectedPT.member_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('pt_sessions')
                .update({
                  payment_approved: true,
                  approved_by: user?.id,
                  approved_at: new Date().toISOString(),
                })
                .eq('id', selectedPT.id);

              if (error) throw error;

              Alert.alert('Success', 'Payment approved!');
              setPTDetailModalVisible(false);
              fetchPTSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to approve payment');
            }
          },
        },
      ]
    );
  };

  // Handle Cancel PT
  const handleCancelPT = () => {
    if (!selectedPT) return;

    Alert.alert(
      'Cancel PT Session',
      'Are you sure you want to cancel this PT session?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('pt_sessions')
                .update({
                  status: 'cancelled',
                  cancelled_by: user?.id,
                  cancelled_at: new Date().toISOString(),
                })
                .eq('id', selectedPT.id);

              if (error) throw error;

              // Format date for notification
              const sessionDate = new Date(selectedPT.scheduled_at);
              const sgDate = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000);
              const dateStr = sgDate.toISOString().split('T')[0];

              // Send notifications to coach and member
              const notifications = [
                {
                  user_id: selectedPT.coach_id,
                  title: 'PT Session Cancelled',
                  message: `PT session with ${selectedPT.member_name} on ${dateStr} has been cancelled`,
                  notification_type: 'pt_cancelled',
                  reference_id: selectedPT.id,
                  reference_type: 'pt_session',
                  is_read: false,
                },
                {
                  user_id: selectedPT.member_id,
                  title: 'PT Session Cancelled',
                  message: `Your PT session on ${dateStr} has been cancelled`,
                  notification_type: 'pt_cancelled',
                  reference_id: selectedPT.id,
                  reference_type: 'pt_session',
                  is_read: false,
                },
              ];

              await supabase.from('notifications').insert(notifications);

              Alert.alert('Success', 'PT session cancelled.');
              setPTDetailModalVisible(false);
              fetchPTSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel PT session');
            }
          },
        },
      ]
    );
  };

  // Handle Delete PT (Master Admin only)
  const handleDeletePT = () => {
    if (!selectedPT) return;

    Alert.alert(
      'Delete PT Session',
      'This will permanently delete this PT session. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              // Format date for notification
              const sessionDate = new Date(selectedPT.scheduled_at);
              const sgDate = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000);
              const dateStr = sgDate.toISOString().split('T')[0];

              // Send notifications to coach and member BEFORE deleting
              const notifications = [
                {
                  user_id: selectedPT.coach_id,
                  title: 'PT Session Deleted',
                  message: `PT session with ${selectedPT.member_name} on ${dateStr} has been deleted`,
                  notification_type: 'pt_cancelled',
                  reference_id: selectedPT.id,
                  reference_type: 'pt_session',
                  is_read: false,
                },
                {
                  user_id: selectedPT.member_id,
                  title: 'PT Session Deleted',
                  message: `Your PT session on ${dateStr} has been deleted`,
                  notification_type: 'pt_cancelled',
                  reference_id: selectedPT.id,
                  reference_type: 'pt_session',
                  is_read: false,
                },
              ];

              await supabase.from('notifications').insert(notifications);

              const { error } = await supabase
                .from('pt_sessions')
                .delete()
                .eq('id', selectedPT.id);

              if (error) throw error;

              Alert.alert('Success', 'PT session deleted.');
              setPTDetailModalVisible(false);
              fetchPTSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete PT session');
            }
          },
        },
      ]
    );
  };

  // Copy PT session to next week
  const handleCopyToNextWeek = async (session: PTSession) => {
    // Parse scheduled_at to SGT date/time
    const sessionDate = new Date(session.scheduled_at);
    const sgDate = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000);
    const nextWeekDate = new Date(sgDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const dateStr = `${nextWeekDate.getUTCFullYear()}-${String(nextWeekDate.getUTCMonth() + 1).padStart(2, '0')}-${String(nextWeekDate.getUTCDate()).padStart(2, '0')}`;
    const timeStr = `${String(sgDate.getUTCHours()).padStart(2, '0')}:${String(sgDate.getUTCMinutes()).padStart(2, '0')}`;

    // Extract client name from notes (format: "Client: Name\n\n...")
    let clientName = session.member_name || '';
    if (session.notes) {
      const clientMatch = session.notes.match(/^Client:\s*(.+?)(\n|$)/);
      if (clientMatch) clientName = clientMatch[1].trim();
    }

    // Pre-fill the Add PT form
    setNewPTCoachId(session.coach_id);
    setNewPTClientName(clientName);
    setNewPTDate(dateStr);
    setNewPTTime(timeStr);
    setNewPTDuration(String(session.duration_minutes));
    setNewPTSessionType(session.session_type);
    setNewPTNotes(session.notes?.replace(/^Client:\s*.+?\n\n?/, '') || '');

    // Fetch coach rates for the pre-filled coach
    const { data: coachData } = await supabase
      .from('users')
      .select('solo_rate, buddy_rate, pt_commission_rate, email')
      .eq('id', session.coach_id)
      .single();

    if (coachData) {
      const isSenior = (coachData.solo_rate || 100) >= 120;
      setNewPTCoachRates({
        solo_rate: coachData.solo_rate || 100,
        buddy_rate: coachData.buddy_rate || 0,
        pt_commission_rate: coachData.pt_commission_rate || 0.5,
        isSenior,
      });
    }

    setCalendarMonth(nextWeekDate);
    setRepeatWeekly(false);
    setRepeatWeeks(4);

    // Close detail modal, open create modal
    setPTDetailModalVisible(false);
    setShowAddPTModal(true);
  };

  // Create new class
  const handleCreateClass = async () => {
    // Validation
    if (!newClassLevel || !newClassDay || !newClassStartTime || !newClassEndTime) {
      Alert.alert('Error', 'Please fill in all required fields (level, day, start time, end time)');
      return;
    }

    if (newClassCoaches.length === 0) {
      Alert.alert('Error', 'Please assign at least one coach');
      return;
    }

    if (!newClassLeadCoach) {
      Alert.alert('Error', 'Please select a lead coach');
      return;
    }

    if (!newClassCoaches.includes(newClassLeadCoach)) {
      Alert.alert('Error', 'Lead coach must be one of the assigned coaches');
      return;
    }

    const capacity = parseInt(newClassCapacity);
    if (isNaN(capacity) || capacity < 1 || capacity > 50) {
      Alert.alert('Error', 'Capacity must be between 1 and 50');
      return;
    }

    setCreatingClass(true);

    try {
      // Create class
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .insert({
          name: newClassName || `${newClassLevel} Class`,
          day_of_week: newClassDay,
          start_time: newClassStartTime,
          end_time: newClassEndTime,
          capacity: capacity,
          description: newClassDescription,
          location: 'Jai Muay Thai',
          lead_coach_id: newClassLeadCoach,
          is_active: true,
        })
        .select()
        .single();

      if (classError) throw classError;

      // Assign coaches to class
      const coachAssignments = newClassCoaches.map(coachId => ({
        class_id: classData.id,
        coach_id: coachId,
        is_lead: coachId === newClassLeadCoach,
      }));

      const { error: assignError } = await supabase
        .from('class_coaches')
        .insert(coachAssignments);

      if (assignError) throw assignError;

      // Send notifications to all assigned coaches
      const notifications = newClassCoaches.map(coachId => ({
        user_id: coachId,
        title: 'New Class Assignment',
        message: `You've been assigned to ${newClassName || newClassLevel} class on ${newClassDay} at ${newClassStartTime}${coachId === newClassLeadCoach ? ' as lead coach' : ''}`,
        notification_type: 'class' as const,
        reference_id: classData.id,
        reference_type: 'class' as const,
        is_read: false,
      }));

      await supabase.from('notifications').insert(notifications);

      Alert.alert('Success', 'Class created successfully!');

      // Reset form
      setNewClassName('');
      setNewClassLevel('All-Levels');
      setNewClassDay('monday');
      setNewClassStartTime('');
      setNewClassEndTime('');
      setNewClassCapacity('20');
      setNewClassDescription('');
      setNewClassCoaches([]);
      setNewClassLeadCoach('');

      setShowAddClassModal(false);
      fetchClasses();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create class');
    } finally {
      setCreatingClass(false);
    }
  };

  // Helper: build UTC ISO string from a YYYY-MM-DD date and HH:MM time in SGT
  const buildUTCFromSGT = (dateStr: string, timeStr: string): string => {
    // Validate date format
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) throw new Error('Invalid date format');

    // Normalize time: accept "1430" or "14:30"
    let normalizedTime = timeStr.trim();
    const fourDigit = normalizedTime.match(/^(\d{2})(\d{2})$/);
    if (fourDigit) normalizedTime = `${fourDigit[1]}:${fourDigit[2]}`;

    // Validate time format
    const timeMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) throw new Error('Invalid time format');

    const hours = parseInt(timeMatch[1]);
    const mins = parseInt(timeMatch[2]);
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) {
      throw new Error('Invalid time value');
    }

    // Build ISO 8601 with SGT offset (+08:00) — JS Date handles the UTC conversion
    const sgtISO = `${dateStr}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00+08:00`;
    const utcDate = new Date(sgtISO);

    if (isNaN(utcDate.getTime())) throw new Error('Invalid date/time combination');

    return utcDate.toISOString();
  };

  // Helper: add N weeks to a YYYY-MM-DD string
  const addWeeksToDate = (dateStr: string, weeks: number): string => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + weeks * 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Create new PT session(s)
  const handleCreatePTSession = async () => {
    // Validation
    if (!newPTCoachId) {
      Alert.alert('Error', 'Please select a coach');
      return;
    }

    if (!newPTClientName || newPTClientName.trim() === '') {
      Alert.alert('Error', 'Please enter client name');
      return;
    }

    if (!newPTDate || !newPTTime) {
      Alert.alert('Error', 'Please enter date and time');
      return;
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newPTDate)) {
      Alert.alert('Error', 'Invalid date format. Please select a date from the calendar.');
      return;
    }

    // Validate time format (accept "1430" or "14:30")
    if (!/^\d{1,2}:\d{2}$/.test(newPTTime) && !/^\d{4}$/.test(newPTTime)) {
      Alert.alert('Error', 'Invalid time format. Use 1430 or 14:30');
      return;
    }

    const duration = parseInt(newPTDuration);
    if (isNaN(duration) || duration < 15 || duration > 180) {
      Alert.alert('Error', 'Duration must be between 15 and 180 minutes');
      return;
    }

    if (!newPTCoachRates || newPTSessionRate === 0) {
      Alert.alert('Error', 'Please select a session type');
      return;
    }

    // If repeating, show confirmation with all dates
    if (repeatWeekly && repeatWeeks > 1) {
      const dates: string[] = [];
      for (let i = 0; i < repeatWeeks; i++) {
        const d = addWeeksToDate(newPTDate, i);
        dates.push(formatDisplayDate(d));
      }
      const dateList = dates.join('\n');

      Alert.alert(
        `Create ${repeatWeeks} sessions?`,
        `Sessions will be created on:\n\n${dateList}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create All', onPress: () => executeCreatePTSessions() },
        ]
      );
      return;
    }

    await executeCreatePTSessions();
  };

  const executeCreatePTSessions = async () => {
    setCreatingPT(true);

    try {
      const sessionRate = newPTSessionRate;
      const commission = newPTCommission;
      const duration = parseInt(newPTDuration);
      const sessionCount = repeatWeekly ? repeatWeeks : 1;

      const sessionsToInsert = [];
      const notificationsToInsert = [];

      for (let i = 0; i < sessionCount; i++) {
        const sessionDate = i === 0 ? newPTDate : addWeeksToDate(newPTDate, i);
        const utcISO = buildUTCFromSGT(sessionDate, newPTTime);

        console.log(`[PT Create] Session ${i + 1}/${sessionCount}: date=${sessionDate}, time=${newPTTime}, utcISO=${utcISO}`);

        sessionsToInsert.push({
          coach_id: newPTCoachId,
          member_id: null,
          scheduled_at: utcISO,
          duration_minutes: duration,
          session_type: newPTSessionType,
          session_rate: sessionRate,
          commission_amount: commission,
          status: 'scheduled',
          notes: `Client: ${newPTClientName}${newPTNotes ? '\n\n' + newPTNotes : ''}`,
          coach_verified: false,
          member_verified: false,
        });
      }

      // Batch insert all sessions
      const { data: sessionData, error: sessionError } = await supabase
        .from('pt_sessions')
        .insert(sessionsToInsert)
        .select();

      if (sessionError) throw sessionError;

      // Send notification(s) to coach
      if (sessionData) {
        for (const session of sessionData) {
          notificationsToInsert.push({
            user_id: newPTCoachId,
            title: 'New PT Session Scheduled',
            message: `PT session with ${newPTClientName} on ${formatDisplayDate(newPTDate)} at ${newPTTime}`,
            notification_type: 'booking' as const,
            reference_id: session.id,
            reference_type: 'pt_session' as const,
            is_read: false,
          });
        }
        await supabase.from('notifications').insert(notificationsToInsert);
      }

      const successMsg = sessionCount > 1
        ? `${sessionCount} PT sessions created successfully!`
        : 'PT session created successfully!';
      Alert.alert('Success', successMsg);

      // Reset form
      setNewPTCoachId('');
      setNewPTClientName('');
      setNewPTMemberId('');
      setNewPTDate('');
      setNewPTTime('');
      setNewPTDuration('60');
      setNewPTSessionType('solo_single');
      setNewPTNotes('');
      setNewPTCoachRates(null);
      setNewPTSessionRate(0);
      setNewPTCommission(0);
      setShowDatePicker(false);
      setCalendarMonth(new Date());
      setRepeatWeekly(false);
      setRepeatWeeks(4);

      setShowAddPTModal(false);
      fetchPTSessions();
    } catch (error: any) {
      console.error('[PT Create] Error:', error);
      Alert.alert('Error', error.message || 'Failed to create PT session');
    } finally {
      setCreatingPT(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchClasses();
    fetchPTSessions();
  }, [viewType, coachFilter]);

  useEffect(() => {
    if (view === 'weekly' && scrollViewRef.current) {
      setTimeout(() => {
        const todayOffset = 7 * (DAY_COLUMN_WIDTH + 8);
        scrollViewRef.current?.scrollTo({ x: Math.max(0, todayOffset), animated: false });
      }, 100);
    }
  }, [view]);

  // NOTE: editPTSessionType commission auto-calculation is handled by the useEffect
  // at lines 231-247 which uses flexible commission based on selectedCoachRates

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const getDayOfWeek = (date: Date): string => {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  };

  // Get today's workload for a coach
  const getCoachWorkload = (coachId: string) => {
    const today = new Date();
    const todayDayOfWeek = getDayOfWeek(today);

    // Count classes today where coach is assigned
    const classCount = classes.filter(cls => {
      if (cls.day_of_week !== todayDayOfWeek) return false;
      return cls.lead_coach_id === coachId;
    }).length;

    // Count PT sessions today
    const todayDateStr = today.toISOString().split('T')[0];
    const ptCount = ptSessions.filter(session => {
      const sessionDate = new Date(session.scheduled_at);
      const sgDate = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000);
      const sessionDateStr = sgDate.toISOString().split('T')[0];
      return sessionDateStr === todayDateStr && session.coach_id === coachId;
    }).length;

    return { classCount, ptCount };
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const isTimePassed = (startTime: string, date: Date) => {
    if (!startTime) return false;
    const now = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    const classDateTime = new Date(date);
    classDateTime.setHours(hours, minutes, 0, 0);
    return now > classDateTime;
  };

  const today = new Date();
  const todayDayOfWeek = getDayOfWeek(today);
  const todayClasses = classes
    .filter(c => c.day_of_week === todayDayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const generateWeekDays = () => {
    const days = [];
    for (let i = -7; i <= 13; i++) {
      const date = new Date();
      date.setDate(today.getDate() + i);
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

  // Render class detail modal
  const renderClassDetailModal = () => {
    if (!selectedClass) return null;

    const level = getClassLevel(selectedClass.name);
    const leadCoach = assignedCoaches.find(c => c.order === 1);

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
              <Text style={styles.detailModalTitle}>Class Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.detailModalBody}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Class Name */}
              <View style={styles.detailRow}>
                <Ionicons name="fitness-outline" size={18} color={Colors.jaiBlue} />
                <Text style={styles.detailLabel}>Class</Text>
                <Text style={styles.detailValue}>{selectedClass.name}</Text>
              </View>

              {/* Level */}
              <View style={styles.detailRow}>
                <Ionicons name="barbell-outline" size={18} color={Colors.jaiBlue} />
                <Text style={styles.detailLabel}>Level</Text>
                <Text style={styles.detailValue}>{level}</Text>
              </View>

              {/* Day */}
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Day</Text>
                <Text style={[styles.detailValue, { textTransform: 'capitalize' }]}>
                  {selectedClass.day_of_week}
                </Text>
              </View>

              {/* Time */}
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Time</Text>
                <Text style={styles.detailValue}>
                  {formatTime(selectedClass.start_time)} - {formatTime(selectedClass.end_time)}
                </Text>
              </View>

              {/* Capacity */}
              <View style={styles.detailRow}>
                <Ionicons name="people-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Capacity</Text>
                <Text style={styles.detailValue}>{selectedClass.capacity}</Text>
              </View>

              {/* Enrolled */}
              <View style={styles.detailRow}>
                <Ionicons name="person-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Enrolled</Text>
                <Text style={styles.detailValue}>{enrolledCount} / {selectedClass.capacity}</Text>
              </View>

              {/* Assigned Coaches Section */}
              <View style={styles.detailSection}>
                <View style={styles.detailSectionHeader}>
                  <Ionicons name="people-outline" size={16} color={Colors.jaiBlue} />
                  <Text style={styles.detailSectionTitle}>Assigned Coaches</Text>
                </View>
                {assignedCoaches.length === 0 ? (
                  <Text style={styles.noCoachesText}>No coaches assigned</Text>
                ) : (
                  <View style={styles.coachList}>
                    {assignedCoaches.map((coach) => (
                      <View key={coach.coach_id} style={styles.coachListItem}>
                        <View style={styles.coachListLeft}>
                          <Text style={styles.coachListName}>{coach.full_name}</Text>
                        </View>
                        {coach.is_lead && (
                          <View style={styles.leadBadge}>
                            <Text style={styles.leadBadgeText}>Lead</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEditClass}
              >
                <Ionicons name="create-outline" size={18} color={Colors.white} />
                <Text style={styles.editButtonText}>Edit Class</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelClass}
              >
                <Ionicons name="close-circle-outline" size={18} color={Colors.white} />
                <Text style={styles.cancelButtonText}>Cancel Class</Text>
              </TouchableOpacity>

              {isMasterAdmin && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDeleteClass}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.white} />
                  <Text style={styles.deleteButtonText}>Delete Class</Text>
                </TouchableOpacity>
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

  // Render PT detail modal
  const renderPTDetailModal = () => {
    if (!selectedPT) return null;

    const { time, date } = formatPTDateTime(selectedPT.scheduled_at);
    const canApprovePayment = selectedPT.coach_verified && selectedPT.member_verified && !selectedPT.payment_approved;
    const isPaid = selectedPT.payment_approved;

    return (
      <Modal
        transparent
        visible={ptDetailModalVisible}
        animationType="slide"
        onRequestClose={() => setPTDetailModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPTDetailModalVisible(false)}
        >
          <TouchableOpacity style={styles.detailModalContent} activeOpacity={1}>
            {/* Header */}
            <View style={styles.detailModalHeader}>
              <Text style={styles.detailModalTitle}>PT Session Details</Text>
              <TouchableOpacity onPress={() => setPTDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.white} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.detailModalBody}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Member Name */}
              <View style={styles.detailRow}>
                <Ionicons name="person-outline" size={18} color={Colors.success} />
                <Text style={styles.detailLabel}>Member</Text>
                <Text style={styles.detailValue}>{selectedPT.member_name}</Text>
              </View>

              {/* Coach Name */}
              <View style={styles.detailRow}>
                <Ionicons name="fitness-outline" size={18} color={Colors.jaiBlue} />
                <Text style={styles.detailLabel}>Coach</Text>
                <Text style={styles.detailValue}>{selectedPT.coach_name}</Text>
              </View>

              {/* Date */}
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>{date}</Text>
              </View>

              {/* Time */}
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Time</Text>
                <Text style={styles.detailValue}>{time}</Text>
              </View>

              {/* Duration */}
              <View style={styles.detailRow}>
                <Ionicons name="hourglass-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{selectedPT.duration_minutes} min</Text>
              </View>

              {/* Session Type */}
              <View style={styles.detailRow}>
                <Ionicons name="walk-outline" size={18} color={Colors.success} />
                <Text style={styles.detailLabel}>Type</Text>
                <Text style={styles.detailValue}>
                  {selectedPT.session_type === 'buddy' && 'Buddy'}
                  {selectedPT.session_type === 'house_call' && 'House Call'}
                  {selectedPT.session_type === 'solo_package' && 'Solo Package'}
                  {selectedPT.session_type === 'solo_single' && 'Solo Single'}
                </Text>
              </View>

              {/* Commission */}
              <View style={styles.detailRow}>
                <Ionicons name="cash-outline" size={18} color={Colors.success} />
                <Text style={styles.detailLabel}>Commission</Text>
                <Text style={[styles.detailValue, { color: Colors.success }]}>
                  S${(selectedPT.commission_amount || 40).toFixed(2)}
                </Text>
              </View>

              {/* Status */}
              <View style={styles.detailRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.lightGray} />
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={[styles.detailValue, {
                  textTransform: 'capitalize',
                  color: selectedPT.status === 'cancelled' ? Colors.warning : Colors.white
                }]}>
                  {selectedPT.status}
                </Text>
              </View>

              {/* Verification Status */}
              <View style={styles.detailSection}>
                <View style={styles.detailSectionHeader}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={Colors.jaiBlue} />
                  <Text style={styles.detailSectionTitle}>Verification Status</Text>
                </View>
                <View style={styles.verificationRow}>
                  <View style={styles.verificationItem}>
                    <Ionicons
                      name={selectedPT.coach_verified ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={selectedPT.coach_verified ? Colors.success : Colors.darkGray}
                    />
                    <Text style={[styles.verificationText, selectedPT.coach_verified && styles.verificationTextActive]}>
                      Coach {selectedPT.coach_verified ? 'Verified' : 'Pending'}
                    </Text>
                  </View>
                  <View style={styles.verificationItem}>
                    <Ionicons
                      name={selectedPT.member_verified ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={selectedPT.member_verified ? Colors.success : Colors.darkGray}
                    />
                    <Text style={[styles.verificationText, selectedPT.member_verified && styles.verificationTextActive]}>
                      Member {selectedPT.member_verified ? 'Verified' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Payment Status */}
              {isPaid && (
                <View style={[styles.detailSection, { backgroundColor: Colors.success + '20' }]}>
                  <View style={styles.detailSectionHeader}>
                    <Ionicons name="checkmark-done-circle" size={16} color={Colors.success} />
                    <Text style={[styles.detailSectionTitle, { color: Colors.success }]}>Payment Approved</Text>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <TouchableOpacity
                style={styles.editButton}
                onPress={handleEditPT}
              >
                <Ionicons name="create-outline" size={18} color={Colors.white} />
                <Text style={styles.editButtonText}>Edit Session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.copyNextWeekButton}
                onPress={() => handleCopyToNextWeek(selectedPT)}
              >
                <Ionicons name="copy-outline" size={18} color={Colors.white} />
                <Text style={styles.copyNextWeekButtonText}>Copy to Next Week</Text>
              </TouchableOpacity>

              {canApprovePayment && (
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleApprovePayment}
                >
                  <Ionicons name="checkmark-done-circle-outline" size={18} color={Colors.white} />
                  <Text style={styles.saveButtonText}>Approve Payment</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelPT}
              >
                <Ionicons name="close-circle-outline" size={18} color={Colors.white} />
                <Text style={styles.cancelButtonText}>Cancel Session</Text>
              </TouchableOpacity>

              {isMasterAdmin && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDeletePT}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.white} />
                  <Text style={styles.deleteButtonText}>Delete Session</Text>
                </TouchableOpacity>
              )}

              {/* Close Button */}
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPTDetailModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Render PT edit modal
  const renderPTEditModal = () => {
    if (!selectedPT) return null;

    // Parse the scheduled_at for date/time inputs
    const parseDateTime = (isoString: string) => {
      const date = new Date(isoString);
      const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const year = sgDate.getUTCFullYear();
      const month = String(sgDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(sgDate.getUTCDate()).padStart(2, '0');
      const hours = String(sgDate.getUTCHours()).padStart(2, '0');
      const minutes = String(sgDate.getUTCMinutes()).padStart(2, '0');
      return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
      };
    };

    const { date: defaultDate, time: defaultTime } = parseDateTime(editPTScheduledAt);

    return (
      <Modal
        transparent
        visible={ptEditModalVisible}
        animationType="slide"
        onRequestClose={() => setPTEditModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPTEditModalVisible(false)}
        >
          <TouchableOpacity style={styles.editModalContent} activeOpacity={1}>
            {/* Header */}
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
              {/* Member Dropdown */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Member</Text>
                <View style={styles.ptPickerList}>
                  {members.length === 0 ? (
                    <Text style={styles.noCoachesText}>Loading members...</Text>
                  ) : (
                    members.map((member) => (
                      <TouchableOpacity
                        key={member.id}
                        style={[
                          styles.ptSelectItem,
                          editPTMemberId === member.id && styles.ptSelectItemSelected,
                        ]}
                        onPress={() => setEditPTMemberId(member.id)}
                      >
                        <View style={styles.coachSelectLeft}>
                          <View style={styles.coachAvatarSmall}>
                            <Text style={styles.coachAvatarTextSmall}>
                              {member.full_name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View>
                            <Text style={styles.coachSelectName}>{member.full_name}</Text>
                            <Text style={styles.coachSelectRole}>{member.email}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={editPTMemberId === member.id ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={editPTMemberId === member.id ? Colors.success : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>

              {/* Coach Dropdown */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Coach</Text>
                <View style={styles.ptPickerList}>
                  {coaches.length === 0 ? (
                    <Text style={styles.noCoachesText}>Loading coaches...</Text>
                  ) : (
                    coaches.map((coach) => (
                      <TouchableOpacity
                        key={coach.id}
                        style={[
                          styles.ptSelectItem,
                          editPTCoachId === coach.id && styles.ptSelectItemSelected,
                        ]}
                        onPress={() => setEditPTCoachId(coach.id)}
                      >
                        <View style={styles.coachSelectLeft}>
                          <View style={styles.coachAvatarSmall}>
                            <Text style={styles.coachAvatarTextSmall}>
                              {coach.full_name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View>
                            <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                            <Text style={styles.coachSelectRole}>
                              {coach.employment_type === 'full_time'
                                ? 'Full-Time'
                                : 'Part-Time'}
                            </Text>
                          </View>
                        </View>
                        <Ionicons
                          name={editPTCoachId === coach.id ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={editPTCoachId === coach.id ? Colors.success : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>

              {/* Date and Time Row */}
              <View style={styles.ptTimeRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Date</Text>
                  <TextInput
                    style={styles.formInput}
                    value={defaultDate}
                    onChangeText={(text) => {
                      // Simple date parsing - in production use a date picker
                      setEditPTScheduledAt(text + 'T' + defaultTime + ':00Z');
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.darkGray}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.md }]}>
                  <Text style={styles.formLabel}>Time</Text>
                  <TextInput
                    style={styles.formInput}
                    value={defaultTime}
                    onChangeText={(text) => {
                      // Simple time parsing - in production use a time picker
                      setEditPTScheduledAt(defaultDate + 'T' + text + ':00Z');
                    }}
                    placeholder="HH:MM"
                    placeholderTextColor={Colors.darkGray}
                  />
                </View>
              </View>

              {/* Duration */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Duration (minutes)</Text>
                <TextInput
                  style={styles.formInput}
                  value={editPTDuration}
                  onChangeText={setEditPTDuration}
                  placeholder="60"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="number-pad"
                />
              </View>

              {/* Session Type */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Session Type</Text>
                <View style={styles.pickerContainer}>
                  {SESSION_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.pickerOption,
                        editPTSessionType === type.value && styles.pickerOptionSelected,
                      ]}
                      onPress={() => handleSessionTypeChange(type.value)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          editPTSessionType === type.value && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Session Rate */}
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
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.formHint}>
                  Auto-filled based on coach's rates. You can override for special pricing.
                </Text>
              </View>

              {/* Commission */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Commission (S$) - What Coach Earns</Text>
                <TextInput
                  style={styles.formInput}
                  value={editPTCommission}
                  onChangeText={setEditPTCommission}
                  placeholder="40"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="decimal-pad"
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

              {/* Save Button */}
              <TouchableOpacity
                style={styles.saveButton}
                onPress={savePTChanges}
              >
                <Ionicons name="save-outline" size={18} color={Colors.white} />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPTEditModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Render edit class modal
  const renderEditClassModal = () => {
    if (!selectedClass) return null;

    return (
      <Modal
        transparent
        visible={editModalVisible}
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditModalVisible(false)}
        >
          <TouchableOpacity style={styles.editModalContent} activeOpacity={1}>
            {/* Header */}
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
                {coaches.length === 0 ? (
                  <Text style={styles.noCoachesText}>No coaches available</Text>
                ) : (
                  <View style={styles.coachSimpleList}>
                    {coaches.map((coach) => {
                      const assigned = assignedCoaches.find(c => c.coach_id === coach.id);
                      const isLead = assigned && assigned.order === 1;
                      return (
                        <TouchableOpacity
                          key={coach.id}
                          style={styles.coachSimpleItem}
                          onPress={() => toggleCoachAssignment(coach.id)}
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
                )}
              </View>

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalSaveButton, saving && { opacity: 0.7 }]}
                  onPress={saveClassChanges}
                  disabled={saving}
                >
                  <Text style={styles.modalSaveButtonText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
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
    );
  };

  const renderTodayView = () => (
    <ScrollView
      style={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
      }
    >
      <View style={styles.dateHeaderRow}>
        <Ionicons name="calendar" size={18} color={Colors.jaiBlue} />
        <Text style={styles.dateHeader}>{formatDate(today)}</Text>
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>ALL CLASSES</Text>
        <View style={styles.classCount}>
          <Text style={styles.classCountText}>{todayClasses.length}</Text>
        </View>
      </View>

      {todayClasses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={40} color={Colors.darkGray} />
          <Text style={styles.emptyText}>No classes scheduled for today</Text>
        </View>
      ) : (
        todayClasses.map((classItem) => {
          const isPassed = isTimePassed(classItem.start_time, today);
          const coachColor = classItem.lead_coach_id ? getCoachColor(classItem.lead_coach_id, coaches) : Colors.jaiBlue;

          // Format coach names (first names only)
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
              onPress={() => handleClassPress(classItem)}
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
              <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                {classItem.enrolled_count || 0}/{classItem.capacity || 12} pax • {coachNames || 'No coaches'}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

      {/* PT Sessions Section */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: Colors.success }]} />
        <Text style={styles.sectionTitle}>PT SESSIONS</Text>
        <View style={[styles.classCount, { backgroundColor: Colors.success }]}>
          <Text style={styles.classCountText}>{ptSessions.length}</Text>
        </View>
      </View>

      {ptSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="person-outline" size={40} color={Colors.darkGray} />
          <Text style={styles.emptyText}>No PT sessions scheduled</Text>
        </View>
      ) : (
        ptSessions.map((session) => {
          const { time } = formatPTDateTime(session.scheduled_at);
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
              onPress={() => handlePTPress(session)}
              activeOpacity={0.7}
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
        })
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderWeeklyView = () => {
    // Helper to get PT sessions for a specific date
    const getPTSessionsForDate = (date: Date) => {
      const dateStr = date.toISOString().split('T')[0];
      return ptSessions.filter(session => {
        const sessionDate = new Date(session.scheduled_at);
        const sgDate = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000);
        const sessionDateStr = sgDate.toISOString().split('T')[0];
        return sessionDateStr === dateStr;
      }).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    };

    return (
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

          const dayPTSessions = getPTSessionsForDate(day.date);
          const hasContent = dayClasses.length > 0 || dayPTSessions.length > 0;

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
                showsVerticalScrollIndicator={false}
              >
                {!hasContent ? (
                  <View style={styles.noClassCard}>
                    <Text style={styles.noClassText}>No sessions</Text>
                  </View>
                ) : (
                  <>
                    {/* Render Classes */}
                    {dayClasses.map((classItem) => {
                      const isPassed = day.isPast || (day.isToday && isTimePassed(classItem.start_time, day.date));
                      return (
                        <TouchableOpacity
                          key={`class-${classItem.id}`}
                          style={[
                            styles.miniClassCard,
                            { borderLeftColor: classItem.lead_coach_id ? getCoachColor(classItem.lead_coach_id, coaches) : Colors.jaiBlue },
                            isPassed && styles.miniCardDimmed
                          ]}
                          onPress={() => handleClassPress(classItem)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.miniClassName} numberOfLines={1}>
                            {classItem.name}
                          </Text>
                          <Text style={styles.miniClassTime}>
                            {formatTime(classItem.start_time)}
                          </Text>
                          {classItem.lead_coach && (
                            <Text style={styles.miniCoachName} numberOfLines={1}>
                              {classItem.lead_coach.full_name}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}

                    {/* Render PT Sessions */}
                    {dayPTSessions.map((session) => {
                      const { time } = formatPTDateTime(session.scheduled_at);
                      const isPassed = isPTSessionPassed(session.scheduled_at);
                      const isBuddy = session.session_type === 'buddy';
                      const isHouseCall = session.session_type === 'house_call';
                      const icon = isBuddy ? '👥' : isHouseCall ? '🏠' : '💪';

                      return (
                        <TouchableOpacity
                          key={`pt-${session.id}`}
                          style={[
                            styles.miniPTCard,
                            { borderLeftColor: getCoachColor(session.coach_id, coaches) },
                            isPassed && styles.miniCardDimmed
                          ]}
                          onPress={() => handlePTPress(session)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.miniPTMember} numberOfLines={1}>
                            {icon} {session.member_name}
                          </Text>
                          <Text style={styles.miniPTTime}>
                            {time}
                          </Text>
                          <Text style={styles.miniPTCoach} numberOfLines={1}>
                            {session.coach_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Schedule</Text>
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

        {/* Filter Bar */}
        <View style={styles.filterContainer}>
          {/* Filter Toggle Button */}
          <TouchableOpacity
            style={styles.filterToggleButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="filter-outline" size={18} color={Colors.jaiBlue} />
            <Text style={styles.filterToggleText}>
              {coachFilter !== 'all' || viewType !== 'all' ? 'Filters (Active)' : 'Filters'}
            </Text>
            <Ionicons
              name={showFilters ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.lightGray}
            />
          </TouchableOpacity>

          {/* Filter Options (Expandable) */}
          {showFilters && (
            <View style={styles.filterOptions}>
              {/* View Type Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Show:</Text>
                <View style={styles.filterPills}>
                  <TouchableOpacity
                    style={[styles.filterPill, viewType === 'all' && styles.filterPillActive]}
                    onPress={() => setViewType('all')}
                  >
                    <Text style={[styles.filterPillText, viewType === 'all' && styles.filterPillTextActive]}>
                      All
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterPill, viewType === 'classes' && styles.filterPillActive]}
                    onPress={() => setViewType('classes')}
                  >
                    <Ionicons name="fitness-outline" size={12} color={viewType === 'classes' ? Colors.white : Colors.lightGray} />
                    <Text style={[styles.filterPillText, viewType === 'classes' && styles.filterPillTextActive]}>
                      Classes
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterPill, viewType === 'pt' && styles.filterPillActive]}
                    onPress={() => setViewType('pt')}
                  >
                    <Ionicons name="barbell-outline" size={12} color={viewType === 'pt' ? Colors.white : Colors.lightGray} />
                    <Text style={[styles.filterPillText, viewType === 'pt' && styles.filterPillTextActive]}>
                      PT Only
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Coach Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Coach:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPills}>
                  <TouchableOpacity
                    style={[styles.filterPill, coachFilter === 'all' && styles.filterPillActive]}
                    onPress={() => setCoachFilter('all')}
                  >
                    <Text style={[styles.filterPillText, coachFilter === 'all' && styles.filterPillTextActive]}>
                      All Coaches
                    </Text>
                  </TouchableOpacity>
                  {coaches.map((coach) => (
                    <TouchableOpacity
                      key={coach.id}
                      style={[styles.filterPill, coachFilter === coach.id && styles.filterPillActive]}
                      onPress={() => setCoachFilter(coach.id)}
                    >
                      <Text style={[styles.filterPillText, coachFilter === coach.id && styles.filterPillTextActive]}>
                        {coach.full_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Clear Filters */}
              {(coachFilter !== 'all' || viewType !== 'all') && (
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={() => {
                    setViewType('all');
                    setCoachFilter('all');
                  }}
                >
                  <Ionicons name="close-circle-outline" size={14} color={Colors.warning} />
                  <Text style={styles.clearFiltersText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {view === 'today' ? renderTodayView() : renderWeeklyView()}

        {/* Floating Add Button */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAddMenu(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[Colors.jaiBlue, Colors.neonPurple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color={Colors.white} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Class Detail Modal */}
        {renderClassDetailModal()}

        {/* Edit Class Modal */}
        {renderEditClassModal()}

        {/* PT Detail Modal */}
        {renderPTDetailModal()}

        {/* PT Edit Modal */}
        {renderPTEditModal()}

        {/* Add Menu Modal */}
        <Modal
          visible={showAddMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddMenu(false)}
        >
          <TouchableOpacity
            style={styles.addMenuOverlay}
            activeOpacity={1}
            onPress={() => setShowAddMenu(false)}
          >
            <View style={styles.addMenuContent}>
              <TouchableOpacity
                style={styles.addMenuItem}
                onPress={() => {
                  setShowAddMenu(false);
                  setShowAddClassModal(true);
                }}
              >
                <View style={[styles.addMenuIcon, { backgroundColor: Colors.jaiBlue + '20' }]}>
                  <Ionicons name="fitness-outline" size={24} color={Colors.jaiBlue} />
                </View>
                <View style={styles.addMenuText}>
                  <Text style={styles.addMenuTitle}>Add Class</Text>
                  <Text style={styles.addMenuSubtitle}>Schedule a recurring class</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addMenuItem}
                onPress={() => {
                  setShowAddMenu(false);
                  setShowAddPTModal(true);
                }}
              >
                <View style={[styles.addMenuIcon, { backgroundColor: Colors.warning + '20' }]}>
                  <Ionicons name="barbell-outline" size={24} color={Colors.warning} />
                </View>
                <View style={styles.addMenuText}>
                  <Text style={styles.addMenuTitle}>Add PT Session</Text>
                  <Text style={styles.addMenuSubtitle}>Schedule a personal training session</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addMenuCancel}
                onPress={() => setShowAddMenu(false)}
              >
                <Text style={styles.addMenuCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Add Class Modal */}
        <Modal
          visible={showAddClassModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddClassModal(false)}
        >
          <TouchableOpacity
            style={styles.addMenuOverlay}
            activeOpacity={1}
            onPress={() => setShowAddClassModal(false)}
          >
            <TouchableOpacity
              style={styles.addFormModal}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.addFormHeader}>
                <Text style={styles.addFormTitle}>Add New Class</Text>
                <TouchableOpacity onPress={() => setShowAddClassModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.lightGray} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.addFormBody}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Class Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Class Name (Optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newClassName}
                    onChangeText={setNewClassName}
                    placeholder="Leave blank to auto-generate"
                    placeholderTextColor={Colors.darkGray}
                  />
                </View>

                {/* Class Level */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Class Level *</Text>
                  <View style={styles.buttonGrid}>
                    {['All-Levels', 'Kids', 'Pre-Teen', 'Advanced', 'Sparring'].map(level => (
                      <TouchableOpacity
                        key={level}
                        style={[
                          styles.gridButton,
                          newClassLevel === level && styles.gridButtonActive
                        ]}
                        onPress={() => setNewClassLevel(level)}
                      >
                        <Text style={[
                          styles.gridButtonText,
                          newClassLevel === level && styles.gridButtonTextActive
                        ]}>
                          {level}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Day of Week */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Day of Week *</Text>
                  <View style={styles.dayButtonRow}>
                    {[
                      { value: 'monday', label: 'Mon' },
                      { value: 'tuesday', label: 'Tue' },
                      { value: 'wednesday', label: 'Wed' },
                      { value: 'thursday', label: 'Thu' },
                      { value: 'friday', label: 'Fri' },
                      { value: 'saturday', label: 'Sat' },
                      { value: 'sunday', label: 'Sun' },
                    ].map(day => (
                      <TouchableOpacity
                        key={day.value}
                        style={[
                          styles.dayButton,
                          newClassDay === day.value && styles.gridButtonActive
                        ]}
                        onPress={() => setNewClassDay(day.value)}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.dayButtonText,
                            newClassDay === day.value && styles.gridButtonTextActive
                          ]}
                        >
                          {day.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Time */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Time *</Text>
                  <View style={styles.timeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timeLabel}>Start Time</Text>
                      <TextInput
                        style={styles.formInput}
                        value={newClassStartTime}
                        onChangeText={setNewClassStartTime}
                        placeholder="19:00"
                        placeholderTextColor={Colors.darkGray}
                        keyboardType="default"
                      />
                    </View>
                    <Text style={styles.timeSeparator}>to</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timeLabel}>End Time</Text>
                      <TextInput
                        style={styles.formInput}
                        value={newClassEndTime}
                        onChangeText={setNewClassEndTime}
                        placeholder="20:00"
                        placeholderTextColor={Colors.darkGray}
                        keyboardType="default"
                      />
                    </View>
                  </View>
                </View>

                {/* Capacity */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Capacity *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newClassCapacity}
                    onChangeText={setNewClassCapacity}
                    placeholder="20"
                    placeholderTextColor={Colors.darkGray}
                    keyboardType="number-pad"
                  />
                </View>

                {/* Description */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Description (Optional)</Text>
                  <TextInput
                    style={[styles.formInput, { minHeight: 80 }]}
                    value={newClassDescription}
                    onChangeText={setNewClassDescription}
                    placeholder="Add class description..."
                    placeholderTextColor={Colors.darkGray}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Assign Coaches */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Assign Coaches *</Text>
                  <ScrollView style={styles.coachSelectList} nestedScrollEnabled>
                    {coaches.map(coach => (
                      <TouchableOpacity
                        key={coach.id}
                        style={[
                          styles.coachSelectItem,
                          newClassCoaches.includes(coach.id) && styles.coachSelectItemActive
                        ]}
                        onPress={() => {
                          if (newClassCoaches.includes(coach.id)) {
                            setNewClassCoaches(newClassCoaches.filter(id => id !== coach.id));
                            if (newClassLeadCoach === coach.id) {
                              setNewClassLeadCoach('');
                            }
                          } else {
                            setNewClassCoaches([...newClassCoaches, coach.id]);
                          }
                        }}
                      >
                        <View style={styles.coachSelectInfo}>
                          <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                          <Text style={styles.coachSelectRole}>
                            {coach.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
                          </Text>
                        </View>
                        <Ionicons
                          name={newClassCoaches.includes(coach.id) ? 'checkbox' : 'square-outline'}
                          size={24}
                          color={newClassCoaches.includes(coach.id) ? Colors.success : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Lead Coach */}
                {newClassCoaches.length > 0 && (
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Lead Coach *</Text>
                    <View style={styles.coachSelectList}>
                      {coaches
                        .filter(coach => newClassCoaches.includes(coach.id))
                        .map(coach => (
                          <TouchableOpacity
                            key={coach.id}
                            style={[
                              styles.coachSelectItem,
                              newClassLeadCoach === coach.id && styles.coachSelectItemActive
                            ]}
                            onPress={() => setNewClassLeadCoach(coach.id)}
                          >
                            <View style={styles.coachSelectInfo}>
                              <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                              <Text style={styles.coachSelectRole}>Lead Coach</Text>
                            </View>
                            <Ionicons
                              name={newClassLeadCoach === coach.id ? 'radio-button-on' : 'radio-button-off'}
                              size={24}
                              color={newClassLeadCoach === coach.id ? Colors.jaiBlue : Colors.lightGray}
                            />
                          </TouchableOpacity>
                        ))}
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.addFormButtons}>
                <TouchableOpacity
                  style={[styles.addFormButton, styles.addFormCancelButton]}
                  onPress={() => setShowAddClassModal(false)}
                  disabled={creatingClass}
                >
                  <Text style={styles.addFormCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addFormButton, styles.addFormSaveButton]}
                  onPress={handleCreateClass}
                  disabled={creatingClass}
                >
                  <Text style={styles.addFormSaveButtonText}>
                    {creatingClass ? 'Creating...' : 'Create Class'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Add PT Session Modal */}
        <Modal
          visible={showAddPTModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddPTModal(false)}
        >
          <TouchableOpacity
            style={[styles.addMenuOverlay, { justifyContent: 'center' }]}
            activeOpacity={1}
            onPress={() => setShowAddPTModal(false)}
          >
            <TouchableOpacity
              style={[styles.addFormModal, { height: '88%' }]}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.addFormHeader}>
                <Text style={styles.addFormTitle}>Add PT Session</Text>
                <TouchableOpacity onPress={() => setShowAddPTModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.lightGray} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.addFormBody} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                {/* Select Coach */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Select Coach *</Text>
                  <ScrollView style={styles.coachSelectScrollList} nestedScrollEnabled>
                    {coaches.map(coach => (
                      <TouchableOpacity
                        key={coach.id}
                        style={[
                          styles.coachSelectItem,
                          newPTCoachId === coach.id && styles.coachSelectItemActive
                        ]}
                        onPress={() => setNewPTCoachId(coach.id)}
                      >
                        <View style={styles.coachSelectInfo}>
                          <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                          <Text style={styles.coachSelectRole}>
                            {coach.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
                          </Text>
                        </View>
                        <Ionicons
                          name={newPTCoachId === coach.id ? 'radio-button-on' : 'radio-button-off'}
                          size={24}
                          color={newPTCoachId === coach.id ? Colors.success : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Client Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Client Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newPTClientName}
                    onChangeText={setNewPTClientName}
                    placeholder="Enter client name"
                    placeholderTextColor={Colors.darkGray}
                  />
                </View>

                {/* Date */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Date *</Text>
                  <TouchableOpacity
                    style={[styles.formInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                    onPress={() => {
                      if (!showDatePicker && newPTDate) {
                        setCalendarMonth(new Date(newPTDate + 'T00:00:00'));
                      }
                      setShowDatePicker(!showDatePicker);
                    }}
                  >
                    <Text style={{ color: newPTDate ? Colors.white : Colors.darkGray, fontSize: 16 }}>
                      {newPTDate ? formatDisplayDate(newPTDate) : 'Select date'}
                    </Text>
                    <Ionicons
                      name={showDatePicker ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={Colors.lightGray}
                    />
                  </TouchableOpacity>

                  {showDatePicker && (
                    <View style={styles.calendarDropdown}>
                      {/* Month navigation */}
                      <View style={styles.calendarHeader}>
                        <TouchableOpacity
                          onPress={() => {
                            const prev = new Date(calendarMonth);
                            prev.setMonth(prev.getMonth() - 1);
                            setCalendarMonth(prev);
                          }}
                          style={styles.calendarNavButton}
                        >
                          <Ionicons name="chevron-back" size={20} color={Colors.white} />
                        </TouchableOpacity>
                        <Text style={styles.calendarMonthText}>
                          {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            const next = new Date(calendarMonth);
                            next.setMonth(next.getMonth() + 1);
                            setCalendarMonth(next);
                          }}
                          style={styles.calendarNavButton}
                        >
                          <Ionicons name="chevron-forward" size={20} color={Colors.white} />
                        </TouchableOpacity>
                      </View>

                      {/* Day-of-week headers */}
                      <View style={styles.calendarDayHeaders}>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                          <Text key={day} style={styles.calendarDayHeader}>{day}</Text>
                        ))}
                      </View>

                      {/* Date grid */}
                      <View style={styles.calendarGrid}>
                        {getCalendarDays(calendarMonth).map((date, index) => {
                          if (!date) {
                            return <View key={`empty-${index}`} style={styles.calendarCell} />;
                          }
                          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                          const isSelected = dateStr === newPTDate;
                          const todayStr = getTodayStr();
                          const isToday = dateStr === todayStr;
                          const isPast = dateStr < todayStr;

                          return (
                            <TouchableOpacity
                              key={dateStr}
                              style={styles.calendarCell}
                              onPress={() => {
                                setNewPTDate(dateStr);
                                setShowDatePicker(false);
                              }}
                            >
                              <View style={[
                                styles.calendarCellInner,
                                isSelected && styles.calendarCellSelected,
                                isToday && !isSelected && styles.calendarCellToday,
                              ]}>
                                <Text style={[
                                  styles.calendarDateText,
                                  isSelected && styles.calendarDateTextSelected,
                                  isPast && !isSelected && styles.calendarDateTextPast,
                                ]}>
                                  {date.getDate()}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>

                {/* Time */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Time (24h) *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newPTTime}
                    onChangeText={(text) => {
                      // Strip non-digits except colon
                      const clean = text.replace(/[^\d:]/g, '');
                      // Auto-format: when 4 digits typed without colon, insert colon
                      if (/^\d{4}$/.test(clean)) {
                        setNewPTTime(`${clean.slice(0, 2)}:${clean.slice(2)}`);
                      } else {
                        setNewPTTime(clean);
                      }
                    }}
                    placeholder="e.g. 1430 or 14:30"
                    placeholderTextColor={Colors.darkGray}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>

                {/* Duration */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Duration *</Text>
                  <View style={styles.buttonGrid}>
                    {['60', '90', '120'].map(duration => (
                      <TouchableOpacity
                        key={duration}
                        style={[
                          styles.gridButton,
                          newPTDuration === duration && styles.gridButtonActive
                        ]}
                        onPress={() => setNewPTDuration(duration)}
                      >
                        <Text style={[
                          styles.gridButtonText,
                          newPTDuration === duration && styles.gridButtonTextActive
                        ]}>
                          {duration} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Session Type */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Session Type *</Text>
                  {!newPTCoachRates ? (
                    <Text style={styles.helperText}>Select a coach first</Text>
                  ) : (
                    <View style={styles.buttonGrid}>
                      {/* Senior Coaches - Show all options */}
                      {newPTCoachRates.isSenior && [
                        { value: 'solo_single', label: 'Solo Single', rate: newPTCoachRates.solo_rate, perSession: false },
                        { value: 'solo_10pack', label: 'Solo 10-Pack', rate: newPTCoachRates.solo_rate - 10, perSession: true },
                        { value: 'solo_20pack', label: 'Solo 20-Pack', rate: newPTCoachRates.solo_rate - 20, perSession: true },
                        { value: 'buddy_single', label: 'Buddy Single', rate: newPTCoachRates.buddy_rate, perSession: false },
                        { value: 'buddy_12pack', label: 'Buddy 12-Pack', rate: newPTCoachRates.buddy_rate - 30, perSession: true },
                      ].map(type => (
                        <TouchableOpacity
                          key={type.value}
                          style={[
                            styles.gridButton,
                            newPTSessionType === type.value && styles.gridButtonActive
                          ]}
                          onPress={() => setNewPTSessionType(type.value)}
                        >
                          <Text style={[
                            styles.gridButtonText,
                            newPTSessionType === type.value && styles.gridButtonTextActive
                          ]}>
                            {type.label}
                          </Text>
                          <Text style={[
                            styles.commissionText,
                            newPTSessionType === type.value && styles.commissionTextActive
                          ]}>
                            S${type.rate}{type.perSession ? '/session' : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      {/* Assistant Coaches - Solo only, no buddy */}
                      {!newPTCoachRates.isSenior && [
                        { value: 'solo_single', label: 'Solo Single', rate: newPTCoachRates.solo_rate, perSession: false },
                        { value: 'solo_10pack', label: 'Solo 10-Pack', rate: newPTCoachRates.solo_rate - 10, perSession: true },
                        { value: 'solo_20pack', label: 'Solo 20-Pack', rate: newPTCoachRates.solo_rate - 20, perSession: true },
                      ].map(type => (
                        <TouchableOpacity
                          key={type.value}
                          style={[
                            styles.gridButton,
                            newPTSessionType === type.value && styles.gridButtonActive
                          ]}
                          onPress={() => setNewPTSessionType(type.value)}
                        >
                          <Text style={[
                            styles.gridButtonText,
                            newPTSessionType === type.value && styles.gridButtonTextActive
                          ]}>
                            {type.label}
                          </Text>
                          <Text style={[
                            styles.commissionText,
                            newPTSessionType === type.value && styles.commissionTextActive
                          ]}>
                            S${type.rate}{type.perSession ? '/session' : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Commission Display */}
                {newPTCoachRates && newPTSessionRate > 0 && (
                  <View style={styles.commissionBreakdown}>
                    <Text style={styles.breakdownText}>
                      Client Pays: <Text style={styles.highlightAmount}>S${newPTSessionRate}</Text>
                      {' → '}
                      Coach Earns: <Text style={styles.highlightAmount}>S${newPTCommission}</Text>
                      {' '}
                      <Text style={styles.percentageText}>
                        ({(newPTCoachRates.pt_commission_rate * 100).toFixed(0)}%)
                      </Text>
                    </Text>
                  </View>
                )}

                {/* Notes */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Notes (Optional)</Text>
                  <TextInput
                    style={[styles.formInput, { minHeight: 80 }]}
                    value={newPTNotes}
                    onChangeText={setNewPTNotes}
                    placeholder="Add any notes..."
                    placeholderTextColor={Colors.darkGray}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Repeat Weekly */}
                <View style={styles.formGroup}>
                  <View style={styles.repeatToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formLabel}>Repeat Weekly</Text>
                      <Text style={styles.repeatHint}>Create recurring sessions at the same day/time</Text>
                    </View>
                    <Switch
                      value={repeatWeekly}
                      onValueChange={setRepeatWeekly}
                      trackColor={{ false: Colors.border, true: Colors.jaiBlue + '60' }}
                      thumbColor={repeatWeekly ? Colors.jaiBlue : Colors.darkGray}
                    />
                  </View>

                  {repeatWeekly && (
                    <View style={styles.repeatOptions}>
                      <Text style={styles.repeatLabel}>Number of weeks:</Text>
                      <View style={styles.buttonGrid}>
                        {[2, 4, 8, 12].map(weeks => (
                          <TouchableOpacity
                            key={weeks}
                            style={[
                              styles.gridButton,
                              repeatWeeks === weeks && styles.gridButtonActive
                            ]}
                            onPress={() => setRepeatWeeks(weeks)}
                          >
                            <Text style={[
                              styles.gridButtonText,
                              repeatWeeks === weeks && styles.gridButtonTextActive
                            ]}>
                              {weeks} weeks
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {newPTDate && (
                        <View style={styles.repeatPreview}>
                          <Text style={styles.repeatPreviewTitle}>Sessions will be created on:</Text>
                          {Array.from({ length: Math.min(repeatWeeks, 6) }).map((_, i) => {
                            const d = addWeeksToDate(newPTDate, i);
                            return (
                              <Text key={i} style={styles.repeatPreviewDate}>
                                {i + 1}. {formatDisplayDate(d)}
                              </Text>
                            );
                          })}
                          {repeatWeeks > 6 && (
                            <Text style={styles.repeatPreviewDate}>
                              ...and {repeatWeeks - 6} more
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.addFormButtons}>
                <TouchableOpacity
                  style={[styles.addFormButton, styles.addFormCancelButton]}
                  onPress={() => setShowAddPTModal(false)}
                  disabled={creatingPT}
                >
                  <Text style={styles.addFormCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addFormButton, styles.addFormSaveButton]}
                  onPress={handleCreatePTSession}
                  disabled={creatingPT}
                >
                  <Text style={styles.addFormSaveButtonText}>
                    {creatingPT ? 'Creating...' : repeatWeekly ? `Create ${repeatWeeks} Sessions` : 'Create Session'}
                  </Text>
                </TouchableOpacity>
              </View>
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
    flex: 1,
  },
  classCount: {
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  classCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
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
  classCapacity: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  coachText: {
    fontSize: 12,
    color: Colors.jaiBlue,
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
    paddingBottom: 0,
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
  miniCoachName: {
    fontSize: 10,
    color: Colors.jaiBlue,
    marginTop: 3,
  },
  // Mini PT Card Styles (Weekly View)
  miniPTCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniPTMember: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  miniPTTime: {
    fontSize: 11,
    color: Colors.warning,
    marginTop: 3,
    fontWeight: '600',
  },
  miniPTCoach: {
    fontSize: 10,
    color: Colors.success,
    marginTop: 3,
  },
  // Filter Styles
  filterContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  filterToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.jaiBlue,
    flex: 1,
  },
  filterOptions: {
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    padding: Spacing.md,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterSection: {
    marginBottom: Spacing.sm,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
  },
  filterPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.black,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterPillActive: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.lightGray,
  },
  filterPillTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.warning,
  },
  // Coach Panel Styles
  coachPanel: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  coachPanelTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  coachScrollView: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  coachPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 160,
  },
  coachPillSelected: {
    backgroundColor: Colors.jaiBlue + '20',
    borderColor: Colors.jaiBlue,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  coachAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  coachPillInfo: {
    flex: 1,
  },
  coachPillName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: 4,
  },
  coachPillNameSelected: {
    color: Colors.jaiBlue,
  },
  coachPillMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coachTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coachTypeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  coachWorkload: {
    fontSize: 11,
    color: Colors.darkGray,
  },
  // FAB Styles
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: Colors.jaiBlue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Add Menu Styles
  addMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  addMenuContent: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.black,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addMenuText: {
    flex: 1,
  },
  addMenuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: 2,
  },
  addMenuSubtitle: {
    fontSize: 12,
    color: Colors.lightGray,
  },
  addMenuCancel: {
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  addMenuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  // PT Card Styles
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
  ptCoachName: {
    fontSize: 12,
    color: Colors.jaiBlue,
    marginTop: 2,
  },
  ptDuration: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  ptCommission: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
    marginTop: 2,
  },
  // Picker Styles
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    backgroundColor: Colors.black,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  pickerOptionSelected: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  pickerOptionText: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  pickerOptionTextSelected: {
    color: Colors.white,
    fontWeight: '600',
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
    paddingBottom: 100,
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
    width: 90,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.warning,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
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
  // Edit Modal Styles
  editModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    maxHeight: '75%',
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
    color: Colors.lightGray,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    color: Colors.darkGray,
    fontStyle: 'italic',
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
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  // Detail section styles
  detailSection: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  noCoachesText: {
    fontSize: 13,
    color: Colors.darkGray,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  coachList: {
    gap: 8,
  },
  coachListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  coachListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coachListName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.white,
  },
  leadBadge: {
    backgroundColor: Colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  leadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
    textTransform: 'uppercase',
  },
  // Coach select styles
  coachSelectList: {
    gap: 8,
  },
  coachSelectScrollList: {
    maxHeight: 360,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  coachSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  coachSelectItemSelected: {
    borderColor: Colors.jaiBlue,
    backgroundColor: Colors.jaiBlue + '10',
  },
  coachSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coachAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachAvatarTextSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  coachSelectName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.white,
  },
  coachSelectRole: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
  },
  coachSelectRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginTop: 2,
    fontStyle: 'italic',
  },
  // Time row styles
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // PT Picker styles
  ptTimeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ptPickerList: {
    maxHeight: 200,
    backgroundColor: Colors.black,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  ptSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ptSelectItemSelected: {
    backgroundColor: Colors.success + '15',
  },
  // Verification styles
  verificationRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    backgroundColor: Colors.black,
    padding: Spacing.sm,
    borderRadius: 8,
  },
  verificationText: {
    fontSize: 13,
    color: Colors.darkGray,
    flex: 1,
  },
  verificationTextActive: {
    color: Colors.success,
    fontWeight: '600',
  },
  // Add Form Modal Styles
  addFormModal: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    height: '80%',
    alignSelf: 'center',
    marginBottom: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  addFormTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
  },
  addFormBody: {
    flex: 1,
    padding: Spacing.lg,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridButton: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  gridButtonActive: {
    backgroundColor: Colors.jaiBlue + '20',
    borderColor: Colors.jaiBlue,
  },
  gridButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  gridButtonTextActive: {
    color: Colors.jaiBlue,
  },
  dayButtonRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
  },
  dayButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  timeLabel: {
    fontSize: 12,
    color: Colors.darkGray,
    marginBottom: 4,
  },
  timeSeparator: {
    fontSize: 16,
    color: Colors.lightGray,
    marginBottom: Spacing.md,
  },
  coachSelectList: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  coachSelectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.black,
  },
  coachSelectItemActive: {
    backgroundColor: Colors.jaiBlue + '15',
  },
  coachSelectInfo: {
    flex: 1,
  },
  memberLoadButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.black,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  memberLoadButtonText: {
    fontSize: 14,
    color: Colors.jaiBlue,
    fontWeight: '600',
  },
  memberScrollList: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  commissionText: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
  },
  commissionTextActive: {
    color: Colors.jaiBlue,
    fontWeight: '600',
  },
  addFormButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addFormButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 10,
    alignItems: 'center',
  },
  addFormCancelButton: {
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addFormCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  addFormSaveButton: {
    backgroundColor: Colors.jaiBlue,
  },
  addFormSaveButtonText: {
    fontSize: 16,
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
  // Calendar Picker Styles
  calendarDropdown: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarNavButton: {
    padding: 4,
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  calendarDayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#B3B3B3',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarCellSelected: {
    backgroundColor: '#0096FF',
  },
  calendarCellToday: {
    borderWidth: 1.5,
    borderColor: '#0096FF',
  },
  calendarDateText: {
    fontSize: 14,
    color: Colors.white,
  },
  calendarDateTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  calendarDateTextPast: {
    opacity: 0.4,
  },
  // Repeat Weekly Styles
  repeatToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repeatHint: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 2,
  },
  repeatOptions: {
    marginTop: Spacing.md,
  },
  repeatLabel: {
    fontSize: 13,
    color: Colors.lightGray,
    marginBottom: 8,
  },
  repeatPreview: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.jaiBlue + '10',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
  },
  repeatPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginBottom: 6,
  },
  repeatPreviewDate: {
    fontSize: 13,
    color: Colors.lightGray,
    marginBottom: 2,
  },
  // Copy to Next Week Button
  copyNextWeekButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  copyNextWeekButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
});
