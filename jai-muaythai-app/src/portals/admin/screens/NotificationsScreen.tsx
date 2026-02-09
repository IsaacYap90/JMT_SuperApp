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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing, Fonts } from '../../../shared/constants/Colors';

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  reference_id: string;
  reference_type: string;
  action_type: string;
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
  reviewed_by?: string;
  reviewed_at?: string;
  coach?: {
    full_name: string;
    email: string;
    role: string;
  };
}

// Notification type color mapping
const NOTIFICATION_COLORS: Record<string, string> = {
  class_assignment: '#00BFFF',
  lead_coach_assignment: '#00BFFF',
  class: '#00BFFF',
  class_unassignment: '#FF4444',
  class_cancelled: '#FF4444',
  pt_created: '#FF8C00',
  pt_updated: '#FF8C00',
  pt_cancelled: '#FF4444',
  pt_deleted: '#FF4444',
  booking: '#FF8C00',
  leave_request: '#9B59B6',
  leave_status: '#9B59B6',
  system: '#888888',
  broadcast: '#888888',
};

export const AdminNotificationsScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [approvalReason, setApprovalReason] = useState('');

  const fetchNotifications = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
  };

  const markAllAsRead = async () => {
    if (markingAllRead) return; // Prevent double-tap

    setMarkingAllRead(true);
    try {
      console.log('[Admin Notif] Marking all read for user:', user?.id);

      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user?.id)
        .eq('is_read', false)
        .select();

      console.log('[Admin Notif] Update result:', { data, error });

      if (error) {
        console.error('[Admin Notif] Mark all read error:', error);
        Alert.alert('Error', error.message || 'Failed to mark notifications as read');
        return;
      }

      // Refresh notifications list from database
      await fetchNotifications();

      console.log('[Admin Notif] ✓ All notifications marked as read');
    } catch (err: any) {
      console.error('[Admin Notif] Mark all read failed:', err);
      Alert.alert('Error', err.message || 'An error occurred');
    } finally {
      setMarkingAllRead(false);
    }
  };

  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleNotificationPress = async (notification: Notification) => {
    await markAsRead(notification.id);

    // Handle different notification types
    if (notification.reference_type === 'leave_request') {
      console.log('[Admin Notif] Handling leave request notification:', notification.reference_id);

      // Fetch leave request details with coach info
      let leaveRequest = null;

      if (notification.reference_id) {
        const { data, error } = await supabase
          .from('leave_requests')
          .select(`
            *,
            coach:users!coach_id (full_name, email, role)
          `)
          .eq('id', notification.reference_id)
          .single();

        console.log('[Admin Notif] Leave request fetch result:', { data, error });

        if (data) {
          leaveRequest = data;
        } else if (error) {
          console.error('[Admin Notif] Failed to fetch leave request:', error);
        }
      }

      // Fallback: find most recent pending leave request if reference_id failed
      if (!leaveRequest) {
        console.log('[Admin Notif] Trying fallback query for pending leave requests');
        const { data } = await supabase
          .from('leave_requests')
          .select(`
            *,
            coach:users!coach_id (full_name, email, role)
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          leaveRequest = data;
          console.log('[Admin Notif] Found leave request via fallback:', data.id);
        }
      }

      if (leaveRequest) {
        setSelectedLeave(leaveRequest);
        setLeaveModalVisible(true);
      } else {
        Alert.alert('Leave Request', 'Could not find the leave request details. It may have been deleted.');
      }
    } else if (notification.reference_type === 'class' || notification.notification_type === 'class_assignment') {
      // Navigate to Schedule tab
      (navigation as any).navigate('AdminTabs', { screen: 'Schedule' });
    } else if (notification.reference_type === 'pt_session' || notification.notification_type.startsWith('pt_')) {
      // Show detail modal
      setSelectedNotification(notification);
      setDetailModalVisible(true);
    } else if (notification.notification_type === 'broadcast' || notification.notification_type === 'system') {
      // Just mark as read (already done above)
      setSelectedNotification(notification);
      setDetailModalVisible(true);
    } else {
      // Show detail modal for other types
      setSelectedNotification(notification);
      setDetailModalVisible(true);
    }
  };

  const handleApproval = async (status: 'approved' | 'rejected') => {
    if (!selectedLeave) return;

    try {
      console.log('[Admin Notif] Updating leave request:', selectedLeave.id, 'to status:', status);

      const { data, error } = await supabase
        .from('leave_requests')
        .update({
          status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: approvalReason || null
        })
        .eq('id', selectedLeave.id)
        .select();

      console.log('[Admin Notif] Leave update result:', { data, error });

      if (error) {
        console.error('[Admin Notif] Failed to update leave request:', error);
        Alert.alert('Error', error.message || 'Failed to update leave request.');
        return;
      }

      // Send notification to coach
      console.log('[Admin Notif] Sending notification to coach:', selectedLeave.coach_id);
      const { error: notifError } = await supabase.from('notifications').insert({
        user_id: selectedLeave.coach_id,
        title: `Leave ${status === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your leave from ${selectedLeave.start_date} to ${selectedLeave.end_date} has been ${status}.${approvalReason ? ` Notes: ${approvalReason}` : ''}`,
        notification_type: 'leave_status',
        reference_id: selectedLeave.id,
        reference_type: 'leave_request',
        is_read: false
      });

      if (notifError) {
        console.error('[Admin Notif] Failed to send notification to coach:', notifError);
      }

      setLeaveModalVisible(false);
      setSelectedLeave(null);
      setApprovalReason('');
      fetchNotifications();
      Alert.alert('Success', `Leave request has been ${status}.`);
    } catch (err: any) {
      console.error('[Admin Notif] Leave approval failed:', err);
      Alert.alert('Error', err.message || 'An error occurred');
    }
  };

  const getNotificationColor = (notification: Notification): string => {
    return NOTIFICATION_COLORS[notification.notification_type] || Colors.lightGray;
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllButton, markingAllRead && styles.markAllButtonDisabled]}
            onPress={markAllAsRead}
            disabled={markingAllRead}
          >
            <Text style={styles.markAllText}>
              {markingAllRead ? 'Marking...' : 'Mark all read'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="notifications-outline" size={48} color={Colors.darkGray} />
            <Text style={styles.emptyText}>No notifications</Text>
          </View>
        ) : (
          notifications.map((notification) => {
            const color = getNotificationColor(notification);
            const isUnread = !notification.is_read;

            return (
              <TouchableOpacity
                key={notification.id}
                style={[
                  styles.compactCard,
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: color,
                  },
                  isUnread && styles.unreadCard
                ]}
                onPress={() => handleNotificationPress(notification)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {notification.title}
                  </Text>
                  <Text style={styles.cardTime}>{getRelativeTime(notification.created_at)}</Text>
                </View>
                <Text style={styles.cardMessage} numberOfLines={2}>
                  {notification.message}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notification Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            {selectedNotification && (
              <>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Title:</Text>
                    <Text style={styles.detailValue}>{selectedNotification.title}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Message:</Text>
                    <Text style={styles.detailValue}>{selectedNotification.message}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedNotification.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type:</Text>
                    <Text style={styles.detailValue}>
                      {selectedNotification.notification_type.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => setDetailModalVisible(false)}
                >
                  <Text style={styles.dismissButtonText}>Dismiss</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Leave Approval Modal */}
      <Modal
        visible={leaveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Leave Request</Text>
              <TouchableOpacity onPress={() => setLeaveModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            {selectedLeave && (
              <>
                {/* Status Badge at top if not pending */}
                {selectedLeave.status !== 'pending' && (
                  <View style={[
                    styles.statusBadge,
                    selectedLeave.status === 'approved' ? styles.statusApproved : styles.statusRejected,
                    { marginBottom: 12 }
                  ]}>
                    <Text style={styles.statusBadgeText}>
                      {selectedLeave.status === 'approved' ? '✓ APPROVED' : '✗ REJECTED'}
                    </Text>
                  </View>
                )}

                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Coach:</Text>
                    <Text style={styles.detailValue}>{selectedLeave.coach?.full_name || 'Unknown'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Leave Type:</Text>
                    <Text style={styles.detailValue}>
                      {selectedLeave.leave_type
                        ? selectedLeave.leave_type.charAt(0).toUpperCase() + selectedLeave.leave_type.slice(1)
                        : 'Not specified'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date Range:</Text>
                    <Text style={styles.detailValue}>
                      {selectedLeave.start_date} - {selectedLeave.end_date}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Reason:</Text>
                    <Text style={styles.detailValue}>{selectedLeave.reason}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Applied:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedLeave.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <Text style={[
                      styles.detailValue,
                      {
                        color: selectedLeave.status === 'approved'
                          ? Colors.success
                          : selectedLeave.status === 'rejected'
                            ? Colors.error
                            : Colors.warning
                      }
                    ]}>
                      {selectedLeave.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {selectedLeave.status === 'pending' && (
                  <>
                    <Text style={styles.inputLabel}>Notes (optional):</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Add notes for the employee..."
                      placeholderTextColor={Colors.darkGray}
                      value={approvalReason}
                      onChangeText={setApprovalReason}
                      multiline
                    />

                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.rejectButton]}
                        onPress={() => handleApproval('rejected')}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.approveButton]}
                        onPress={() => handleApproval('approved')}
                      >
                        <Text style={styles.approveButtonText}>Approve</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {selectedLeave.status !== 'pending' && (
                  <View style={styles.statusContainer}>
                    <View style={[
                      styles.statusBadge,
                      selectedLeave.status === 'approved' ? styles.statusApproved : styles.statusRejected
                    ]}>
                      <Text style={styles.statusBadgeText}>
                        {selectedLeave.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.dismissButton}
                      onPress={() => setLeaveModalVisible(false)}
                    >
                      <Text style={styles.dismissButtonText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.jaiBlue + '20',
  },
  markAllButtonDisabled: {
    opacity: 0.5,
  },
  markAllText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.jaiBlue,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.xl * 2,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  emptyText: {
    color: Colors.darkGray,
    fontFamily: Fonts.regular,
    fontSize: 16,
    marginTop: 12,
  },
  // Compact Card Styles
  compactCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unreadCard: {
    backgroundColor: Colors.cardBg + 'DD',
    borderColor: Colors.border + 'BB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
  cardTime: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.darkGray,
  },
  cardMessage: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
    lineHeight: 18,
    marginLeft: 16,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  detailCard: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.darkGray,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.white,
    lineHeight: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.lightGray,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: Colors.black,
    borderRadius: 8,
    padding: Spacing.md,
    color: Colors.white,
    fontFamily: Fonts.regular,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: Colors.success,
  },
  rejectButton: {
    backgroundColor: Colors.error,
  },
  approveButtonText: {
    color: Colors.white,
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  rejectButtonText: {
    color: Colors.white,
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  dismissButton: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.lightGray,
  },
  statusContainer: {
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statusApproved: {
    backgroundColor: Colors.success,
  },
  statusRejected: {
    backgroundColor: Colors.error,
  },
  statusBadgeText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
});
