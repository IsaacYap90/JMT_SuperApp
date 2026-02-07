import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { PTSession, PTPaymentApproval } from '../../../types';

// Helper functions
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency = (amount: number) => {
  return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Jeremy's user ID for bulk approval
const JEREMY_USER_ID = 'your-jeremy-user-id-here'; // Replace with actual UUID

export const AdminPTPaymentsScreen: React.FC = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<PTPaymentApproval[]>([]);
  const [selectedSession, setSelectedSession] = useState<PTPaymentApproval | null>(null);
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [approving, setApproving] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  const isMasterAdmin = profile?.role === 'master_admin';

  const fetchSessions = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Fetch sessions that need payment approval
      const { data, error } = await supabase
        .from('pt_sessions')
        .select(`
          id,
          scheduled_at,
          session_price,
          session_type,
          commission_amount,
          coach_verified,
          member_verified,
          payment_approved,
          payment_amount,
          package_id,
          coach_id,
          member_id,
          cancelled_at,
          cancellation_reason,
          coach:coach_id(full_name, email),
          member:member_id(full_name, email)
        `)
        .eq('coach_verified', true)
        .eq('member_verified', true)
        .eq('payment_approved', false)
        .is('cancelled_at', null)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      // Get package info for each session
      const sessionsWithPackages: PTPaymentApproval[] = await Promise.all(
        (data || []).map(async (session: any) => {
          let packageSessionsRemaining = 0;
          if (session.package_id) {
            const { data: pkg } = await supabase
              .from('pt_packages')
              .select('sessions_used, total_sessions')
              .eq('id', session.package_id)
              .single();
            if (pkg) {
              packageSessionsRemaining = pkg.total_sessions - pkg.sessions_used;
            }
          }

          return {
            sessionId: session.id,
            sessionDate: session.scheduled_at,
            coachId: session.coach_id,
            coachName: session.coach?.full_name || 'Unknown',
            memberId: session.member_id,
            memberName: session.member?.full_name || 'Unknown',
            sessionPrice: session.session_price || 90,
            coachCommission: session.payment_amount ?? session.commission_amount ?? (session.session_price || 90) * 0.5,
            packageId: session.package_id,
            packageSessionsRemaining,
          };
        })
      );

      setSessions(sessionsWithPackages);
    } catch (error) {
      console.error('Error fetching PT sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Handle single session approval
  const handleApproveSession = (session: PTPaymentApproval) => {
    setSelectedSession(session);
    setPaymentAmount(session.coachCommission.toFixed(2));
    setApprovalModalVisible(true);
  };

  const confirmApproval = async () => {
    if (!selectedSession) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount');
      return;
    }

    try {
      setApproving(true);

      // Update session payment status
      const { error: updateError } = await supabase
        .from('pt_sessions')
        .update({
          payment_approved: true,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          payment_amount: amount,
        })
        .eq('id', selectedSession.sessionId);

      if (updateError) throw updateError;

      // If there's a package, update sessions_used
      if (selectedSession.packageId) {
        const { error: packageError } = await supabase
          .from('pt_packages')
          .update({
            sessions_used: selectedSession.packageSessionsRemaining > 0
              ? selectedSession.packageSessionsRemaining
              : 0, // This is simplified
          })
          .eq('id', selectedSession.packageId);

        if (packageError) {
          console.error('Error updating package:', packageError);
        }
      }

      // Check if this was the last session in package
      if (selectedSession.packageId && selectedSession.packageSessionsRemaining <= 1) {
        await supabase
          .from('pt_packages')
          .update({ status: 'completed' })
          .eq('id', selectedSession.packageId);
      }

      Alert.alert('Success', 'Payment approved successfully');
      setApprovalModalVisible(false);
      fetchSessions();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to approve payment');
    } finally {
      setApproving(false);
    }
  };

  // Handle bulk approval for Sunday payments
  const handleBulkApprove = async () => {
    if (sessions.length === 0) {
      Alert.alert('No Sessions', 'There are no sessions to approve');
      return;
    }

    const totalAmount = sessions.reduce((sum, s) => sum + s.coachCommission, 0);

    Alert.alert(
      'Bulk Approve All',
      `Approve all ${sessions.length} sessions for a total of ${formatCurrency(totalAmount)}? This is typically done for Sunday payments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          style: 'default',
          onPress: async () => {
            try {
              setBulkApproving(true);

              const sessionIds = sessions.map(s => s.sessionId);

              // Bulk update
              const { error: updateError } = await supabase
                .from('pt_sessions')
                .update({
                  payment_approved: true,
                  approved_by: user?.id,
                  approved_at: new Date().toISOString(),
                })
                .in('id', sessionIds);

              if (updateError) throw updateError;

              // Update packages for each session
              for (const session of sessions) {
                if (session.packageId) {
                  // Increment sessions_used
                  const { data: pkg } = await supabase
                    .from('pt_packages')
                    .select('sessions_used, total_sessions')
                    .eq('id', session.packageId)
                    .single();

                  if (pkg) {
                    const newUsed = pkg.sessions_used + 1;
                    await supabase
                      .from('pt_packages')
                      .update({
                        sessions_used: newUsed,
                        status: newUsed >= pkg.total_sessions ? 'completed' : 'active'
                      })
                      .eq('id', session.packageId);
                  }
                }
              }

              Alert.alert('Success', `Approved ${sessions.length} sessions for payment`);
              fetchSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to bulk approve');
            } finally {
              setBulkApproving(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  // Calculate totals
  const totalPending = sessions.reduce((sum, s) => sum + s.coachCommission, 0);

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.jaiBlue} />
      </View>
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
          <Text style={styles.title}>PT Payments</Text>
          {isMasterAdmin && sessions.length > 0 && (
            <TouchableOpacity
              style={styles.bulkButton}
              onPress={handleBulkApprove}
              disabled={bulkApproving}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.bulkButtonText}>
                {bulkApproving ? 'Approving...' : 'Approve All for Sunday'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
          }
        >
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <LinearGradient
              colors={[Colors.jaiBlue + '20', Colors.neonPurple + '10']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryGradient}
            >
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{sessions.length}</Text>
                  <Text style={styles.summaryLabel}>Sessions Pending</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: Colors.neonGreen }]}>
                    {formatCurrency(totalPending)}
                  </Text>
                  <Text style={styles.summaryLabel}>Total to Pay</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Info Note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.jaiBlue} />
            <Text style={styles.infoText}>
              Sessions shown here have been verified by both coach and member.{'\n'}
              Approve to mark as paid and update package usage.
            </Text>
          </View>

          {/* Sessions List */}
          {sessions.map((session) => (
            <View key={session.sessionId} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <View style={styles.sessionDateInfo}>
                  <Text style={styles.sessionDate}>{formatDate(session.sessionDate)}</Text>
                  <Text style={styles.sessionTime}>{formatDateTime(session.sessionDate)}</Text>
                </View>
                <View style={styles.amountBadge}>
                  <Text style={styles.amountText}>{formatCurrency(session.coachCommission)}</Text>
                  <Text style={styles.amountSubtext}>coach commission</Text>
                </View>
              </View>

              <View style={styles.sessionDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="person-outline" size={14} color={Colors.jaiBlue} />
                  <Text style={styles.detailLabel}>Coach</Text>
                  <Text style={styles.detailValue}>{session.coachName}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="person-outline" size={14} color={Colors.neonPurple} />
                  <Text style={styles.detailLabel}>Member</Text>
                  <Text style={styles.detailValue}>{session.memberName}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={14} color={Colors.success} />
                  <Text style={styles.detailLabel}>Session Price</Text>
                  <Text style={styles.detailValue}>{formatCurrency(session.sessionPrice)}</Text>
                </View>
                {session.packageId && (
                  <View style={styles.packageBadge}>
                    <Ionicons name="cube-outline" size={12} color={Colors.darkGray} />
                    <Text style={styles.packageText}>
                      Package session ({session.packageSessionsRemaining} remaining)
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.approveButton}
                onPress={() => handleApproveSession(session)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                <Text style={styles.approveButtonText}>Approve Payment</Text>
              </TouchableOpacity>
            </View>
          ))}

          {sessions.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.success} />
              <Text style={styles.emptyText}>All Caught Up!</Text>
              <Text style={styles.emptySubtext}>No pending payments to approve</Text>
            </View>
          )}

          {/* Cancelled Sessions Info */}
          <View style={styles.cancelledSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="close-circle-outline" size={18} color="#FF6B6B" />
              <Text style={styles.sectionTitle}>Note</Text>
            </View>
            <Text style={styles.sectionText}>
              Cancelled sessions are automatically filtered out and will not appear here.
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Approval Modal */}
      <Modal
        visible={approvalModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setApprovalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Approve Payment</Text>
              <TouchableOpacity onPress={() => setApprovalModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            {selectedSession && (
              <View style={styles.modalBody}>
                <View style={styles.modalSessionInfo}>
                  <Text style={styles.modalSessionDate}>
                    {formatDate(selectedSession.sessionDate)}
                  </Text>
                  <Text style={styles.modalSessionCoach}>
                    {selectedSession.coachName} with {selectedSession.memberName}
                  </Text>
                </View>

                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>Payment Amount (S$)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={Colors.darkGray}
                  />
                  <Text style={styles.modalHelper}>
                    Default: 50% of session price ({formatCurrency(selectedSession.sessionPrice * 0.5)})
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.confirmButton, approving && styles.disabledButton]}
                  onPress={confirmApproval}
                  disabled={approving}
                >
                  <Text style={styles.confirmButtonText}>
                    {approving ? 'Approving...' : 'Confirm Payment'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.jaiBlue + '15',
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '50',
  },
  bulkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.jaiBlue,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  summaryCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  summaryGradient: {
    padding: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.white,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 4,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.jaiBlue + '10',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoText: {
    fontSize: 12,
    color: Colors.lightGray,
    flex: 1,
    lineHeight: 18,
  },
  sessionCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sessionDateInfo: {
    flex: 1,
  },
  sessionDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  sessionTime: {
    fontSize: 12,
    color: Colors.darkGray,
  },
  amountBadge: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.neonGreen,
  },
  amountSubtext: {
    fontSize: 10,
    color: Colors.darkGray,
  },
  sessionDetails: {
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.darkGray,
    width: 60,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  packageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '50',
  },
  packageText: {
    fontSize: 11,
    color: Colors.darkGray,
  },
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.success,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: Spacing.sm,
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.success,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.darkGray,
    marginTop: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  modalBody: {
    padding: Spacing.md,
  },
  modalSessionInfo: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalSessionDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  modalSessionCoach: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  modalField: {
    marginBottom: Spacing.md,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: Colors.black,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHelper: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 4,
  },
  confirmButton: {
    backgroundColor: Colors.success,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelledSection: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: '#FF6B6B10',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B30',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  sectionText: {
    fontSize: 12,
    color: Colors.lightGray,
    lineHeight: 18,
  },
});

export default AdminPTPaymentsScreen;
