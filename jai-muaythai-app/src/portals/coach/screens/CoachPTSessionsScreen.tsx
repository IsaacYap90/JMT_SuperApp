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
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';
import { PTSession, PTSessionType, VerificationStatus } from '../../../types';

// Session type configuration
const SESSION_TYPE_CONFIG: Record<PTSessionType, { icon: string; badgeIcon: string; badgeColor: string; bgColor: string; label: string; commissionColor: string; showBadge: boolean }> = {
  solo_package: {
    icon: 'person-outline',
    badgeIcon: 'person',
    badgeColor: Colors.jaiBlue,
    bgColor: Colors.jaiBlue + '20',
    label: 'Package',
    commissionColor: Colors.white,
    showBadge: false, // No badge for solo_package (default)
  },
  solo_single: {
    icon: 'person-outline',
    badgeIcon: 'person',
    badgeColor: '#FFB300',
    bgColor: '#FFB30020',
    label: 'Single',
    commissionColor: '#FFB300',
    showBadge: true,
  },
  buddy: {
    icon: 'people-outline',
    badgeIcon: 'people',
    badgeColor: '#FF6B35',
    bgColor: '#FF6B3520',
    label: 'Buddy',
    commissionColor: '#FF6B35',
    showBadge: true,
  },
  house_call: {
    icon: 'home-outline',
    badgeIcon: 'home',
    badgeColor: Colors.success,
    bgColor: Colors.success + '20',
    label: 'House Call',
    commissionColor: Colors.success,
    showBadge: true,
  },
};

// Get session type from session or default to solo_package
const getSessionType = (session: PTSession): PTSessionType => {
  const validTypes: PTSessionType[] = ['solo_package', 'solo_single', 'buddy', 'house_call'];
  const type = session.session_type as PTSessionType;
  return validTypes.includes(type) ? type : 'solo_package';
};

// Get session type config
const getSessionTypeConfig = (session: PTSession) => {
  const type = getSessionType(session);
  return SESSION_TYPE_CONFIG[type];
};

// Get commission amount
const getCommission = (session: PTSession): number => {
  return session.commission_amount ?? (session.session_price || 90) * 0.5;
};
const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const hours = sgDate.getUTCHours();
  const minutes = sgDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const isSessionPast = (scheduledAt: string) => {
  return new Date(scheduledAt) < new Date();
};

// Get verification status badge info
const getVerificationBadge = (session: PTSession): { color: string; bgColor: string; text: string; icon: string } => {
  if (session.payment_approved) {
    return {
      color: '#0096FF',
      bgColor: '#0096FF20',
      text: 'Paid',
      icon: 'checkmark-circle',
    };
  }
  if (session.coach_verified && session.member_verified) {
    return {
      color: Colors.success,
      bgColor: Colors.success + '20',
      text: 'Verified',
      icon: 'checkmark-done-circle',
    };
  }
  if (session.coach_verified && !session.member_verified) {
    return {
      color: '#FFB300',
      bgColor: '#FFB30020',
      text: 'Waiting for Member',
      icon: 'time',
    };
  }
  if (isSessionPast(session.scheduled_at) && session.status === 'scheduled') {
    return {
      color: '#FF6B35',
      bgColor: '#FF6B3520',
      text: 'Mark Attended',
      icon: 'checkmark-circle-outline',
    };
  }
  return {
    color: '#FF6B35',
    bgColor: '#FF6B3520',
    text: 'Upcoming',
    icon: 'calendar-outline',
  };
};

export const CoachPTSessionsScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<PTSession[]>([]);
  const [todaySessions, setTodaySessions] = useState<PTSession[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<PTSession[]>([]);
  const [completedSessions, setCompletedSessions] = useState<PTSession[]>([]);
  const [earningsSummary, setEarningsSummary] = useState({
    pendingVerification: 0,
    pendingPayment: 0,
    paidThisWeek: 0,
    totalPending: 0,
  });

  // Cancellation dialog state
  const [cancellationModalVisible, setCancellationModalVisible] = useState(false);
  const [sessionToCancel, setSessionToCancel] = useState<PTSession | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<PTSession | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState('60');
  const [editSessionType, setEditSessionType] = useState<PTSessionType>('solo_package');
  const [editMemberId, setEditMemberId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const formatCurrency = (amount: number) => {
    return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fetchSessions = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Fetch all PT sessions for this coach
      const { data, error } = await supabase
        .from('pt_sessions')
        .select(`
          id,
          coach_id,
          member_id,
          scheduled_at,
          duration_minutes,
          status,
          session_price,
          session_type,
          commission_amount,
          coach_verified,
          member_verified,
          verification_date,
          payment_approved,
          approved_at,
          payment_amount,
          package_id,
          member:member_id(full_name, email)
        `)
        .eq('coach_id', user.id)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      // For buddy sessions, fetch additional members
      const sessionIds = (data || []).map((s: any) => s.id);
      let buddyMembersMap: Record<string, string[]> = {};

      if (sessionIds.length > 0) {
        const { data: buddyData } = await supabase
          .from('pt_session_buddy_members')
          .select('session_id, member_id')
          .in('session_id', sessionIds);

        if (buddyData) {
          // Get member names for buddy members
          const memberIds = [...new Set(buddyData.map(b => b.member_id))];
          if (memberIds.length > 0) {
            const { data: members } = await supabase
              .from('users')
              .select('id, full_name')
              .in('id', memberIds);

            const memberNameMap = Object.fromEntries(
              (members || []).map(m => [m.id, m.full_name])
            );

            // Group buddy members by session
            buddyData.forEach(b => {
              if (!buddyMembersMap[b.session_id]) {
                buddyMembersMap[b.session_id] = [];
              }
              if (memberNameMap[b.member_id]) {
                buddyMembersMap[b.session_id].push(memberNameMap[b.member_id]);
              }
            });
          }
        }
      }

      const typedSessions: PTSession[] = (data || []).map((s: any) => ({
        ...s,
        member_name: s.member?.full_name || 'Unknown Member',
        member_email: s.member?.email || '',
        buddy_members: buddyMembersMap[s.id] || [],
      }));

      setSessions(typedSessions);

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      // Split into categories
      const todayList: PTSession[] = [];
      const upcoming: PTSession[] = [];
      const completed: PTSession[] = [];
      let pendingVer = 0;
      let pendingPay = 0;
      let paidWeek = 0;

      // Calculate start of current week (Sunday)
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);

      typedSessions.forEach((session) => {
        const sessionDate = new Date(session.scheduled_at);
        const sessionDateStr = sessionDate.toISOString().split('T')[0];

        // Calculate earnings using commission_amount
        const commission = session.payment_amount ?? getCommission(session);

        if (session.payment_approved && session.approved_at) {
          const approvedDate = new Date(session.approved_at);
          if (approvedDate >= weekStart) {
            paidWeek += commission;
          }
        }

        if (!session.payment_approved) {
          if (session.coach_verified && session.member_verified) {
            pendingPay += commission;
          } else if (session.coach_verified) {
            pendingVer += commission;
          }
        }

        // Categorize sessions
        if (sessionDateStr === todayStr) {
          todayList.push(session);
        } else if (sessionDate > now) {
          upcoming.push(session);
        } else {
          completed.push(session);
        }
      });

      setTodaySessions(todayList);
      setUpcomingSessions(upcoming);
      setCompletedSessions(completed.slice(-10).reverse()); // Show last 10 completed

      setEarningsSummary({
        pendingVerification: Math.round(pendingVer * 100) / 100,
        pendingPayment: Math.round(pendingPay * 100) / 100,
        paidThisWeek: Math.round(paidWeek * 100) / 100,
        totalPending: Math.round((pendingVer + pendingPay) * 100) / 100,
      });

    } catch (error) {
      console.error('Error fetching PT sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const handleMarkAttended = async (session: PTSession) => {
    Alert.alert(
      'Mark as Attended',
      `Confirm that you conducted the PT session with ${session.member_name} on ${formatDate(session.scheduled_at)} at ${formatDateTime(session.scheduled_at)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('pt_sessions')
                .update({
                  coach_verified: true,
                  verification_date: new Date().toISOString(),
                  // Keep status as 'scheduled' until member verifies
                })
                .eq('id', session.id);

              if (error) throw error;

              Alert.alert('Success', 'Session marked as attended. Waiting for member verification.');
              fetchSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update session');
            }
          },
        },
      ]
    );
  };

  const handleUndoVerification = async (session: PTSession) => {
    Alert.alert(
      'Undo Verification',
      'Remove your verification from this session? This will allow you to mark it as attended again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('pt_sessions')
                .update({
                  coach_verified: false,
                  verification_date: null,
                })
                .eq('id', session.id);

              if (error) throw error;
              fetchSessions();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update session');
            }
          },
        },
      ]
    );
  };

  const handleCancelClick = (session: PTSession) => {
    setSessionToCancel(session);
    setCancellationReason('');
    setCancellationModalVisible(true);
  };

  const handleConfirmCancellation = async () => {
    if (!sessionToCancel || !user?.id) return;

    if (!cancellationReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for cancellation.');
      return;
    }

    setCancelling(true);
    try {
      // Update the session as cancelled
      const { error } = await supabase
        .from('pt_sessions')
        .update({
          status: 'cancelled',
          cancelled_by: user.id,
          cancellation_reason: cancellationReason.trim(),
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', sessionToCancel.id);

      if (error) throw error;

      // Create notifications for admin and member
      const notifications = [
        {
          user_id: (await getMasterAdminId()) || '00000000-0000-0000-0000-000000000000',
          title: 'PT Session Cancelled',
          message: `${user.full_name || 'Coach'} cancelled session with ${sessionToCancel.member_name} on ${formatDate(sessionToCancel.scheduled_at)} at ${formatDateTime(sessionToCancel.scheduled_at)}. Reason: ${cancellationReason.trim()}`,
          notification_type: 'pt_cancelled',
          is_read: false,
        },
        {
          user_id: sessionToCancel.member_id,
          title: 'PT Session Cancelled',
          message: `Your PT session on ${formatDate(sessionToCancel.scheduled_at)} at ${formatDateTime(sessionToCancel.scheduled_at)} has been cancelled. Reason: ${cancellationReason.trim()}`,
          notification_type: 'pt_cancelled',
          is_read: false,
        },
      ];

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error('Error creating notification:', notifError);
      }

      setCancellationModalVisible(false);
      setSessionToCancel(null);
      setCancellationReason('');
      Alert.alert('Session Cancelled', 'The session has been cancelled. The admin has been notified.');
      fetchSessions();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to cancel session');
    } finally {
      setCancelling(false);
    }
  };

  // Helper to get a master admin ID for notifications
  const getMasterAdminId = async (): Promise<string | null> => {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'master_admin')
      .limit(1)
      .single();
    return data?.id || null;
  };

  // Fetch available members for edit modal
  const fetchMembers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'member')
      .eq('is_active', true)
      .order('full_name');
    setMembers(data || []);
  };

  // Handle edit button press
  const handleEditPress = (session: PTSession) => {
    setSessionToEdit(session);

    // Parse scheduled_at into date and time in Singapore timezone
    const scheduledDate = new Date(session.scheduled_at);
    const sgDate = new Date(scheduledDate.getTime() + 8 * 60 * 60 * 1000);
    const dateStr = sgDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const hours = sgDate.getUTCHours();
    const minutes = sgDate.getUTCMinutes();
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    setEditDate(dateStr);
    setEditTime(timeStr);
    setEditDuration(session.duration_minutes.toString());
    setEditSessionType(session.session_type);
    setEditMemberId(session.member_id);
    setEditNotes(session.notes || '');

    fetchMembers();
    setEditModalVisible(true);
  };

  // Get member name by ID
  const getMemberName = (memberId: string): string => {
    const member = members.find(m => m.id === memberId);
    return member?.full_name || 'Unknown Member';
  };

  // Save edited session
  const handleSaveEdit = async () => {
    if (!sessionToEdit || !user) return;

    // Validation
    if (!editDate || !editTime) {
      Alert.alert('Error', 'Please enter date and time');
      return;
    }

    const duration = parseInt(editDuration);
    if (isNaN(duration) || duration < 15 || duration > 180) {
      Alert.alert('Error', 'Duration must be between 15 and 180 minutes');
      return;
    }

    if (!editMemberId) {
      Alert.alert('Error', 'Please select a member');
      return;
    }

    // Validate time format
    const timeMatch = editTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      Alert.alert('Error', 'Time must be in HH:MM format (e.g., 14:30)');
      return;
    }

    setSaving(true);

    try {
      // Parse date and time in Singapore timezone
      const [hours, minutes] = editTime.split(':').map(Number);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        Alert.alert('Error', 'Invalid time. Hours must be 0-23, minutes must be 0-59');
        setSaving(false);
        return;
      }

      const dateTime = new Date(`${editDate}T00:00:00Z`);
      dateTime.setUTCHours(hours, minutes, 0, 0);

      // Convert to UTC for database (subtract 8 hours)
      const utcDateTime = new Date(dateTime.getTime() - 8 * 60 * 60 * 1000);

      // Calculate commission based on session type
      const commissionMap: Record<PTSessionType, number> = {
        solo_package: 40,
        solo_single: 50,
        buddy: 60,
        house_call: 70,
      };
      const commission = commissionMap[editSessionType];

      // Update session
      const { error } = await supabase
        .from('pt_sessions')
        .update({
          scheduled_at: utcDateTime.toISOString(),
          duration_minutes: duration,
          session_type: editSessionType,
          commission_amount: commission,
          member_id: editMemberId,
          notes: editNotes.trim() || null,
          edited_by: user.id,
          edited_at: new Date().toISOString(),
          edit_count: (sessionToEdit.edit_count || 0) + 1,
        })
        .eq('id', sessionToEdit.id);

      if (error) throw error;

      // Create notification for admin
      const adminId = await getMasterAdminId();
      if (adminId) {
        await supabase.from('notifications').insert({
          user_id: adminId,
          title: 'PT Session Updated',
          message: `${user.full_name} edited session with ${getMemberName(editMemberId)} - ${editDate} at ${editTime}`,
          notification_type: 'booking',
          is_read: false,
        });
      }

      Alert.alert('Success', 'Session updated successfully!');
      setEditModalVisible(false);
      fetchSessions();
    } catch (error: any) {
      console.error('Error updating session:', error);
      Alert.alert('Error', error.message || 'Failed to update session');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchSessions();

    // Set up realtime subscription for PT sessions
    const channel = supabase
      .channel('pt_sessions_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'pt_sessions',
          filter: `coach_id=eq.${user?.id}`, // Only listen to this coach's sessions
        },
        (payload) => {
          console.log('PT Session change detected:', payload);
          // Refresh sessions when any change is detected
          fetchSessions();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSessions, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  };

  // Render session card with verification status
  const renderSessionCard = (session: PTSession, showActions: boolean = true) => {
    const badge = getVerificationBadge(session);
    const typeConfig = getSessionTypeConfig(session);
    const isPast = isSessionPast(session.scheduled_at);
    const canVerify = isPast && !session.coach_verified && session.status === 'scheduled';
    const canUndo = session.coach_verified && !session.member_verified;
    // Cancel only allowed for scheduled sessions that haven't been verified yet
    const canCancel = session.status === 'scheduled' && !session.cancelled_at && !session.coach_verified;
    // Edit only allowed for scheduled sessions that haven't been verified yet
    const canEdit = session.status === 'scheduled' && !session.cancelled_at && !session.coach_verified;
    const isCancelled = !!session.cancelled_at;
    const isEdited = (session.edit_count || 0) > 0;
    const commission = getCommission(session);

    return (
      <View key={session.id} style={[styles.sessionCard, isCancelled && styles.cancelledSessionCard]}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionDateTime}>
            <Text style={[styles.sessionDate, isCancelled && styles.cancelledText]}>{formatDate(session.scheduled_at)}</Text>
            <Text style={[styles.sessionTime, isCancelled && styles.cancelledText]}>{formatDateTime(session.scheduled_at)}</Text>
          </View>

          {/* Session Type Badge */}
          {typeConfig.showBadge && (
            <View style={[styles.typeBadge, { backgroundColor: typeConfig.bgColor }]}>
              <Ionicons name={typeConfig.badgeIcon as any} size={12} color={typeConfig.badgeColor} />
              <Text style={[styles.typeBadgeText, { color: typeConfig.badgeColor }]}>{typeConfig.label}</Text>
            </View>
          )}

          {/* Cancelled Badge */}
          {isCancelled && (
            <View style={styles.cancelledBadge}>
              <Ionicons name="close-circle" size={12} color="#FF6B6B" />
              <Text style={styles.cancelledBadgeText}>CANCELLED</Text>
            </View>
          )}

          {/* Edited Badge */}
          {isEdited && !isCancelled && (
            <View style={styles.editedBadge}>
              <Ionicons name="create-outline" size={12} color={Colors.warning} />
              <Text style={styles.editedBadgeText}>EDITED</Text>
            </View>
          )}

          {/* Coach Verified Badge */}
          {session.coach_verified && !isCancelled && (
            <View style={styles.coachVerifiedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
              <Text style={styles.coachVerifiedBadgeText}>Verified</Text>
            </View>
          )}

          {/* Status Badge */}
          {!isCancelled && (
            <View style={[styles.statusBadge, { backgroundColor: badge.bgColor }]}>
              <Ionicons name={badge.icon as any} size={12} color={badge.color} />
              <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.text}</Text>
            </View>
          )}
        </View>

        <View style={styles.sessionInfo}>
          {/* Member name with optional buddy members */}
          <View style={styles.memberRow}>
            <Ionicons name={typeConfig.icon as any} size={16} color={isCancelled ? Colors.darkGray : Colors.lightGray} />
            <Text style={[styles.memberName, isCancelled && styles.cancelledText]}>
              {session.member_name}
              {session.buddy_members && session.buddy_members.length > 0 && ` & ${session.buddy_members.join(' & ')}`}
            </Text>
          </View>

          {/* Commission display */}
          <View style={styles.commissionRow}>
            <Text style={[styles.commissionText, { color: typeConfig.commissionColor }, isCancelled && styles.cancelledText]}>
              {formatCurrency(commission)}
            </Text>
          </View>
        </View>

        {/* Cancellation reason display */}
        {isCancelled && session.cancellation_reason && (
          <View style={styles.cancellationReasonContainer}>
            <Ionicons name="information-circle-outline" size={14} color="#FF6B6B" />
            <Text style={styles.cancellationReasonText}>
              Cancelled: {session.cancellation_reason}
            </Text>
          </View>
        )}

        {/* Verification status details */}
        {(session.coach_verified || session.member_verified) && !isCancelled && (
          <View style={styles.verificationDetails}>
            {session.coach_verified && (
              <View style={styles.verificationItem}>
                <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                <Text style={styles.verificationText}>You verified on {session.verification_date ? new Date(session.verification_date).toLocaleDateString() : 'N/A'}</Text>
              </View>
            )}
            {session.member_verified ? (
              <View style={styles.verificationItem}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={styles.verificationText}>Member verified</Text>
              </View>
            ) : (
              <View style={styles.verificationItem}>
                <Ionicons name="time-outline" size={14} color="#FFB300" />
                <Text style={styles.verificationText}>Waiting for member verification</Text>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        {showActions && (
          <View style={styles.actionRow}>
            {canVerify && (
              <TouchableOpacity
                style={styles.verifyButton}
                onPress={() => handleMarkAttended(session)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
                <Text style={styles.verifyButtonText}>Mark as Attended</Text>
              </TouchableOpacity>
            )}
            {canUndo && (
              <TouchableOpacity
                style={styles.undoButton}
                onPress={() => handleUndoVerification(session)}
              >
                <Ionicons name="refresh-circle-outline" size={18} color="#FF6B6B" />
                <Text style={styles.undoButtonText}>Undo</Text>
              </TouchableOpacity>
            )}
            {canEdit && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleEditPress(session)}
              >
                <Ionicons name="create-outline" size={18} color={Colors.jaiBlue} />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => handleCancelClick(session)}
              >
                <Ionicons name="close-circle-outline" size={18} color="#FF6B6B" />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
            {!canVerify && !canUndo && !canCancel && session.coach_verified && !session.member_verified && !isCancelled && (
              <Text style={styles.waitingNote}>
                Note: Member portal will allow members to verify attendance. For now, a Master Admin can verify on their behalf.
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  // Render earnings summary card
  const [showBreakdown, setShowBreakdown] = useState(false);

  const renderEarningsSummary = () => (
    <View style={styles.earningsSummaryCard}>
      <LinearGradient
        colors={[Colors.jaiBlue + '20', Colors.neonPurple + '10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.earningsGradient}
      >
        <View style={styles.takeHomeContainer}>
          <Text style={styles.takeHomeLabel}>TAKE HOME THIS WEEK</Text>
          <Text style={styles.takeHomeAmount}>{formatCurrency(earningsSummary.paidThisWeek)}</Text>
        </View>

        <TouchableOpacity 
          style={styles.breakdownToggle} 
          onPress={() => setShowBreakdown(!showBreakdown)}
        >
          <Text style={styles.breakdownToggleText}>
            {showBreakdown ? 'Hide Details' : 'See Breakdown'}
          </Text>
          <Ionicons name={showBreakdown ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.jaiBlue} />
        </TouchableOpacity>

        {showBreakdown && (
          <View style={styles.breakdownContainer}>
            <View style={styles.earningsRow}>
              <View style={styles.earningsItem}>
                <View style={[styles.earningsDot, { backgroundColor: '#FFB300' }]} />
                <Text style={styles.earningsLabel}>Pending Verification</Text>
                <Text style={styles.earningsValue}>{formatCurrency(earningsSummary.pendingVerification)}</Text>
              </View>
              <View style={styles.earningsItem}>
                <View style={[styles.earningsDot, { backgroundColor: Colors.success }]} />
                <Text style={styles.earningsLabel}>Pending Payment</Text>
                <Text style={styles.earningsValue}>{formatCurrency(earningsSummary.pendingPayment)}</Text>
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Pending</Text>
              <Text style={styles.totalValue}>{formatCurrency(earningsSummary.totalPending)}</Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );

  // Render cancellation modal
  const renderCancellationModal = () => (
    <Modal
      transparent
      visible={cancellationModalVisible}
      animationType="fade"
      onRequestClose={() => setCancellationModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.modalContainer}
        activeOpacity={1}
        onPress={() => setCancellationModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalContent} activeOpacity={1}>
          <Text style={styles.modalTitle}>Cancel Session</Text>

          {sessionToCancel && (
            <View style={styles.modalSessionInfo}>
              <Text style={styles.modalSessionText}>
                {sessionToCancel.member_name}
              </Text>
              <Text style={styles.modalSessionText}>
                {formatDate(sessionToCancel.scheduled_at)} at {formatDateTime(sessionToCancel.scheduled_at)}
              </Text>
            </View>
          )}

          <Text style={styles.modalLabel}>Reason for cancellation *</Text>
          <TextInput
            style={styles.modalTextInput}
            placeholder="Please provide a reason..."
            placeholderTextColor={Colors.darkGray}
            value={cancellationReason}
            onChangeText={setCancellationReason}
            multiline
            numberOfLines={4}
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => setCancellationModalVisible(false)}
            >
              <Text style={styles.modalCancelButtonText}>Keep Session</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalConfirmButton]}
              onPress={handleConfirmCancellation}
              disabled={cancelling}
            >
              <Text style={styles.modalConfirmButtonText}>
                {cancelling ? 'Cancelling...' : 'Cancel Session'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // Render edit modal
  const renderEditModal = () => (
    <Modal
      visible={editModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setEditModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setEditModalVisible(false)}
      >
        <TouchableOpacity style={styles.editModalContent} activeOpacity={1}>
          <View style={styles.modalHeader}>
            <Text style={styles.editModalTitle}>Edit PT Session</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Ionicons name="close" size={24} color={Colors.lightGray} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.editModalBody} showsVerticalScrollIndicator={false}>
            {/* Date Field */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Date</Text>
              <TextInput
                style={styles.formInput}
                value={editDate}
                onChangeText={setEditDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.darkGray}
              />
            </View>

            {/* Time Field */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Time (24h format)</Text>
              <TextInput
                style={styles.formInput}
                value={editTime}
                onChangeText={setEditTime}
                placeholder="14:30"
                placeholderTextColor={Colors.darkGray}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {/* Duration Field */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Duration (minutes)</Text>
              <TextInput
                style={styles.formInput}
                value={editDuration}
                onChangeText={setEditDuration}
                placeholder="60"
                placeholderTextColor={Colors.darkGray}
                keyboardType="number-pad"
              />
            </View>

            {/* Session Type Picker */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Session Type</Text>
              <View style={styles.sessionTypePicker}>
                {(['solo_package', 'solo_single', 'buddy', 'house_call'] as PTSessionType[]).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.sessionTypeOption,
                      editSessionType === type && styles.sessionTypeOptionActive
                    ]}
                    onPress={() => setEditSessionType(type)}
                  >
                    <Text style={[
                      styles.sessionTypeText,
                      editSessionType === type && styles.sessionTypeTextActive
                    ]}>
                      {type.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Member Selector */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Member</Text>
              <ScrollView style={styles.memberList} nestedScrollEnabled>
                {members.map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.memberOption,
                      editMemberId === member.id && styles.memberOptionSelected
                    ]}
                    onPress={() => setEditMemberId(member.id)}
                  >
                    <View>
                      <Text style={styles.modalMemberName}>{member.full_name}</Text>
                      <Text style={styles.memberEmail}>{member.email}</Text>
                    </View>
                    <Ionicons
                      name={editMemberId === member.id ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={editMemberId === member.id ? Colors.success : Colors.lightGray}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Notes Field */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.formInput, { minHeight: 80 }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add any notes..."
                placeholderTextColor={Colors.darkGray}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalButtonsRow}>
            <TouchableOpacity
              style={[styles.modalActionButton, styles.modalCancelActionButton]}
              onPress={() => setEditModalVisible(false)}
            >
              <Text style={styles.modalCancelActionButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalActionButton, styles.modalSaveButton]}
              onPress={handleSaveEdit}
              disabled={saving}
            >
              <Text style={styles.modalSaveButtonText}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

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
          <Text style={styles.title}>PT Sessions</Text>
        </View>

        {/* Cancellation Modal */}
        {renderCancellationModal()}

        {/* Edit Modal */}
        {renderEditModal()}

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
          }
        >
          {/* Earnings Summary */}
          {renderEarningsSummary()}

          {/* Today's Sessions */}
          {todaySessions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="today-outline" size={18} color={Colors.jaiBlue} />
                <Text style={styles.sectionTitle}>Today</Text>
              </View>
              {todaySessions.map((session) => renderSessionCard(session))}
            </View>
          )}

          {/* Upcoming Sessions */}
          {upcomingSessions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar-outline" size={18} color={Colors.neonPurple} />
                <Text style={styles.sectionTitle}>Upcoming</Text>
              </View>
              {upcomingSessions.map((session) => renderSessionCard(session))}
            </View>
          )}

          {/* Completed Sessions */}
          {completedSessions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
                <Text style={styles.sectionTitle}>Recent Sessions</Text>
              </View>
              {completedSessions.map((session) => renderSessionCard(session))}
            </View>
          )}

          {sessions.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="fitness-outline" size={48} color={Colors.darkGray} />
              <Text style={styles.emptyText}>No PT sessions scheduled</Text>
              <Text style={styles.emptySubtext}>Your upcoming sessions will appear here</Text>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
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
  // Earnings Summary
  earningsSummaryCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  earningsGradient: {
    padding: Spacing.md,
  },
  earningsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: Spacing.md,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  earningsItem: {
    alignItems: 'center',
    flex: 1,
  },
  earningsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  earningsLabel: {
    fontSize: 10,
    color: Colors.darkGray,
    textAlign: 'center',
    marginBottom: 2,
  },
  earningsValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalLabel: {
    fontSize: 13,
    color: Colors.lightGray,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.neonGreen,
  },
  // Sections
  section: {
    marginBottom: Spacing.lg,
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
    color: Colors.white,
  },
  // Session Card
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
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sessionDateTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionDate: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  sessionTime: {
    fontSize: 12,
    color: Colors.darkGray,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Session Type Badge
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sessionInfo: {
    marginBottom: Spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 12,
    color: Colors.darkGray,
  },
  commissionRow: {
    marginTop: 4,
  },
  commissionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Verification details
  verificationDetails: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 8,
    marginBottom: Spacing.sm,
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  verificationText: {
    fontSize: 11,
    color: Colors.lightGray,
  },
  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  verifyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.success,
    paddingVertical: 10,
    borderRadius: 8,
  },
  verifyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  undoButtonText: {
    fontSize: 12,
    color: '#FF6B6B',
  },
  waitingNote: {
    fontSize: 10,
    color: Colors.darkGray,
    fontStyle: 'italic',
    flex: 1,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.darkGray,
    marginTop: 4,
  },
  // Cancelled session styles
  cancelledSessionCard: {
    opacity: 0.6,
    borderColor: '#FF6B6B',
  },
  cancelledText: {
    textDecorationLine: 'line-through',
    color: Colors.darkGray,
  },
  cancelledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FF6B6B20',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  cancelledBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  cancellationReasonContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FF6B6B10',
    borderRadius: 8,
    padding: 8,
    marginBottom: Spacing.sm,
  },
  cancellationReasonText: {
    fontSize: 11,
    color: '#FF6B6B',
    flex: 1,
    fontStyle: 'italic',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  cancelButtonText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  // Cancellation Modal
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: Spacing.lg,
    width: '85%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: Spacing.md,
  },
  modalSessionInfo: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalSessionText: {
    fontSize: 13,
    color: Colors.lightGray,
    marginBottom: 4,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  modalTextInput: {
    backgroundColor: Colors.black,
    borderRadius: 8,
    padding: Spacing.md,
    color: Colors.white,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modalConfirmButton: {
    backgroundColor: '#FF6B6B',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  // Coach Verified Badge
  coachVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.success + '20',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  coachVerifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.success,
  },
  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Edited Badge
  editedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.warning + '20',
  },
  editedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.warning,
  },
  // Edit Button
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.jaiBlue + '20',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '40',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.jaiBlue,
  },
  // Edit Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
  editModalBody: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  formInput: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionTypePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sessionTypeOption: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  sessionTypeOptionActive: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  sessionTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  sessionTypeTextActive: {
    color: Colors.white,
  },
  memberList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  memberOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberOptionSelected: {
    backgroundColor: Colors.success + '15',
  },
  modalMemberName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  memberEmail: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 2,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalActionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelActionButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelActionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  modalSaveButton: {
    backgroundColor: Colors.jaiBlue,
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
});

export default CoachPTSessionsScreen;
