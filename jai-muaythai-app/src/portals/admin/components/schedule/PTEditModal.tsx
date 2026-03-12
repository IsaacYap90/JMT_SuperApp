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
import { Member, Coach, SESSION_TYPES } from './types';

interface PTEditModalProps {
  visible: boolean;
  editPTScheduledAt: string;
  editPTMemberId: string;
  editPTCoachId: string;
  editPTDuration: string;
  editPTSessionType: string;
  editPTSessionRate: string;
  editPTCommission: string;
  selectedCoachRates: {
    solo_rate: number;
    buddy_rate: number;
    house_call_rate: number;
    pt_commission_rate: number;
  } | null;
  members: Member[];
  coaches: Coach[];
  onClose: () => void;
  onSave: () => void;
  onMemberChange: (memberId: string) => void;
  onCoachChange: (coachId: string) => void;
  onScheduledAtChange: (scheduledAt: string) => void;
  onDurationChange: (duration: string) => void;
  onSessionTypeChange: (type: string) => void;
  onSessionRateChange: (rate: string) => void;
  onCommissionChange: (commission: string) => void;
}

export const PTEditModal: React.FC<PTEditModalProps> = ({
  visible,
  editPTScheduledAt,
  editPTMemberId,
  editPTCoachId,
  editPTDuration,
  editPTSessionType,
  editPTSessionRate,
  editPTCommission,
  selectedCoachRates,
  members,
  coaches,
  onClose,
  onSave,
  onMemberChange,
  onCoachChange,
  onScheduledAtChange,
  onDurationChange,
  onSessionTypeChange,
  onSessionRateChange,
  onCommissionChange,
}) => {
  // Parse the scheduled_at for date/time inputs
  const parseDateTime = (isoString: string) => {
    const date = new Date(isoString);
    const sgDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const year = sgDate.getUTCFullYear();
    const month = String(sgDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(sgDate.getUTCDate()).padStart(2, '0');
    const hours = String(sgDate.getUTCHours()).padStart(2, '0');
    const minutes = String(sgDate.getUTCMinutes()).padStart(2, '0');
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
    };
  };

  const { date: defaultDate, time: defaultTime } = parseDateTime(editPTScheduledAt);

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
            <Text style={styles.editModalTitle}>Edit PT Session</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.editModalBody}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Member Dropdown */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Member</Text>
              <View style={styles.ptPickerList}>
                {members.length === 0 ? (
                  <Text style={styles.noCoachesText}>Loading members...</Text>
                ) : (
                  members.map((member) => (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.ptSelectItem,
                        editPTMemberId === member.id && styles.ptSelectItemSelected,
                      ]}
                      onPress={() => onMemberChange(member.id)}
                    >
                      <View style={styles.coachSelectLeft}>
                        <View style={styles.coachAvatarSmall}>
                          <Text style={styles.coachAvatarTextSmall}>
                            {member.full_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.coachSelectName}>{member.full_name}</Text>
                          <Text style={styles.coachSelectRole}>{member.email}</Text>
                        </View>
                      </View>
                      <Ionicons
                        name={editPTMemberId === member.id ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={editPTMemberId === member.id ? Colors.success : Colors.lightGray}
                      />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>

            {/* Coach Dropdown */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Coach</Text>
              <View style={styles.ptPickerList}>
                {coaches.length === 0 ? (
                  <Text style={styles.noCoachesText}>Loading coaches...</Text>
                ) : (
                  coaches.map((coach) => (
                    <TouchableOpacity
                      key={coach.id}
                      style={[
                        styles.ptSelectItem,
                        editPTCoachId === coach.id && styles.ptSelectItemSelected,
                      ]}
                      onPress={() => onCoachChange(coach.id)}
                    >
                      <View style={styles.coachSelectLeft}>
                        <View style={styles.coachAvatarSmall}>
                          <Text style={styles.coachAvatarTextSmall}>
                            {coach.full_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                          <Text style={styles.coachSelectRole}>
                            {coach.employment_type === 'full_time'
                              ? 'Full-Time'
                              : 'Part-Time'}
                          </Text>
                        </View>
                      </View>
                      <Ionicons
                        name={editPTCoachId === coach.id ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={editPTCoachId === coach.id ? Colors.success : Colors.lightGray}
                      />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>

            {/* Date and Time Row */}
            <View style={styles.ptTimeRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Date</Text>
                <TextInput
                  style={styles.formInput}
                  value={defaultDate}
                  onChangeText={(text) => {
                    onScheduledAtChange(text + 'T' + defaultTime + ':00Z');
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.darkGray}
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.md }]}>
                <Text style={styles.formLabel}>Time</Text>
                <TextInput
                  style={styles.formInput}
                  value={defaultTime}
                  onChangeText={(text) => {
                    onScheduledAtChange(defaultDate + 'T' + text + ':00Z');
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.darkGray}
                />
              </View>
            </View>

            {/* Duration */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Duration (minutes)</Text>
              <TextInput
                style={styles.formInput}
                value={editPTDuration}
                onChangeText={onDurationChange}
                placeholder="60"
                placeholderTextColor={Colors.darkGray}
                keyboardType="number-pad"
              />
            </View>

            {/* Session Type */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Session Type</Text>
              <View style={styles.pickerContainer}>
                {SESSION_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.pickerOption,
                      editPTSessionType === type.value && styles.pickerOptionSelected,
                    ]}
                    onPress={() => onSessionTypeChange(type.value)}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        editPTSessionType === type.value && styles.pickerOptionTextSelected,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Session Rate */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Session Rate (S$) - What Client Pays</Text>
              <TextInput
                style={styles.formInput}
                value={editPTSessionRate}
                onChangeText={onSessionRateChange}
                placeholder="80"
                placeholderTextColor={Colors.darkGray}
                keyboardType="decimal-pad"
              />
              <Text style={styles.formHint}>
                Auto-filled based on coach's rates. You can override for special pricing.
              </Text>
            </View>

            {/* Commission */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Commission (S$) - What Coach Earns</Text>
              <TextInput
                style={styles.formInput}
                value={editPTCommission}
                onChangeText={onCommissionChange}
                placeholder="40"
                placeholderTextColor={Colors.darkGray}
                keyboardType="decimal-pad"
              />
              {editPTSessionRate && editPTCommission && selectedCoachRates && (
                <View style={styles.commissionBreakdown}>
                  <Text style={styles.breakdownText}>
                    Client Pays: <Text style={styles.highlightAmount}>S${parseFloat(editPTSessionRate).toFixed(0)}</Text>
                    {' → '}
                    Coach Earns: <Text style={styles.highlightAmount}>S${parseFloat(editPTCommission).toFixed(0)}</Text>
                    {' '}
                    <Text style={styles.percentageText}>
                      ({(selectedCoachRates.pt_commission_rate * 100).toFixed(0)}%)
                    </Text>
                  </Text>
                  <Text style={styles.gymRevenue}>
                    Gym Revenue: S${(parseFloat(editPTSessionRate) - parseFloat(editPTCommission)).toFixed(0)}
                  </Text>
                </View>
              )}
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={onSave}
            >
              <Ionicons name="save-outline" size={18} color={Colors.white} />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={onClose}
            >
              <Text style={styles.modalCloseButtonText}>Cancel</Text>
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
  formHint: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
  noCoachesText: {
    fontSize: 13,
    color: Colors.darkGray,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  ptTimeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ptPickerList: {
    maxHeight: 200,
    backgroundColor: Colors.black,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  ptSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ptSelectItemSelected: {
    backgroundColor: Colors.success + '15',
  },
  coachSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coachAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachAvatarTextSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
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
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    backgroundColor: Colors.black,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  pickerOptionSelected: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  pickerOptionText: {
    fontSize: 14,
    color: Colors.lightGray,
  },
  pickerOptionTextSelected: {
    color: Colors.white,
    fontWeight: '600',
  },
  commissionBreakdown: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.jaiBlue + '15',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
  },
  breakdownText: {
    fontSize: 14,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  highlightAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.success,
  },
  percentageText: {
    fontSize: 12,
    color: Colors.jaiBlue,
    fontWeight: '600',
  },
  gymRevenue: {
    fontSize: 13,
    color: Colors.darkGray,
    marginTop: Spacing.xs,
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
