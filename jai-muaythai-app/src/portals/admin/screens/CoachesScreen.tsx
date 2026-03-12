import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { Payslip } from '../../../types';
import { PayslipViewer } from '../../coach/components/PayslipViewer';

import { Coach, LeaveRequest } from '../components/coaches/types';
import { AddCoachModal } from '../components/coaches/AddCoachModal';
import { EditCoachModal } from '../components/coaches/EditCoachModal';
import { LeaveDetailModal } from '../components/coaches/LeaveDetailModal';
import { CoachCard } from '../components/coaches/CoachCard';

export const AdminCoachesScreen: React.FC = () => {
  const { user } = useAuth();
  const isMasterAdmin = user?.role === 'master_admin';
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

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
        resetAddModal();
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

  const resetAddModal = () => {
    setShowAddModal(false);
    setNewEmail('');
    setNewFullName('');
    setNewPhone('');
    setNewHourlyRate('');
    setNewBaseSalary('');
    setNewStartDate('');
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
  const renderCoach = ({ item }: { item: Coach }) => (
    <CoachCard
      coach={item}
      isMasterAdmin={isMasterAdmin}
      onPress={openEditModal}
    />
  );

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
        <AddCoachModal
          visible={showAddModal}
          newFullName={newFullName}
          newEmail={newEmail}
          newPhone={newPhone}
          newEmploymentType={newEmploymentType}
          newHourlyRate={newHourlyRate}
          newBaseSalary={newBaseSalary}
          newStartDate={newStartDate}
          creating={creating}
          isMasterAdmin={isMasterAdmin}
          onFullNameChange={setNewFullName}
          onEmailChange={setNewEmail}
          onPhoneChange={setNewPhone}
          onEmploymentTypeChange={setNewEmploymentType}
          onHourlyRateChange={setNewHourlyRate}
          onBaseSalaryChange={setNewBaseSalary}
          onStartDateChange={setNewStartDate}
          onClose={resetAddModal}
          onSubmit={handleAddCoach}
        />

        {/* ===== EDIT COACH MODAL ===== */}
        <EditCoachModal
          visible={showEditModal}
          selectedCoach={selectedCoach}
          editFullName={editFullName}
          editPhone={editPhone}
          editEmploymentType={editEmploymentType}
          editHourlyRate={editHourlyRate}
          editBaseSalary={editBaseSalary}
          editPTCommissionRate={editPTCommissionRate}
          editSoloRate={editSoloRate}
          editBuddyRate={editBuddyRate}
          editHouseCallRate={editHouseCallRate}
          editCertifications={editCertifications}
          editStartDate={editStartDate}
          editEmergencyContactName={editEmergencyContactName}
          editEmergencyContactPhone={editEmergencyContactPhone}
          saving={saving}
          coachPayslips={coachPayslips}
          loadingPayslips={loadingPayslips}
          isMasterAdmin={isMasterAdmin}
          onFullNameChange={setEditFullName}
          onPhoneChange={setEditPhone}
          onEmploymentTypeChange={setEditEmploymentType}
          onHourlyRateChange={setEditHourlyRate}
          onBaseSalaryChange={setEditBaseSalary}
          onPTCommissionRateChange={setEditPTCommissionRate}
          onSoloRateChange={setEditSoloRate}
          onBuddyRateChange={setEditBuddyRate}
          onHouseCallRateChange={setEditHouseCallRate}
          onCertificationsChange={setEditCertifications}
          onStartDateChange={setEditStartDate}
          onEmergencyContactNameChange={setEditEmergencyContactName}
          onEmergencyContactPhoneChange={setEditEmergencyContactPhone}
          onClose={() => { setShowEditModal(false); setSelectedCoach(null); }}
          onSave={handleSaveEdit}
          onGeneratePayslip={generateCoachPayslip}
          onViewPayslip={setSelectedPayslip}
        />

        {/* ===== LEAVE DETAIL MODAL ===== */}
        <LeaveDetailModal
          visible={leaveDetailVisible}
          selectedLeave={selectedLeave}
          approvalNotes={approvalNotes}
          loading={false}
          onClose={() => setLeaveDetailVisible(false)}
          onApprove={handleApproveLeave}
          onReject={handleRejectLeave}
          onNotesChange={setApprovalNotes}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

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
});
