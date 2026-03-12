import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { Coach, AssignedCoach } from './types';

interface ClassEditModalProps {
  visible: boolean;
  editClassType: 'All-Levels' | 'Advanced' | 'Sparring';
  editTime: string;
  editDayOfWeek: string;
  assignedCoaches: AssignedCoach[];
  coaches: Coach[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onClassTypeChange: (type: 'All-Levels' | 'Advanced' | 'Sparring') => void;
  onTimeChange: (time: string) => void;
  onToggleCoachAssignment: (coachId: string) => void;
}

export const ClassEditModal: React.FC<ClassEditModalProps> = ({
  visible,
  editClassType,
  editTime,
  editDayOfWeek,
  assignedCoaches,
  coaches,
  saving,
  onClose,
  onSave,
  onClassTypeChange,
  onTimeChange,
  onToggleCoachAssignment,
}) => {
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
        <TouchableOpacity style={styles.editModalContent} activeOpacity={1}>
          {/* Header */}
          <View style={styles.editModalHeader}>
            <Text style={styles.editModalTitle}>Edit Class</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.editModalBody}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Class Type Selector */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>CLASS TYPE</Text>
              <View style={styles.classTypeButtons}>
                {(['All-Levels', 'Advanced', 'Sparring'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.classTypeButton,
                      editClassType === type && styles.classTypeButtonActive
                    ]}
                    onPress={() => onClassTypeChange(type)}
                  >
                    <Text style={[
                      styles.classTypeButtonText,
                      editClassType === type && styles.classTypeButtonTextActive
                    ]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Time */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>TIME</Text>
              <TextInput
                style={styles.formInput}
                value={editTime}
                onChangeText={onTimeChange}
                placeholder="18:30"
                placeholderTextColor={Colors.darkGray}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.formHelper}>24-hour format (e.g., 18:30 for 6:30 PM)</Text>
            </View>

            {/* Coaches */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>ASSIGN COACHES</Text>
              <Text style={styles.formHelper}>Tap to assign. First tap = Lead</Text>
              {coaches.length === 0 ? (
                <Text style={styles.noCoachesText}>No coaches available</Text>
              ) : (
                <View style={styles.coachSimpleList}>
                  {coaches.map((coach) => {
                    const assigned = assignedCoaches.find(c => c.coach_id === coach.id);
                    const isLead = assigned && assigned.order === 1;
                    return (
                      <TouchableOpacity
                        key={coach.id}
                        style={styles.coachSimpleItem}
                        onPress={() => onToggleCoachAssignment(coach.id)}
                      >
                        <View style={styles.coachSimpleLeft}>
                          <View style={[
                            styles.coachDot,
                            assigned && (isLead ? styles.coachDotLead : styles.coachDotAssistant)
                          ]} />
                          <Text style={[styles.coachSimpleName, assigned && styles.coachSimpleNameActive]}>
                            {assigned ? `${assigned.order}. ` : ''}{coach.full_name}
                          </Text>
                        </View>
                        {isLead && (
                          <View style={styles.leadBadgeSmall}>
                            <Text style={styles.leadBadgeSmallText}>LEAD</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalSaveButton, saving && { opacity: 0.7 }]}
                onPress={onSave}
                disabled={saving}
              >
                <Text style={styles.modalSaveButtonText}>
                  {saving ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={onClose}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
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
  editModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    maxHeight: '75%',
    marginBottom: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editModalTitle: {
    fontSize: 18,
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
    color: Colors.lightGray,
    marginBottom: 8,
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
  formHelper: {
    fontSize: 11,
    color: Colors.darkGray,
    marginBottom: Spacing.xs,
    marginTop: 2,
    fontStyle: 'italic',
  },
  noCoachesText: {
    fontSize: 13,
    color: Colors.darkGray,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  classTypeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  classTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  classTypeButtonActive: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  classTypeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  classTypeButtonTextActive: {
    color: Colors.white,
  },
  coachSimpleList: {
    gap: 0,
  },
  coachSimpleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  coachSimpleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  coachDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.darkGray,
  },
  coachDotLead: {
    backgroundColor: '#FFD700',
  },
  coachDotAssistant: {
    backgroundColor: Colors.lightGray,
  },
  coachSimpleName: {
    fontSize: 15,
    color: Colors.lightGray,
  },
  coachSimpleNameActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  leadBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#FFD700',
  },
  leadBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.lg,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: Colors.success,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
});
