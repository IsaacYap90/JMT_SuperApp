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
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing, Fonts } from '../../../shared/constants/Colors';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  created_at: string;
  coach: {
    full_name: string;
    email: string;
  };
}

export const LeaveApprovalsScreen: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const fetchRequests = async () => {
    let query = supabase
      .from('leave_requests')
      .select(`
        *,
        coach:coach_id (full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      query = query.eq('status', 'pending');
    }

    const { data } = await query;
    setRequests(data || []);
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  const handleApprove = async (leaveId: string, coachName: string) => {
    Alert.alert(
      'Approve Leave',
      `Approve leave request from ${coachName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            const { error } = await supabase
              .from('leave_requests')
              .update({
                status: 'approved',
                reviewed_by: user?.id,
                reviewed_at: new Date().toISOString(),
              })
              .eq('id', leaveId);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert('Success', 'Leave request approved');
              fetchRequests();
            }
          },
        },
      ]
    );
  };

  const handleReject = async (leaveId: string, coachName: string) => {
    Alert.alert(
      'Reject Leave',
      `Reject leave request from ${coachName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('leave_requests')
              .update({
                status: 'rejected',
                reviewed_by: user?.id,
                reviewed_at: new Date().toISOString(),
              })
              .eq('id', leaveId);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              Alert.alert('Success', 'Leave request rejected');
              fetchRequests();
            }
          },
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return Colors.success;
      case 'rejected': return Colors.error;
      case 'pending': return Colors.warning;
      default: return Colors.darkGray;
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leave Approvals</Text>
        {pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount} pending</Text>
          </View>
        )}
      </View>

      {/* Filter Toggle */}
      <View style={styles.filterToggle}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'pending' && styles.filterTabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            Pending
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All Requests
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
        }
      >
        {requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {filter === 'pending' ? 'No pending leave requests' : 'No leave requests found'}
            </Text>
          </View>
        ) : (
          requests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={styles.coachInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {request.coach?.full_name?.charAt(0) || '?'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.coachName}>{request.coach?.full_name}</Text>
                    <Text style={styles.coachEmail}>{request.coach?.email}</Text>
                  </View>
                </View>
                <View style={styles.badgeRow}>
                  <View style={styles.leaveTypeBadge}>
                    <Text style={styles.leaveTypeText}>
                      {request.leave_type === 'annual' ? 'Annual' : 'MC'}
                    </Text>
                  </View>
                  {request.status !== 'pending' && (
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) }]}>
                      <Text style={styles.statusText}>
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.datesRow}>
                <Text style={styles.dateText}>
                  {formatDate(request.start_date)} - {formatDate(request.end_date)}
                </Text>
                <Text style={styles.daysText}>
                  {calculateDays(request.start_date, request.end_date)} day(s)
                </Text>
              </View>

              {request.reason && (
                <Text style={styles.reasonText}>Reason: {request.reason}</Text>
              )}

              {request.status === 'pending' && (
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => handleReject(request.id, request.coach?.full_name)}
                  >
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => handleApprove(request.id, request.coach?.full_name)}
                  >
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
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
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  badge: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.white,
  },
  filterToggle: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 10,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterTabActive: {
    backgroundColor: Colors.jaiBlue,
  },
  filterText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.lightGray,
  },
  filterTextActive: {
    color: Colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 12,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.darkGray,
    fontFamily: Fonts.regular,
  },
  requestCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 12,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  coachInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  coachName: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
  coachEmail: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  leaveTypeBadge: {
    backgroundColor: Colors.black,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  leaveTypeText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.white,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.white,
  },
  datesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
  daysText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
  },
  reasonText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  rejectButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: 'center',
  },
  rejectButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.error,
  },
  approveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.success,
    alignItems: 'center',
  },
  approveButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
});
