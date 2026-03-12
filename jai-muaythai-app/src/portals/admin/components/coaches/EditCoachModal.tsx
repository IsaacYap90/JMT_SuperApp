import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { EditCoachModalProps, MONTH_NAMES, formatCurrency } from './types';

export const EditCoachModal: React.FC<EditCoachModalProps> = ({
  visible,
  selectedCoach,
  editFullName,
  editPhone,
  editEmploymentType,
  editHourlyRate,
  editBaseSalary,
  editPTCommissionRate,
  editSoloRate,
  editBuddyRate,
  editHouseCallRate,
  editCertifications,
  editStartDate,
  editEmergencyContactName,
  editEmergencyContactPhone,
  saving,
  coachPayslips,
  loadingPayslips,
  isMasterAdmin,
  onFullNameChange,
  onPhoneChange,
  onEmploymentTypeChange,
  onHourlyRateChange,
  onBaseSalaryChange,
  onPTCommissionRateChange,
  onSoloRateChange,
  onBuddyRateChange,
  onHouseCallRateChange,
  onCertificationsChange,
  onStartDateChange,
  onEmergencyContactNameChange,
  onEmergencyContactPhoneChange,
  onClose,
  onSave,
  onGeneratePayslip,
  onViewPayslip,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Coach</Text>

              {/* Coach Info (read-only) */}
              <View style={styles.editCoachHeader}>
                <LinearGradient colors={[Colors.jaiBlue, Colors.jaiBlue]} style={styles.editAvatar}>
                  <Text style={styles.editAvatarText}>
                    {selectedCoach?.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </LinearGradient>
                <View>
                  <Text style={styles.editCoachName}>{selectedCoach?.full_name || 'New Coach'}</Text>
                  <Text style={styles.editCoachEmail}>{selectedCoach?.email}</Text>
                </View>
              </View>

              {/* Full Name */}
              <Text style={styles.modalLabel}>Full Name</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editFullName}
                  onChangeText={onFullNameChange}
                  placeholder="Full Name"
                  placeholderTextColor={Colors.darkGray}
                />
              </View>

              {/* Phone */}
              <Text style={styles.modalLabel}>Phone</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="call-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editPhone}
                  onChangeText={onPhoneChange}
                  placeholder="+65 1234 5678"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Employment Type Toggle */}
              <Text style={styles.modalLabel}>Employment Type</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    editEmploymentType === 'full_time' && styles.toggleButtonActive,
                  ]}
                  onPress={() => onEmploymentTypeChange('full_time')}
                >
                  <Text style={[
                    styles.toggleText,
                    editEmploymentType === 'full_time' && styles.toggleTextActive,
                  ]}>Full-Time</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    editEmploymentType === 'part_time' && styles.toggleButtonActive,
                  ]}
                  onPress={() => onEmploymentTypeChange('part_time')}
                >
                  <Text style={[
                    styles.toggleText,
                    editEmploymentType === 'part_time' && styles.toggleTextActive,
                  ]}>Part-Time</Text>
                </TouchableOpacity>
              </View>

              {/* Hourly Rate (Part-Time) or Base Salary (Full-Time) */}
              {editEmploymentType === 'part_time' ? (
                <>
                  <Text style={styles.modalLabel}>Hourly Rate (SGD)</Text>
                  <View style={styles.modalInputContainer}>
                    <Text style={styles.currencyPrefix}>S$</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editHourlyRate}
                      onChangeText={onHourlyRateChange}
                      placeholder="50"
                      placeholderTextColor={Colors.darkGray}
                      keyboardType="numeric"
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.salaryFieldContainer}>
                    <View style={styles.salaryFieldHeader}>
                      <Text style={styles.modalLabel}>Base Salary (S$/month)</Text>
                      {isMasterAdmin && (
                        <View style={styles.confidentialBadge}>
                          <Ionicons name="lock-closed" size={10} color={Colors.warning} />
                          <Text style={styles.confidentialText}>Private</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.modalInputContainer}>
                      <Text style={styles.currencyPrefix}>S$</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={editBaseSalary}
                        onChangeText={onBaseSalaryChange}
                        placeholder="3000"
                        placeholderTextColor={Colors.darkGray}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </>
              )}

              {/* PT Commission Rate */}
              <Text style={styles.modalLabel}>PT Commission Rate (%)</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="wallet-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editPTCommissionRate}
                  onChangeText={onPTCommissionRateChange}
                  placeholder="50"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="numeric"
                />
                <Text style={styles.percentageSymbol}>%</Text>
              </View>
              <Text style={styles.helperText}>Default: 50% • Senior coaches may receive higher rates</Text>

              {/* PT Session Rates Section */}
              <View style={styles.modalDivider} />
              <View style={styles.payslipsSectionHeader}>
                <View style={styles.payslipsSectionAccent} />
                <Text style={styles.payslipsSectionTitle}>PT SESSION RATES (Client Pays)</Text>
              </View>
              <Text style={styles.helperText}>Set what clients pay for each session type. Coach earns: rate x commission %</Text>

              {/* Solo Rate */}
              <Text style={styles.modalLabel}>Solo Session Rate (S$)</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editSoloRate}
                  onChangeText={onSoloRateChange}
                  placeholder="80"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="numeric"
                />
              </View>

              {/* Buddy Rate */}
              <Text style={styles.modalLabel}>Buddy Session Rate (S$)</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="people-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editBuddyRate}
                  onChangeText={onBuddyRateChange}
                  placeholder="120"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="numeric"
                />
              </View>

              {/* House Call Rate */}
              <Text style={styles.modalLabel}>House Call Rate (S$)</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="home-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editHouseCallRate}
                  onChangeText={onHouseCallRateChange}
                  placeholder="140"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.modalDivider} />

              {/* Start Date */}
              <Text style={styles.modalLabel}>Start Date</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="calendar-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editStartDate}
                  onChangeText={onStartDateChange}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.darkGray}
                />
              </View>

              {/* Certifications */}
              <Text style={styles.modalLabel}>Certifications (optional)</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="ribbon-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editCertifications}
                  onChangeText={onCertificationsChange}
                  placeholder="e.g., CPR, First Aid, Muay Thai Level 3"
                  placeholderTextColor={Colors.darkGray}
                />
              </View>

              {/* Emergency Contact */}
              <View style={styles.modalDivider} />
              <Text style={styles.modalLabel}>Emergency Contact Name</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="person-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editEmergencyContactName}
                  onChangeText={onEmergencyContactNameChange}
                  placeholder="Emergency contact name"
                  placeholderTextColor={Colors.darkGray}
                />
              </View>

              <Text style={styles.modalLabel}>Emergency Contact Phone</Text>
              <View style={styles.modalInputContainer}>
                <Ionicons name="call-outline" size={20} color={Colors.lightGray} style={styles.modalInputIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={editEmergencyContactPhone}
                  onChangeText={onEmergencyContactPhoneChange}
                  placeholder="+65 1234 5678"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="phone-pad"
                />
              </View>

              {/* ===== PAYSLIPS SECTION (Master Admin only) ===== */}
              {isMasterAdmin && (
                <>
                  <View style={styles.modalDivider} />

                  <View style={styles.payslipsSectionHeader}>
                    <View style={styles.payslipsSectionAccent} />
                    <Text style={styles.payslipsSectionTitle}>PAYSLIPS</Text>
                  </View>

                  {loadingPayslips ? (
                    <ActivityIndicator color={Colors.jaiBlue} style={{ padding: 20 }} />
                  ) : coachPayslips.length === 0 ? (
                    <View style={styles.noPayslipsContainer}>
                      <Ionicons name="document-text-outline" size={32} color={Colors.darkGray} />
                      <Text style={styles.noPayslipsText}>No payslips yet</Text>
                    </View>
                  ) : (
                    <View style={styles.payslipsList}>
                      {coachPayslips.slice(0, 6).map(payslip => (
                        <TouchableOpacity
                          key={payslip.id}
                          style={styles.payslipItem}
                          onPress={() => onViewPayslip(payslip)}
                        >
                          <View style={styles.payslipItemLeft}>
                            <Text style={styles.payslipMonth}>
                              {MONTH_NAMES[payslip.month - 1]} {payslip.year}
                            </Text>
                            <Text style={styles.payslipGross}>
                              Gross: {formatCurrency(payslip.gross_pay)}
                            </Text>
                          </View>
                          <View style={styles.payslipItemRight}>
                            <Text style={styles.payslipNet}>{formatCurrency(payslip.net_pay)}</Text>
                            <View style={[
                              styles.payslipStatusBadge,
                              { backgroundColor: payslip.status === 'paid' ? Colors.success + '20' : Colors.warning + '20' }
                            ]}>
                              <Text style={[
                                styles.payslipStatusText,
                                { color: payslip.status === 'paid' ? Colors.success : Colors.warning }
                              ]}>
                                {payslip.status === 'paid' ? 'Paid' : 'Pending'}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                      {coachPayslips.length > 6 && (
                        <Text style={styles.payslipMore}>
                          +{coachPayslips.length - 6} more payslips
                        </Text>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.generatePayslipButton}
                    onPress={() => {
                      Alert.alert(
                        'Generate Payslip',
                        `Create a payslip for ${selectedCoach?.full_name}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Generate',
                            onPress: () => onGeneratePayslip(),
                          },
                        ]
                      );
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={Colors.jaiBlue} />
                    <Text style={styles.generatePayslipText}>Generate Payslip</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity onPress={onSave} disabled={saving}>
                <LinearGradient
                  colors={[Colors.jaiBlue, Colors.jaiBlue]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.modalButton, { marginTop: 24 }]}
                >
                  {saving ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalButtonText}>Save Changes</Text>
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
  percentageSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginLeft: 10,
  },
  helperText: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 4,
    marginBottom: 12,
    fontStyle: 'italic',
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
  editCoachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 8,
    marginTop: Spacing.md,
  },
  editAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  editAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  editCoachName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  editCoachEmail: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
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
  salaryFieldContainer: {
    marginTop: Spacing.sm,
  },
  salaryFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  confidentialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  confidentialText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.warning,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  payslipsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  payslipsSectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 2,
    marginRight: 8,
  },
  payslipsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noPayslipsContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: Colors.black,
    borderRadius: 12,
  },
  noPayslipsText: {
    fontSize: 14,
    color: Colors.lightGray,
    marginTop: 8,
  },
  payslipsList: {
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 8,
  },
  payslipItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.cardBg,
    marginBottom: 6,
  },
  payslipItemLeft: {
    flex: 1,
  },
  payslipMonth: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  payslipGross: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 2,
  },
  payslipItemRight: {
    alignItems: 'flex-end',
  },
  payslipNet: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
  },
  payslipStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  payslipStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  payslipMore: {
    fontSize: 12,
    color: Colors.lightGray,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  generatePayslipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.jaiBlue + '40',
    borderStyle: 'dashed',
  },
  generatePayslipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginLeft: 8,
  },
});
