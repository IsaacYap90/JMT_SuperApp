import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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

export const CoachNotificationsScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  const fetchNotifications = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
      setNotifications(data);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('coach-notifications')
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

  const handleNotificationPress = async (notification: Notification) => {
    console.log('Coach notification pressed:', notification.id);
    console.log('reference_type:', notification.reference_type);

    await markAsRead(notification.id);

    // Open detail modal for all notification types
    setSelectedNotification(notification);
    setDetailModalVisible(true);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDateTime(dateString);
  };

  const getNotificationColor = (type: string) => {
    const colorMap: Record<string, string> = {
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
    return colorMap[type] || '#888888';
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'leave_request': return '📋';
      case 'leave_status': return '✅';
      case 'schedule_change': return '📅';
      case 'booking': return '📆';
      case 'broadcast': return '📢';
      case 'system': return '⚙️';
      default: return '🔔';
    }
  };

  const renderDetailModal = () => {
    if (!selectedNotification) return null;

    const notifColor = getNotificationColor(selectedNotification.notification_type);

    return (
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDetailModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.detailModalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={[styles.colorDot, { backgroundColor: notifColor }]} />
                <Text style={styles.modalTitle}>{selectedNotification.title}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalMessage}>{selectedNotification.message}</Text>

              <View style={styles.modalMeta}>
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={16} color={Colors.darkGray} />
                  <Text style={styles.metaText}>
                    {formatDateTime(selectedNotification.created_at)}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Ionicons name="person-outline" size={16} color={Colors.darkGray} />
                  <Text style={styles.metaText}>From: Admin</Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={async () => {
              await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user?.id)
                .eq('is_read', false);
              setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            }}
          >
            <Text style={styles.markAllText}>Mark all read</Text>
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
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>No notifications</Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[styles.notificationCard, !notification.is_read && styles.unreadCard]}
              onPress={() => handleNotificationPress(notification)}
              activeOpacity={0.7}
            >
              <View style={styles.notificationIcon}>
                <Text style={styles.iconText}>{getNotificationIcon(notification.notification_type)}</Text>
              </View>
              <View style={styles.notificationContent}>
                <View style={styles.notificationHeader}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  {!notification.is_read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.notificationMessage}>{notification.message}</Text>
                <Text style={styles.notificationTime}>{formatDateTime(notification.created_at)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {renderDetailModal()}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.darkCharcoal,
  },
  markAllText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.jaiBlue,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 12,
    padding: Spacing.xl,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: Colors.darkGray,
    fontFamily: Fonts.regular,
    fontSize: 16,
  },
  notificationCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 10,
    flexDirection: 'row',
  },
  unreadCard: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.jaiBlue,
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
    marginBottom: 6,
  },
  notificationTime: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.darkGray,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: Spacing.lg,
    maxHeight: 300,
  },
  modalMessage: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  modalMeta: {
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.darkGray,
  },
  modalFooter: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  closeModalButton: {
    backgroundColor: Colors.jaiBlue,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
});
