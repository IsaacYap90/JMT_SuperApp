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
import { ClassItem, AssignedCoach, getClassLevel } from './types';

interface ClassDetailModalProps {
  visible: boolean;
  selectedClass: ClassItem | null;
  assignedCoaches: AssignedCoach[];
  enrolledCount: number;
  isMasterAdmin: boolean;
  formatTime: (time: string) => string;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export const ClassDetailModal: React.FC<ClassDetailModalProps> = ({
  visible,
  selectedClass,
  assignedCoaches,
  enrolledCount,
  isMasterAdmin,
  formatTime,
  onClose,
  onEdit,
  onCancel,
  onDelete,
}) => {
  if (!selectedClass) return null;

  const level = getClassLevel(selectedClass.name);

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
            <Text style={styles.detailModalTitle}>Class Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailModalBody}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Class Name */}
            <View style={styles.detailRow}>
              <Ionicons name="fitness-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.detailLabel}>Class</Text>
              <Text style={styles.detailValue}>{selectedClass.name}</Text>
            </View>

            {/* Level */}
            <View style={styles.detailRow}>
              <Ionicons name="barbell-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.detailLabel}>Level</Text>
              <Text style={styles.detailValue}>{level}</Text>
            </View>

            {/* Day */}
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Day</Text>
              <Text style={[styles.detailValue, { textTransform: 'capitalize' }]}>
                {selectedClass.day_of_week}
              </Text>
            </View>

            {/* Time */}
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>
                {formatTime(selectedClass.start_time)} - {formatTime(selectedClass.end_time)}
              </Text>
            </View>

            {/* Capacity */}
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Capacity</Text>
              <Text style={styles.detailValue}>{selectedClass.capacity}</Text>
            </View>

            {/* Enrolled */}
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.detailLabel}>Enrolled</Text>
              <Text style={styles.detailValue}>{enrolledCount} / {selectedClass.capacity}</Text>
            </View>

            {/* Assigned Coaches Section */}
            <View style={styles.detailSection}>
              <View style={styles.detailSectionHeader}>
                <Ionicons name="people-outline" size={16} color={Colors.jaiBlue} />
                <Text style={styles.detailSectionTitle}>Assigned Coaches</Text>
              </View>
              {assignedCoaches.length === 0 ? (
                <Text style={styles.noCoachesText}>No coaches assigned</Text>
              ) : (
                <View style={styles.coachList}>
                  {assignedCoaches.map((coach) => (
                    <View key={coach.coach_id} style={styles.coachListItem}>
                      <View style={styles.coachListLeft}>
                        <Text style={styles.coachListName}>{coach.full_name}</Text>
                      </View>
                      {coach.is_lead && (
                        <View style={styles.leadBadge}>
                          <Text style={styles.leadBadgeText}>Lead</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={styles.editButton}
              onPress={onEdit}
            >
              <Ionicons name="create-outline" size={18} color={Colors.white} />
              <Text style={styles.editButtonText}>Edit Class</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
            >
              <Ionicons name="close-circle-outline" size={18} color={Colors.white} />
              <Text style={styles.cancelButtonText}>Cancel Class</Text>
            </TouchableOpacity>

            {isMasterAdmin && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={onDelete}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.white} />
                <Text style={styles.deleteButtonText}>Delete Class</Text>
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
  noCoachesText: {
    fontSize: 13,
    color: Colors.darkGray,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  coachList: {
    gap: 8,
  },
  coachListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  coachListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coachListName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.white,
  },
  leadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFD700',
  },
  leadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
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
