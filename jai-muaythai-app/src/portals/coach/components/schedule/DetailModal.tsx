import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { ClassItem, PTSession, TimelineItem } from './types';
import { getClassLevel, isPTSessionPassed } from './utils';

interface DetailModalProps {
  visible: boolean;
  selectedItem: TimelineItem | null;
  userId?: string;
  enrolledCount: number;
  onClose: () => void;
  onMarkAttended: (session: PTSession) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  visible,
  selectedItem,
  userId,
  enrolledCount,
  onClose,
  onMarkAttended,
}) => {
  if (!selectedItem) return null;

  const isClass = selectedItem.type === 'class';
  const isPT = selectedItem.type === 'pt';
  const cls = isClass ? selectedItem.data as ClassItem : null;
  const session = isPT ? selectedItem.data as PTSession : null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.detailModalContent} activeOpacity={1}>
          {/* Header */}
          <View style={styles.detailModalHeader}>
            <Text style={styles.detailModalTitle}>
              {isClass ? 'Class Details' : 'PT Session Details'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.detailModalBody}>
            {/* Time */}
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{selectedItem.time}</Text>
            </View>

            {isClass && cls && (
              <>
                {/* Class Name */}
                <View style={styles.detailRow}>
                  <Ionicons name="fitness-outline" size={18} color={Colors.jaiBlue} />
                  <Text style={styles.detailLabel}>Class</Text>
                  <Text style={styles.detailValue}>{cls.name}</Text>
                </View>

                {/* Level */}
                <View style={styles.detailRow}>
                  <Ionicons name="barbell-outline" size={18} color={Colors.jaiBlue} />
                  <Text style={styles.detailLabel}>Level</Text>
                  <Text style={styles.detailValue}>{getClassLevel(cls.name)}</Text>
                </View>

                {/* Duration */}
                <View style={styles.detailRow}>
                  <Ionicons name="hourglass-outline" size={18} color={Colors.lightGray} />
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={styles.detailValue}>{cls.start_time} - {cls.end_time}</Text>
                </View>

                {/* Lead Coach */}
                <View style={styles.detailRow}>
                  <Ionicons name="person-outline" size={18} color={Colors.lightGray} />
                  <Text style={styles.detailLabel}>Lead Coach</Text>
                  <Text style={styles.detailValue}>{cls.lead_coach?.full_name || 'Unknown'}</Text>
                </View>

                {/* Enrollment */}
                <View style={styles.detailRow}>
                  <Ionicons name="people-outline" size={18} color={Colors.lightGray} />
                  <Text style={styles.detailLabel}>Enrolled</Text>
                  <Text style={styles.detailValue}>{enrolledCount} / {cls.capacity}</Text>
                </View>

                {/* Role indicator */}
                {cls.isMyClass ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
                    <Text style={styles.detailLabel}>Role</Text>
                    <Text style={[styles.detailValue, { color: Colors.success }]}>Your Class</Text>
                  </View>
                ) : cls.lead_coach_id !== userId ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="person-add-outline" size={18} color={Colors.warning} />
                    <Text style={styles.detailLabel}>Role</Text>
                    <Text style={[styles.detailValue, { color: Colors.warning }]}>Assistant</Text>
                  </View>
                ) : null}
              </>
            )}

            {isPT && session && (
              <>
                {/* Member Name */}
                <View style={styles.detailRow}>
                  <Ionicons name="person-outline" size={18} color={Colors.success} />
                  <Text style={styles.detailLabel}>Member</Text>
                  <Text style={styles.detailValue}>{session.member_name}</Text>
                </View>

                {/* Duration */}
                <View style={styles.detailRow}>
                  <Ionicons name="hourglass-outline" size={18} color={Colors.lightGray} />
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={styles.detailValue}>{session.duration_minutes} min</Text>
                </View>

                {/* Session Type */}
                <View style={styles.detailRow}>
                  <Ionicons name="walk-outline" size={18} color={Colors.success} />
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>
                    {session.session_type === 'buddy' && '👥 Buddy'}
                    {session.session_type === 'house_call' && '🏠 House Call'}
                    {session.session_type === 'solo_package' && 'Solo Package'}
                    {session.session_type === 'solo_single' && 'Solo Single'}
                  </Text>
                </View>

                {/* Commission */}
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={18} color={Colors.success} />
                  <Text style={styles.detailLabel}>Commission</Text>
                  <Text style={[styles.detailValue, { color: Colors.success }]}>
                    S${(session.commission_amount || 40).toFixed(2)}
                  </Text>
                </View>

                {/* Status */}
                <View style={styles.detailRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={Colors.lightGray} />
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, { textTransform: 'capitalize' }]}>
                    {session.status}
                  </Text>
                </View>

                {/* Mark Attended Button */}
                {isPTSessionPassed(session.scheduled_at) && !session.coach_verified && session.status === 'scheduled' && (
                  <TouchableOpacity
                    style={styles.modalMarkAttendedButton}
                    onPress={() => {
                      onClose();
                      onMarkAttended(session);
                    }}
                  >
                    <Ionicons name="checkmark-done" size={18} color={Colors.white} />
                    <Text style={styles.modalMarkAttendedButtonText}>Mark as Attended</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  detailModalContent: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  detailModalBody: {
    padding: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.lightGray,
    marginLeft: 12,
    width: 80,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  modalMarkAttendedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  modalMarkAttendedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
});
