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
import { ClassItem, PTSession, TimelineItem } from './types';
import { formatTime, formatDate, formatPTDateTime, isPTSessionPassed, getClassLevel, isTimePassed } from './utils';

interface TodayViewProps {
  todayClasses: ClassItem[];
  todayPTSessions: PTSession[];
  upcomingPTSessions: PTSession[];
  today: Date;
  coachColor: string;
  refreshing: boolean;
  onRefresh: () => void;
  onCardPress: (item: TimelineItem) => void;
  onMarkAttended: (session: PTSession) => void;
  formatCoachRole: (cls: ClassItem) => string;
}

export const TodayView: React.FC<TodayViewProps> = ({
  todayClasses,
  todayPTSessions,
  upcomingPTSessions,
  today,
  coachColor,
  refreshing,
  onRefresh,
  onCardPress,
  onMarkAttended,
  formatCoachRole,
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
        <Text style={styles.dateHeader}>{formatDate(today.toISOString())}</Text>
      </View>

      {/* Group Classes Section */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: Colors.jaiBlue }]} />
        <Text style={styles.sectionTitle}>GROUP CLASSES</Text>
      </View>

      {todayClasses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={40} color={Colors.darkGray} />
          <Text style={styles.emptyText}>No classes scheduled for today</Text>
        </View>
      ) : (
        todayClasses.map((classItem) => {
          const isPassed = isTimePassed(classItem.start_time, today);
          const isMyClass = classItem.isMyClass;

          return (
            <TouchableOpacity
              key={classItem.id}
              style={[
                styles.compactCard,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: coachColor,
                },
                isPassed && styles.cardDimmed,
              ]}
              onPress={() => {
                const timelineItem: TimelineItem = {
                  id: `class-${classItem.id}`,
                  type: 'class',
                  time: formatTime(classItem.start_time),
                  title: classItem.name,
                  subtitle: getClassLevel(classItem.name),
                  details: `${classItem.start_time} - ${classItem.end_time}`,
                  isPassed,
                  isAssistant: !isMyClass,
                  data: classItem,
                };
                onCardPress(timelineItem);
              }}
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
              <Text
                style={[styles.compactCoach, isPassed && styles.textDimmed]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {formatCoachRole(classItem)}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

      {/* PT Sessions Section */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: Colors.success }]} />
        <Text style={styles.sectionTitle}>PT SESSIONS</Text>
      </View>

      {todayPTSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="person-outline" size={40} color={Colors.darkGray} />
          <Text style={styles.emptyText}>No PT sessions for today</Text>
        </View>
      ) : (
        todayPTSessions.map((session) => {
          const isPassed = isPTSessionPassed(session.scheduled_at);
          const { time } = formatPTDateTime(session.scheduled_at);
          const isBuddy = session.session_type === 'buddy';
          const isHouseCall = session.session_type === 'house_call';
          const sessionTypeLabel = isBuddy ? 'Buddy' : isHouseCall ? 'House Call' : 'Solo Package';
          const commission = session.commission_amount || 40;
          const canMarkAttended = isPassed && !session.coach_verified && session.status === 'scheduled';

          return (
            <TouchableOpacity
              key={session.id}
              style={[
                styles.compactCard,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: coachColor,
                },
                isPassed && styles.cardDimmed,
              ]}
              onPress={() => {
                if (canMarkAttended) {
                  onMarkAttended(session);
                } else {
                  const timelineItem: TimelineItem = {
                    id: `pt-${session.id}`,
                    type: 'pt',
                    time,
                    title: session.member_name,
                    subtitle: `${session.duration_minutes} min`,
                    details: `${session.duration_minutes} min`,
                    isPassed,
                    sessionType: session.session_type,
                    commission: session.commission_amount || 40,
                    data: session,
                  };
                  onCardPress(timelineItem);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.compactCardHeader}>
                <View style={[styles.colorDot, { backgroundColor: coachColor }]} />
                <Text style={[styles.compactTime, isPassed && styles.textDimmed]}>
                  {time}
                </Text>
                <Text style={[styles.compactTitle, isPassed && styles.textDimmed]}>
                  PT - {session.member_name}
                </Text>
              </View>
              <Text style={[styles.compactCoach, isPassed && styles.textDimmed]}>
                You • {sessionTypeLabel} • S${commission.toFixed(0)}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

      {/* Upcoming PT Sessions (rest of the week) */}
      {upcomingPTSessions.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, { backgroundColor: Colors.warning }]} />
            <Text style={styles.sectionTitle}>UPCOMING PT SESSIONS</Text>
          </View>

          {upcomingPTSessions.slice(0, 5).map((session) => {
            const { time, date } = formatPTDateTime(session.scheduled_at);
            const isBuddy = session.session_type === 'buddy';
            const isHouseCall = session.session_type === 'house_call';
            const icon = isBuddy ? '👥' : isHouseCall ? '🏠' : '';

            return (
              <View key={session.id} style={styles.upcomingPTCard}>
                <View style={styles.upcomingPTLeft}>
                  <Text style={styles.upcomingPTDate}>{date}</Text>
                  <Text style={styles.upcomingPTTime}>{time}</Text>
                </View>
                <View style={styles.upcomingPTRight}>
                  <Text style={styles.upcomingPTMember}>
                    {icon} {session.member_name}
                  </Text>
                  <Text style={styles.upcomingPTDuration}>{session.duration_minutes} min</Text>
                </View>
              </View>
            );
          })}
        </>
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
  upcomingPTCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  upcomingPTLeft: {
    alignItems: 'flex-start',
  },
  upcomingPTDate: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  upcomingPTTime: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
    marginTop: 2,
  },
  upcomingPTRight: {
    alignItems: 'flex-end',
  },
  upcomingPTMember: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  upcomingPTDuration: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 2,
  },
});
