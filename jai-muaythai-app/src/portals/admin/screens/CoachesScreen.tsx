import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing, Fonts } from '../../../shared/constants/Colors';
import { Payslip } from '../../../types';
import { PayslipViewer } from '../../coach/components/PayslipViewer';

interface Coach {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  employment_type: 'full_time' | 'part_time' | null;
  hourly_rate: number | null;
  base_salary: number | null;
  pt_commission_rate: number | null;
  solo_rate: number | null;
  buddy_rate: number | null;
  house_call_rate: number | null;
  certifications: string | null;
  start_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface LeaveRequest {
  id: string;
  coach_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  status: string;
  created_at: string;
  coach?: {
    full_name: string;
    email: string;
  };
}

export const AdminCoachesScreen: React.FC = () => {
  const { user } = useAuth();
  const isMasterAdmin = user?.role === 'master_admin';
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const formatCurrency = (amount: number) => {
    return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Add Coach Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmploymentType, setNewEmploymentType] = useState<'full_time' | 'part_time'>('part_time');
  const [newHourlyRate, setNewHourlyRate] = useState('');
  const [newBaseSalary, setNewBaseSalary] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit Coach Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmploymentType, setEditEmploymentType] = useState<'full_time' | 'part_time'>('part_time');
  const [editHourlyRate, setEditHourlyRate] = useState('');
  const [editBaseSalary, setEditBaseSalary] = useState('');
  const [editPTCommissionRate, setEditPTCommissionRate] = useState('');
  const [editSoloRate, setEditSoloRate] = useState('');
  const [editBuddyRate, setEditBuddyRate] = useState('');
  const [editHouseCallRate, setEditHouseCallRate] = useState('');
  const [editCertifications, setEditCertifications] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEmergencyContactName, setEditEmergencyContactName] = useState('');
  const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Coach payslips
  const [coachPayslips, setCoachPayslips] = useState<Payslip[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  // Pending Leave
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequest[]>([]);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [leaveDetailVisible, setLeaveDetailVisible] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  const fetchCoaches = useCallback(async () => {
    const { data, error} = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        email,
        phone,
        is_active,
        employment_type,
        hourly_rate,
        base_salary,
        pt_commission_rate,
        solo_rate,
        buddy_rate,
        house_call_rate,
        certifications,
        start_date,
        emergency_contact_name,
        emergency_contact_phone,
        avatar_url,
        created_at
      `)
      .in('role', ['coach', 'master_admin'])
      .not('full_name', 'is', null)
      .neq('full_name', '')
      .not('email', 'is', null)
      .neq('email', '')
      .order('full_name', { ascending: true });

    if (data) setCoaches(data);
    if (error) console.error('Error fetching coaches:', error);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  const fetchPendingLeave = useCallback(async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select(`
        *,
        coach:users!coach_id (full_name, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (data) setPendingLeaveRequests(data);
  }, []);

  useEffect(() => {
    fetchPendingLeave();
  }, [fetchPendingLeave]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCoaches(), fetchPendingLeave()]);
    setRefreshing(false);
  };

  const handleLeavePress = async (leave: LeaveRequest) => {
    const { data } = await supabase
      .from('leave_requests')
      .select(`
        *,
        coach:users!coach_id (full_name, email)
      `)
      .eq('id', leave.id)
      .single();

    if (data) {
      setSelectedLeave(data);
      setLeaveDetailVisible(true);
    } else {
      Alert.alert('Error', 'Could not load leave request details');
    }
  };

  const handleApproveLeave = async () => {
    if (!selectedLeave) return;
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: approvalNotes || null,
        })
        .eq('id', selectedLeave.id);

      if (error) { Alert.alert('Error', error.message); return; }

      await supabase.from('notifications').insert({
        user_id: selectedLeave.coach_id,
        title: 'Leave Approved',
        message: `Your leave from ${selectedLeave.start_date} to ${selectedLeave.end_date} has been approved${approvalNotes ? `. Notes: ${approvalNotes}` : ''}`,
        notification_type: 'leave_status',
        is_read: false,
      });

      Alert.alert('Success', 'Leave request approved');
      setLeaveDetailVisible(false);
      setSelectedLeave(null);
      setApprovalNotes('');
      fetchPendingLeave();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to approve leave');
    }
  };

  const handleRejectLeave = async () => {
    if (!selectedLeave) return;
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: approvalNotes || null,
        })
        .eq('id', selectedLeave.id);

      if (error) { Alert.alert('Error', error.message); return; }

      await supabase.from('notifications').insert({
        user_id: selectedLeave.coach_id,
        title: 'Leave Rejected',
        message: `Your leave from ${selectedLeave.start_date} to ${selectedLeave.end_date} has been rejected${approvalNotes ? `. Notes: ${approvalNotes}` : ''}`,
        notification_type: 'leave_status',
        is_read: false,
      });

      Alert.alert('Success', 'Leave request rejected');
      setLeaveDetailVisible(false);
      setSelectedLeave(null);
      setApprovalNotes('');
      fetchPendingLeave();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reject leave');
    }
  };

  // ===== ADD COACH =====
  const handleAddCoach = async () => {
    const email = newEmail.trim().toLowerCase();
    const fullName = newFullName.trim();

    // Validation
    if (!email) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (!fullName) {
      Alert.alert('Error', 'Please enter full name');
      return;
    }
    if (newEmploymentType === 'part_time' && !newHourlyRate) {
      Alert.alert('Error', 'Please enter hourly rate for part-time coaches');
      return;
    }
    if (newEmploymentType === 'full_time' && !newBaseSalary) {
      Alert.alert('Error', 'Please enter base salary for full-time coaches');
      return;
    }

    setCreating(true);
    try {
      // Get current session for token
      const { data: { session } } = await supabase.auth.getSession();

      // Call Edge Function using direct fetch
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email: email,
            password: 'JMT1234',
            full_name: fullName,
            role: 'coach',
            user_token: session?.access_token,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      const data = { user: result.user };

      if (data.user) {
        // Update user record with employment details (profile already created by Edge Function)
        const { error: updateError } = await supabase
          .from('users')
          .update({
            phone: newPhone.trim() || null,
            employment_type: newEmploymentType,
            hourly_rate: newEmploymentType === 'part_time' ? parseFloat(newHourlyRate) || null : null,
            base_salary: newEmploymentType === 'full_time' ? parseFloat(newBaseSalary) || null : null,
            start_date: newStartDate || new Date().toISOString().split('T')[0],
            is_first_login: true,
          })
          .eq('id', data.user.id);

        if (updateError) {
          console.error('Error updating user details:', updateError);
        }

        Alert.alert(
          'Coach Added!',
          `Account created for ${fullName}\n\nEmail: ${email}\nDefault password: JMT1234\n\nThey will be asked to change it on first login.`,
          [{ text: 'OK' }]
        );
        setShowAddModal(false);
        setNewEmail('');
        setNewFullName('');
        setNewPhone('');
        setNewHourlyRate('');
        setNewBaseSalary('');
        setNewStartDate('');
        // Wait a moment for the trigger to create the records
        setTimeout(() => fetchCoaches(), 1500);
      }
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        Alert.alert('Error', 'This email is already registered');
      } else {
        Alert.alert('Error', err.message || 'Failed to create coach account');
      }
    } finally {
      setCreating(false);
    }
  };

  // ===== EDIT COACH =====
  const openEditModal = (coach: Coach) => {
    setSelectedCoach(coach);
    setEditFullName(coach.full_name || '');
    setEditPhone(coach.phone || '');
    setEditEmploymentType(coach.employment_type || 'part_time');
    setEditHourlyRate(coach.hourly_rate?.toString() || '');
    setEditBaseSalary(coach.base_salary?.toString() || '');
    setEditPTCommissionRate(coach.pt_commission_rate ? (coach.pt_commission_rate * 100).toString() : '50');
    setEditSoloRate(coach.solo_rate?.toString() || '80');
    setEditBuddyRate(coach.buddy_rate?.toString() || '120');
    setEditHouseCallRate(coach.house_call_rate?.toString() || '140');
    setEditCertifications(coach.certifications || '');
    setEditStartDate(coach.start_date || '');
    setEditEmergencyContactName(coach.emergency_contact_name || '');
    setEditEmergencyContactPhone(coach.emergency_contact_phone || '');
    setShowEditModal(true);
    fetchCoachPayslips(coach.id);
  };

  const fetchCoachPayslips = async (coachId: string) => {
    setLoadingPayslips(true);
    try {
      const { data } = await supabase
        .from('payslips')
        .select('*')
        .eq('user_id', coachId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      setCoachPayslips(data || []);
    } catch (err) {
      console.error('Error fetching payslips:', err);
    } finally {
      setLoadingPayslips(false);
    }
  };

  const generateCoachPayslip = async () => {
    if (!selectedCoach) return;

    if (!selectedCoach.employment_type) {
      Alert.alert('Error', 'Please set employment type for this coach first');
      return;
    }

    // Generate for current month
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Check if payslip already exists
    const { data: existing } = await supabase
      .from('payslips')
      .select('id')
      .eq('user_id', selectedCoach.id)
      .eq('month', month)
      .eq('year', year)
      .single();

    if (existing) {
      Alert.alert('Info', 'Payslip already exists for this month');
      return;
    }

    const isFullTime = selectedCoach.employment_type === 'full_time';
    const baseSalary = selectedCoach.base_salary || 0;
    const hourlyRate = selectedCoach.hourly_rate || 50;

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    const { data: classes } = await supabase
      .from('classes')
      .select('id, duration')
      .eq('lead_coach_id', selectedCoach.id)
      .gte('scheduled_at', startOfMonth.toISOString())
      .lte('scheduled_at', endOfMonth.toISOString());

    const classCount = classes?.length || 0;
    const classHours = classes?.reduce((sum, c) => sum + ((c.duration || 60) / 60), 0) || 0;
    const classEarnings = isFullTime ? 0 : classHours * hourlyRate;

    const { data: ptSessions } = await supabase
      .from('pt_sessions')
      .select('session_price, status, scheduled_at')
      .eq('coach_id', selectedCoach.id)
      .gte('scheduled_at', startOfMonth.toISOString())
      .lte('scheduled_at', endOfMonth.toISOString())
      .in('status', ['attended', 'completed']);

    // Calculate weekly PT breakdown
    const ptWeeklyBreakdown: { week: number; amount: number }[] = [];
    for (let w = 1; w <= 5; w++) {
      const weekStart = new Date(year, month - 1, 1 + (w - 1) * 7);
      const weekEnd = new Date(year, month - 1, 7 + (w - 1) * 7);

      const weekSessions = ptSessions?.filter(s => {
        const sessionDate = new Date(s.scheduled_at);
        return sessionDate >= weekStart && sessionDate < weekEnd;
      }) || [];

      const weekAmount = weekSessions.reduce((sum, s) => sum + ((s.session_price || 90) * 0.5), 0);
      if (weekAmount > 0 || weekSessions.length > 0) {
        ptWeeklyBreakdown.push({ week: w, amount: Math.round(weekAmount * 100) / 100 });
      }
    }

    const ptSessionCount = ptSessions?.length || 0;
    const ptCommission = ptSessions?.reduce((sum, s) => sum + ((s.session_price || 90) * 0.5), 0) || 0;

    const grossPay = isFullTime ? baseSalary + ptCommission : classEarnings + ptCommission;
    const cpfContribution = Math.round(grossPay * 0.17 * 100) / 100;
    const netPay = grossPay - cpfContribution;

    const paymentDate = isFullTime
      ? new Date(year, month, 1).toISOString()
      : new Date(year, month + 1, 0).toISOString();

    const { error } = await supabase
      .from('payslips')
      .insert({
        user_id: selectedCoach.id,
        month,
        year,
        employment_type: selectedCoach.employment_type,
        base_salary: isFullTime ? baseSalary : 0,
        class_earnings: classEarnings,
        class_hours: classHours,
        class_rate_per_hour: hourlyRate,
        pt_commission: ptCommission,
        pt_session_count: ptSessionCount,
        pt_weekly_breakdown: ptWeeklyBreakdown,
        gross_pay: grossPay,
        cpf_contribution: cpfContribution,
        other_deductions: 0,
        deduction_details: [],
        total_deductions: cpfContribution,
        net_pay: netPay,
        status: 'pending',
        payment_date: paymentDate,
      });

    if (error) {
      Alert.alert('Error', 'Failed to create payslip: ' + error.message);
    } else {
      Alert.alert('Success', 'Payslip created successfully');
      fetchCoachPayslips(selectedCoach.id);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedCoach) return;

    // Validation
    if (!editFullName.trim()) {
      Alert.alert('Error', 'Full name is required');
      return;
    }

    if (editEmploymentType === 'part_time' && !editHourlyRate) {
      Alert.alert('Error', 'Hourly rate is required for part-time coaches');
      return;
    }

    if (editEmploymentType === 'full_time' && !editBaseSalary) {
      Alert.alert('Error', 'Base salary is required for full-time coaches');
      return;
    }

    setSaving(true);
    try {
      // Convert percentage to decimal (e.g., 50% -> 0.5)
      const commissionRate = editPTCommissionRate ? parseFloat(editPTCommissionRate) / 100 : 0.5;

      const updateData: any = {
        full_name: editFullName.trim(),
        phone: editPhone.trim() || null,
        employment_type: editEmploymentType,
        hourly_rate: editEmploymentType === 'part_time' ? parseFloat(editHourlyRate) || null : null,
        base_salary: editEmploymentType === 'full_time' ? parseFloat(editBaseSalary) || null : null,
        pt_commission_rate: commissionRate,
        solo_rate: parseFloat(editSoloRate) || 80,
        buddy_rate: parseFloat(editBuddyRate) || 120,
        house_call_rate: parseFloat(editHouseCallRate) || 140,
        certifications: editCertifications.trim() || null,
        start_date: editStartDate || null,
        emergency_contact_name: editEmergencyContactName.trim() || null,
        emergency_contact_phone: editEmergencyContactPhone.trim() || null,
      };

      console.log('[AdminCoachesScreen] Updating coach:', selectedCoach.id, updateData);

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', selectedCoach.id)
        .select();

      console.log('[AdminCoachesScreen] Update result:', { data, error });

      if (error) throw error;

      Alert.alert('Saved!', 'Coach details updated successfully');
      setShowEditModal(false);
      setSelectedCoach(null);
      fetchCoaches();
    } catch (err: any) {
      console.error('[AdminCoachesScreen] Save error:', err);
      Alert.alert('Error', err.message || 'Failed to update coach');
    } finally {
      setSaving(false);
    }
  };

  // ===== RENDER COACH CARD =====
  const renderCoach = ({ item }: { item: Coach }) => {
    const hasEmploymentDetails = item.employment_type &&
      ((item.employment_type === 'part_time' && item.hourly_rate) ||
       (item.employment_type === 'full_time' && item.base_salary));

    return (
      <TouchableOpacity style={styles.coachCard} onPress={() => openEditModal(item)} activeOpacity={0.7}>
        <View style={styles.coachHeader}>
          <LinearGradient colors={[Colors.jaiBlue, Colors.jaiBlue]} style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.full_name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </LinearGradient>
          <View style={styles.coachInfo}>
            <Text style={styles.coachName}>{item.full_name || 'New Coach'}</Text>
            <Text style={styles.coachEmail}>{item.email}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
        </View>

        {/* Badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, {
            backgroundColor: item.employment_type === 'full_time' ? Colors.success + '15' : Colors.warning + '15',
          }]}>
            <Text style={[styles.badgeText, {
              color: item.employment_type === 'full_time' ? Colors.success : Colors.warning,
            }]}>
              {item.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
            </Text>
          </View>
          {item.start_date && (
            <View style={[styles.badge, {
              backgroundColor: Colors.jaiBlue + '15',
            }]}>
              <Text style={[styles.badgeText, { color: Colors.jaiBlue }]}>
                Started {new Date(item.start_date).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })}
              </Text>
            </View>
          )}
        </View>

        {/* Rates */}
        <View style={styles.ratesRow}>
          {item.employment_type === 'part_time' ? (
            <>
              <View style={styles.rateItem}>
                <Text style={styles.rateLabel}>Hourly Rate</Text>
                <Text style={[styles.rateValue, !hasEmploymentDetails && styles.rateNotSet]}>
                  {item.hourly_rate ? formatCurrency(item.hourly_rate) : 'Not set'}
                </Text>
              </View>
              <View style={styles.rateDivider} />
            </>
          ) : (
            <>
              <View style={styles.rateItem}>
                <Text style={styles.rateLabel}>Base Salary</Text>
                <Text style={[styles.rateValue, !hasEmploymentDetails && styles.rateNotSet]}>
                  {item.base_salary ? formatCurrency(item.base_salary) : 'Not set'}
                </Text>
              </View>
              <View style={styles.rateDivider} />
            </>
          )}
          <View style={styles.rateItem}>
            <Text style={styles.rateLabel}>Phone</Text>
            <Text style={[styles.rateValue, !item.phone && styles.rateNotSet]}>
              {item.phone || 'Not set'}
            </Text>
          </View>
          <View style={styles.rateDivider} />
          <View style={styles.rateItem}>
            <Text style={styles.rateLabel}>Active</Text>
            <Ionicons
              name={item.is_active ? 'checkmark-circle' : 'close-circle'}
              size={20}
              color={item.is_active ? Colors.success : Colors.error}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Show PayslipViewer when a payslip is selected
  if (selectedPayslip && selectedCoach) {
    const coachInfo = coaches.find(c => c.id === selectedPayslip.user_id) || { full_name: selectedCoach.full_name, email: selectedCoach.email };
    return (
      <PayslipViewer
        payslip={selectedPayslip}
        coachName={coachInfo.full_name || 'Unknown'}
        coachEmail={coachInfo.email || ''}
        onClose={() => setSelectedPayslip(null)}
        onRefresh={() => fetchCoachPayslips(selectedCoach.id)}
        isAdmin={true}
        isMasterAdmin={isMasterAdmin}
      />
    );
  }

  return (
    <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Coaches</Text>
            <Text style={styles.headerSubtitle}>{coaches.length} total</Text>
          </View>
          {isMasterAdmin && (
            <TouchableOpacity onPress={() => setShowAddModal(true)}>
              <LinearGradient
                colors={[Colors.jaiBlue, Colors.jaiBlue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addButton}
              >
                <Ionicons name="add" size={18} color={Colors.white} />
                <Text style={styles.addButtonText}>Add Coach</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Coach List */}
        {loading ? (
          <ActivityIndicator size="large" color={Colors.jaiBlue} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={coaches}
            renderItem={renderCoach}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
            }
            ListHeaderComponent={
              pendingLeaveRequests.length > 0 ? (
                <View style={styles.leaveSection}>
                  <View style={styles.leaveSectionHeader}>
                    <View style={styles.leaveSectionAccent} />
                    <Text style={styles.leaveSectionTitle}>PENDING LEAVE</Text>
                    <View style={styles.leaveCountBadge}>
                      <Text style={styles.leaveCountBadgeText}>{pendingLeaveRequests.length}</Text>
                    </View>
                  </View>
                  {pendingLeaveRequests.map((leave) => (
                    <TouchableOpacity
                      key={leave.id}
                      style={styles.leaveCard}
                      onPress={() => handleLeavePress(leave)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.leaveCardHeader}>
                        <View style={styles.leaveWarningDot} />
                        <Text style={styles.leaveCoachName}>
                          {leave.coach?.full_name || 'Unknown'}
                        </Text>
                        <View style={styles.leavePendingBadge}>
                          <Text style={styles.leavePendingBadgeText}>PENDING</Text>
                        </View>
                      </View>
                      <Text style={styles.leaveInfo}>
                        {leave.leave_type ? leave.leave_type.charAt(0).toUpperCase() + leave.leave_type.slice(1) : 'Leave'} {' \u2022 '} {leave.start_date} - {leave.end_date}
                      </Text>
                      {leave.reason ? (
                        <Text style={styles.leaveReason} numberOfLines={1}>
                          {leave.reason}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                  <View style={styles.leaveDivider} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={60} color={Colors.darkGray} />
                <Text style={styles.emptyText}>No coaches yet</Text>
                <Text style={styles.emptySubtext}>Tap "Add Coach" to get started</Text>
              </View>
            }
          />
        )}

        {/* ===== ADD COACH MODAL ===== */}
        <Modal visible={showAddModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Add New Coach</Text>
                  <Text style={styles.modalSubtitle}>Fill in coach details to create account</Text>

                  <Text style={styles.modalLabel}>Full Name</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={newFullName}
                      onChangeText={setNewFullName}
                      placeholder="Full Name"
                      placeholderTextColor={Colors.darkGray}
                      autoFocus
                    />
                  </View>

                  <Text style={styles.modalLabel}>Email Address</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="mail-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      placeholder="coach@email.com"
                      placeholderTextColor={Colors.darkGray}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>

                  <Text style={styles.modalLabel}>Phone (optional)</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="call-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={newPhone}
                      onChangeText={setNewPhone}
                      placeholder="+65 1234 5678"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="phone-pad"
                    />
                  </View>

                  <Text style={styles.modalLabel}>Employment Type</Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[
                        styles.toggleButton,
                        newEmploymentType === 'full_time' && styles.toggleButtonActive,
                      ]}
                      onPress={() => setNewEmploymentType('full_time')}
                    >
                      <Text style={[
                        styles.toggleText,
                        newEmploymentType === 'full_time' && styles.toggleTextActive,
                      ]}>Full-Time</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.toggleButton,
                        newEmploymentType === 'part_time' && styles.toggleButtonActive,
                      ]}
                      onPress={() => setNewEmploymentType('part_time')}
                    >
                      <Text style={[
                        styles.toggleText,
                        newEmploymentType === 'part_time' && styles.toggleTextActive,
                      ]}>Part-Time</Text>
                    </TouchableOpacity>
                  </View>

                  {newEmploymentType === 'part_time' ? (
                    <>
                      <Text style={styles.modalLabel}>Hourly Rate (SGD)</Text>
                      <View style={styles.modalInputContainer}>
                        <Text style={styles.currencyPrefix}>S$</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={newHourlyRate}
                          onChangeText={setNewHourlyRate}
                          placeholder="50"
                          placeholderTextColor={Colors.darkGray}
                          keyboardType="numeric"
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.modalLabel}>Base Salary (S$/month)</Text>
                      <View style={styles.modalInputContainer}>
                        <Text style={styles.currencyPrefix}>S$</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={newBaseSalary}
                          onChangeText={setNewBaseSalary}
                          placeholder="3000"
                          placeholderTextColor={Colors.darkGray}
                          keyboardType="numeric"
                        />
                      </View>
                    </>
                  )}

                  <Text style={styles.modalLabel}>Start Date (optional)</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={newStartDate}
                      onChangeText={setNewStartDate}
                      placeholder="YYYY-MM-DD (defaults to today)"
                      placeholderTextColor={Colors.darkGray}
                    />
                  </View>

                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle" size={18} color={Colors.jaiBlue} />
                    <Text style={styles.infoText}>
                      Default password: JMT1234{'\n'}Coach will change it on first login
                    </Text>
                  </View>

                  <TouchableOpacity onPress={handleAddCoach} disabled={creating}>
                    <LinearGradient
                      colors={[Colors.jaiBlue, Colors.jaiBlue]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.modalButton}
                    >
                      {creating ? (
                        <ActivityIndicator color={Colors.white} />
                      ) : (
                        <Text style={styles.modalButtonText}>Create Coach Account</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowAddModal(false);
                      setNewEmail('');
                      setNewFullName('');
                      setNewPhone('');
                      setNewHourlyRate('');
                      setNewBaseSalary('');
                      setNewStartDate('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* ===== EDIT COACH MODAL ===== */}
        <Modal visible={showEditModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Edit Coach</Text>

                  {/* Coach Info (read-only) */}
                  <View style={styles.editCoachHeader}>
                    <LinearGradient colors={[Colors.jaiBlue, Colors.jaiBlue]} style={styles.editAvatar}>
                      <Text style={styles.editAvatarText}>
                        {selectedCoach?.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </Text>
                    </LinearGradient>
                    <View>
                      <Text style={styles.editCoachName}>{selectedCoach?.full_name || 'New Coach'}</Text>
                      <Text style={styles.editCoachEmail}>{selectedCoach?.email}</Text>
                    </View>
                  </View>

                  {/* Full Name */}
                  <Text style={styles.modalLabel}>Full Name</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editFullName}
                      onChangeText={setEditFullName}
                      placeholder="Full Name"
                      placeholderTextColor={Colors.darkGray}
                    />
                  </View>

                  {/* Phone */}
                  <Text style={styles.modalLabel}>Phone</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="call-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editPhone}
                      onChangeText={setEditPhone}
                      placeholder="+65 1234 5678"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="phone-pad"
                    />
                  </View>

                  {/* Employment Type Toggle */}
                  <Text style={styles.modalLabel}>Employment Type</Text>
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      style={[
                        styles.toggleButton,
                        editEmploymentType === 'full_time' && styles.toggleButtonActive,
                      ]}
                      onPress={() => setEditEmploymentType('full_time')}
                    >
                      <Text style={[
                        styles.toggleText,
                        editEmploymentType === 'full_time' && styles.toggleTextActive,
                      ]}>Full-Time</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.toggleButton,
                        editEmploymentType === 'part_time' && styles.toggleButtonActive,
                      ]}
                      onPress={() => setEditEmploymentType('part_time')}
                    >
                      <Text style={[
                        styles.toggleText,
                        editEmploymentType === 'part_time' && styles.toggleTextActive,
                      ]}>Part-Time</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Hourly Rate (Part-Time) or Base Salary (Full-Time) */}
                  {editEmploymentType === 'part_time' ? (
                    <>
                      <Text style={styles.modalLabel}>Hourly Rate (SGD)</Text>
                      <View style={styles.modalInputContainer}>
                        <Text style={styles.currencyPrefix}>S$</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={editHourlyRate}
                          onChangeText={setEditHourlyRate}
                          placeholder="50"
                          placeholderTextColor={Colors.darkGray}
                          keyboardType="numeric"
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.salaryFieldContainer}>
                        <View style={styles.salaryFieldHeader}>
                          <Text style={styles.modalLabel}>Base Salary (S$/month)</Text>
                          {isMasterAdmin && (
                            <View style={styles.confidentialBadge}>
                              <Ionicons name="lock-closed" size={10} color={Colors.warning} />
                              <Text style={styles.confidentialText}>Private</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.modalInputContainer}>
                          <Text style={styles.currencyPrefix}>S$</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={editBaseSalary}
                            onChangeText={setEditBaseSalary}
                            placeholder="3000"
                            placeholderTextColor={Colors.darkGray}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    </>
                  )}

                  {/* PT Commission Rate */}
                  <Text style={styles.modalLabel}>PT Commission Rate (%)</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="wallet-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editPTCommissionRate}
                      onChangeText={setEditPTCommissionRate}
                      placeholder="50"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="numeric"
                    />
                    <Text style={styles.percentageSymbol}>%</Text>
                  </View>
                  <Text style={styles.helperText}>Default: 50% • Senior coaches may receive higher rates</Text>

                  {/* PT Session Rates Section */}
                  <View style={styles.modalDivider} />
                  <View style={styles.payslipsSectionHeader}>
                    <View style={styles.payslipsSectionAccent} />
                    <Text style={styles.payslipsSectionTitle}>PT SESSION RATES (Client Pays)</Text>
                  </View>
                  <Text style={styles.helperText}>Set what clients pay for each session type. Coach earns: rate × commission %</Text>

                  {/* Solo Rate */}
                  <Text style={styles.modalLabel}>Solo Session Rate (S$)</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editSoloRate}
                      onChangeText={setEditSoloRate}
                      placeholder="80"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Buddy Rate */}
                  <Text style={styles.modalLabel}>Buddy Session Rate (S$)</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="people-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editBuddyRate}
                      onChangeText={setEditBuddyRate}
                      placeholder="120"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* House Call Rate */}
                  <Text style={styles.modalLabel}>House Call Rate (S$)</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="home-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editHouseCallRate}
                      onChangeText={setEditHouseCallRate}
                      placeholder="140"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.modalDivider} />

                  {/* Start Date */}
                  <Text style={styles.modalLabel}>Start Date</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editStartDate}
                      onChangeText={setEditStartDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.darkGray}
                    />
                  </View>

                  {/* Certifications */}
                  <Text style={styles.modalLabel}>Certifications (optional)</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="ribbon-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editCertifications}
                      onChangeText={setEditCertifications}
                      placeholder="e.g., CPR, First Aid, Muay Thai Level 3"
                      placeholderTextColor={Colors.darkGray}
                    />
                  </View>

                  {/* Emergency Contact */}
                  <View style={styles.modalDivider} />
                  <Text style={styles.modalLabel}>Emergency Contact Name</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editEmergencyContactName}
                      onChangeText={setEditEmergencyContactName}
                      placeholder="Emergency contact name"
                      placeholderTextColor={Colors.darkGray}
                    />
                  </View>

                  <Text style={styles.modalLabel}>Emergency Contact Phone</Text>
                  <View style={styles.modalInputContainer}>
                    <Ionicons name="call-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                    <TextInput
                      style={styles.modalInput}
                      value={editEmergencyContactPhone}
                      onChangeText={setEditEmergencyContactPhone}
                      placeholder="+65 1234 5678"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="phone-pad"
                    />
                  </View>

                  {/* ===== PAYSLIPS SECTION (Master Admin only) ===== */}
                  {isMasterAdmin && (
                    <>
                      <View style={styles.modalDivider} />

                      <View style={styles.payslipsSectionHeader}>
                        <View style={styles.payslipsSectionAccent} />
                        <Text style={styles.payslipsSectionTitle}>PAYSLIPS</Text>
                      </View>

                      {loadingPayslips ? (
                        <ActivityIndicator color={Colors.jaiBlue} style={{ padding: 20 }} />
                      ) : coachPayslips.length === 0 ? (
                        <View style={styles.noPayslipsContainer}>
                          <Ionicons name="document-text-outline" size={32} color={Colors.darkGray} />
                          <Text style={styles.noPayslipsText}>No payslips yet</Text>
                        </View>
                      ) : (
                        <View style={styles.payslipsList}>
                          {coachPayslips.slice(0, 6).map(payslip => (
                            <TouchableOpacity
                              key={payslip.id}
                              style={styles.payslipItem}
                              onPress={() => setSelectedPayslip(payslip)}
                            >
                              <View style={styles.payslipItemLeft}>
                                <Text style={styles.payslipMonth}>
                                  {MONTH_NAMES[payslip.month - 1]} {payslip.year}
                                </Text>
                                <Text style={styles.payslipGross}>
                                  Gross: {formatCurrency(payslip.gross_pay)}
                                </Text>
                              </View>
                              <View style={styles.payslipItemRight}>
                                <Text style={styles.payslipNet}>{formatCurrency(payslip.net_pay)}</Text>
                                <View style={[
                                  styles.payslipStatusBadge,
                                  { backgroundColor: payslip.status === 'paid' ? Colors.success + '20' : Colors.warning + '20' }
                                ]}>
                                  <Text style={[
                                    styles.payslipStatusText,
                                    { color: payslip.status === 'paid' ? Colors.success : Colors.warning }
                                  ]}>
                                    {payslip.status === 'paid' ? 'Paid' : 'Pending'}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          ))}
                          {coachPayslips.length > 6 && (
                            <Text style={styles.payslipMore}>
                              +{coachPayslips.length - 6} more payslips
                            </Text>
                          )}
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.generatePayslipButton}
                        onPress={() => {
                          Alert.alert(
                            'Generate Payslip',
                            `Create a payslip for ${selectedCoach?.full_name}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Generate',
                                onPress: () => generateCoachPayslip(),
                              },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={18} color={Colors.jaiBlue} />
                        <Text style={styles.generatePayslipText}>Generate Payslip</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  <TouchableOpacity onPress={handleSaveEdit} disabled={saving}>
                    <LinearGradient
                      colors={[Colors.jaiBlue, Colors.jaiBlue]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.modalButton, { marginTop: 24 }]}
                    >
                      {saving ? (
                        <ActivityIndicator color={Colors.white} />
                      ) : (
                        <Text style={styles.modalButtonText}>Save Changes</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => { setShowEditModal(false); setSelectedCoach(null); }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* ===== LEAVE DETAIL MODAL ===== */}
        <Modal
          visible={leaveDetailVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLeaveDetailVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.leaveModalContent}>
              <View style={styles.leaveModalHeader}>
                <Text style={styles.leaveModalTitle}>Leave Request</Text>
                <TouchableOpacity onPress={() => setLeaveDetailVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.white} />
                </TouchableOpacity>
              </View>

              {selectedLeave && (
                <>
                  <ScrollView style={styles.leaveModalBody}>
                    <View style={styles.leaveDetailRow}>
                      <Text style={styles.leaveDetailLabel}>Coach</Text>
                      <Text style={styles.leaveDetailValue}>{selectedLeave.coach?.full_name || 'Unknown'}</Text>
                    </View>
                    <View style={styles.leaveDetailRow}>
                      <Text style={styles.leaveDetailLabel}>Leave Type</Text>
                      <Text style={styles.leaveDetailValue}>
                        {selectedLeave.leave_type
                          ? selectedLeave.leave_type.charAt(0).toUpperCase() + selectedLeave.leave_type.slice(1)
                          : 'Not specified'}
                      </Text>
                    </View>
                    <View style={styles.leaveDetailRow}>
                      <Text style={styles.leaveDetailLabel}>Date Range</Text>
                      <Text style={styles.leaveDetailValue}>
                        {selectedLeave.start_date} - {selectedLeave.end_date}
                      </Text>
                    </View>
                    <View style={styles.leaveDetailRow}>
                      <Text style={styles.leaveDetailLabel}>Reason</Text>
                      <Text style={styles.leaveDetailValue}>{selectedLeave.reason}</Text>
                    </View>
                    <View style={styles.leaveDetailRow}>
                      <Text style={styles.leaveDetailLabel}>Applied</Text>
                      <Text style={styles.leaveDetailValue}>
                        {new Date(selectedLeave.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </Text>
                    </View>

                    <Text style={[styles.leaveDetailLabel, { marginTop: 16, marginBottom: 8 }]}>
                      Notes (optional):
                    </Text>
                    <TextInput
                      style={styles.leaveNotesInput}
                      placeholder="Add notes for the coach..."
                      placeholderTextColor={Colors.darkGray}
                      value={approvalNotes}
                      onChangeText={setApprovalNotes}
                      multiline
                      numberOfLines={3}
                    />
                  </ScrollView>

                  <View style={styles.leaveActions}>
                    <TouchableOpacity
                      style={[styles.leaveActionButton, { backgroundColor: Colors.error }]}
                      onPress={handleRejectLeave}
                    >
                      <Ionicons name="close-circle" size={18} color={Colors.white} />
                      <Text style={styles.leaveActionText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.leaveActionButton, { backgroundColor: Colors.success }]}
                      onPress={handleApproveLeave}
                    >
                      <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                      <Text style={styles.leaveActionText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.white,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  addButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  coachCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  coachInfo: { flex: 1 },
  coachName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.white,
  },
  coachEmail: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ratesRow: {
    flexDirection: 'row',
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 12,
  },
  rateItem: {
    flex: 1,
    alignItems: 'center',
  },
  rateDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  rateLabel: {
    fontSize: 11,
    color: Colors.lightGray,
    marginBottom: 4,
  },
  rateValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  rateNotSet: {
    color: Colors.warning,
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: Colors.lightGray,
    fontSize: 14,
    marginTop: 4,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.lightGray,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
    marginTop: Spacing.md,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  modalInputIcon: {
    marginRight: 10,
  },
  modalInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.white,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginRight: 10,
  },
  percentageSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginLeft: 10,
  },
  helperText: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 4,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.lightGray,
    lineHeight: 20,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: Spacing.lg,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.lightGray,
  },
  editCoachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 8,
    marginTop: Spacing.md,
  },
  editAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  editAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  editCoachName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  editCoachEmail: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleButtonActive: {
    backgroundColor: Colors.jaiBlue + '15',
    borderColor: Colors.jaiBlue,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.lightGray,
  },
  toggleTextActive: {
    color: Colors.jaiBlue,
  },
  // Salary field styles
  salaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  salaryFieldContainer: {
    marginTop: Spacing.sm,
  },
  salaryFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  confidentialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  confidentialText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.warning,
  },
  salaryHelperText: {
    fontSize: 11,
    color: Colors.lightGray,
    marginTop: 6,
    fontStyle: 'italic',
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  // Payslips section styles
  payslipsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  payslipsSectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 2,
    marginRight: 8,
  },
  payslipsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noPayslipsContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: Colors.black,
    borderRadius: 12,
  },
  noPayslipsText: {
    fontSize: 14,
    color: Colors.lightGray,
    marginTop: 8,
  },
  payslipsList: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 8,
  },
  payslipItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.cardBg,
    marginBottom: 6,
  },
  payslipItemLeft: {
    flex: 1,
  },
  payslipMonth: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  payslipGross: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 2,
  },
  payslipItemRight: {
    alignItems: 'flex-end',
  },
  payslipNet: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
  },
  payslipStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  payslipStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  payslipMore: {
    fontSize: 12,
    color: Colors.lightGray,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  generatePayslipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '40',
    borderStyle: 'dashed',
  },
  generatePayslipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginLeft: 8,
  },
  // Pending Leave Section styles
  leaveSection: {
    marginBottom: Spacing.md,
  },
  leaveSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  leaveSectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: Colors.warning,
    borderRadius: 2,
    marginRight: 8,
  },
  leaveSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  leaveCountBadge: {
    backgroundColor: Colors.warning,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  leaveCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
  },
  leaveCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  leaveCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  leaveWarningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.warning,
    marginRight: 8,
  },
  leaveCoachName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  leavePendingBadge: {
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  leavePendingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.warning,
  },
  leaveInfo: {
    fontSize: 13,
    color: Colors.lightGray,
    marginLeft: 16,
  },
  leaveReason: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
    marginLeft: 16,
    fontStyle: 'italic',
  },
  leaveDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  // Leave Detail Modal styles
  leaveModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: '70%',
    marginBottom: 100,
  },
  leaveModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  leaveModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
  leaveModalBody: {
    marginBottom: Spacing.md,
  },
  leaveDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  leaveDetailLabel: {
    fontSize: 13,
    color: Colors.lightGray,
    flex: 1,
  },
  leaveDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 2,
    textAlign: 'right',
  },
  leaveNotesInput: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: 14,
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  leaveActions: {
    flexDirection: 'row',
    gap: 12,
  },
  leaveActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  leaveActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
});
