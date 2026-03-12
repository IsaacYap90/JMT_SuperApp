import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { getCoachColor } from '../../../../shared/constants/CoachColors';
import { ClassItem, PTSession, Coach, DAY_COLUMN_WIDTH } from './types';

interface WeekDay {
  date: Date;
  dayOfWeek: string;
  isToday: boolean;
  isPast: boolean;
}

interface WeeklyViewProps {
  weekDays: WeekDay[];
  classes: ClassItem[];
  ptSessions: PTSession[];
  coaches: Coach[];
  scrollViewRef: React.RefObject<ScrollView | null>;
  formatTime: (time: string) => string;
  formatPTDateTime: (isoString: string) => { time: string; date: string };
  isTimePassed: (startTime: string, date: Date) => boolean;
  isPTSessionPassed: (isoString: string) => boolean;
  onClassPress: (cls: ClassItem) => void;
  onPTPress: (session: PTSession) => void;
}

export const WeeklyView: React.FC<WeeklyViewProps> = ({
  weekDays,
  classes,
  ptSessions,
  coaches,
  scrollViewRef,
  formatTime,
  formatPTDateTime,
  isTimePassed,
  isPTSessionPassed,
  onClassPress,
  onPTPress,
}) => {
  // Helper to get PT sessions for a specific date
  const getPTSessionsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return ptSessions.filter(session => {
      const sessionDate = new Date(session.scheduled_at);
      const sgDate = new Date(sessionDate.getTime() + 8 * 60 * 60 * 1000);
      const sessionDateStr = sgDate.toISOString().split('T')[0];
      return sessionDateStr === dateStr;
    }).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.weeklyContainer}
      contentContainerStyle={styles.weeklyContent}
    >
      {weekDays.map((day, index) => {
        const dayClasses = classes
          .filter(c => c.day_of_week === day.dayOfWeek)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));

        const dayPTSessions = getPTSessionsForDate(day.date);
        const hasContent = dayClasses.length > 0 || dayPTSessions.length > 0;

        return (
          <View
            key={index}
            style={[
              styles.dayColumn,
              day.isPast && styles.dayColumnPast
            ]}
          >
            <View style={[
              styles.dayHeaderContainer,
              day.isToday && styles.dayHeaderToday
            ]}>
              <Text style={[
                styles.dayHeaderDay,
                day.isToday && styles.dayHeaderTodayText,
                day.isPast && styles.dayHeaderPast
              ]}>
                {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
              </Text>
              <Text style={[
                styles.dayHeaderDate,
                day.isToday && styles.dayHeaderTodayText,
                day.isPast && styles.dayHeaderPast
              ]}>
                {day.date.getDate()}
              </Text>
            </View>

            <ScrollView
              style={styles.dayClassList}
              showsVerticalScrollIndicator={false}
            >
              {!hasContent ? (
                <View style={styles.noClassCard}>
                  <Text style={styles.noClassText}>No sessions</Text>
                </View>
              ) : (
                <>
                  {/* Render Classes */}
                  {dayClasses.map((classItem) => {
                    const isPassed = day.isPast || (day.isToday && isTimePassed(classItem.start_time, day.date));
                    return (
                      <TouchableOpacity
                        key={`class-${classItem.id}`}
                        style={[
                          styles.miniClassCard,
                          { borderLeftColor: classItem.lead_coach_id ? getCoachColor(classItem.lead_coach_id, coaches) : Colors.jaiBlue },
                          isPassed && styles.miniCardDimmed
                        ]}
                        onPress={() => onClassPress(classItem)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.miniClassName} numberOfLines={1}>
                          {classItem.name}
                        </Text>
                        <Text style={styles.miniClassTime}>
                          {formatTime(classItem.start_time)}
                        </Text>
                        {classItem.lead_coach && (
                          <Text style={styles.miniCoachName} numberOfLines={1}>
                            {classItem.lead_coach.full_name}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {/* Render PT Sessions */}
                  {dayPTSessions.map((session) => {
                    const { time } = formatPTDateTime(session.scheduled_at);
                    const isPassed = isPTSessionPassed(session.scheduled_at);
                    const isBuddy = session.session_type === 'buddy';
                    const isHouseCall = session.session_type === 'house_call';
                    const icon = isBuddy ? '\u{1F465}' : isHouseCall ? '\u{1F3E0}' : '\u{1F4AA}';

                    return (
                      <TouchableOpacity
                        key={`pt-${session.id}`}
                        style={[
                          styles.miniPTCard,
                          { borderLeftColor: getCoachColor(session.coach_id, coaches) },
                          isPassed && styles.miniCardDimmed
                        ]}
                        onPress={() => onPTPress(session)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.miniPTMember} numberOfLines={1}>
                          {icon} {session.member_name}
                        </Text>
                        <Text style={styles.miniPTTime}>
                          {time}
                        </Text>
                        <Text style={styles.miniPTCoach} numberOfLines={1}>
                          {session.coach_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  weeklyContainer: {
    flex: 1,
  },
  weeklyContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 0,
  },
  dayColumn: {
    width: DAY_COLUMN_WIDTH,
    marginRight: 8,
  },
  dayColumnPast: {
    opacity: 0.5,
  },
  dayHeaderContainer: {
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    paddingVertical: 8,
    marginBottom: Spacing.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayHeaderToday: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  dayHeaderDay: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  dayHeaderDate: {
    fontSize: 11,
    color: Colors.lightGray,
    marginTop: 2,
  },
  dayHeaderTodayText: {
    color: Colors.white,
  },
  dayHeaderPast: {
    color: Colors.darkGray,
  },
  dayClassList: {
    flex: 1,
  },
  noClassCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noClassText: {
    fontSize: 11,
    color: Colors.darkGray,
  },
  miniClassCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniCardDimmed: {
    opacity: 0.5,
    borderLeftColor: Colors.darkGray,
  },
  miniClassName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  miniClassTime: {
    fontSize: 11,
    color: Colors.lightGray,
    marginTop: 3,
  },
  miniCoachName: {
    fontSize: 10,
    color: Colors.jaiBlue,
    marginTop: 3,
  },
  miniPTCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniPTMember: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  miniPTTime: {
    fontSize: 11,
    color: Colors.warning,
    marginTop: 3,
    fontWeight: '600',
  },
  miniPTCoach: {
    fontSize: 10,
    color: Colors.success,
    marginTop: 3,
  },
});
