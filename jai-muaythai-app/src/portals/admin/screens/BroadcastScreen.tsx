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
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing, Fonts } from '../../../shared/constants/Colors';

interface Broadcast {
  id: string;
  title: string;
  message: string;
  target_audience: string;
  created_at: string;
  sender: {
    full_name: string;
  };
}

export const AdminBroadcastScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'all' | 'coaches' | 'members'>('all');
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null);

  const fetchBroadcasts = async () => {
    const { data } = await supabase
      .from('broadcasts')
      .select(`
        *,
        sender:created_by (full_name)
      `)
      .order('created_at', { ascending: false });

    if (data) {
      setBroadcasts(data);
    }
  };

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBroadcasts();
    setRefreshing(false);
  };

  const handleSendBroadcast = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Error', 'Please enter title and message');
      return;
    }

    // Insert broadcast
    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .insert({
        title,
        message,
        target_audience: audience,
        created_by: user?.id,
      })
      .select()
      .single();

    if (broadcastError) {
      Alert.alert('Error', broadcastError.message);
      return;
    }

    // Get target users
    let targetRoles: string[] = [];
    if (audience === 'all') {
      targetRoles = ['coach', 'member'];
    } else if (audience === 'coaches') {
      targetRoles = ['coach'];
    } else {
      targetRoles = ['member'];
    }

    const { data: targetUsers } = await supabase
      .from('users')
      .select('id')
      .in('role', targetRoles)
      .eq('is_active', true);

    // Create notifications for each user
    if (targetUsers) {
      const notifications = targetUsers.map(u => ({
        user_id: u.id,
        title: `📢 ${title}`,
        message,
        notification_type: 'broadcast',
        sender_id: user?.id,
        reference_id: broadcast.id,
        reference_type: 'broadcast',
      }));

      await supabase.from('notifications').insert(notifications);
    }

    Alert.alert('Success', `Broadcast sent to ${targetUsers?.length || 0} users`);
    resetModal();
    fetchBroadcasts();
  };

  const resetModal = () => {
    setModalVisible(false);
    setTitle('');
    setMessage('');
    setAudience('all');
  };

  const handleBroadcastPress = (broadcast: Broadcast) => {
    setSelectedBroadcast(broadcast);
    setDetailModalVisible(true);
  };

  const renderDetailModal = () => {
    if (!selectedBroadcast) return null;

    const audienceColor = getAudienceColor(selectedBroadcast.target_audience);

    return (
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.detailModalOverlay}
          activeOpacity={1}
          onPress={() => setDetailModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.detailModalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.detailModalHeader}>
              <View style={styles.detailTitleRow}>
                <View style={[styles.colorDot, { backgroundColor: audienceColor }]} />
                <Text style={styles.detailModalTitle}>{selectedBroadcast.title}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailModalVisible(false)}
                style={styles.detailCloseButton}
              >
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailModalBody}>
              <View style={[styles.detailAudienceBadge, { backgroundColor: audienceColor }]}>
                <Text style={styles.detailAudienceBadgeText}>
                  To: {getAudienceLabel(selectedBroadcast.target_audience)}
                </Text>
              </View>

              <Text style={styles.detailMessage}>{selectedBroadcast.message}</Text>

              <View style={styles.detailMeta}>
                <View style={styles.detailMetaRow}>
                  <Ionicons name="person-outline" size={16} color={Colors.darkGray} />
                  <Text style={styles.detailMetaText}>
                    Sent by: {selectedBroadcast.sender?.full_name || 'Admin'}
                  </Text>
                </View>

                <View style={styles.detailMetaRow}>
                  <Ionicons name="time-outline" size={16} color={Colors.darkGray} />
                  <Text style={styles.detailMetaText}>
                    {formatTime(selectedBroadcast.created_at)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.detailModalFooter}>
              <TouchableOpacity
                style={styles.detailCloseModalButton}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.detailCloseModalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
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
    return formatTime(dateString);
  };

  const getAudienceLabel = (aud: string) => {
    switch (aud) {
      case 'all': return 'All';
      case 'coaches': return 'Coaches';
      case 'members': return 'Members';
      default: return aud;
    }
  };

  const getAudienceColor = (aud: string) => {
    switch (aud) {
      case 'all': return Colors.jaiBlue; // Blue
      case 'coaches': return '#9B59B6'; // Purple
      case 'members': return '#27AE60'; // Green
      default: return Colors.jaiBlue;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Broadcasts</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.newButton}>
          <Text style={styles.newButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
        }
      >
        {broadcasts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📢</Text>
            <Text style={styles.emptyText}>No broadcasts yet</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => setModalVisible(true)}>
              <Text style={styles.emptyButtonText}>Send First Broadcast</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>📋 Broadcast History</Text>
            </View>

            {broadcasts.map((broadcast) => (
              <TouchableOpacity
                key={broadcast.id}
                style={styles.broadcastCard}
                onPress={() => handleBroadcastPress(broadcast)}
                activeOpacity={0.7}
              >
                <View style={styles.broadcastHeader}>
                  <View style={[styles.colorDot, { backgroundColor: getAudienceColor(broadcast.target_audience) }]} />
                  <Text style={styles.broadcastTitle}>{broadcast.title}</Text>
                  <Text style={styles.broadcastTime}>{getRelativeTime(broadcast.created_at)}</Text>
                </View>
                <View style={styles.audienceBadge}>
                  <Text style={styles.audienceBadgeText}>
                    To: {getAudienceLabel(broadcast.target_audience)}
                  </Text>
                </View>
                <Text style={styles.broadcastMessage} numberOfLines={2} ellipsizeMode="tail">
                  {broadcast.message}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* New Broadcast Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={resetModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Broadcast</Text>
              <TouchableOpacity onPress={resetModal}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Target Audience</Text>
            <View style={styles.audienceToggle}>
              {(['all', 'coaches', 'members'] as const).map((aud) => (
                <TouchableOpacity
                  key={aud}
                  style={[styles.audienceTab, audience === aud && styles.audienceTabActive]}
                  onPress={() => setAudience(aud)}
                >
                  <Text style={[styles.audienceText, audience === aud && styles.audienceTextActive]}>
                    {aud === 'all' ? 'All' : aud === 'coaches' ? 'Coaches' : 'Members'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter broadcast title..."
              placeholderTextColor={Colors.darkGray}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Enter your message..."
              placeholderTextColor={Colors.darkGray}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={resetModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendButton} onPress={handleSendBroadcast}>
                <Text style={styles.sendButtonText}>Send Broadcast</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  backButton: {
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: Colors.jaiBlue,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  newButton: {
    backgroundColor: Colors.jaiBlue,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
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
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: Colors.jaiBlue,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
  historyHeader: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  historyTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.lightGray,
  },
  broadcastCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 12,
  },
  broadcastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  broadcastTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
    flex: 1,
  },
  broadcastTime: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.darkGray,
  },
  audienceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: Colors.black,
  },
  audienceBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.lightGray,
  },
  broadcastMessage: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.darkCharcoal,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  closeButton: {
    fontSize: 24,
    color: Colors.lightGray,
    padding: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.lightGray,
    marginBottom: 6,
    marginTop: 10,
  },
  audienceToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: 4,
  },
  audienceTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  audienceTabActive: {
    backgroundColor: Colors.jaiBlue,
  },
  audienceText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.lightGray,
  },
  audienceTextActive: {
    color: Colors.white,
  },
  input: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    color: Colors.white,
    fontFamily: Fonts.regular,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.lg,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.lightGray,
  },
  sendButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.jaiBlue,
    alignItems: 'center',
  },
  sendButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.white,
  },
  detailModalOverlay: {
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
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailModalTitle: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
    flex: 1,
  },
  detailCloseButton: {
    padding: 4,
  },
  detailModalBody: {
    padding: Spacing.lg,
    maxHeight: 300,
  },
  detailAudienceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  detailAudienceBadgeText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
  detailMessage: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  detailMeta: {
    gap: 8,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailMetaText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.darkGray,
  },
  detailModalFooter: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  detailCloseModalButton: {
    backgroundColor: Colors.jaiBlue,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  detailCloseModalButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
});
