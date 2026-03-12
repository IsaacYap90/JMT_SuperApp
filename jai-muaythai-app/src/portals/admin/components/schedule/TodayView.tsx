import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { getCoachColor } from '../../../../shared/constants/CoachColors';
import { ClassItem, PTSession, Coach, getCommissionForSessionType } from './types';

interface TodayViewProps {
  todayClasses: ClassItem[];
  ptSessions: PTSession[];
  coaches: Coach[];
  refreshing: boolean;
  today: Date;
  formatTime: (time: string) => string;
  formatDate: (date: Date) => string;
  formatPTDateTime: (isoString: string) => { time: string; date: string };
  isTimePassed: (startTime: string, date: Date) => boolean;
  isPTSessionPassed: (isoString: string) => boolean;
  onRefresh: () => void;
  onClassPress: (cls: ClassItem) => void;
  onPTPress: (session: PTSession) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  todayClasses,
  ptSessions,
  coaches,
  refreshing,
  today,
  formatTime,
  formatDate,
  formatPTDateTime,
  isTimePassed,
  isPTSessionPassed,
  onRefresh,
  onClassPress,
  onPTPress,
}) => {
  return (
    <ScrollView
      style={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.jaiBlue} />
      }
    >
      <View style={styles.dateHeaderRow}>
        <Ionicons name="calendar" size={18} color={Colors.jaiBlue} />
        <Text style={styles.dateHeader}>{formatDate(today)}</Text>
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>ALL CLASSES</Text>
        <View style={styles.classCount}>
          <Text style={styles.classCountText}>{todayClasses.length}</Text>
        </View>
      </View>

      {todayClasses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={40} color={Colors.darkGray} />
          <Text style={styles.emptyText}>No classes scheduled for today</Text>
        </View>
      ) : (
        todayClasses.map((classItem) => {
          const isPassed = isTimePassed(classItem.start_time, today);
          const coachColor = classItem.lead_coach_id ? getCoachColor(classItem.lead_coach_id, coaches) : Colors.jaiBlue;

          // Format coach names (first names only)
          const coachNames = (classItem.assigned_coaches || [])
            .map(name => name.split(' ')[0]) // Get first name only
            .join(', ');

          return (
            <TouchableOpacity
              key={classItem.id}
              style={[
                styles.compactCard,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: coachColor,
                },
                isPassed && styles.cardDimmed
              ]}
              onPress={() => onClassPress(classItem)}
              activeOpacity={0.7}
            >
              <View style={styles.compactCardHeader}>
                <View style={[styles.colorDot, { backgroundColor: coachColor }]} />
                <Text style={[styles.compactTime, isPassed && styles.textDimmed]}>
                  {formatTime(classItem.start_time)}
                </Text>
                <Text style={[styles.compactTitle, isPassed && styles.textDimmed]}>
                  {classItem.name}
                </Text>
              </View>
              <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                {classItem.enrolled_count || 0}/{classItem.capacity || 12} pax • {coachNames || 'No coaches'}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

      {/* PT Sessions Section */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: Colors.success }]} />
        <Text style={styles.sectionTitle}>PT SESSIONS</Text>
        <View style={[styles.classCount, { backgroundColor: Colors.success }]}>
          <Text style={styles.classCountText}>{ptSessions.length}</Text>
        </View>
      </View>

      {ptSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="person-outline" size={40} color={Colors.darkGray} />
          <Text style={styles.emptyText}>No PT sessions scheduled</Text>
        </View>
      ) : (
        ptSessions.map((session) => {
          const { time } = formatPTDateTime(session.scheduled_at);
          const isPassed = isPTSessionPassed(session.scheduled_at);
          const isBuddy = session.session_type === 'buddy';
          const isHouseCall = session.session_type === 'house_call';
          const sessionTypeLabel = isBuddy ? 'Buddy' : isHouseCall ? 'House Call' : 'Solo';
          const commission = session.commission_amount || getCommissionForSessionType(session.session_type);
          const coachColor = getCoachColor(session.coach_id, coaches);

          return (
            <TouchableOpacity
              key={session.id}
              style={[
                styles.compactCard,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: coachColor,
                },
                isPassed && styles.cardDimmed
              ]}
              onPress={() => onPTPress(session)}
              activeOpacity={0.7}
            >
              <View style={styles.compactCardHeader}>
                <View style={[styles.colorDot, { backgroundColor: coachColor }]} />
                <Text style={[styles.compactTime, isPassed && styles.textDimmed]}>
                  {time}
                </Text>
                <Text style={[styles.compactTitle, isPassed && styles.textDimmed]}>
                  {session.member_name}
                </Text>
              </View>
              <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                {session.coach_name} • {sessionTypeLabel} • S${commission}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  dateHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  classCount: {
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  classCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  emptyCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    color: Colors.darkGray,
    marginTop: 12,
    fontSize: 14,
  },
  compactCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactTime: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.jaiBlue,
    minWidth: 60,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
  },
  compactCoach: {
    fontSize: 12,
    color: Colors.lightGray,
    marginLeft: 16,
  },
  cardDimmed: {
    opacity: 0.5,
  },
  textDimmed: {
    opacity: 0.5,
  },
});
