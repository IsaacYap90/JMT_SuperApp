import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { AddCoachModalProps } from './types';

export const AddCoachModal: React.FC<AddCoachModalProps> = ({
  visible,
  newFullName,
  newEmail,
  newPhone,
  newEmploymentType,
  newHourlyRate,
  newBaseSalary,
  newStartDate,
  creating,
  onFullNameChange,
  onEmailChange,
  onPhoneChange,
  onEmploymentTypeChange,
  onHourlyRateChange,
  onBaseSalaryChange,
  onStartDateChange,
  onClose,
  onSubmit,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add New Coach</Text>
              <Text style={styles.modalSubtitle}>Fill in coach details to create account</Text>

              <Text style={styles.modalLabel}>Full Name</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={newFullName}
                  onChangeText={onFullNameChange}
                  placeholder="Full Name"
                  placeholderTextColor={Colors.darkGray}
                  autoFocus
                />
              </View>

              <Text style={styles.modalLabel}>Email Address</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="mail-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={newEmail}
                  onChangeText={onEmailChange}
                  placeholder="coach@email.com"
                  placeholderTextColor={Colors.darkGray}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <Text style={styles.modalLabel}>Phone (optional)</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="call-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={newPhone}
                  onChangeText={onPhoneChange}
                  placeholder="+65 1234 5678"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.modalLabel}>Employment Type</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    newEmploymentType === 'full_time' && styles.toggleButtonActive,
                  ]}
                  onPress={() => onEmploymentTypeChange('full_time')}
                >
                  <Text style={[
                    styles.toggleText,
                    newEmploymentType === 'full_time' && styles.toggleTextActive,
                  ]}>Full-Time</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    newEmploymentType === 'part_time' && styles.toggleButtonActive,
                  ]}
                  onPress={() => onEmploymentTypeChange('part_time')}
                >
                  <Text style={[
                    styles.toggleText,
                    newEmploymentType === 'part_time' && styles.toggleTextActive,
                  ]}>Part-Time</Text>
                </TouchableOpacity>
              </View>

              {newEmploymentType === 'part_time' ? (
                <>
                  <Text style={styles.modalLabel}>Hourly Rate (SGD)</Text>
                  <View style={styles.modalInputContainer}>
                    <Text style={styles.currencyPrefix}>S$</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newHourlyRate}
                      onChangeText={onHourlyRateChange}
                      placeholder="50"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="numeric"
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalLabel}>Base Salary (S$/month)</Text>
                  <View style={styles.modalInputContainer}>
                    <Text style={styles.currencyPrefix}>S$</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newBaseSalary}
                      onChangeText={onBaseSalaryChange}
                      placeholder="3000"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="numeric"
                    />
                  </View>
                </>
              )}

              <Text style={styles.modalLabel}>Start Date (optional)</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="calendar-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={newStartDate}
                  onChangeText={onStartDateChange}
                  placeholder="YYYY-MM-DD (defaults to today)"
                  placeholderTextColor={Colors.darkGray}
                />
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={18} color={Colors.jaiBlue} />
                <Text style={styles.infoText}>
                  Default password: JMT1234{'\n'}Coach will change it on first login
                </Text>
              </View>

              <TouchableOpacity onPress={onSubmit} disabled={creating}>
                <LinearGradient
                  colors={[Colors.jaiBlue, Colors.jaiBlue]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalButton}
                >
                  {creating ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalButtonText}>Create Coach Account</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  modalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.lightGray,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
    marginTop: Spacing.md,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  modalInputIcon: {
    marginRight: 10,
  },
  modalInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.white,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginRight: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleButtonActive: {
    backgroundColor: Colors.jaiBlue + '15',
    borderColor: Colors.jaiBlue,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.lightGray,
  },
  toggleTextActive: {
    color: Colors.jaiBlue,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.lightGray,
    lineHeight: 20,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: Spacing.lg,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.lightGray,
  },
});
