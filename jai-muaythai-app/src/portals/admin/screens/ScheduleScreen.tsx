import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

import {
  ClassItem,
  PTSession,
  Member,
  Coach,
  AssignedCoach,
  SESSION_TYPES,
  DAY_COLUMN_WIDTH,
  formatDisplayDate,
  getCommissionForSessionType,
  getSessionRateForType,
} from '../components/schedule/types';
import { ClassDetailModal } from '../components/schedule/ClassDetailModal';
import { PTDetailModal } from '../components/schedule/PTDetailModal';
import { PTEditModal } from '../components/schedule/PTEditModal';
import { ClassEditModal } from '../components/schedule/ClassEditModal';
import { AddMenuModal } from '../components/schedule/AddMenuModal';
import { AddClassModal } from '../components/schedule/AddClassModal';
import { AddPTSessionModal } from '../components/schedule/AddPTSessionModal';
import { TodayView } from '../components/schedule/TodayView';
import { WeeklyView } from '../components/schedule/WeeklyView';

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

      // Calculate commission: session_rate x pt_commission_rate
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
            message: `You've been assigned to ${className.trim()} on ${editDayOfWeek.charAt(0).toUpperCase() + editDayOfWeek.slice(1)}s at ${editTime}${isLead ? ' as Lead Coach' : ''}`,
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
      setEditPTCommission(getCommissionForSessionType(type).toString());
    }
  };

  // Handle session rate change with commission recalculation
  const handleSessionRateChange = (value: string) => {
    setEditPTSessionRate(value);
    // Recalculate commission when session rate changes
    if (selectedCoachRates && value) {
      const rate = parseFloat(value);
      const commission = rate * selectedCoachRates.pt_commission_rate;
      setEditPTCommission(commission.toFixed(0));
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

    // Build ISO 8601 with SGT offset (+08:00) -- JS Date handles the UTC conversion
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

  // Toggle coach for AddClassModal
  const handleToggleNewClassCoach = (coachId: string) => {
    if (newClassCoaches.includes(coachId)) {
      setNewClassCoaches(newClassCoaches.filter(id => id !== coachId));
      if (newClassLeadCoach === coachId) {
        setNewClassLeadCoach('');
      }
    } else {
      setNewClassCoaches([...newClassCoaches, coachId]);
    }
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

        {view === 'today' ? (
          <TodayView
            todayClasses={todayClasses}
            ptSessions={ptSessions}
            coaches={coaches}
            refreshing={refreshing}
            today={today}
            formatTime={formatTime}
            formatDate={formatDate}
            formatPTDateTime={formatPTDateTime}
            isTimePassed={isTimePassed}
            isPTSessionPassed={isPTSessionPassed}
            onRefresh={onRefresh}
            onClassPress={handleClassPress}
            onPTPress={handlePTPress}
          />
        ) : (
          <WeeklyView
            weekDays={weekDays}
            classes={classes}
            ptSessions={ptSessions}
            coaches={coaches}
            scrollViewRef={scrollViewRef}
            formatTime={formatTime}
            formatPTDateTime={formatPTDateTime}
            isTimePassed={isTimePassed}
            isPTSessionPassed={isPTSessionPassed}
            onClassPress={handleClassPress}
            onPTPress={handlePTPress}
          />
        )}

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
        <ClassDetailModal
          visible={detailModalVisible}
          selectedClass={selectedClass}
          assignedCoaches={assignedCoaches}
          enrolledCount={enrolledCount}
          isMasterAdmin={isMasterAdmin}
          formatTime={formatTime}
          onClose={() => setDetailModalVisible(false)}
          onEdit={handleEditClass}
          onCancel={handleCancelClass}
          onDelete={handleDeleteClass}
        />

        {/* Edit Class Modal */}
        <ClassEditModal
          visible={editModalVisible}
          editClassType={editClassType}
          editTime={editTime}
          editDayOfWeek={editDayOfWeek}
          assignedCoaches={assignedCoaches}
          coaches={coaches}
          saving={saving}
          onClose={() => setEditModalVisible(false)}
          onSave={saveClassChanges}
          onClassTypeChange={setEditClassType}
          onTimeChange={setEditTime}
          onToggleCoachAssignment={toggleCoachAssignment}
        />

        {/* PT Detail Modal */}
        <PTDetailModal
          visible={ptDetailModalVisible}
          selectedPT={selectedPT}
          isMasterAdmin={isMasterAdmin}
          formatPTDateTime={formatPTDateTime}
          onClose={() => setPTDetailModalVisible(false)}
          onEdit={handleEditPT}
          onApprove={handleApprovePayment}
          onCancel={handleCancelPT}
          onDelete={handleDeletePT}
          onCopyToNextWeek={handleCopyToNextWeek}
        />

        {/* PT Edit Modal */}
        <PTEditModal
          visible={ptEditModalVisible}
          editPTScheduledAt={editPTScheduledAt}
          editPTMemberId={editPTMemberId}
          editPTCoachId={editPTCoachId}
          editPTDuration={editPTDuration}
          editPTSessionType={editPTSessionType}
          editPTSessionRate={editPTSessionRate}
          editPTCommission={editPTCommission}
          selectedCoachRates={selectedCoachRates}
          members={members}
          coaches={coaches}
          onClose={() => setPTEditModalVisible(false)}
          onSave={savePTChanges}
          onMemberChange={setEditPTMemberId}
          onCoachChange={setEditPTCoachId}
          onScheduledAtChange={setEditPTScheduledAt}
          onDurationChange={setEditPTDuration}
          onSessionTypeChange={handleSessionTypeChange}
          onSessionRateChange={handleSessionRateChange}
          onCommissionChange={setEditPTCommission}
        />

        {/* Add Menu Modal */}
        <AddMenuModal
          visible={showAddMenu}
          onClose={() => setShowAddMenu(false)}
          onAddClass={() => setShowAddClassModal(true)}
          onAddPTSession={() => setShowAddPTModal(true)}
        />

        {/* Add Class Modal */}
        <AddClassModal
          visible={showAddClassModal}
          newClassName={newClassName}
          newClassLevel={newClassLevel}
          newClassDay={newClassDay}
          newClassStartTime={newClassStartTime}
          newClassEndTime={newClassEndTime}
          newClassCapacity={newClassCapacity}
          newClassDescription={newClassDescription}
          newClassCoaches={newClassCoaches}
          newClassLeadCoach={newClassLeadCoach}
          creatingClass={creatingClass}
          coaches={coaches}
          onClose={() => setShowAddClassModal(false)}
          onCreate={handleCreateClass}
          onClassNameChange={setNewClassName}
          onClassLevelChange={setNewClassLevel}
          onClassDayChange={setNewClassDay}
          onClassStartTimeChange={setNewClassStartTime}
          onClassEndTimeChange={setNewClassEndTime}
          onClassCapacityChange={setNewClassCapacity}
          onClassDescriptionChange={setNewClassDescription}
          onToggleCoach={handleToggleNewClassCoach}
          onLeadCoachChange={setNewClassLeadCoach}
        />

        {/* Add PT Session Modal */}
        <AddPTSessionModal
          visible={showAddPTModal}
          newPTCoachId={newPTCoachId}
          newPTClientName={newPTClientName}
          newPTDate={newPTDate}
          newPTTime={newPTTime}
          newPTDuration={newPTDuration}
          newPTSessionType={newPTSessionType}
          newPTNotes={newPTNotes}
          newPTCoachRates={newPTCoachRates}
          newPTSessionRate={newPTSessionRate}
          newPTCommission={newPTCommission}
          showDatePicker={showDatePicker}
          calendarMonth={calendarMonth}
          repeatWeekly={repeatWeekly}
          repeatWeeks={repeatWeeks}
          creatingPT={creatingPT}
          coaches={coaches}
          onClose={() => setShowAddPTModal(false)}
          onCreate={handleCreatePTSession}
          onCoachChange={setNewPTCoachId}
          onClientNameChange={setNewPTClientName}
          onDateChange={setNewPTDate}
          onTimeChange={setNewPTTime}
          onDurationChange={setNewPTDuration}
          onSessionTypeChange={setNewPTSessionType}
          onNotesChange={setNewPTNotes}
          onShowDatePickerChange={setShowDatePicker}
          onCalendarMonthChange={setCalendarMonth}
          onRepeatWeeklyChange={setRepeatWeekly}
          onRepeatWeeksChange={setRepeatWeeks}
          addWeeksToDate={addWeeksToDate}
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
});
