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
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

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

export const NotificationsScreen: React.FC = () => {
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
      .channel('member-notifications')
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
    await markAsRead(notification.id);
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'booking': return '📆';
      case 'pt_cancelled': return '⚠️';
      case 'payment': return '💰';
      case 'system': return '⚙️';
      default: return '🔔';
    }
  };

  const renderDetailModal = () => {
    if (!selectedNotification) return null;

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
                <View style={[styles.colorDot, { backgroundColor: Colors.jaiBlue }]} />
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
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>
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
              <Text style={styles.markAllText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
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
                  <Text style={styles.notificationMessage} numberOfLines={2}>{notification.message}</Text>
                  <Text style={styles.notificationTime}>{formatDateTime(notification.created_at)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {renderDetailModal()}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backButton: { marginRight: 16 },
  title: { flex: 1, fontSize: 24, fontWeight: '800', color: Colors.white },
  markAllButton: { padding: 8 },
  markAllText: { fontSize: 12, color: Colors.jaiBlue, fontWeight: '600' },
  content: { padding: Spacing.lg },
  emptyCard: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: Colors.darkGray, fontSize: 16 },
  notificationCard: {
    backgroundColor: Colors.cardBg, borderRadius: 12, padding: Spacing.md,
    marginBottom: 10, flexDirection: 'row', borderWidth: 1, borderColor: Colors.border,
  },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: Colors.jaiBlue },
  notificationIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.black,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  iconText: { fontSize: 20 },
  notificationContent: { flex: 1 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  notificationTitle: { fontSize: 15, fontWeight: '700', color: Colors.white, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.jaiBlue, marginLeft: 8 },
  notificationMessage: { fontSize: 13, color: Colors.lightGray, marginBottom: 6 },
  notificationTime: { fontSize: 11, color: Colors.darkGray },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  detailModalContent: { backgroundColor: Colors.cardBg, borderRadius: 20, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: Colors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.white, flex: 1 },
  closeButton: { padding: 4 },
  modalBody: { padding: Spacing.md },
  modalMessage: { fontSize: 15, color: Colors.lightGray, lineHeight: 22, marginBottom: Spacing.md },
  modalMeta: { gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 13, color: Colors.darkGray },
  modalFooter: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  closeModalButton: { backgroundColor: Colors.jaiBlue, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  closeModalButtonText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
