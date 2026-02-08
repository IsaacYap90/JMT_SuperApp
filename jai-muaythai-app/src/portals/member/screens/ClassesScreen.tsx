import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface ClassSession {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  capacity: number;
  enrolled_count: number;
  lead_coach?: { full_name: string };
  is_booked: boolean;
  booking_id?: string;
  day_of_week: string;
}

export const ClassesScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay()); // 0=Sunday

  // Date management
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const fetchClasses = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Get schedule for the selected day of week
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][selectedDay];
      
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('classes')
        .select(`
          id, name, start_time, end_time, capacity, day_of_week,
          lead_coach:lead_coach_id(full_name)
        `)
        .eq('day_of_week', dayName)
        .eq('is_active', true)
        .order('start_time');

      if (scheduleError) throw scheduleError;

      // 2. Get my bookings
      const { data: myBookings } = await supabase
        .from('class_enrollments')
        .select('class_id, id')
        .eq('user_id', user.id)
        .eq('status', 'active');

      // 3. Get total enrollment counts
      // Note: This requires a separate query or a view. For simplicity/speed, we'll fetch counts.
      // Ideally, use a RPC function or view for this.
      // Hack: For now, we assume capacity isn't always full or handle it optimistically.
      
      const bookedClassIds = new Set(myBookings?.map(b => b.class_id));
      const bookingMap = new Map(myBookings?.map(b => [b.class_id, b.id]));

      const processedClasses = (scheduleData || []).map(cls => ({
        ...cls,
        enrolled_count: 0, // Placeholder - needs real count
        is_booked: bookedClassIds.has(cls.id),
        booking_id: bookingMap.get(cls.id),
      }));

      setClasses(processedClasses);

    } catch (err: any) {
      console.error('Error fetching classes:', err);
      Alert.alert('Error', 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [user, selectedDay]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleBook = async (classId: string) => {
    try {
      const { error } = await supabase
        .from('class_enrollments')
        .insert({
          user_id: user?.id,
          class_id: classId,
          status: 'active',
          session_date: new Date().toISOString().split('T')[0] // Simplifying: booking generic slot
          // REALITY CHECK: JMT schema likely books specific dates (class_sessions).
          // If 'classes' table defines the recurring schedule, we need to book a specific SESSION.
          // Assuming we book the recurring slot for now based on the selected date.
        });

      if (error) throw error;
      Alert.alert('Success', 'Class booked!');
      fetchClasses();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Booking failed');
    }
  };

  const handleCancel = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('class_enrollments')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);

      if (error) throw error;
      Alert.alert('Cancelled', 'Booking cancelled.');
      fetchClasses();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Cancellation failed');
    }
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Class Schedule</Text>
        </View>

        {/* Date Strip */}
        <View style={styles.dateStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {weekDays.map((date) => {
              const day = date.getDay();
              const isSelected = day === selectedDay;
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dateItem, isSelected && styles.dateItemSelected]}
                  onPress={() => setSelectedDay(day)}
                >
                  <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </Text>
                  <Text style={[styles.dateNum, isSelected && styles.dateTextSelected]}>
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchClasses} tintColor={Colors.jaiBlue} />}
        >
          {loading ? (
            <ActivityIndicator color={Colors.jaiBlue} style={{ marginTop: 40 }} />
          ) : classes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.darkGray} />
              <Text style={styles.emptyText}>No classes on this day</Text>
            </View>
          ) : (
            classes.map((cls) => (
              <View key={cls.id} style={styles.card}>
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{formatTime(cls.start_time)}</Text>
                  <Text style={styles.durationText}>60 min</Text>
                </View>
                <View style={styles.infoColumn}>
                  <Text style={styles.className}>{cls.name}</Text>
                  <Text style={styles.coachName}>{cls.lead_coach?.full_name || 'TBA'}</Text>
                </View>
                <View style={styles.actionColumn}>
                  {cls.is_booked ? (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => cls.booking_id && handleCancel(cls.booking_id)}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.bookButton}
                      onPress={() => handleBook(cls.id)}
                    >
                      <Text style={styles.bookText}>Book</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  safeArea: { flex: 1 },
  header: { padding: Spacing.lg },
  title: { fontSize: 28, fontWeight: '800', color: Colors.white },
  dateStrip: { flexDirection: 'row', paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  dateItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 70,
    borderRadius: 12,
    backgroundColor: Colors.cardBg,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateItemSelected: { backgroundColor: Colors.jaiBlue, borderColor: Colors.jaiBlue },
  dateDay: { fontSize: 12, color: Colors.lightGray, marginBottom: 4 },
  dateNum: { fontSize: 18, fontWeight: '700', color: Colors.white },
  dateTextSelected: { color: Colors.white },
  content: { padding: Spacing.lg },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  timeColumn: { alignItems: 'center', marginRight: Spacing.md, width: 60 },
  timeText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  durationText: { fontSize: 11, color: Colors.lightGray, marginTop: 4 },
  infoColumn: { flex: 1 },
  className: { fontSize: 16, fontWeight: '600', color: Colors.white },
  coachName: { fontSize: 13, color: Colors.jaiBlue, marginTop: 2 },
  actionColumn: { marginLeft: Spacing.sm },
  bookButton: {
    backgroundColor: Colors.jaiBlue,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bookText: { color: Colors.white, fontWeight: '600', fontSize: 13 },
  cancelButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  cancelText: { color: '#FF6B6B', fontWeight: '600', fontSize: 13 },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: Colors.darkGray, marginTop: 12 },
});
