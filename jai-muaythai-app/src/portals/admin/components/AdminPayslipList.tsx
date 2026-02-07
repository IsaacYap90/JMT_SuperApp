import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { Payslip, PayslipDeduction } from '../../../types';
import { PayslipViewer } from '../../coach/components/PayslipViewer';

export const AdminPayslipList: React.FC = () => {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [coaches, setCoaches] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [bulkGenerateVisible, setBulkGenerateVisible] = useState(false);
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  // Create form state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonthNum, setSelectedMonthNum] = useState(new Date().getMonth() + 1);

  const fetchCoaches = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'coach')
      .eq('is_active', true)
      .order('full_name');

    if (data) {
      setCoaches(data.map(c => ({ id: c.id, full_name: c.full_name || 'Unknown', email: c.email || '' })));
    }
  };

  const fetchPayslips = async () => {
    const { data } = await supabase
      .from('payslips')
      .select('*')
      .eq('year', selectedYear)
      .eq('month', selectedMonthNum)
      .order('created_at', { ascending: false });

    if (data) {
      setPayslips(data);
    }
  };

  useEffect(() => {
    fetchCoaches();
    fetchPayslips();
  }, [selectedYear, selectedMonthNum]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPayslips();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getMonthName = (month: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  };

  const handleCreatePayslip = async () => {
    if (!selectedCoachId) {
      Alert.alert('Error', 'Please select a coach');
      return;
    }

    // Fetch coach profile for calculations
    const { data: coachProfile } = await supabase
      .from('coach_profiles')
      .select('*')
      .eq('user_id', selectedCoachId)
      .single();

    if (!coachProfile) {
      Alert.alert('Error', 'Coach profile not found');
      return;
    }

    const { data: coach } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', selectedCoachId)
      .single();

    // Check if payslip already exists
    const { data: existing } = await supabase
      .from('payslips')
      .select('id')
      .eq('user_id', selectedCoachId)
      .eq('month', selectedMonthNum)
      .eq('year', selectedYear)
      .single();

    if (existing) {
      Alert.alert('Error', 'Payslip already exists for this coach and period');
      return;
    }

    // Calculate earnings based on employment type
    const isFullTime = coachProfile.employment_type === 'full_time';
    const monthlySalary = coachProfile.monthly_salary || 0;
    const ratePerClass = coachProfile.rate_per_class || 50;
    const ratePerPT = coachProfile.rate_per_pt || 80;

    // Get class count and hours for the month
    const startOfMonth = new Date(selectedYear, selectedMonthNum - 1, 1);
    const endOfMonth = new Date(selectedYear, selectedMonthNum, 0);

    const { data: classes } = await supabase
      .from('classes')
      .select('id, duration')
      .eq('lead_coach_id', selectedCoachId)
      .gte('scheduled_at', startOfMonth.toISOString())
      .lte('scheduled_at', endOfMonth.toISOString());

    const classCount = classes?.length || 0;
    const classHours = classes?.reduce((sum, c) => sum + ((c.duration || 60) / 60), 0) || 0;
    const classEarnings = isFullTime ? 0 : classHours * ratePerClass;

    // Get PT sessions for the month with dates for weekly breakdown
    const { data: ptSessions } = await supabase
      .from('pt_sessions')
      .select('session_price, status, scheduled_at')
      .eq('coach_id', selectedCoachId)
      .gte('scheduled_at', startOfMonth.toISOString())
      .lte('scheduled_at', endOfMonth.toISOString())
      .in('status', ['attended', 'completed']);

    // Calculate weekly PT breakdown
    const ptWeeklyBreakdown: { week: number; amount: number }[] = [];
    for (let w = 1; w <= 5; w++) {
      const weekStart = new Date(selectedYear, selectedMonthNum - 1, 1 + (w - 1) * 7);
      const weekEnd = new Date(selectedYear, selectedMonthNum - 1, 7 + (w - 1) * 7);

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

    // Calculate gross pay
    const grossPay = isFullTime ? monthlySalary + ptCommission : classEarnings + ptCommission;

    // Calculate CPF (17% of gross for simplicity, capped at typical limits)
    const cpfContribution = Math.round(grossPay * 0.17 * 100) / 100;

    // Net pay
    const netPay = grossPay - cpfContribution;

    // Determine payment date
    const paymentDate = isFullTime
      ? new Date(selectedYear, selectedMonthNum, 1).toISOString() // 1st of month
      : new Date(selectedYear, selectedMonthNum + 1, 0).toISOString(); // Last day of month

    const { error } = await supabase
      .from('payslips')
      .insert({
        user_id: selectedCoachId,
        month: selectedMonthNum,
        year: selectedYear,
        employment_type: coachProfile.employment_type || 'part_time',
        base_salary: isFullTime ? monthlySalary : 0,
        class_earnings: classEarnings,
        class_hours: classHours,
        class_rate_per_hour: ratePerClass,
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
      setCreateModalVisible(false);
      fetchPayslips();
    }
  };

  const handleBulkGenerate = async () => {
    setGenerating(true);

    try {
      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const coach of coaches) {
        // Check if payslip already exists
        const { data: existing } = await supabase
          .from('payslips')
          .select('id')
          .eq('user_id', coach.id)
          .eq('month', selectedMonthNum)
          .eq('year', selectedYear)
          .single();

        if (existing) {
          skipped++;
          continue;
        }

        // Fetch coach profile
        const { data: coachProfile } = await supabase
          .from('coach_profiles')
          .select('*')
          .eq('user_id', coach.id)
          .single();

        if (!coachProfile) {
          errors.push(`${coach.full_name}: No profile found`);
          continue;
        }

        // Calculate earnings
        const isFullTime = coachProfile.employment_type === 'full_time';
        const monthlySalary = coachProfile.monthly_salary || 0;
        const ratePerClass = coachProfile.rate_per_class || 50;
        const ratePerPT = coachProfile.rate_per_pt || 80;

        const startOfMonth = new Date(selectedYear, selectedMonthNum - 1, 1);
        const endOfMonth = new Date(selectedYear, selectedMonthNum, 0);

        // Get class count and hours
        const { data: classes } = await supabase
          .from('classes')
          .select('id, duration')
          .eq('lead_coach_id', coach.id)
          .gte('scheduled_at', startOfMonth.toISOString())
          .lte('scheduled_at', endOfMonth.toISOString());

        const classCount = classes?.length || 0;
        const classHours = classes?.reduce((sum, c) => sum + ((c.duration || 60) / 60), 0) || 0;
        const classEarnings = isFullTime ? 0 : classHours * ratePerClass;

        // Get PT sessions with dates for weekly breakdown
        const { data: ptSessions } = await supabase
          .from('pt_sessions')
          .select('session_price, status, scheduled_at')
          .eq('coach_id', coach.id)
          .gte('scheduled_at', startOfMonth.toISOString())
          .lte('scheduled_at', endOfMonth.toISOString())
          .in('status', ['attended', 'completed']);

        // Calculate weekly PT breakdown
        const ptWeeklyBreakdown: { week: number; amount: number }[] = [];
        for (let w = 1; w <= 5; w++) {
          const weekStart = new Date(selectedYear, selectedMonthNum - 1, 1 + (w - 1) * 7);
          const weekEnd = new Date(selectedYear, selectedMonthNum - 1, 7 + (w - 1) * 7);

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

        const grossPay = isFullTime ? monthlySalary + ptCommission : classEarnings + ptCommission;
        const cpfContribution = Math.round(grossPay * 0.17 * 100) / 100;
        const netPay = grossPay - cpfContribution;

        const paymentDate = isFullTime
          ? new Date(selectedYear, selectedMonthNum, 1).toISOString()
          : new Date(selectedYear, selectedMonthNum + 1, 0).toISOString();

        const { error } = await supabase
          .from('payslips')
          .insert({
            user_id: coach.id,
            month: selectedMonthNum,
            year: selectedYear,
            employment_type: coachProfile.employment_type || 'part_time',
            base_salary: isFullTime ? monthlySalary : 0,
            class_earnings: classEarnings,
            class_hours: classHours,
            class_rate_per_hour: ratePerClass,
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
          errors.push(`${coach.full_name}: ${error.message}`);
        } else {
          created++;
        }
      }

      let message = `Created ${created} payslip(s)`;
      if (skipped > 0) message += `, ${skipped} skipped (already exist)`;
      if (errors.length > 0) message += `. Errors: ${errors.join(', ')}`;

      Alert.alert(created > 0 ? 'Success' : 'Warning', message);
      setBulkGenerateVisible(false);
      fetchPayslips();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate payslips');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePayslip = (payslip: Payslip) => {
    Alert.alert(
      'Delete Payslip',
      `Are you sure you want to delete the ${getMonthName(payslip.month)} ${payslip.year} payslip?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('payslips').delete().eq('id', payslip.id);
            fetchPayslips();
          },
        },
      ]
    );
  };

  const coachInfo = selectedPayslip
    ? coaches.find(c => c.id === selectedPayslip.user_id) || { full_name: 'Unknown', email: '' }
    : null;

  if (selectedPayslip && coachInfo) {
    return (
      <PayslipViewer
        payslip={selectedPayslip}
        coachName={coachInfo.full_name}
        coachEmail={coachInfo.email}
        onClose={() => {
          setSelectedPayslip(null);
          fetchPayslips();
        }}
        onRefresh={fetchPayslips}
        isAdmin={true}
        isMasterAdmin={user?.role === 'master_admin'}
      />
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Payslips</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.bulkButton}
              onPress={() => setBulkGenerateVisible(true)}
            >
              <Ionicons name="layers-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.bulkButtonText}>Bulk Generate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setCreateModalVisible(true)}
            >
              <Ionicons name="add" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Month Selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={() => setSelectedMonthNum(m => m === 1 ? 12 : m - 1)}
            style={styles.monthArrow}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.lightGray} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {getMonthName(selectedMonthNum)} {selectedYear}
          </Text>
          <TouchableOpacity
            onPress={() => setSelectedMonthNum(m => m === 12 ? 1 : m + 1)}
            style={styles.monthArrow}
          >
            <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
          }
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="time-outline" size={40} color={Colors.darkGray} />
              <Text style={styles.loadingText}>Loading payslips...</Text>
            </View>
          ) : payslips.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={60} color={Colors.darkGray} />
              <Text style={styles.emptyText}>No payslips for this period</Text>
              <Text style={styles.emptySubtext}>Tap + to create a payslip</Text>
            </View>
          ) : (
            payslips.map(payslip => {
              const coach = coaches.find(c => c.id === payslip.user_id);
              return (
                <TouchableOpacity
                  key={payslip.id}
                  style={styles.payslipCard}
                  onPress={() => setSelectedPayslip(payslip)}
                >
                  <View style={styles.payslipLeft}>
                    <LinearGradient
                      colors={[Colors.jaiBlue, Colors.neonPurple]}
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>
                        {coach?.full_name.charAt(0).toUpperCase() || '?'}
                      </Text>
                    </LinearGradient>
                    <View>
                      <Text style={styles.payslipName}>{coach?.full_name || 'Unknown'}</Text>
                      <Text style={styles.payslipType}>
                        {payslip.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.payslipRight}>
                    <Text style={styles.payslipAmount}>{formatCurrency(payslip.net_pay)}</Text>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: payslip.status === 'paid' ? Colors.success + '20' : Colors.warning + '20' }
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { color: payslip.status === 'paid' ? Colors.success : Colors.warning }
                      ]}>
                        {payslip.status === 'paid' ? 'Paid' : 'Pending'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeletePayslip(payslip)}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Create Payslip Modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Payslip</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Coach</Text>
              <View style={styles.pickerContainer}>
                {coaches.map(coach => (
                  <TouchableOpacity
                    key={coach.id}
                    style={[
                      styles.pickerOption,
                      selectedCoachId === coach.id && styles.pickerOptionSelected
                    ]}
                    onPress={() => setSelectedCoachId(coach.id)}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      selectedCoachId === coach.id && styles.pickerOptionTextSelected
                    ]}>
                      {coach.full_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Period</Text>
              <Text style={styles.periodText}>
                {getMonthName(selectedMonthNum)} {selectedYear}
              </Text>

              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreatePayslip}
              >
                <Text style={styles.createButtonText}>Generate Payslip</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bulk Generate Modal */}
      <Modal
        visible={bulkGenerateVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBulkGenerateVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bulk Generate Payslips</Text>
              <TouchableOpacity onPress={() => setBulkGenerateVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.bulkInfoCard}>
                <Ionicons name="information-circle-outline" size={24} color={Colors.jaiBlue} />
                <View style={styles.bulkInfoText}>
                  <Text style={styles.bulkInfoTitle}>Generate for {getMonthName(selectedMonthNum)} {selectedYear}</Text>
                  <Text style={styles.bulkInfoSubtitle}>
                    This will create payslips for all {coaches.length} active coaches
                  </Text>
                </View>
              </View>

              <View style={styles.bulkCoachList}>
                <Text style={styles.bulkCoachListTitle}>Coaches ({coaches.length})</Text>
                {coaches.slice(0, 5).map(coach => (
                  <Text key={coach.id} style={styles.bulkCoachName}>• {coach.full_name}</Text>
                ))}
                {coaches.length > 5 && (
                  <Text style={styles.bulkCoachMore}>...and {coaches.length - 5} more</Text>
                )}
              </View>

              <View style={styles.bulkSummary}>
                <Text style={styles.bulkSummaryLabel}>Payslips to be created:</Text>
                <Text style={styles.bulkSummaryValue}>{coaches.length}</Text>
              </View>

              <TouchableOpacity
                style={[styles.createButton, generating && styles.disabledButton]}
                onPress={handleBulkGenerate}
                disabled={generating}
              >
                <Text style={styles.createButtonText}>
                  {generating ? 'Generating...' : `Generate ${coaches.length} Payslips`}
                </Text>
              </TouchableOpacity>

              <Text style={styles.bulkNote}>
                Existing payslips will be skipped automatically
              </Text>
            </View>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.white,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.jaiBlue + '15',
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '50',
  },
  bulkButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.jaiBlue,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    gap: 16,
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    minWidth: 140,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.darkGray,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.white,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.darkGray,
    marginTop: 4,
  },
  payslipCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  payslipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  payslipName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  payslipType: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 2,
  },
  payslipRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  payslipAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.neonGreen,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  deleteButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
  },
  pickerContainer: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 8,
    marginBottom: 16,
  },
  pickerOption: {
    padding: 12,
    borderRadius: 8,
  },
  pickerOptionSelected: {
    backgroundColor: Colors.jaiBlue + '30',
  },
  pickerOptionText: {
    fontSize: 15,
    color: Colors.lightGray,
  },
  pickerOptionTextSelected: {
    color: Colors.jaiBlue,
    fontWeight: '600',
  },
  periodText: {
    fontSize: 16,
    color: Colors.white,
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: Colors.jaiBlue,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  disabledButton: {
    opacity: 0.6,
  },
  bulkInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  bulkInfoText: {
    flex: 1,
  },
  bulkInfoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  bulkInfoSubtitle: {
    fontSize: 13,
    color: Colors.darkGray,
    marginTop: 2,
  },
  bulkCoachList: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  bulkCoachListTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bulkCoachName: {
    fontSize: 14,
    color: Colors.white,
    paddingVertical: 2,
  },
  bulkCoachMore: {
    fontSize: 13,
    color: Colors.darkGray,
    fontStyle: 'italic',
    marginTop: 4,
  },
  bulkSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  bulkSummaryLabel: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  bulkSummaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.jaiBlue,
  },
  bulkNote: {
    fontSize: 12,
    color: Colors.darkGray,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
