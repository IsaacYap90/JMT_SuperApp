import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { Colors, Spacing, Fonts } from '../../../shared/constants/Colors';

interface Member {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  memberships?: {
    status: string;
    end_date: string;
  }[];
}

interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  session_type: string;
  coach: { full_name: string } | null;
}

export const AdminMembersScreen: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [ptSessions, setPtSessions] = useState<PTSession[]>([]);
  const [loadingPT, setLoadingPT] = useState(false);

  const fetchMembers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        memberships (status, end_date)
      `)
      .eq('role', 'member')
      .order('created_at', { ascending: false });

    if (data) {
      setMembers(data);
      setFilteredMembers(data);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    let filtered = members;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        m =>
          m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filter === 'active') {
      filtered = filtered.filter(
        m => m.memberships?.some(mem => mem.status === 'active')
      );
    } else if (filter === 'expired') {
      filtered = filtered.filter(
        m => !m.memberships?.some(mem => mem.status === 'active')
      );
    }

    setFilteredMembers(filtered);
  }, [searchQuery, filter, members]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMembers();
    setRefreshing(false);
  };

  const getMembershipStatus = (member: Member) => {
    const activeMembership = member.memberships?.find(m => m.status === 'active');
    if (activeMembership) {
      return { status: 'Active', color: Colors.success };
    }
    return { status: 'No Membership', color: Colors.darkGray };
  };

  const openMemberDetail = async (member: Member) => {
    setSelectedMember(member);
    setDetailVisible(true);
    setLoadingPT(true);
    setPtSessions([]);

    const { data } = await supabase
      .from('pt_sessions')
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        status,
        session_type,
        coach:coach_id (full_name)
      `)
      .eq('member_id', member.id)
      .order('scheduled_at', { ascending: false })
      .limit(20);

    if (data) {
      const formattedData = data.map((item: any) => ({
        ...item,
        coach: Array.isArray(item.coach) ? item.coach[0] : item.coach
      }));
      setPtSessions(formattedData as PTSession[]);
    }
    setLoadingPT(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getPTStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return Colors.success;
      case 'cancelled': return Colors.error;
      case 'scheduled': return Colors.jaiBlue;
      default: return Colors.darkGray;
    }
  };

  const renderMember = ({ item }: { item: Member }) => {
    const membershipInfo = getMembershipStatus(item);

    return (
      <TouchableOpacity style={styles.memberCard} onPress={() => openMemberDetail(item)}>
        <View style={styles.memberInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.full_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.memberDetails}>
            <Text style={styles.memberName}>{item.full_name || 'No Name'}</Text>
            <Text style={styles.memberEmail}>{item.email}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: membershipInfo.color + '30' }]}>
          <Text style={[styles.statusText, { color: membershipInfo.color }]}>{membershipInfo.status}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Members</Text>
        <Text style={styles.count}>{filteredMembers.length} total</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor={Colors.darkGray}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['all', 'active', 'expired'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Members List */}
      <FlatList
        data={filteredMembers}
        renderItem={renderMember}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No members found</Text>
          </View>
        }
      />

      {/* Member Detail Modal */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Member Details</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.lightGray} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {selectedMember && (
                <>
                  {/* Avatar & Name */}
                  <View style={styles.detailProfileSection}>
                    <View style={styles.detailAvatar}>
                      <Text style={styles.detailAvatarText}>
                        {selectedMember.full_name?.charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <Text style={styles.detailName}>{selectedMember.full_name || 'No Name'}</Text>
                    <View style={[
                      styles.detailStatusBadge,
                      { backgroundColor: getMembershipStatus(selectedMember).color + '20' }
                    ]}>
                      <View style={[
                        styles.detailStatusDot,
                        { backgroundColor: getMembershipStatus(selectedMember).color }
                      ]} />
                      <Text style={[
                        styles.detailStatusText,
                        { color: getMembershipStatus(selectedMember).color }
                      ]}>
                        {getMembershipStatus(selectedMember).status}
                      </Text>
                    </View>
                  </View>

                  {/* Info Card */}
                  <View style={styles.detailCard}>
                    <View style={styles.detailRow}>
                      <Ionicons name="mail-outline" size={18} color={Colors.jaiBlue} />
                      <View style={styles.detailRowContent}>
                        <Text style={styles.detailLabel}>Email</Text>
                        <Text style={styles.detailValue}>{selectedMember.email}</Text>
                      </View>
                    </View>

                    <View style={styles.detailDivider} />

                    <View style={styles.detailRow}>
                      <Ionicons name="call-outline" size={18} color={Colors.jaiBlue} />
                      <View style={styles.detailRowContent}>
                        <Text style={styles.detailLabel}>Phone</Text>
                        <Text style={styles.detailValue}>
                          {selectedMember.phone || 'Not provided'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailDivider} />

                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={18} color={Colors.jaiBlue} />
                      <View style={styles.detailRowContent}>
                        <Text style={styles.detailLabel}>Joined</Text>
                        <Text style={styles.detailValue}>
                          {formatDate(selectedMember.created_at)}
                        </Text>
                      </View>
                    </View>

                    {selectedMember.memberships?.some(m => m.status === 'active') && (
                      <>
                        <View style={styles.detailDivider} />
                        <View style={styles.detailRow}>
                          <Ionicons name="card-outline" size={18} color={Colors.jaiBlue} />
                          <View style={styles.detailRowContent}>
                            <Text style={styles.detailLabel}>Membership Expires</Text>
                            <Text style={styles.detailValue}>
                              {formatDate(selectedMember.memberships.find(m => m.status === 'active')!.end_date)}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}
                  </View>

                  {/* Emergency Contact */}
                  <View style={styles.detailCard}>
                    <Text style={styles.emergencyTitle}>Emergency Contact</Text>
                    {selectedMember.emergency_contact_name ? (
                      <>
                        <View style={styles.detailRow}>
                          <Ionicons name="person-outline" size={18} color={Colors.warning} />
                          <View style={styles.detailRowContent}>
                            <Text style={styles.detailLabel}>Name</Text>
                            <Text style={styles.detailValue}>{selectedMember.emergency_contact_name}</Text>
                          </View>
                        </View>

                        <View style={styles.detailDivider} />

                        <View style={styles.detailRow}>
                          <Ionicons name="call-outline" size={18} color={Colors.warning} />
                          <View style={styles.detailRowContent}>
                            <Text style={styles.detailLabel}>Phone</Text>
                            <Text style={styles.detailValue}>
                              {selectedMember.emergency_contact_phone || 'Not provided'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.detailDivider} />

                        <View style={styles.detailRow}>
                          <Ionicons name="people-outline" size={18} color={Colors.warning} />
                          <View style={styles.detailRowContent}>
                            <Text style={styles.detailLabel}>Relationship</Text>
                            <Text style={styles.detailValue}>
                              {selectedMember.emergency_contact_relationship || 'Not provided'}
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.emergencyEmpty}>No emergency contact on file</Text>
                    )}
                  </View>

                  {/* PT Sessions */}
                  <View style={styles.ptSection}>
                    <Text style={styles.ptSectionTitle}>PT Sessions</Text>
                    {loadingPT ? (
                      <ActivityIndicator color={Colors.jaiBlue} style={{ marginTop: 16 }} />
                    ) : ptSessions.length === 0 ? (
                      <View style={styles.ptEmpty}>
                        <Ionicons name="barbell-outline" size={32} color={Colors.darkGray} />
                        <Text style={styles.ptEmptyText}>No PT sessions</Text>
                      </View>
                    ) : (
                      ptSessions.map(session => (
                        <View key={session.id} style={styles.ptCard}>
                          <View style={styles.ptCardHeader}>
                            <Text style={styles.ptDate}>{formatDateTime(session.scheduled_at)}</Text>
                            <View style={[
                              styles.ptStatusBadge,
                              { backgroundColor: getPTStatusColor(session.status) + '20' }
                            ]}>
                              <Text style={[
                                styles.ptStatusText,
                                { color: getPTStatusColor(session.status) }
                              ]}>
                                {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.ptCardBody}>
                            <Text style={styles.ptCoach}>
                              Coach: {(session.coach as any)?.full_name || 'Unknown'}
                            </Text>
                            <Text style={styles.ptMeta}>
                              {session.session_type === 'solo' ? 'Solo' : 'Buddy'} · {session.duration_minutes} min
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}
            </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.white,
  },
  count: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchInput: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    color: Colors.white,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  filterText: {
    fontWeight: '500',
    fontSize: 14,
    color: Colors.lightGray,
  },
  filterTextActive: {
    color: Colors.white,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  memberCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  memberEmail: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.white,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: Colors.darkGray,
    fontSize: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '92%',
    maxHeight: '75%',
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: 100,
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
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  // Profile section
  detailProfileSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  detailAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailAvatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.white,
  },
  detailName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 8,
  },
  detailStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  detailStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailStatusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Info card
  detailCard: {
    backgroundColor: Colors.black,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  detailRowContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: Colors.darkGray,
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '500',
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  // Emergency contact
  emergencyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
    marginBottom: 4,
  },
  emergencyEmpty: {
    fontSize: 13,
    color: Colors.darkGray,
    paddingVertical: 8,
  },
  // PT Sessions section
  ptSection: {
    marginBottom: Spacing.md,
  },
  ptSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 12,
  },
  ptEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  ptEmptyText: {
    fontSize: 14,
    color: Colors.darkGray,
  },
  ptCard: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ptCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  ptDate: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  ptStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ptStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ptCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ptCoach: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  ptMeta: {
    fontSize: 12,
    color: Colors.darkGray,
  },
});
