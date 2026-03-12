import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { LeaveDetailModalProps } from './types';

export const LeaveDetailModal: React.FC<LeaveDetailModalProps> = ({
  visible,
  selectedLeave,
  approvalNotes,
  onClose,
  onApprove,
  onReject,
  onNotesChange,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.leaveModalContent}>
          <View style={styles.leaveModalHeader}>
            <Text style={styles.leaveModalTitle}>Leave Request</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {selectedLeave && (
            <>
              <ScrollView style={styles.leaveModalBody}>
                <View style={styles.leaveDetailRow}>
                  <Text style={styles.leaveDetailLabel}>Coach</Text>
                  <Text style={styles.leaveDetailValue}>{selectedLeave.coach?.full_name || 'Unknown'}</Text>
                </View>
                <View style={styles.leaveDetailRow}>
                  <Text style={styles.leaveDetailLabel}>Leave Type</Text>
                  <Text style={styles.leaveDetailValue}>
                    {selectedLeave.leave_type
                      ? selectedLeave.leave_type.charAt(0).toUpperCase() + selectedLeave.leave_type.slice(1)
                      : 'Not specified'}
                  </Text>
                </View>
                <View style={styles.leaveDetailRow}>
                  <Text style={styles.leaveDetailLabel}>Date Range</Text>
                  <Text style={styles.leaveDetailValue}>
                    {selectedLeave.start_date} - {selectedLeave.end_date}
                  </Text>
                </View>
                <View style={styles.leaveDetailRow}>
                  <Text style={styles.leaveDetailLabel}>Reason</Text>
                  <Text style={styles.leaveDetailValue}>{selectedLeave.reason}</Text>
                </View>
                <View style={styles.leaveDetailRow}>
                  <Text style={styles.leaveDetailLabel}>Applied</Text>
                  <Text style={styles.leaveDetailValue}>
                    {new Date(selectedLeave.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </Text>
                </View>

                <Text style={[styles.leaveDetailLabel, { marginTop: 16, marginBottom: 8 }]}>
                  Notes (optional):
                </Text>
                <TextInput
                  style={styles.leaveNotesInput}
                  placeholder="Add notes for the coach..."
                  placeholderTextColor={Colors.darkGray}
                  value={approvalNotes}
                  onChangeText={onNotesChange}
                  multiline
                  numberOfLines={3}
                />
              </ScrollView>

              <View style={styles.leaveActions}>
                <TouchableOpacity
                  style={[styles.leaveActionButton, { backgroundColor: Colors.error }]}
                  onPress={onReject}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.white} />
                  <Text style={styles.leaveActionText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.leaveActionButton, { backgroundColor: Colors.success }]}
                  onPress={onApprove}
                >
                  <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                  <Text style={styles.leaveActionText}>Approve</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  leaveModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: '70%',
    marginBottom: 100,
  },
  leaveModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  leaveModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
  leaveModalBody: {
    marginBottom: Spacing.md,
  },
  leaveDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  leaveDetailLabel: {
    fontSize: 13,
    color: Colors.lightGray,
    flex: 1,
  },
  leaveDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 2,
    textAlign: 'right',
  },
  leaveNotesInput: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: 14,
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  leaveActions: {
    flexDirection: 'row',
    gap: 12,
  },
  leaveActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  leaveActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
});
