import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { PinGate } from '../../../shared/components/PinGate';
import { PayslipList } from '../components/PayslipList';
import { Payslip } from '../../../types';

interface EarningItem {
  id: string;
  type: 'class' | 'pt';
  name: string;
  date: string;
  amount: number;
}

type TabType = 'earnings' | 'payslips';

export const CoachEarningsScreen: React.FC = () => {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [profile, setProfile] = useState<any>(null);
  const [currentPayslip, setCurrentPayslip] = useState<Payslip | null>(null);
  const [realTimeEarnings, setRealTimeEarnings] = useState({
    baseSalary: 0,
    ptCommission: 0,
    grossPay: 0,
    netPay: 0,
  });
  const [classCount, setClassCount] = useState(0);
  const [ptCount, setPtCount] = useState(0);
  const [ptCommission, setPtCommission] = useState(0);
  const [pinVerified, setPinVerified] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pinError, setPinError] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('earnings');

  // YTD, MTD, and Weekly earnings
  const [ytdEarnings, setYtdEarnings] = useState(0);
  const [mtdEarnings, setMtdEarnings] = useState(0);
  const [weeklyEarnings, setWeeklyEarnings] = useState(0);
  const [isCalculating, setIsCalculating] = useState(true);

  const formatCurrency = (amount: number) => {
    return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Calculate YTD earnings from payslips table
  const calculateYTD = async (coachId: string, currentYear: number) => {
    try {
      const { data: ytdPayslips } = await supabase
        .from('payslips')
        .select('net_pay')
        .eq('user_id', coachId)
        .eq('year', currentYear);

      if (ytdPayslips && ytdPayslips.length > 0) {
        const total = ytdPayslips.reduce((sum, p) => sum + (p.net_pay || 0), 0);
        setYtdEarnings(Math.round(total * 100) / 100);
      } else {
        // Fallback: sum from approved PT sessions + base salary
        const { data: coachProfile } = await supabase
          .from('coach_profiles')
          .select('monthly_salary, employment_type')
          .eq('user_id', coachId)
          .single();

        const isFullTime = coachProfile?.employment_type === 'full_time';
        const baseSalary = isFullTime ? (coachProfile?.monthly_salary || 0) : 0;

        // Get approved PT sessions for current year
        const { data: approvedSessions } = await supabase
          .from('pt_sessions')
          .select('payment_amount, commission_amount, session_price, approved_at')
          .eq('coach_id', coachId)
          .eq('payment_approved', true)
          .gte('approved_at', `${currentYear}-01-01T00:00:00Z`);

        const ptTotal = approvedSessions?.reduce((sum, s) => {
          return sum + (s.payment_amount ?? s.commission_amount ?? (s.session_price || 90) * 0.5);
        }, 0) || 0;

        const total = isFullTime ? (baseSalary * currentYear) + ptTotal : ptTotal;
        setYtdEarnings(Math.round(total * 100) / 100);
      }
    } catch (err) {
      console.error('Error calculating YTD:', err);
      setYtdEarnings(0);
    }
  };

  // Calculate MTD earnings - use payslip if exists, otherwise real-time
  const calculateMTD = async (coachId: string, coachProfile: any, currentYear: number, currentMonth: number) => {
    try {
      // Check if payslip exists for current month
      const { data: payslip } = await supabase
        .from('payslips')
        .select('net_pay')
        .eq('user_id', coachId)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .single();

      if (payslip && payslip.net_pay) {
        setMtdEarnings(payslip.net_pay);
      } else {
        // Calculate from approved sessions only (verified by both coach and member)
        const isFullTime = coachProfile?.employment_type === 'full_time';
        const baseSalary = isFullTime ? (coachProfile?.monthly_salary || 0) : 0;

        const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
        const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59);

        // Only count payment_approved sessions
        const { data: ptSessions } = await supabase
          .from('pt_sessions')
          .select('payment_amount, commission_amount, session_price')
          .eq('coach_id', coachId)
          .eq('payment_approved', true)
          .gte('approved_at', startOfMonth.toISOString())
          .lte('approved_at', endOfMonth.toISOString());

        const monthlyPtCommission = ptSessions?.reduce((sum, s) => {
          return sum + (s.payment_amount ?? s.commission_amount ?? (s.session_price || 90) * 0.5);
        }, 0) || 0;

        const grossPay = isFullTime ? baseSalary + monthlyPtCommission : monthlyPtCommission;
        setMtdEarnings(Math.round(grossPay * 100) / 100);
      }
    } catch (err) {
      console.error('Error calculating MTD:', err);
      setMtdEarnings(0);
    }
  };

  // Calculate weekly earnings from PT sessions (real-time)
  const calculateWeekly = async (coachId: string) => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - dayOfWeek);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      endOfWeek.setHours(0, 0, 0, 0);

      // Only count payment_approved sessions within the week
      const { data: weekPTSessions } = await supabase
        .from('pt_sessions')
        .select('payment_amount, commission_amount, session_price, approved_at')
        .eq('coach_id', coachId)
        .eq('payment_approved', true)
        .gte('approved_at', startOfWeek.toISOString())
        .lt('approved_at', endOfWeek.toISOString());

      const weeklyPTCommission = weekPTSessions?.reduce((sum, s) => {
        return sum + (s.payment_amount ?? s.commission_amount ?? (s.session_price || 90) * 0.5);
      }, 0) || 0;

      setWeeklyEarnings(Math.round(weeklyPTCommission * 100) / 100);
    } catch (err) {
      console.error('Error calculating weekly earnings:', err);
      setWeeklyEarnings(0);
    }
  };

  const fetchData = async () => {
    if (!user?.id) return;

    setIsCalculating(true);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const { data: coachProfile } = await supabase
      .from('coach_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (coachProfile) setProfile(coachProfile);

    // Calculate YTD, MTD, and Weekly earnings
    await Promise.all([
      calculateYTD(user.id, currentYear),
      calculateMTD(user.id, coachProfile, currentYear, currentMonth),
      calculateWeekly(user.id),
    ]);

    // Calculate month boundaries for selected month
    const selectedYear = selectedMonth.getFullYear();
    const selectedMonthNum = selectedMonth.getMonth() + 1;
    const startOfMonth = new Date(selectedYear, selectedMonthNum - 1, 1);
    const endOfMonth = new Date(selectedYear, selectedMonthNum, 0, 23, 59, 59);

    // 1. Check if payslip exists for selected month
    const { data: payslip } = await supabase
      .from('payslips')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', selectedMonthNum)
      .eq('year', selectedYear)
      .single();

    if (payslip) {
      setCurrentPayslip(payslip);
      setRealTimeEarnings({
        baseSalary: payslip.base_salary || 0,
        ptCommission: payslip.pt_commission || 0,
        grossPay: payslip.gross_pay || 0,
        netPay: payslip.net_pay || 0,
      });
    } else {
      setCurrentPayslip(null);
      // Calculate real-time earnings from database
      const isFullTime = coachProfile?.employment_type === 'full_time';
      const baseSalary = isFullTime ? (coachProfile?.monthly_salary || 0) : 0;

      // Get PT sessions for the selected month (attended/completed)
      const { data: ptSessions } = await supabase
        .from('pt_sessions')
        .select('session_price, commission_amount')
        .eq('coach_id', user.id)
        .eq('status', 'attended')
        .gte('scheduled_at', startOfMonth.toISOString())
        .lte('scheduled_at', endOfMonth.toISOString());

      const monthlyPtCommission = ptSessions?.reduce((sum, s) => {
        return sum + (s.commission_amount ?? (s.session_price || 90) * 0.5);
      }, 0) || 0;

      const grossPay = isFullTime ? baseSalary + monthlyPtCommission : monthlyPtCommission;
      const netPay = grossPay; // No deductions calculated for pending

      setRealTimeEarnings({
        baseSalary,
        ptCommission: monthlyPtCommission,
        grossPay,
        netPay,
      });
    }

    // Count weekly classes for this coach
    const { data: classes } = await supabase
      .from('classes')
      .select('id, name, scheduled_at')
      .eq('lead_coach_id', user.id)
      .eq('is_active', true)
      .gte('scheduled_at', new Date().toISOString());

    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    endOfWeek.setHours(0, 0, 0, 0);

    const weeklyClasses = classes?.filter(c => {
      const classDate = new Date(c.scheduled_at);
      return classDate >= startOfWeek && classDate < endOfWeek;
    }) || [];

    setClassCount(weeklyClasses.length);

    // Get PT sessions for the week
    const { data: weekPTSessions } = await supabase
      .from('pt_sessions')
      .select('session_price, commission_amount, status, scheduled_at')
      .eq('coach_id', user.id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString());

    const weeklyPTSessions = weekPTSessions?.filter(s => {
      const ptDate = new Date(s.scheduled_at);
      return ptDate >= startOfWeek && ptDate < endOfWeek;
    }) || [];

    // Calculate total PT commission based on session type
    const totalCommission = weeklyPTSessions?.reduce((sum, session) => {
      return sum + (session.commission_amount ?? (session.session_price || 90) * 0.5);
    }, 0) || 0;

    setPtCommission(totalCommission);
    setPtCount(weeklyPTSessions?.length || 0);
    setIsCalculating(false);
  };

  const checkPin = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('coach_profiles')
      .select('earnings_pin')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setHasPin(!!data.earnings_pin);
    } else {
      setHasPin(false);
    }
  };

  const handleSetPin = async (pin: string) => {
    const { error } = await supabase
      .from('coach_profiles')
      .update({ earnings_pin: pin })
      .eq('user_id', user?.id);

    if (error) {
      Alert.alert('Error', 'Failed to set PIN');
    } else {
      setHasPin(true);
      setPinVerified(true);
    }
  };

  const handleEnterPin = async (enteredPin: string) => {
    const { data } = await supabase
      .from('coach_profiles')
      .select('earnings_pin')
      .eq('user_id', user?.id)
      .single();

    if (data && data.earnings_pin === enteredPin) {
      setPinVerified(true);
    } else {
      Alert.alert('Wrong PIN', 'The PIN you entered is incorrect. Please try again.');
    }
  };

  useEffect(() => {
    fetchData();
    checkPin();
  }, [user?.id]);

  // Refetch when selected month changes
  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [selectedMonth, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Calculate earnings based on employment type
  const isFullTime = profile?.employment_type === 'full_time';
  const monthlySalary = profile?.monthly_salary || 0;
  const ratePerClass = profile?.rate_per_class || 50;
  const ratePerPT = profile?.rate_per_pt || 80;
  const weeksInMonth = 4;

  // Use payslip data if available, otherwise use real-time calculations
  const baseSalary = realTimeEarnings.baseSalary;
  const monthlyPTEarnings = realTimeEarnings.ptCommission;
  const totalEarnings = realTimeEarnings.grossPay;
  const netPay = realTimeEarnings.netPay;

  const changeMonth = (direction: number) => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + direction);
    setSelectedMonth(newDate);
  };

  // Loading state
  if (hasPin === null) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  // PIN not set yet - show set PIN screen
  if (!hasPin) {
    return <PinGate mode="set" onSuccess={handleSetPin} />;
  }

  // PIN set but not verified - show enter PIN screen
  if (!pinVerified) {
    return <PinGate mode="enter" onSuccess={handleEnterPin} />;
  }

  const monthName = selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Earnings</Text>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'earnings' && styles.activeTab]}
            onPress={() => setActiveTab('earnings')}
          >
            <Ionicons
              name="wallet-outline"
              size={18}
              color={activeTab === 'earnings' ? Colors.jaiBlue : Colors.darkGray}
            />
            <Text style={[styles.tabText, activeTab === 'earnings' && styles.activeTabText]}>
              Summary
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'payslips' && styles.activeTab]}
            onPress={() => {
              console.log('[EarningsScreen] Switching to payslips tab');
              setActiveTab('payslips');
            }}
          >
            <Ionicons
              name="document-text-outline"
              size={18}
              color={activeTab === 'payslips' ? Colors.jaiBlue : Colors.darkGray}
            />
            <Text style={[styles.tabText, activeTab === 'payslips' && styles.activeTabText]}>
              Payslips
            </Text>
          </TouchableOpacity>
        </View>

        {/* Earnings Summary - YTD, MTD, Weekly */}
        {activeTab === 'earnings' && (
          <View style={styles.earningsSummaryCard}>
            <View style={styles.earningsSummaryHeader}>
              <Ionicons name="stats-chart-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.earningsSummaryTitle}>Earnings Summary</Text>
            </View>
            <View style={styles.earningsSummaryDivider} />
            <View style={styles.earningsSummaryRow}>
              <View style={styles.earningsSummaryItem}>
                <Text style={styles.earningsSummaryLabel}>YTD ({new Date().getFullYear()})</Text>
                <Text style={styles.earningsSummaryValue}>{isCalculating ? '...' : formatCurrency(ytdEarnings)}</Text>
              </View>
              <View style={styles.earningsSummaryItem}>
                <Text style={styles.earningsSummaryLabel}>MTD ({new Date().toLocaleString('default', { month: 'short' })})</Text>
                <Text style={[styles.earningsSummaryValue, { color: Colors.jaiBlue }]}>
                  {isCalculating ? '...' : formatCurrency(mtdEarnings)}
                </Text>
              </View>
              <View style={styles.earningsSummaryItem}>
                <Text style={styles.earningsSummaryLabel}>This Week</Text>
                <Text style={[styles.earningsSummaryValue, { color: Colors.neonGreen }]}>
                  {isCalculating ? '...' : formatCurrency(weeklyEarnings)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'earnings' ? (
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
            }
          >
            {/* Month Selector */}
            <View style={styles.monthSelector}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
                <Ionicons name="chevron-back" size={20} color={Colors.lightGray} />
              </TouchableOpacity>
              <Text style={styles.monthText}>{monthName}</Text>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
                <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

          {/* Total Earnings Card */}
          <View style={styles.totalCard}>
            <LinearGradient
              colors={[Colors.jaiBlue + '20', Colors.neonPurple + '10']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.totalCardGradient}
            >
              {/* Status Badge */}
              <View style={[styles.statusBadge, {
                backgroundColor: currentPayslip
                  ? (currentPayslip.status === 'paid' ? Colors.success + '20' : Colors.warning + '20')
                  : Colors.warning + '20'
              }]}>
                <Text style={[styles.statusText, {
                  color: currentPayslip
                    ? (currentPayslip.status === 'paid' ? Colors.success : Colors.warning)
                    : Colors.warning
                }]}>
                  {currentPayslip
                    ? (currentPayslip.status === 'paid' ? 'PAID' : 'PENDING')
                    : 'PENDING'}
                </Text>
              </View>

              <Text style={styles.totalLabel}>MONTHLY EARNINGS</Text>
              <Text style={styles.totalAmount}>{formatCurrency(totalEarnings)}</Text>

              {/* Earnings Breakdown */}
              <View style={styles.totalDivider} />

              {/* Base Salary row - only show if > 0 */}
              {baseSalary > 0 && (
                <View style={styles.breakdownRowVertical}>
                  <View style={[styles.breakdownRowItem, { width: '100%' }]}>
                    <Text style={styles.breakdownLabelSmall}>Base Salary</Text>
                    <Text style={styles.breakdownValueSmall}>{formatCurrency(baseSalary)}</Text>
                  </View>
                </View>
              )}

              {/* PT Commission row */}
              {monthlyPTEarnings > 0 && (
                <View style={styles.breakdownRowVertical}>
                  <View style={[styles.breakdownRowItem, { width: '100%' }]}>
                    <Text style={styles.breakdownLabelSmall}>PT Commission</Text>
                    <Text style={[styles.breakdownValueSmall, { color: Colors.neonGreen }]}>
                      +{formatCurrency(monthlyPTEarnings)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Gross Pay */}
              <View style={styles.totalDivider} />
              <View style={styles.breakdownRowVertical}>
                <View style={[styles.breakdownRowItem, { width: '100%' }]}>
                  <Text style={[styles.breakdownLabelSmall, { fontWeight: '700' }]}>Gross Pay</Text>
                  <Text style={[styles.breakdownValueSmall, { fontWeight: '700' }]}>
                    {formatCurrency(totalEarnings)}
                  </Text>
                </View>
              </View>

              {/* Net Pay */}
              <View style={styles.breakdownRowVertical}>
                <View style={[styles.breakdownRowItem, { width: '100%' }]}>
                  <Text style={[styles.breakdownLabelSmall, { fontWeight: '700', color: Colors.jaiBlue }]}>Net Pay</Text>
                  <Text style={[styles.breakdownValueSmall, { fontWeight: '700', color: Colors.jaiBlue }]}>
                    {formatCurrency(netPay)}
                  </Text>
                </View>
              </View>

              <View style={styles.totalDivider} />
              <View style={styles.ytdRow}>
                <Ionicons name="trending-up" size={16} color={Colors.neonGreen} />
                <Text style={styles.ytdLabel}>YTD Earnings</Text>
                <Text style={styles.ytdValue}>{isCalculating ? '...' : formatCurrency(ytdEarnings)}</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Earnings Breakdown */}
          <View style={styles.breakdownCard}>
            <View style={styles.breakdownHeader}>
              <Ionicons name="pie-chart-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.breakdownTitle}>Earnings Breakdown</Text>
            </View>

            <View style={styles.breakdownRow}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownValue}>{formatCurrency(baseSalary)}</Text>
                <Text style={styles.breakdownLabel}>Base Salary</Text>
              </View>
              <View style={styles.breakdownItem}>
                <Text style={[styles.breakdownValue, { color: Colors.neonGreen }]}>
                  +{formatCurrency(monthlyPTEarnings)}
                </Text>
                <Text style={styles.breakdownLabel}>PT Commission</Text>
              </View>
            </View>
          </View>

          {/* Weekly Summary */}
          <View style={styles.weeklyCard}>
            <View style={styles.weeklyHeader}>
              <Ionicons name="calendar-outline" size={18} color={Colors.neonPurple} />
              <Text style={styles.weeklyHeaderText}>This Week's Summary</Text>
            </View>

            <View style={styles.weeklyRow}>
              <View style={styles.weeklyInfo}>
                <Ionicons name="fitness-outline" size={16} color={Colors.jaiBlue} />
                <Text style={styles.weeklyLabel}>Classes this week</Text>
              </View>
              <Text style={styles.weeklyValue}>{classCount}</Text>
            </View>
            <View style={styles.weeklyDivider} />
            <View style={styles.weeklyRow}>
              <View style={styles.weeklyInfo}>
                <Ionicons name="person-outline" size={16} color={Colors.neonPurple} />
                <Text style={styles.weeklyLabel}>PT sessions per week</Text>
              </View>
              <Text style={styles.weeklyValue}>{ptCount}</Text>
            </View>
            <View style={styles.weeklyDivider} />
            <View style={styles.weeklyRow}>
              <View style={styles.weeklyInfo}>
                <Ionicons name="cash-outline" size={16} color={Colors.neonGreen} />
                <Text style={styles.weeklyLabel}>Weekly earnings</Text>
              </View>
              <Text style={[styles.weeklyValue, { color: Colors.neonGreen }]}>
                {formatCurrency((classCount * ratePerClass) + (ptCount * ratePerPT))}
              </Text>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        <PayslipList />
      )}
    </SafeAreaView>
  </View>
);
}

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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeTab: {
    backgroundColor: Colors.jaiBlue + '15',
    borderColor: Colors.jaiBlue + '50',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkGray,
  },
  activeTabText: {
    color: Colors.jaiBlue,
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
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    minWidth: 160,
    textAlign: 'center',
  },
  totalCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totalCardGradient: {
    padding: 20,
    alignItems: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.lightGray,
    letterSpacing: 1,
  },
  totalAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: Colors.white,
    marginTop: 4,
  },
  totalDivider: {
    width: '80%',
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  totalBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  breakdownItem: {
    alignItems: 'center',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  breakdownLabel: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
  },
  breakdownDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.jaiBlue,
  },
  breakdownRowVertical: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
  },
  breakdownRowItem: {
    alignItems: 'center',
  },
  ytdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  ytdLabel: {
    fontSize: 12,
    color: Colors.lightGray,
  },
  ytdValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.neonGreen,
  },
  breakdownCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weeklyCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  weeklyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  weeklyHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  weeklyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weeklyLabel: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  weeklyValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  weeklyDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  breakdownLabelSmall: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  breakdownValueSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  // Salary card styles
  salaryBreakdownCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  salaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  salaryDivider: {
    width: 1,
    height: 50,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  salaryItemLabel: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 6,
    marginBottom: 4,
  },
  salaryItemValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  salaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  salaryTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  salaryTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.neonGreen,
  },
  // Earnings Summary styles
  earningsSummaryCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '40',
  },
  earningsSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  earningsSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  earningsSummaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  earningsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  earningsSummaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  earningsSummaryLabel: {
    fontSize: 11,
    color: Colors.darkGray,
    marginBottom: 4,
  },
  earningsSummaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
});

export default CoachEarningsScreen;
