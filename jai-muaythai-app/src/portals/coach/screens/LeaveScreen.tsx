import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  created_at: string;
}

interface LeaveBalance {
  annual_leave_balance: number;
  mc_balance: number;
}

export const CoachLeaveScreen: React.FC = () => {
  const { user } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance>({ annual_leave_balance: 14, mc_balance: 14 });
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [leaveType, setLeaveType] = useState<'annual' | 'mc'>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [selectingDate, setSelectingDate] = useState<'start' | 'end' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    if (!user?.id) return;

    const { data: requests } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('coach_id', user.id)
      .order('created_at', { ascending: false });

    if (requests) setLeaveRequests(requests);

    const { data: profile } = await supabase
      .from('coach_profiles')
      .select('annual_leave_balance, mc_balance')
      .eq('user_id', user.id)
      .single();

    if (profile) setBalance(profile);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('leave-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'leave_requests',
        filter: `coach_id=eq.${user?.id}`,
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      Alert.alert('Error', 'Please select start and end dates');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Error', 'Please enter a reason');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from('leave_requests').insert({
      coach_id: user?.id,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim(),
      status: 'pending',
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Leave request submitted!');
      setModalVisible(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      fetchData();
    }

    setSubmitting(false);
  };

  const handleCancel = (request: LeaveRequest) => {
    const isApproved = request.status === 'approved';
    Alert.alert(
      'Cancel Leave',
      isApproved
        ? 'This leave was already approved. Cancelling will restore your leave balance. Are you sure?'
        : 'Are you sure you want to cancel this leave request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('leave_requests')
              .update({ status: 'cancelled' })
              .eq('id', request.id);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert('Success', 'Leave request cancelled');
              fetchData();
            }
          }
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const calculateDays = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <Ionicons name="checkmark-circle" size={20} color={Colors.success} />;
      case 'rejected': return <Ionicons name="close-circle" size={20} color={Colors.error} />;
      case 'cancelled': return <Ionicons name="ban" size={20} color={Colors.darkGray} />;
      default: return <Ionicons name="time" size={20} color={Colors.warning} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return Colors.success;
      case 'rejected': return Colors.error;
      case 'cancelled': return Colors.darkGray;
      default: return Colors.warning;
    }
  };

  const getMarkedDates = () => {
    const marked: any = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const isStart = dateStr === startDate;
        const isEnd = dateStr === endDate;

        marked[dateStr] = {
          color: Colors.jaiBlue,
          textColor: Colors.white,
          startingDay: isStart,
          endingDay: isEnd,
        };
        current.setDate(current.getDate() + 1);
      }
    } else if (startDate) {
      marked[startDate] = {
        color: Colors.jaiBlue,
        textColor: Colors.white,
        startingDay: true,
        endingDay: true,
      };
    }

    return marked;
  };

  const annualPercent = (balance.annual_leave_balance / 14) * 100;
  const mcPercent = (balance.mc_balance / 14) * 100;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Leave</Text>
          </View>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[Colors.jaiBlue, Colors.neonPurple]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.applyButton}
            >
              <Ionicons name="add" size={18} color={Colors.white} />
              <Text style={styles.applyButtonText}>Apply</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
          }
        >
          {/* Balance Cards */}
          <View style={styles.balanceRow}>
            <View style={styles.balanceCard}>
              <View style={[styles.balanceGlow, { backgroundColor: Colors.jaiBlue }]} />
              <Ionicons name="sunny-outline" size={20} color={Colors.jaiBlue} />
              <Text style={styles.balanceLabel}>Annual Leave</Text>
              <Text style={[
                styles.balanceValue,
                { color: balance.annual_leave_balance <= 3 ? Colors.error : Colors.jaiBlue }
              ]}>
                {balance.annual_leave_balance}
              </Text>
              <Text style={styles.balanceTotal}>of 14 days</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, {
                  width: `${annualPercent}%`,
                  backgroundColor: balance.annual_leave_balance <= 3 ? Colors.error : Colors.jaiBlue,
                }]} />
              </View>
            </View>

            <View style={styles.balanceCard}>
              <View style={[styles.balanceGlow, { backgroundColor: Colors.neonPurple }]} />
              <Ionicons name="medkit-outline" size={20} color={Colors.neonPurple} />
              <Text style={styles.balanceLabel}>Medical Leave</Text>
              <Text style={[
                styles.balanceValue,
                { color: balance.mc_balance <= 3 ? Colors.error : Colors.neonPurple }
              ]}>
                {balance.mc_balance}
              </Text>
              <Text style={styles.balanceTotal}>of 14 days</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, {
                  width: `${mcPercent}%`,
                  backgroundColor: balance.mc_balance <= 3 ? Colors.error : Colors.neonPurple,
                }]} />
              </View>
            </View>
          </View>

          {/* Leave History */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>LEAVE HISTORY</Text>
          </View>

          {leaveRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={40} color={Colors.darkGray} />
              <Text style={styles.emptyText}>No leave requests yet</Text>
            </View>
          ) : (
            leaveRequests.map((request) => (
              <View key={request.id} style={[
                styles.requestCard,
                request.status === 'cancelled' && styles.requestCardCancelled
              ]}>
                <View style={styles.requestHeader}>
                  <View style={styles.requestTypeRow}>
                    {getStatusIcon(request.status)}
                    <Text style={styles.requestType}>
                      {request.leave_type === 'annual' ? 'Annual Leave' : 'Medical Leave'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </Text>
                  </View>
                </View>
                <View style={styles.requestDetails}>
                  <View style={styles.requestDetailRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.lightGray} />
                    <Text style={styles.requestDetailText}>
                      {formatDate(request.start_date)} - {formatDate(request.end_date)}
                    </Text>
                  </View>
                  <View style={styles.requestDetailRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.lightGray} />
                    <Text style={styles.requestDetailText}>
                      {calculateDays(request.start_date, request.end_date)} day(s)
                    </Text>
                  </View>
                  {request.reason && (
                    <View style={styles.requestDetailRow}>
                      <Ionicons name="chatbubble-outline" size={14} color={Colors.lightGray} />
                      <Text style={styles.requestDetailText}>{request.reason}</Text>
                    </View>
                  )}
                </View>
                {(request.status === 'approved' || request.status === 'pending') && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancel(request)}
                  >
                    <Ionicons name="close-outline" size={16} color={Colors.error} />
                    <Text style={styles.cancelButtonText}>Cancel Leave</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Apply Leave Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Apply Leave</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.lightGray} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Leave Type Selector */}
                <Text style={styles.modalLabel}>Leave Type</Text>
                <View style={styles.typeToggle}>
                  <TouchableOpacity
                    style={[styles.typeButton, leaveType === 'annual' && styles.typeButtonActive]}
                    onPress={() => setLeaveType('annual')}
                  >
                    <Ionicons name="sunny-outline" size={18} color={leaveType === 'annual' ? Colors.white : Colors.lightGray} />
                    <Text style={[styles.typeButtonText, leaveType === 'annual' && styles.typeButtonTextActive]}>Annual</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeButton, leaveType === 'mc' && styles.typeButtonActiveMC]}
                    onPress={() => setLeaveType('mc')}
                  >
                    <Ionicons name="medkit-outline" size={18} color={leaveType === 'mc' ? Colors.white : Colors.lightGray} />
                    <Text style={[styles.typeButtonText, leaveType === 'mc' && styles.typeButtonTextActive]}>Medical</Text>
                  </TouchableOpacity>
                </View>

                {/* Date Selection */}
                <Text style={styles.modalLabel}>Select Dates</Text>
                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={[styles.dateInput, selectingDate === 'start' && styles.dateInputActive]}
                    onPress={() => setSelectingDate('start')}
                  >
                    <Ionicons name="calendar-outline" size={16} color={Colors.jaiBlue} />
                    <Text style={styles.dateInputText}>
                      {startDate ? formatDate(startDate) : 'Start Date'}
                    </Text>
                  </TouchableOpacity>
                  <Ionicons name="arrow-forward" size={16} color={Colors.darkGray} />
                  <TouchableOpacity
                    style={[styles.dateInput, selectingDate === 'end' && styles.dateInputActive]}
                    onPress={() => setSelectingDate('end')}
                  >
                    <Ionicons name="calendar-outline" size={16} color={Colors.neonPurple} />
                    <Text style={styles.dateInputText}>
                      {endDate ? formatDate(endDate) : 'End Date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {selectingDate && (
                  <Calendar
                    onDayPress={(day: any) => {
                      if (selectingDate === 'start') {
                        setStartDate(day.dateString);
                        setSelectingDate('end');
                        if (endDate && day.dateString > endDate) setEndDate('');
                      } else {
                        if (day.dateString >= startDate) {
                          setEndDate(day.dateString);
                          setSelectingDate(null);
                        }
                      }
                    }}
                    markingType="period"
                    markedDates={getMarkedDates()}
                    minDate={new Date().toISOString().split('T')[0]}
                    theme={{
                      backgroundColor: 'transparent',
                      calendarBackground: 'transparent',
                      textSectionTitleColor: Colors.lightGray,
                      dayTextColor: Colors.white,
                      todayTextColor: Colors.jaiBlue,
                      monthTextColor: Colors.white,
                      arrowColor: Colors.jaiBlue,
                      textDisabledColor: Colors.darkGray,
                      textDayFontWeight: '500',
                      textMonthFontWeight: '700',
                    }}
                  />
                )}

                {startDate && endDate && (
                  <View style={styles.durationCard}>
                    <Ionicons name="time-outline" size={16} color={Colors.jaiBlue} />
                    <Text style={styles.durationText}>
                      {calculateDays(startDate, endDate)} day(s) selected
                    </Text>
                  </View>
                )}

                {/* Reason Input */}
                <Text style={styles.modalLabel}>Reason</Text>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Enter reason for leave..."
                  placeholderTextColor={Colors.darkGray}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={3}
                />

                {/* Submit Button */}
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[Colors.jaiBlue, Colors.neonPurple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.submitButton, submitting && { opacity: 0.5 }]}
                  >
                    <Text style={styles.submitButtonText}>
                      {submitting ? 'Submitting...' : 'Submit Request'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </View>
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
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  balanceGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.15,
  },
  balanceLabel: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: '800',
    marginTop: 4,
  },
  balanceTotal: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 2,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
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
  requestCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  requestCardCancelled: {
    opacity: 0.5,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.error,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  requestTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestType: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  requestDetails: {
    gap: 6,
  },
  requestDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestDetailText: {
    fontSize: 13,
    color: Colors.lightGray,
    flex: 1,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  typeButtonActive: {
    backgroundColor: Colors.jaiBlue,
  },
  typeButtonActiveMC: {
    backgroundColor: Colors.neonPurple,
  },
  typeButtonText: {
    fontWeight: '600',
    fontSize: 14,
    color: Colors.lightGray,
  },
  typeButtonTextActive: {
    color: Colors.white,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateInputActive: {
    borderColor: Colors.jaiBlue,
  },
  dateInputText: {
    fontSize: 13,
    color: Colors.white,
  },
  durationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 8,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.jaiBlue,
  },
  reasonInput: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.white,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
});
