import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Colors, Spacing } from '../../../../shared/constants/Colors';
import { ClassItem, PTSession, TimelineItem, DAY_COLUMN_WIDTH } from './types';
import { createUnifiedTimeline } from './utils';

interface WeekDay {
  date: Date;
  dayOfWeek: string;
  isToday: boolean;
  isPast: boolean;
}

interface WeeklyViewProps {
  weekDays: WeekDay[];
  classes: ClassItem[];
  weeklyPTSessions: PTSession[];
  scrollViewRef: React.RefObject<ScrollView | null>;
  onCardPress: (item: TimelineItem) => void;
  getPTSessionsForDay: (dayOfWeek: string) => PTSession[];
}

export const WeeklyView: React.FC<WeeklyViewProps> = ({
  weekDays,
  classes,
  weeklyPTSessions,
  scrollViewRef,
  onCardPress,
  getPTSessionsForDay,
}) => {
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

        const dayPTSessions = getPTSessionsForDay(day.dayOfWeek);
        const timeline = createUnifiedTimeline(dayClasses, dayPTSessions, day.date);
        const hasContent = timeline.length > 0;

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
              contentContainerStyle={{ paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Unified Timeline */}
              {timeline.map((item) => {
                const isClass = item.type === 'class';
                const isPT = item.type === 'pt';
                const isBuddy = item.sessionType === 'buddy';
                const isHouseCall = item.sessionType === 'house_call';

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.timelineCard,
                      item.isPassed && styles.timelineCardDimmed,
                      isClass && styles.timelineCardClass,
                      isPT && styles.timelineCardPT,
                      isBuddy && styles.timelineCardBuddy,
                      isHouseCall && styles.timelineCardHouseCall,
                    ]}
                    onPress={() => onCardPress(item)}
                    activeOpacity={0.7}
                  >
                    {/* Time */}
                    <Text style={styles.timelineTime}>{item.time}</Text>

                    {/* Main Content */}
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.timelineSubtitle} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    </View>

                    {/* Type Badge */}
                    <View style={[
                      styles.timelineBadge,
                      isClass && styles.timelineBadgeClass,
                      isPT && styles.timelineBadgePT,
                    ]}>
                      <Text style={[
                        styles.timelineBadgeText,
                        isClass && styles.timelineBadgeTextClass,
                        isPT && styles.timelineBadgeTextPT,
                      ]}>
                        {isClass ? 'Class' : 'PT'}
                      </Text>
                    </View>

                    {/* Commission for PT */}
                    {isPT && (
                      <Text style={styles.timelineCommission}>
                        {'💰'}S${(item.commission || 40).toFixed(0)}
                      </Text>
                    )}

                    {/* Assistant indicator */}
                    {isClass && item.isAssistant && (
                      <Text style={styles.timelineAssistant}>Assistant</Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              {!hasContent && (
                <View style={styles.noClassCard}>
                  <Text style={styles.noClassText}>No sessions</Text>
                </View>
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
    paddingBottom: 100,
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
  // Unified Timeline Card Styles
  timelineCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineCardDimmed: {
    opacity: 0.5,
  },
  timelineCardClass: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.jaiBlue,
    backgroundColor: Colors.cardBg,
  },
  timelineCardPT: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.warning + '10',
  },
  timelineCardBuddy: {
    borderLeftColor: Colors.neonPurple,
    backgroundColor: Colors.neonPurple + '15',
  },
  timelineCardHouseCall: {
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.warning + '15',
  },
  timelineTime: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
    width: 60,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 8,
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  timelineSubtitle: {
    fontSize: 10,
    color: Colors.lightGray,
    marginTop: 2,
  },
  timelineBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  timelineBadgeClass: {
    backgroundColor: Colors.jaiBlue + '20',
  },
  timelineBadgePT: {
    backgroundColor: Colors.warning + '20',
  },
  timelineBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  timelineBadgeTextClass: {
    color: Colors.jaiBlue,
  },
  timelineBadgeTextPT: {
    color: Colors.warning,
  },
  timelineCommission: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.success,
    marginRight: 4,
  },
  timelineAssistant: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.warning,
    marginLeft: 'auto',
  },
});
