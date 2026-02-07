import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { Colors, Spacing } from '../../../shared/constants/Colors';

// Coach Color Mapping - Each coach gets a unique color for visual distinction
const COACH_COLORS: Record<string, string> = {
  'jeremy@jmt.com': '#00BFFF',
  'isaac@jmt.com': '#FFD700',
  'shafiq@jmt.com': '#9B59B6',
  'sasi@jmt.com': '#2ECC71',
  'heng@jmt.com': '#FF8C00',
  'larvin@jmt.com': '#FF69B4',
};

const getCoachColorByEmail = (email: string): string => {
  if (!email) return Colors.jaiBlue;
  return COACH_COLORS[email.toLowerCase()] || Colors.jaiBlue;
};

interface CoachEarning {
  id: string;
  full_name: string;
  email: string;
  employment_type: string;
  base_salary: number;
  hourly_rate: number;
  pt_commission_rate: number;
  ptCount: number;
  ptRevenue: number;
  ptCommission: number;
  gymRevenue: number;
  totalEarnings: number;
  ytdEarnings: number;
}

interface WeeklyPTSession {
  id: string;
  scheduled_at: string;
  session_type: string;
  session_rate: number;
  commission_amount: number;
  member: { full_name: string } | null;
}

interface WeeklyCoachPayout {
  id: string;
  full_name: string;
  email: string;
  ptCount: number;
  totalPayout: number;
  sessions: WeeklyPTSession[];
}

// Get Monday of the week containing the given date
const getMonday = (d: Date): Date => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getSunday = (monday: Date): Date => {
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
};

const formatShortDate = (d: Date): string => {
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]}`;
};

export const AdminEarningsScreen: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');

  // Weekly state
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [weeklyCoachPayouts, setWeeklyCoachPayouts] = useState<WeeklyCoachPayout[]>([]);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);

  // Monthly state
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [coachEarnings, setCoachEarnings] = useState<CoachEarning[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [ytdPayout, setYtdPayout] = useState(0);
  const [totalPTRevenue, setTotalPTRevenue] = useState(0);
  const [totalGymRevenue, setTotalGymRevenue] = useState(0);

  const formatCurrency = (amount: number) => {
    return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ─── WEEKLY FETCH ───
  const fetchWeeklyData = async () => {
    const sunday = getSunday(weekStart);

    // Convert to SGT-aware UTC boundaries
    const startUTC = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0);
    startUTC.setHours(startUTC.getHours() - 8); // SGT to UTC
    const endUTC = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59);
    endUTC.setHours(endUTC.getHours() - 8);

    // Fetch coaches
    const { data: coaches } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('role', ['coach', 'admin', 'master_admin'])
      .not('full_name', 'is', null)
      .neq('full_name', '')
      .order('full_name');

    if (!coaches) return;

    // Fetch PT sessions for the week
    const { data: ptSessions } = await supabase
      .from('pt_sessions')
      .select(`
        id,
        coach_id,
        scheduled_at,
        session_type,
        session_rate,
        commission_amount,
        coach_verified,
        member:member_id (full_name)
      `)
      .gte('scheduled_at', startUTC.toISOString())
      .lte('scheduled_at', endUTC.toISOString())
      .eq('coach_verified', true);

    const payouts: WeeklyCoachPayout[] = [];
    let total = 0;

    for (const coach of coaches) {
      const coachSessions = (ptSessions || []).filter(pt => pt.coach_id === coach.id);
      if (coachSessions.length === 0) continue;

      const totalPayout = coachSessions.reduce((sum, pt) => sum + (pt.commission_amount || 40), 0);
      total += totalPayout;

      payouts.push({
        id: coach.id,
        full_name: coach.full_name,
        email: coach.email || '',
        ptCount: coachSessions.length,
        totalPayout,
        sessions: coachSessions
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
          .map(pt => ({
            id: pt.id,
            scheduled_at: pt.scheduled_at,
            session_type: pt.session_type || 'solo',
            session_rate: pt.session_rate || 80,
            commission_amount: pt.commission_amount || 40,
            member: pt.member as any,
          })),
      });
    }

    payouts.sort((a, b) => b.totalPayout - a.totalPayout);
    setWeeklyCoachPayouts(payouts);
    setWeeklyTotal(total);
  };

  // ─── MONTHLY FETCH ───
  const fetchMonthlyData = async () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const { data: coaches } = await supabase
      .from('users')
      .select('id, full_name, email, role, employment_type, base_salary, hourly_rate, pt_commission_rate')
      .in('role', ['coach', 'admin', 'master_admin'])
      .not('full_name', 'is', null)
      .neq('full_name', '')
      .order('full_name');

    if (!coaches) return;

    const { data: allPTSessions } = await supabase
      .from('pt_sessions')
      .select('coach_id, session_type, session_rate, commission_amount, status, scheduled_at, coach_verified')
      .gte('scheduled_at', startOfMonth.toISOString())
      .lte('scheduled_at', endOfMonth.toISOString());

    const earnings: CoachEarning[] = [];
    let monthTotal = 0;

    for (const coach of coaches) {
      const coachPTSessions = (allPTSessions || []).filter(
        pt => pt.coach_id === coach.id && pt.coach_verified === true
      );

      const ptCount = coachPTSessions.length;
      const ptRevenue = coachPTSessions.reduce((sum, pt) => sum + (pt.session_rate || 80), 0);
      const ptCommission = coachPTSessions.reduce((sum, pt) => sum + (pt.commission_amount || 40), 0);
      const gymRevenue = ptRevenue - ptCommission;

      let basePay = 0;
      if (coach.employment_type === 'full_time') {
        basePay = coach.base_salary || 0;
      }

      const totalEarnings = basePay + ptCommission;

      earnings.push({
        id: coach.id,
        full_name: coach.full_name,
        email: coach.email || '',
        employment_type: coach.employment_type || 'part_time',
        base_salary: basePay,
        hourly_rate: coach.hourly_rate || 0,
        pt_commission_rate: coach.pt_commission_rate || 0.5,
        ptCount,
        ptRevenue,
        ptCommission,
        gymRevenue,
        totalEarnings,
        ytdEarnings: 0,
      });

      monthTotal += totalEarnings;
    }

    const monthPTRevenue = earnings.reduce((sum, e) => sum + e.ptRevenue, 0);
    const monthGymRevenue = earnings.reduce((sum, e) => sum + e.gymRevenue, 0);

    const currentYear = new Date().getFullYear();
    const selectedYear = selectedMonth.getFullYear();
    const monthsPassed = selectedYear === currentYear ? selectedMonth.getMonth() + 1 : 12;

    let ytdTotal = 0;
    for (const earning of earnings) {
      earning.ytdEarnings = earning.totalEarnings * monthsPassed;
      ytdTotal += earning.ytdEarnings;
    }

    earnings.sort((a, b) => b.totalEarnings - a.totalEarnings);

    setCoachEarnings(earnings);
    setTotalPayout(monthTotal);
    setYtdPayout(ytdTotal);
    setTotalPTRevenue(monthPTRevenue);
    setTotalGymRevenue(monthGymRevenue);
  };

  useEffect(() => {
    if (viewMode === 'weekly') {
      fetchWeeklyData();
    }
  }, [weekStart, viewMode]);

  useEffect(() => {
    if (viewMode === 'monthly') {
      fetchMonthlyData();
    }
  }, [selectedMonth, viewMode]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (viewMode === 'weekly') {
      await fetchWeeklyData();
    } else {
      await fetchMonthlyData();
    }
    setRefreshing(false);
  };

  const changeWeek = (direction: number) => {
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() + direction * 7);
    setWeekStart(newStart);
  };

  const changeMonth = (direction: number) => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(newDate.getMonth() + direction);
    setSelectedMonth(newDate);
  };

  const weekEnd = getSunday(weekStart);
  const weekLabel = `Mon ${formatShortDate(weekStart)} - Sun ${formatShortDate(weekEnd)}`;
  const monthName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const formatSessionDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]} ${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  };

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

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
          }
        >
          {/* View Mode Toggle */}
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, viewMode === 'weekly' && styles.toggleActive]}
              onPress={() => setViewMode('weekly')}
            >
              <Text style={[styles.toggleText, viewMode === 'weekly' && styles.toggleTextActive]}>Weekly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, viewMode === 'monthly' && styles.toggleActive]}
              onPress={() => setViewMode('monthly')}
            >
              <Text style={[styles.toggleText, viewMode === 'monthly' && styles.toggleTextActive]}>Monthly</Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'weekly' ? (
            <>
              {/* Week Selector */}
              <View style={styles.monthSelector}>
                <TouchableOpacity onPress={() => changeWeek(-1)} style={styles.monthArrow}>
                  <Ionicons name="chevron-back" size={20} color={Colors.lightGray} />
                </TouchableOpacity>
                <Text style={styles.weekText}>{weekLabel}</Text>
                <TouchableOpacity onPress={() => changeWeek(1)} style={styles.monthArrow}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
                </TouchableOpacity>
              </View>

              {/* Weekly Total Card */}
              <View style={styles.totalCard}>
                <LinearGradient
                  colors={[Colors.success + '20', Colors.jaiBlue + '10']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.totalCardGradient}
                >
                  <Text style={styles.totalLabel}>WEEKLY PT PAYOUTS</Text>
                  <Text style={styles.totalAmount}>{formatCurrency(weeklyTotal)}</Text>
                  <View style={styles.totalSubRow}>
                    <View style={styles.totalSubItem}>
                      <Text style={styles.totalSubValue}>{weeklyCoachPayouts.length}</Text>
                      <Text style={styles.totalSubLabel}>Coaches</Text>
                    </View>
                    <View style={styles.totalSubDot} />
                    <View style={styles.totalSubItem}>
                      <Text style={styles.totalSubValue}>
                        {weeklyCoachPayouts.reduce((sum, c) => sum + c.ptCount, 0)}
                      </Text>
                      <Text style={styles.totalSubLabel}>Sessions</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* Weekly Coach Cards */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionTitle}>COACH PAYOUTS</Text>
              </View>

              {weeklyCoachPayouts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={40} color={Colors.darkGray} />
                  <Text style={styles.emptyText}>No PT sessions this week</Text>
                </View>
              ) : (
                weeklyCoachPayouts.map(coach => {
                  const coachColor = getCoachColorByEmail(coach.email);
                  const isExpanded = expandedCoach === coach.id;

                  return (
                    <TouchableOpacity
                      key={coach.id}
                      style={[styles.coachCard, { borderLeftWidth: 4, borderLeftColor: coachColor }]}
                      onPress={() => setExpandedCoach(isExpanded ? null : coach.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.coachHeader}>
                        <View style={styles.coachLeft}>
                          <View style={[styles.colorDot, { backgroundColor: coachColor }]} />
                          <View>
                            <Text style={styles.coachName}>{coach.full_name}</Text>
                            <Text style={styles.weeklySessionCount}>{coach.ptCount} PT session{coach.ptCount !== 1 ? 's' : ''}</Text>
                          </View>
                        </View>
                        <View style={styles.coachRight}>
                          <Text style={styles.coachTotal}>{formatCurrency(coach.totalPayout)}</Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={Colors.darkGray}
                          />
                        </View>
                      </View>

                      {isExpanded && (
                        <View style={styles.sessionList}>
                          {coach.sessions.map(session => (
                            <View key={session.id} style={styles.sessionRow}>
                              <View style={styles.sessionInfo}>
                                <Text style={styles.sessionDate}>{formatSessionDate(session.scheduled_at)}</Text>
                                <Text style={styles.sessionClient}>
                                  {(session.member as any)?.full_name || 'Unknown'} · {session.session_type === 'solo_package' || session.session_type === 'solo_single' ? 'Solo' : session.session_type === 'buddy' ? 'Buddy' : session.session_type === 'house_call' ? 'House Call' : session.session_type}
                                </Text>
                              </View>
                              <Text style={styles.sessionAmount}>{formatCurrency(session.commission_amount)}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Weekly Total Footer */}
              {weeklyCoachPayouts.length > 0 && (
                <View style={styles.weeklyTotalFooter}>
                  <Text style={styles.weeklyTotalLabel}>Total PT Payouts This Week</Text>
                  <Text style={styles.weeklyTotalValue}>{formatCurrency(weeklyTotal)}</Text>
                </View>
              )}
            </>
          ) : (
            <>
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

              {/* Total Payout Card */}
              <View style={styles.totalCard}>
                <LinearGradient
                  colors={[Colors.jaiBlue + '20', Colors.neonPurple + '10']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.totalCardGradient}
                >
                  <Text style={styles.totalLabel}>TOTAL PAYOUT</Text>
                  <Text style={styles.totalAmount}>{formatCurrency(totalPayout)}</Text>
                  <View style={styles.ytdRow}>
                    <Ionicons name="trending-up" size={16} color={Colors.neonGreen} />
                    <Text style={styles.ytdLabel}>YTD Payout</Text>
                    <Text style={styles.ytdValue}>{formatCurrency(ytdPayout)}</Text>
                  </View>
                  <View style={styles.totalSubRow}>
                    <View style={styles.totalSubItem}>
                      <Text style={styles.totalSubValue}>{coachEarnings.length}</Text>
                      <Text style={styles.totalSubLabel}>Coaches</Text>
                    </View>
                    <View style={styles.totalSubDot} />
                    <View style={styles.totalSubItem}>
                      <Text style={styles.totalSubValue}>
                        {coachEarnings.reduce((sum, c) => sum + c.ptCount, 0)}
                      </Text>
                      <Text style={styles.totalSubLabel}>PT Sessions</Text>
                    </View>
                    <View style={styles.totalSubDot} />
                    <View style={styles.totalSubItem}>
                      <Text style={styles.totalSubValue}>
                        {formatCurrency(coachEarnings.reduce((sum, c) => sum + c.ptCommission, 0))}
                      </Text>
                      <Text style={styles.totalSubLabel}>PT Commission</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* PT Revenue Breakdown Card */}
              <View style={styles.revenueCard}>
                <View style={styles.revenueHeader}>
                  <Ionicons name="cash-outline" size={20} color={Colors.success} />
                  <Text style={styles.revenueTitle}>PT REVENUE BREAKDOWN</Text>
                </View>
                <View style={styles.revenueBreakdown}>
                  <View style={styles.revenueRow}>
                    <View style={styles.revenueLeft}>
                      <Ionicons name="person-outline" size={16} color={Colors.jaiBlue} />
                      <Text style={styles.revenueLabel}>Client Payments</Text>
                    </View>
                    <Text style={[styles.revenueValue, { color: Colors.jaiBlue }]}>
                      {formatCurrency(totalPTRevenue)}
                    </Text>
                  </View>
                  <View style={styles.revenueDivider} />
                  <View style={styles.revenueRow}>
                    <View style={styles.revenueLeft}>
                      <Ionicons name="arrow-down-outline" size={16} color={Colors.warning} />
                      <Text style={styles.revenueLabel}>Coach Payouts</Text>
                    </View>
                    <Text style={[styles.revenueValue, { color: Colors.warning }]}>
                      -{formatCurrency(totalPTRevenue - totalGymRevenue)}
                    </Text>
                  </View>
                  <View style={styles.revenueDivider} />
                  <View style={styles.revenueRow}>
                    <View style={styles.revenueLeft}>
                      <Ionicons name="business-outline" size={16} color={Colors.success} />
                      <Text style={[styles.revenueLabel, { fontWeight: '700' }]}>Gym Revenue</Text>
                    </View>
                    <Text style={[styles.revenueValue, { color: Colors.success, fontWeight: '700', fontSize: 18 }]}>
                      {formatCurrency(totalGymRevenue)}
                    </Text>
                  </View>
                </View>
                <View style={styles.revenueFooter}>
                  <Text style={styles.revenueFooterText}>
                    {((totalGymRevenue / totalPTRevenue) * 100 || 0).toFixed(0)}% retained by gym
                  </Text>
                </View>
              </View>

              {/* Coach Earnings List */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionTitle}>COACH BREAKDOWN</Text>
              </View>

              {coachEarnings.map((coach) => {
                const coachColor = getCoachColorByEmail(coach.email);
                return (
                  <View
                    key={coach.id}
                    style={[styles.coachCard, { borderLeftWidth: 4, borderLeftColor: coachColor }]}
                  >
                    <View style={styles.coachHeader}>
                      <View style={styles.coachLeft}>
                        <LinearGradient
                          colors={[Colors.jaiBlue, Colors.neonPurple]}
                          style={styles.coachAvatar}
                        >
                          <Text style={styles.coachAvatarText}>
                            {coach.full_name.charAt(0).toUpperCase()}
                          </Text>
                        </LinearGradient>
                        <View>
                          <Text style={styles.coachName}>{coach.full_name}</Text>
                          <View style={styles.coachTypeRow}>
                            <Text style={[
                              styles.coachType,
                              coach.employment_type === 'full_time' ? styles.fullTimeBadge : styles.partTimeBadge
                            ]}>
                              {coach.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
                            </Text>
                            {coach.employment_type === 'full_time' && coach.base_salary > 0 && (
                              <Text style={styles.coachRate}>
                                Base: S${coach.base_salary.toFixed(0)}/mo
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                      <Text style={styles.coachTotal}>{formatCurrency(coach.totalEarnings)}</Text>
                    </View>

                    {coach.employment_type === 'full_time' && (
                      <View style={styles.salaryBreakdown}>
                        <View style={styles.salaryRowItem}>
                          <Text style={styles.salaryLabel}>Base Salary</Text>
                          <Text style={styles.salaryValue}>{formatCurrency(coach.base_salary)}</Text>
                        </View>
                        <View style={styles.salaryRowItem}>
                          <Text style={styles.salaryLabel}>PT Sessions ({coach.ptCount})</Text>
                          <Text style={[styles.salaryValue, { color: Colors.neonGreen }]}>
                            +{formatCurrency(coach.ptCommission)}
                          </Text>
                        </View>
                        {coach.ptCount > 0 && (
                          <View style={styles.ptRevenueDetail}>
                            <Text style={styles.ptRevenueText}>
                              <Text style={styles.ptRevenueLabel}>Client Paid: </Text>
                              <Text style={styles.ptRevenueAmount}>{formatCurrency(coach.ptRevenue)}</Text>
                              <Text style={styles.ptRevenueLabel}> → Coach: </Text>
                              <Text style={styles.ptRevenueAmount}>{formatCurrency(coach.ptCommission)}</Text>
                              <Text style={styles.ptRevenueLabel}> → Gym: </Text>
                              <Text style={[styles.ptRevenueAmount, { color: Colors.success }]}>
                                {formatCurrency(coach.gymRevenue)}
                              </Text>
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {coach.employment_type === 'part_time' && (
                      <>
                        <View style={styles.coachStats}>
                          <View style={styles.coachStatItem}>
                            <Ionicons name="person-outline" size={14} color={Colors.neonPurple} />
                            <Text style={styles.coachStatText}>{coach.ptCount} PT sessions</Text>
                          </View>
                          <View style={styles.coachStatItem}>
                            <Ionicons name="cash-outline" size={14} color={Colors.success} />
                            <Text style={styles.coachStatText}>{formatCurrency(coach.ptCommission)}</Text>
                          </View>
                        </View>
                        {coach.ptCount > 0 && (
                          <View style={styles.ptRevenueDetail}>
                            <Text style={styles.ptRevenueText}>
                              <Text style={styles.ptRevenueLabel}>Client Paid: </Text>
                              <Text style={styles.ptRevenueAmount}>{formatCurrency(coach.ptRevenue)}</Text>
                              <Text style={styles.ptRevenueLabel}> → Coach: </Text>
                              <Text style={styles.ptRevenueAmount}>{formatCurrency(coach.ptCommission)}</Text>
                              <Text style={styles.ptRevenueLabel}> → Gym: </Text>
                              <Text style={[styles.ptRevenueAmount, { color: Colors.success }]}>
                                {formatCurrency(coach.gymRevenue)}
                              </Text>
                            </Text>
                          </View>
                        )}
                      </>
                    )}

                    <View style={styles.coachYtdRow}>
                      <Ionicons name="trending-up" size={14} color={Colors.neonGreen} />
                      <Text style={styles.coachYtdLabel}>YTD Earnings</Text>
                      <Text style={styles.coachYtdValue}>{formatCurrency(coach.ytdEarnings)}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  // Toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 4,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.jaiBlue,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkGray,
  },
  toggleTextActive: {
    color: Colors.white,
  },
  // Selectors
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    gap: 12,
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
  weekText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },
  // Total card
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
  totalSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  totalSubItem: {
    alignItems: 'center',
  },
  totalSubValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  totalSubLabel: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
  },
  totalSubDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.darkGray,
  },
  // Section
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
  // Coach cards
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coachLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  coachRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  coachAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.white,
  },
  coachName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  weeklySessionCount: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 2,
  },
  coachTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  coachType: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fullTimeBadge: {
    backgroundColor: Colors.success + '15',
    color: Colors.success,
  },
  partTimeBadge: {
    backgroundColor: Colors.warning + '15',
    color: Colors.warning,
  },
  coachRate: {
    fontSize: 11,
    color: Colors.darkGray,
  },
  coachTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.success,
  },
  // Weekly session list
  sessionList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDate: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.white,
  },
  sessionClient: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 2,
  },
  sessionAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
    marginLeft: 12,
  },
  // Weekly total footer
  weeklyTotalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  weeklyTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  weeklyTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.success,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.darkGray,
  },
  // Monthly specific
  salaryBreakdown: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  salaryRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  salaryLabel: {
    fontSize: 12,
    color: Colors.lightGray,
  },
  salaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  coachStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  coachStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coachStatText: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  ytdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: Colors.success + '10',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  ytdLabel: {
    fontSize: 13,
    color: Colors.lightGray,
    flex: 1,
  },
  ytdValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.success,
  },
  coachYtdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  coachYtdLabel: {
    fontSize: 12,
    color: Colors.lightGray,
    flex: 1,
  },
  coachYtdValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
  },
  revenueCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  revenueTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 1,
  },
  revenueBreakdown: {
    gap: Spacing.sm,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  revenueLabel: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  revenueValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  revenueDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  revenueFooter: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  revenueFooterText: {
    fontSize: 12,
    color: Colors.darkGray,
    fontStyle: 'italic',
  },
  ptRevenueDetail: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    backgroundColor: Colors.black + '40',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
  },
  ptRevenueText: {
    fontSize: 12,
    lineHeight: 18,
  },
  ptRevenueLabel: {
    color: Colors.darkGray,
  },
  ptRevenueAmount: {
    color: Colors.white,
    fontWeight: '600',
  },
});
