import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { Coach, getCalendarDays, getTodayStr, formatDisplayDate } from './types';

interface AddPTSessionModalProps {
  visible: boolean;
  newPTCoachId: string;
  newPTClientName: string;
  newPTDate: string;
  newPTTime: string;
  newPTDuration: string;
  newPTSessionType: string;
  newPTNotes: string;
  newPTCoachRates: {
    solo_rate: number;
    buddy_rate: number;
    pt_commission_rate: number;
    isSenior: boolean;
  } | null;
  newPTSessionRate: number;
  newPTCommission: number;
  showDatePicker: boolean;
  calendarMonth: Date;
  repeatWeekly: boolean;
  repeatWeeks: number;
  creatingPT: boolean;
  coaches: Coach[];
  onClose: () => void;
  onCreate: () => void;
  onCoachChange: (coachId: string) => void;
  onClientNameChange: (name: string) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onDurationChange: (duration: string) => void;
  onSessionTypeChange: (type: string) => void;
  onNotesChange: (notes: string) => void;
  onShowDatePickerChange: (show: boolean) => void;
  onCalendarMonthChange: (month: Date) => void;
  onRepeatWeeklyChange: (repeat: boolean) => void;
  onRepeatWeeksChange: (weeks: number) => void;
  addWeeksToDate: (dateStr: string, weeks: number) => string;
}

export const AddPTSessionModal: React.FC<AddPTSessionModalProps> = ({
  visible,
  newPTCoachId,
  newPTClientName,
  newPTDate,
  newPTTime,
  newPTDuration,
  newPTSessionType,
  newPTNotes,
  newPTCoachRates,
  newPTSessionRate,
  newPTCommission,
  showDatePicker,
  calendarMonth,
  repeatWeekly,
  repeatWeeks,
  creatingPT,
  coaches,
  onClose,
  onCreate,
  onCoachChange,
  onClientNameChange,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onSessionTypeChange,
  onNotesChange,
  onShowDatePickerChange,
  onCalendarMonthChange,
  onRepeatWeeklyChange,
  onRepeatWeeksChange,
  addWeeksToDate,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={[styles.addMenuOverlay, { justifyContent: 'center' }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.addFormModal, { height: '88%' }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.addFormHeader}>
            <Text style={styles.addFormTitle}>Add PT Session</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.lightGray} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.addFormBody} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            {/* Select Coach */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Select Coach *</Text>
              <ScrollView style={styles.coachSelectScrollList} nestedScrollEnabled>
                {coaches.map(coach => (
                  <TouchableOpacity
                    key={coach.id}
                    style={[
                      styles.coachSelectItem,
                      newPTCoachId === coach.id && styles.coachSelectItemActive
                    ]}
                    onPress={() => onCoachChange(coach.id)}
                  >
                    <View style={styles.coachSelectInfo}>
                      <Text style={styles.coachSelectName}>{coach.full_name}</Text>
                      <Text style={styles.coachSelectRole}>
                        {coach.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
                      </Text>
                    </View>
                    <Ionicons
                      name={newPTCoachId === coach.id ? 'radio-button-on' : 'radio-button-off'}
                      size={24}
                      color={newPTCoachId === coach.id ? Colors.success : Colors.lightGray}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Client Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Client Name *</Text>
              <TextInput
                style={styles.formInput}
                value={newPTClientName}
                onChangeText={onClientNameChange}
                placeholder="Enter client name"
                placeholderTextColor={Colors.darkGray}
              />
            </View>

            {/* Date */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Date *</Text>
              <TouchableOpacity
                style={[styles.formInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                onPress={() => {
                  if (!showDatePicker && newPTDate) {
                    onCalendarMonthChange(new Date(newPTDate + 'T00:00:00'));
                  }
                  onShowDatePickerChange(!showDatePicker);
                }}
              >
                <Text style={{ color: newPTDate ? Colors.white : Colors.darkGray, fontSize: 16 }}>
                  {newPTDate ? formatDisplayDate(newPTDate) : 'Select date'}
                </Text>
                <Ionicons
                  name={showDatePicker ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={Colors.lightGray}
                />
              </TouchableOpacity>

              {showDatePicker && (
                <View style={styles.calendarDropdown}>
                  {/* Month navigation */}
                  <View style={styles.calendarHeader}>
                    <TouchableOpacity
                      onPress={() => {
                        const prev = new Date(calendarMonth);
                        prev.setMonth(prev.getMonth() - 1);
                        onCalendarMonthChange(prev);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Ionicons name="chevron-back" size={20} color={Colors.white} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthText}>
                      {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const next = new Date(calendarMonth);
                        next.setMonth(next.getMonth() + 1);
                        onCalendarMonthChange(next);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Ionicons name="chevron-forward" size={20} color={Colors.white} />
                    </TouchableOpacity>
                  </View>

                  {/* Day-of-week headers */}
                  <View style={styles.calendarDayHeaders}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                      <Text key={day} style={styles.calendarDayHeader}>{day}</Text>
                    ))}
                  </View>

                  {/* Date grid */}
                  <View style={styles.calendarGrid}>
                    {getCalendarDays(calendarMonth).map((date, index) => {
                      if (!date) {
                        return <View key={`empty-${index}`} style={styles.calendarCell} />;
                      }
                      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                      const isSelected = dateStr === newPTDate;
                      const todayStr = getTodayStr();
                      const isToday = dateStr === todayStr;
                      const isPast = dateStr < todayStr;

                      return (
                        <TouchableOpacity
                          key={dateStr}
                          style={styles.calendarCell}
                          onPress={() => {
                            onDateChange(dateStr);
                            onShowDatePickerChange(false);
                          }}
                        >
                          <View style={[
                            styles.calendarCellInner,
                            isSelected && styles.calendarCellSelected,
                            isToday && !isSelected && styles.calendarCellToday,
                          ]}>
                            <Text style={[
                              styles.calendarDateText,
                              isSelected && styles.calendarDateTextSelected,
                              isPast && !isSelected && styles.calendarDateTextPast,
                            ]}>
                              {date.getDate()}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* Time */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Time (24h) *</Text>
              <TextInput
                style={styles.formInput}
                value={newPTTime}
                onChangeText={(text) => {
                  // Strip non-digits except colon
                  const clean = text.replace(/[^\d:]/g, '');
                  // Auto-format: when 4 digits typed without colon, insert colon
                  if (/^\d{4}$/.test(clean)) {
                    onTimeChange(`${clean.slice(0, 2)}:${clean.slice(2)}`);
                  } else {
                    onTimeChange(clean);
                  }
                }}
                placeholder="e.g. 1430 or 14:30"
                placeholderTextColor={Colors.darkGray}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>

            {/* Duration */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Duration *</Text>
              <View style={styles.buttonGrid}>
                {['60', '90', '120'].map(duration => (
                  <TouchableOpacity
                    key={duration}
                    style={[
                      styles.gridButton,
                      newPTDuration === duration && styles.gridButtonActive
                    ]}
                    onPress={() => onDurationChange(duration)}
                  >
                    <Text style={[
                      styles.gridButtonText,
                      newPTDuration === duration && styles.gridButtonTextActive
                    ]}>
                      {duration} min
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Session Type */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Session Type *</Text>
              {!newPTCoachRates ? (
                <Text style={styles.helperText}>Select a coach first</Text>
              ) : (
                <View style={styles.buttonGrid}>
                  {/* Senior Coaches - Show all options */}
                  {newPTCoachRates.isSenior && [
                    { value: 'solo_single', label: 'Solo Single', rate: newPTCoachRates.solo_rate, perSession: false },
                    { value: 'solo_10pack', label: 'Solo 10-Pack', rate: newPTCoachRates.solo_rate - 10, perSession: true },
                    { value: 'solo_20pack', label: 'Solo 20-Pack', rate: newPTCoachRates.solo_rate - 20, perSession: true },
                    { value: 'buddy_single', label: 'Buddy Single', rate: newPTCoachRates.buddy_rate, perSession: false },
                    { value: 'buddy_12pack', label: 'Buddy 12-Pack', rate: newPTCoachRates.buddy_rate - 30, perSession: true },
                  ].map(type => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.gridButton,
                        newPTSessionType === type.value && styles.gridButtonActive
                      ]}
                      onPress={() => onSessionTypeChange(type.value)}
                    >
                      <Text style={[
                        styles.gridButtonText,
                        newPTSessionType === type.value && styles.gridButtonTextActive
                      ]}>
                        {type.label}
                      </Text>
                      <Text style={[
                        styles.commissionText,
                        newPTSessionType === type.value && styles.commissionTextActive
                      ]}>
                        S${type.rate}{type.perSession ? '/session' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {/* Assistant Coaches - Solo only, no buddy */}
                  {!newPTCoachRates.isSenior && [
                    { value: 'solo_single', label: 'Solo Single', rate: newPTCoachRates.solo_rate, perSession: false },
                    { value: 'solo_10pack', label: 'Solo 10-Pack', rate: newPTCoachRates.solo_rate - 10, perSession: true },
                    { value: 'solo_20pack', label: 'Solo 20-Pack', rate: newPTCoachRates.solo_rate - 20, perSession: true },
                  ].map(type => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.gridButton,
                        newPTSessionType === type.value && styles.gridButtonActive
                      ]}
                      onPress={() => onSessionTypeChange(type.value)}
                    >
                      <Text style={[
                        styles.gridButtonText,
                        newPTSessionType === type.value && styles.gridButtonTextActive
                      ]}>
                        {type.label}
                      </Text>
                      <Text style={[
                        styles.commissionText,
                        newPTSessionType === type.value && styles.commissionTextActive
                      ]}>
                        S${type.rate}{type.perSession ? '/session' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Commission Display */}
            {newPTCoachRates && newPTSessionRate > 0 && (
              <View style={styles.commissionBreakdown}>
                <Text style={styles.breakdownText}>
                  Client Pays: <Text style={styles.highlightAmount}>S${newPTSessionRate}</Text>
                  {' → '}
                  Coach Earns: <Text style={styles.highlightAmount}>S${newPTCommission}</Text>
                  {' '}
                  <Text style={styles.percentageText}>
                    ({(newPTCoachRates.pt_commission_rate * 100).toFixed(0)}%)
                  </Text>
                </Text>
              </View>
            )}

            {/* Notes */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.formInput, { minHeight: 80 }]}
                value={newPTNotes}
                onChangeText={onNotesChange}
                placeholder="Add any notes..."
                placeholderTextColor={Colors.darkGray}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Repeat Weekly */}
            <View style={styles.formGroup}>
              <View style={styles.repeatToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Repeat Weekly</Text>
                  <Text style={styles.repeatHint}>Create recurring sessions at the same day/time</Text>
                </View>
                <Switch
                  value={repeatWeekly}
                  onValueChange={onRepeatWeeklyChange}
                  trackColor={{ false: Colors.border, true: Colors.jaiBlue + '60' }}
                  thumbColor={repeatWeekly ? Colors.jaiBlue : Colors.darkGray}
                />
              </View>

              {repeatWeekly && (
                <View style={styles.repeatOptions}>
                  <Text style={styles.repeatLabel}>Number of weeks:</Text>
                  <View style={styles.buttonGrid}>
                    {[2, 4, 8, 12].map(weeks => (
                      <TouchableOpacity
                        key={weeks}
                        style={[
                          styles.gridButton,
                          repeatWeeks === weeks && styles.gridButtonActive
                        ]}
                        onPress={() => onRepeatWeeksChange(weeks)}
                      >
                        <Text style={[
                          styles.gridButtonText,
                          repeatWeeks === weeks && styles.gridButtonTextActive
                        ]}>
                          {weeks} weeks
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {newPTDate && (
                    <View style={styles.repeatPreview}>
                      <Text style={styles.repeatPreviewTitle}>Sessions will be created on:</Text>
                      {Array.from({ length: Math.min(repeatWeeks, 6) }).map((_, i) => {
                        const d = addWeeksToDate(newPTDate, i);
                        return (
                          <Text key={i} style={styles.repeatPreviewDate}>
                            {i + 1}. {formatDisplayDate(d)}
                          </Text>
                        );
                      })}
                      {repeatWeeks > 6 && (
                        <Text style={styles.repeatPreviewDate}>
                          ...and {repeatWeeks - 6} more
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.addFormButtons}>
            <TouchableOpacity
              style={[styles.addFormButton, styles.addFormCancelButton]}
              onPress={onClose}
              disabled={creatingPT}
            >
              <Text style={styles.addFormCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addFormButton, styles.addFormSaveButton]}
              onPress={onCreate}
              disabled={creatingPT}
            >
              <Text style={styles.addFormSaveButtonText}>
                {creatingPT ? 'Creating...' : repeatWeekly ? `Create ${repeatWeeks} Sessions` : 'Create Session'}
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
  helperText: {
    fontSize: 14,
    color: Colors.darkGray,
    fontStyle: 'italic',
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
  coachSelectScrollList: {
    maxHeight: 360,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
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
  commissionText: {
    fontSize: 11,
    color: Colors.darkGray,
    marginTop: 2,
  },
  commissionTextActive: {
    color: Colors.jaiBlue,
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
  calendarDropdown: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarNavButton: {
    padding: 4,
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  calendarDayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#B3B3B3',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarCellSelected: {
    backgroundColor: '#0096FF',
  },
  calendarCellToday: {
    borderWidth: 1.5,
    borderColor: '#0096FF',
  },
  calendarDateText: {
    fontSize: 14,
    color: Colors.white,
  },
  calendarDateTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  calendarDateTextPast: {
    opacity: 0.4,
  },
  repeatToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repeatHint: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 2,
  },
  repeatOptions: {
    marginTop: Spacing.md,
  },
  repeatLabel: {
    fontSize: 13,
    color: Colors.lightGray,
    marginBottom: 8,
  },
  repeatPreview: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.jaiBlue + '10',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
  },
  repeatPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.jaiBlue,
    marginBottom: 6,
  },
  repeatPreviewDate: {
    fontSize: 13,
    color: Colors.lightGray,
    marginBottom: 2,
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
