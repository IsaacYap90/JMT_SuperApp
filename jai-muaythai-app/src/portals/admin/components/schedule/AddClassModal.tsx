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
import { Coach } from './types';

interface AddClassModalProps {
  visible: boolean;
  newClassName: string;
  newClassLevel: string;
  newClassDay: string;
  newClassStartTime: string;
  newClassEndTime: string;
  newClassCapacity: string;
  newClassDescription: string;
  newClassCoaches: string[];
  newClassLeadCoach: string;
  creatingClass: boolean;
  coaches: Coach[];
  onClose: () => void;
  onCreate: () => void;
  onClassNameChange: (name: string) => void;
  onClassLevelChange: (level: string) => void;
  onClassDayChange: (day: string) => void;
  onClassStartTimeChange: (time: string) => void;
  onClassEndTimeChange: (time: string) => void;
  onClassCapacityChange: (capacity: string) => void;
  onClassDescriptionChange: (description: string) => void;
  onToggleCoach: (coachId: string) => void;
  onLeadCoachChange: (coachId: string) => void;
}

export const AddClassModal: React.FC<AddClassModalProps> = ({
  visible,
  newClassName,
  newClassLevel,
  newClassDay,
  newClassStartTime,
  newClassEndTime,
  newClassCapacity,
  newClassDescription,
  newClassCoaches,
  newClassLeadCoach,
  creatingClass,
  coaches,
  onClose,
  onCreate,
  onClassNameChange,
  onClassLevelChange,
  onClassDayChange,
  onClassStartTimeChange,
  onClassEndTimeChange,
  onClassCapacityChange,
  onClassDescriptionChange,
  onToggleCoach,
  onLeadCoachChange,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.addMenuOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.addFormModal}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.addFormHeader}>
            <Text style={styles.addFormTitle}>Add New Class</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.lightGray} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.addFormBody}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Class Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Class Name (Optional)</Text>
              <TextInput
                style={styles.formInput}
                value={newClassName}
                onChangeText={onClassNameChange}
                placeholder="Leave blank to auto-generate"
                placeholderTextColor={Colors.darkGray}
              />
            </View>

            {/* Class Level */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Class Level *</Text>
              <View style={styles.buttonGrid}>
                {['All-Levels', 'Kids', 'Pre-Teen', 'Advanced', 'Sparring'].map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.gridButton,
                      newClassLevel === level && styles.gridButtonActive
                    ]}
                    onPress={() => onClassLevelChange(level)}
                  >
                    <Text style={[
                      styles.gridButtonText,
                      newClassLevel === level && styles.gridButtonTextActive
                    ]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Day of Week */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Day of Week *</Text>
              <View style={styles.dayButtonRow}>
                {[
                  { value: 'monday', label: 'Mon' },
                  { value: 'tuesday', label: 'Tue' },
                  { value: 'wednesday', label: 'Wed' },
                  { value: 'thursday', label: 'Thu' },
                  { value: 'friday', label: 'Fri' },
                  { value: 'saturday', label: 'Sat' },
                  { value: 'sunday', label: 'Sun' },
                ].map(day => (
                  <TouchableOpacity
                    key={day.value}
                    style={[
                      styles.dayButton,
                      newClassDay === day.value && styles.gridButtonActive
                    ]}
                    onPress={() => onClassDayChange(day.value)}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.dayButtonText,
                        newClassDay === day.value && styles.gridButtonTextActive
                      ]}
                    >
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Time */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Time *</Text>
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeLabel}>Start Time</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newClassStartTime}
                    onChangeText={onClassStartTimeChange}
                    placeholder="19:00"
                    placeholderTextColor={Colors.darkGray}
                    keyboardType="default"
                  />
                </View>
                <Text style={styles.timeSeparator}>to</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeLabel}>End Time</Text>
                  <TextInput
                    style={styles.formInput}
                    value={newClassEndTime}
                    onChangeText={onClassEndTimeChange}
                    placeholder="20:00"
                    placeholderTextColor={Colors.darkGray}
                    keyboardType="default"
                  />
                </View>
              </View>
            </View>

            {/* Capacity */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Capacity *</Text>
              <TextInput
                style={styles.formInput}
                value={newClassCapacity}
                onChangeText={onClassCapacityChange}
                placeholder="20"
                placeholderTextColor={Colors.darkGray}
                keyboardType="number-pad"
              />
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.formInput, { minHeight: 80 }]}
                value={newClassDescription}
                onChangeText={onClassDescriptionChange}
                placeholder="Add class description..."
                placeholderTextColor={Colors.darkGray}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Assign Coaches */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Assign Coaches *</Text>
              <ScrollView style={styles.coachSelectList} nestedScrollEnabled>
                {coaches.map(coach => (
                  <TouchableOpacity
                    key={coach.id}
                    style={[
                      styles.coachSelectItem,
                      newClassCoaches.includes(coach.id) && styles.coachSelectItemActive
                    ]}
                    onPress={() => onToggleCoach(coach.id)}
                  >
                    <View style={styles.coachSelectInfo}>
                      <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                      <Text style={styles.coachSelectRole}>
                        {coach.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
                      </Text>
                    </View>
                    <Ionicons
                      name={newClassCoaches.includes(coach.id) ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={newClassCoaches.includes(coach.id) ? Colors.success : Colors.lightGray}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Lead Coach */}
            {newClassCoaches.length > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Lead Coach *</Text>
                <View style={styles.coachSelectListSimple}>
                  {coaches
                    .filter(coach => newClassCoaches.includes(coach.id))
                    .map(coach => (
                      <TouchableOpacity
                        key={coach.id}
                        style={[
                          styles.coachSelectItemSimple,
                          newClassLeadCoach === coach.id && styles.coachSelectItemSelectedSimple
                        ]}
                        onPress={() => onLeadCoachChange(coach.id)}
                      >
                        <View style={styles.coachSelectInfo}>
                          <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                          <Text style={styles.coachSelectRole}>Lead Coach</Text>
                        </View>
                        <Ionicons
                          name={newClassLeadCoach === coach.id ? 'radio-button-on' : 'radio-button-off'}
                          size={24}
                          color={newClassLeadCoach === coach.id ? Colors.jaiBlue : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.addFormButtons}>
            <TouchableOpacity
              style={[styles.addFormButton, styles.addFormCancelButton]}
              onPress={onClose}
              disabled={creatingClass}
            >
              <Text style={styles.addFormCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addFormButton, styles.addFormSaveButton]}
              onPress={onCreate}
              disabled={creatingClass}
            >
              <Text style={styles.addFormSaveButtonText}>
                {creatingClass ? 'Creating...' : 'Create Class'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  addMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  addFormModal: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    height: '80%',
    alignSelf: 'center',
    marginBottom: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  addFormTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
  },
  addFormBody: {
    flex: 1,
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
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridButton: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  gridButtonActive: {
    backgroundColor: Colors.jaiBlue + '20',
    borderColor: Colors.jaiBlue,
  },
  gridButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  gridButtonTextActive: {
    color: Colors.jaiBlue,
  },
  dayButtonRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
  },
  dayButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  dayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  timeLabel: {
    fontSize: 12,
    color: Colors.darkGray,
    marginBottom: 4,
  },
  timeSeparator: {
    fontSize: 16,
    color: Colors.lightGray,
    marginBottom: Spacing.md,
  },
  coachSelectList: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  coachSelectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.black,
  },
  coachSelectItemActive: {
    backgroundColor: Colors.jaiBlue + '15',
  },
  coachSelectInfo: {
    flex: 1,
  },
  coachSelectName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.white,
  },
  coachSelectRole: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
  },
  coachSelectListSimple: {
    gap: 8,
  },
  coachSelectItemSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  coachSelectItemSelectedSimple: {
    borderColor: Colors.jaiBlue,
    backgroundColor: Colors.jaiBlue + '10',
  },
  addFormButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addFormButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 10,
    alignItems: 'center',
  },
  addFormCancelButton: {
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addFormCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  addFormSaveButton: {
    backgroundColor: Colors.jaiBlue,
  },
  addFormSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
});
