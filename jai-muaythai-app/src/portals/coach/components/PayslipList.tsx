import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { Payslip } from '../../../types';
import { PayslipViewer } from './PayslipViewer';

interface PayslipListProps {
  isAdmin?: boolean;
  targetUserId?: string;
}

export const PayslipList: React.FC<PayslipListProps> = ({
  isAdmin = false,
  targetUserId,
}) => {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [coachInfo, setCoachInfo] = useState<{ full_name: string; email: string } | null>(null);

  const currentUserId = targetUserId || user?.id;

  const fetchPayslips = async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await supabase
        .from('payslips')
        .select('*')
        .eq('user_id', currentUserId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (error) throw error;
      setPayslips(data || []);
    } catch (err) {
      console.error('[PayslipList] Error fetching payslips:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCoachInfo = async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', currentUserId)
        .single();

      if (!error && data) {
        setCoachInfo({ full_name: data.full_name || 'Unknown', email: data.email || '' });
      }
    } catch (err) {
      console.error('Error fetching coach info:', err);
    }
  };

  useEffect(() => {
    if (currentUserId) {
      fetchPayslips();
      fetchCoachInfo();
    } else {
      setLoading(false);
    }
  }, [currentUserId]);

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

  // Get sorted list of years that have payslip data
  const availableYears = [...new Set(payslips.map(p => p.year))].sort((a, b) => a - b);
  const currentYear = new Date().getFullYear();
  const isFirstYear = availableYears.length === 0 || selectedYear <= availableYears[0];
  const isLastYear = selectedYear >= currentYear;

  // Filter payslips for selected year
  const yearPayslips = payslips.filter(p => p.year === selectedYear);
  const ytdBaseSalary = yearPayslips.reduce((sum, p) => sum + (p.base_salary || 0), 0);
  const ytdPtCommission = yearPayslips.reduce((sum, p) => sum + (p.pt_commission || 0), 0);
  const ytdBonus = yearPayslips.reduce((sum, p) => sum + (p.bonus || 0), 0);
  const ytdTotal = yearPayslips.reduce((sum, p) => sum + (p.net_pay || 0), 0);

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
        isAdmin={isAdmin}
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Payslips</Text>
          <Text style={styles.subtitle}>
            {payslips.length} record{payslips.length !== 1 ? 's' : ''}
          </Text>
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
              <Text style={styles.emptyText}>No payslips yet</Text>
              <Text style={styles.emptySubtext}>
                Payslips will appear here once generated
              </Text>
            </View>
          ) : (
            <>
              {/* Year Selector */}
              <View style={styles.yearSelector}>
                <TouchableOpacity
                  onPress={() => {
                    const prevYears = availableYears.filter(y => y < selectedYear);
                    if (prevYears.length > 0) {
                      setSelectedYear(prevYears[prevYears.length - 1]);
                      setExpandedMonth(null);
                    }
                  }}
                  style={[styles.yearArrow, isFirstYear && styles.yearArrowDisabled]}
                  disabled={isFirstYear}
                >
                  <Ionicons name="chevron-back" size={20} color={isFirstYear ? Colors.darkGray : Colors.lightGray} />
                </TouchableOpacity>
                <Text style={styles.yearSelectorText}>{selectedYear}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const nextYears = availableYears.filter(y => y > selectedYear && y <= currentYear);
                    if (nextYears.length > 0) {
                      setSelectedYear(nextYears[0]);
                      setExpandedMonth(null);
                    }
                  }}
                  style={[styles.yearArrow, isLastYear && styles.yearArrowDisabled]}
                  disabled={isLastYear}
                >
                  <Ionicons name="chevron-forward" size={20} color={isLastYear ? Colors.darkGray : Colors.lightGray} />
                </TouchableOpacity>
              </View>

              {/* YTD Earnings Card */}
              <View style={styles.ytdCard}>
                <View style={styles.ytdHeaderRow}>
                  <Ionicons name="trending-up" size={18} color={Colors.neonGreen} />
                  <Text style={styles.ytdTitle}>YTD Earnings</Text>
                </View>
                <View style={styles.ytdDivider} />
                {yearPayslips.length === 0 ? (
                  <Text style={styles.ytdEmptyText}>No payslips for {selectedYear}</Text>
                ) : (
                  <>
                    <View style={styles.ytdRow}>
                      <Text style={styles.ytdLabel}>Base Salary</Text>
                      <Text style={styles.ytdValue}>{formatCurrency(ytdBaseSalary)}</Text>
                    </View>
                    <View style={styles.ytdRow}>
                      <Text style={styles.ytdLabel}>PT Commission</Text>
                      <Text style={styles.ytdValue}>{formatCurrency(ytdPtCommission)}</Text>
                    </View>
                    {ytdBonus > 0 && (
                      <View style={styles.ytdRow}>
                        <Text style={styles.ytdLabel}>Bonus</Text>
                        <Text style={styles.ytdValue}>{formatCurrency(ytdBonus)}</Text>
                      </View>
                    )}
                    <View style={styles.ytdDivider} />
                    <View style={styles.ytdRow}>
                      <Text style={styles.ytdTotalLabel}>Total YTD</Text>
                      <Text style={styles.ytdTotalValue}>{formatCurrency(ytdTotal)}</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Payslips Section Header */}
              {yearPayslips.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionLine} />
                    <Text style={styles.sectionLabel}>Payslips</Text>
                    <View style={styles.sectionLine} />
                  </View>

                  {/* Payslip cards for selected year */}
                  {yearPayslips
                    .sort((a, b) => b.month - a.month)
                    .map(payslip => {
                      const isExpanded = expandedMonth === `${selectedYear}-${payslip.month}`;

                      return (
                        <View key={payslip.id} style={styles.monthCard}>
                          <TouchableOpacity
                            style={styles.monthHeader}
                            onPress={() => setExpandedMonth(isExpanded ? null : `${selectedYear}-${payslip.month}`)}
                          >
                            <View style={styles.monthInfo}>
                              <Text style={styles.monthName}>{getMonthName(payslip.month)}</Text>
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
                            </View>

                            <View style={styles.monthAmounts}>
                              <Text style={styles.netPayText}>{formatCurrency(payslip.net_pay)}</Text>
                              <Ionicons
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                color={Colors.lightGray}
                              />
                            </View>
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.monthDetails}>
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Base Salary</Text>
                                <Text style={styles.detailValue}>{formatCurrency(payslip.base_salary)}</Text>
                              </View>
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>PT Commission</Text>
                                <Text style={styles.detailValue}>{formatCurrency(payslip.pt_commission)}</Text>
                              </View>
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Gross Pay</Text>
                                <Text style={styles.detailValue}>{formatCurrency(payslip.gross_pay)}</Text>
                              </View>
                              {payslip.total_deductions > 0 && (
                                <View style={styles.detailRow}>
                                  <Text style={styles.detailLabel}>Deductions</Text>
                                  <Text style={[styles.detailValue, { color: Colors.error }]}>
                                    -{formatCurrency(payslip.total_deductions)}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.detailDivider} />
                              <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { fontWeight: '700' }]}>Net Pay</Text>
                                <Text style={[styles.detailValue, { fontWeight: '700', color: Colors.jaiBlue, fontSize: 16 }]}>
                                  {formatCurrency(payslip.net_pay)}
                                </Text>
                              </View>

                              <TouchableOpacity
                                style={styles.viewDetailsButton}
                                onPress={() => setSelectedPayslip(payslip)}
                              >
                                <Text style={styles.viewDetailsText}>View Full Payslip</Text>
                                <Ionicons name="arrow-forward" size={16} color={Colors.jaiBlue} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                </>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
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
  subtitle: {
    fontSize: 13,
    color: Colors.darkGray,
    marginTop: 2,
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
  // Year selector
  yearSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    gap: 20,
  },
  yearArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearArrowDisabled: {
    opacity: 0.3,
  },
  yearSelectorText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
    minWidth: 80,
    textAlign: 'center',
  },
  // YTD card
  ytdCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.neonGreen + '40',
  },
  ytdHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ytdTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  ytdDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  ytdEmptyText: {
    fontSize: 13,
    color: Colors.darkGray,
    textAlign: 'center',
    paddingVertical: 8,
  },
  ytdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  ytdLabel: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  ytdValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  ytdTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.neonGreen,
  },
  ytdTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.neonGreen,
  },
  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.sm,
    gap: 12,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.darkGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Payslip cards
  monthCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  monthInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monthName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
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
  monthAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  netPayText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.jaiBlue,
  },
  monthDetails: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.jaiBlue + '20',
    borderRadius: 10,
    gap: 6,
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.jaiBlue,
  },
});
