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
import { PTSession } from './types';

interface PTDetailModalProps {
  visible: boolean;
  selectedPT: PTSession | null;
  isMasterAdmin: boolean;
  formatPTDateTime: (isoString: string) => { time: string; date: string };
  onClose: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onCopyToNextWeek: (session: PTSession) => void;
}

export const PTDetailModal: React.FC<PTDetailModalProps> = ({
  visible,
  selectedPT,
  isMasterAdmin,
  formatPTDateTime,
  onClose,
  onEdit,
  onApprove,
  onCancel,
  onDelete,
  onCopyToNextWeek,
}) => {
  if (!selectedPT) return null;

  const { time, date } = formatPTDateTime(selectedPT.scheduled_at);
  const canApprovePayment = selectedPT.coach_verified && selectedPT.member_verified && !selectedPT.payment_approved;
  const isPaid = selectedPT.payment_approved;

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
            <Text style={styles.detailModalTitle}>PT Session Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailModalBody}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Member Name */}
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={18} color={Colors.success} />
              <Text style={styles.detailLabel}>Member</Text>
              <Text style={styles.detailValue}>{selectedPT.member_name}</Text>
            </View>

            {/* Coach Name */}
            <View style={styles.detailRow}>
              <Ionicons name="fitness-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.detailLabel}>Coach</Text>
              <Text style={styles.detailValue}>{selectedPT.coach_name}</Text>
            </View>

            {/* Date */}
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{date}</Text>
            </View>

            {/* Time */}
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{time}</Text>
            </View>

            {/* Duration */}
            <View style={styles.detailRow}>
              <Ionicons name="hourglass-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>{selectedPT.duration_minutes} min</Text>
            </View>

            {/* Session Type */}
            <View style={styles.detailRow}>
              <Ionicons name="walk-outline" size={18} color={Colors.success} />
              <Text style={styles.detailLabel}>Type</Text>
              <Text style={styles.detailValue}>
                {selectedPT.session_type === 'buddy' && 'Buddy'}
                {selectedPT.session_type === 'house_call' && 'House Call'}
                {selectedPT.session_type === 'solo_package' && 'Solo Package'}
                {selectedPT.session_type === 'solo_single' && 'Solo Single'}
              </Text>
            </View>

            {/* Commission */}
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={18} color={Colors.success} />
              <Text style={styles.detailLabel}>Commission</Text>
              <Text style={[styles.detailValue, { color: Colors.success }]}>
                S${(selectedPT.commission_amount || 40).toFixed(2)}
              </Text>
            </View>

            {/* Status */}
            <View style={styles.detailRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={[styles.detailValue, {
                textTransform: 'capitalize',
                color: selectedPT.status === 'cancelled' ? Colors.warning : Colors.white
              }]}>
                {selectedPT.status}
              </Text>
            </View>

            {/* Verification Status */}
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <Ionicons name="shield-checkmark-outline" size={16} color={Colors.jaiBlue} />
                <Text style={styles.detailSectionTitle}>Verification Status</Text>
              </View>
              <View style={styles.verificationRow}>
                <View style={styles.verificationItem}>
                  <Ionicons
                    name={selectedPT.coach_verified ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={selectedPT.coach_verified ? Colors.success : Colors.darkGray}
                  />
                  <Text style={[styles.verificationText, selectedPT.coach_verified && styles.verificationTextActive]}>
                    Coach {selectedPT.coach_verified ? 'Verified' : 'Pending'}
                  </Text>
                </View>
                <View style={styles.verificationItem}>
                  <Ionicons
                    name={selectedPT.member_verified ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={selectedPT.member_verified ? Colors.success : Colors.darkGray}
                  />
                  <Text style={[styles.verificationText, selectedPT.member_verified && styles.verificationTextActive]}>
                    Member {selectedPT.member_verified ? 'Verified' : 'Pending'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Payment Status */}
            {isPaid && (
              <View style={[styles.detailSection, { backgroundColor: Colors.success + '20' }]}>
                <View style={styles.detailSectionHeader}>
                  <Ionicons name="checkmark-done-circle" size={16} color={Colors.success} />
                  <Text style={[styles.detailSectionTitle, { color: Colors.success }]}>Payment Approved</Text>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.editButton}
              onPress={onEdit}
            >
              <Ionicons name="create-outline" size={18} color={Colors.white} />
              <Text style={styles.editButtonText}>Edit Session</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.copyNextWeekButton}
              onPress={() => onCopyToNextWeek(selectedPT)}
            >
              <Ionicons name="copy-outline" size={18} color={Colors.white} />
              <Text style={styles.copyNextWeekButtonText}>Copy to Next Week</Text>
            </TouchableOpacity>

            {canApprovePayment && (
              <TouchableOpacity
                style={styles.saveButton}
                onPress={onApprove}
              >
                <Ionicons name="checkmark-done-circle-outline" size={18} color={Colors.white} />
                <Text style={styles.saveButtonText}>Approve Payment</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
            >
              <Ionicons name="close-circle-outline" size={18} color={Colors.white} />
              <Text style={styles.cancelButtonText}>Cancel Session</Text>
            </TouchableOpacity>

            {isMasterAdmin && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={onDelete}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.white} />
                <Text style={styles.deleteButtonText}>Delete Session</Text>
              </TouchableOpacity>
            )}

            {/* Close Button */}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={onClose}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
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
    paddingBottom: 100,
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
    width: 90,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  detailSection: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  verificationRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    backgroundColor: Colors.black,
    padding: Spacing.sm,
    borderRadius: 8,
  },
  verificationText: {
    fontSize: 13,
    color: Colors.darkGray,
    flex: 1,
  },
  verificationTextActive: {
    color: Colors.success,
    fontWeight: '600',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  copyNextWeekButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  copyNextWeekButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.warning,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  modalCloseButton: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
});
