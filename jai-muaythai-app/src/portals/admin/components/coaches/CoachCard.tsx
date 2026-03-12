import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { CoachCardProps, formatCurrency } from './types';

export const CoachCard: React.FC<CoachCardProps> = ({
  coach,
  onPress,
}) => {
  const hasEmploymentDetails = coach.employment_type &&
    ((coach.employment_type === 'part_time' && coach.hourly_rate) ||
     (coach.employment_type === 'full_time' && coach.base_salary));

  return (
    <TouchableOpacity style={styles.coachCard} onPress={() => onPress(coach)} activeOpacity={0.7}>
      <View style={styles.coachHeader}>
        <LinearGradient colors={[Colors.jaiBlue, Colors.jaiBlue]} style={styles.avatar}>
          <Text style={styles.avatarText}>
            {coach.full_name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </LinearGradient>
        <View style={styles.coachInfo}>
          <Text style={styles.coachName}>{coach.full_name || 'New Coach'}</Text>
          <Text style={styles.coachEmail}>{coach.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
      </View>

      {/* Badges */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, {
          backgroundColor: coach.employment_type === 'full_time' ? Colors.success + '15' : Colors.warning + '15',
        }]}>
          <Text style={[styles.badgeText, {
            color: coach.employment_type === 'full_time' ? Colors.success : Colors.warning,
          }]}>
            {coach.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
          </Text>
        </View>
        {coach.start_date && (
          <View style={[styles.badge, {
            backgroundColor: Colors.jaiBlue + '15',
          }]}>
            <Text style={[styles.badgeText, { color: Colors.jaiBlue }]}>
              Started {new Date(coach.start_date).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })}
            </Text>
          </View>
        )}
      </View>

      {/* Rates */}
      <View style={styles.ratesRow}>
        {coach.employment_type === 'part_time' ? (
          <>
            <View style={styles.rateItem}>
              <Text style={styles.rateLabel}>Hourly Rate</Text>
              <Text style={[styles.rateValue, !hasEmploymentDetails && styles.rateNotSet]}>
                {coach.hourly_rate ? formatCurrency(coach.hourly_rate) : 'Not set'}
              </Text>
            </View>
            <View style={styles.rateDivider} />
          </>
        ) : (
          <>
            <View style={styles.rateItem}>
              <Text style={styles.rateLabel}>Base Salary</Text>
              <Text style={[styles.rateValue, !hasEmploymentDetails && styles.rateNotSet]}>
                {coach.base_salary ? formatCurrency(coach.base_salary) : 'Not set'}
              </Text>
            </View>
            <View style={styles.rateDivider} />
          </>
        )}
        <View style={styles.rateItem}>
          <Text style={styles.rateLabel}>Phone</Text>
          <Text style={[styles.rateValue, !coach.phone && styles.rateNotSet]}>
            {coach.phone || 'Not set'}
          </Text>
        </View>
        <View style={styles.rateDivider} />
        <View style={styles.rateItem}>
          <Text style={styles.rateLabel}>Active</Text>
          <Ionicons
            name={coach.is_active ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={coach.is_active ? Colors.success : Colors.error}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  coachCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  coachInfo: { flex: 1 },
  coachName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.white,
  },
  coachEmail: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ratesRow: {
    flexDirection: 'row',
    backgroundColor: Colors.black,
    borderRadius: 12,
    padding: 12,
  },
  rateItem: {
    flex: 1,
    alignItems: 'center',
  },
  rateDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  rateLabel: {
    fontSize: 11,
    color: Colors.lightGray,
    marginBottom: 4,
  },
  rateValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.white,
  },
  rateNotSet: {
    color: Colors.warning,
    fontSize: 13,
  },
});
