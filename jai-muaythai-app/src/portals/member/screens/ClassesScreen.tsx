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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface ClassSession {
  id: string;
  class_id: string;
  name: string;
  start_time: string;
  end_time: string;
  capacity: number;
  enrolled_count: number;
  lead_coach?: { full_name: string };
  is_booked: boolean;
  booking_id?: string;
  status: 'scheduled' | 'cancelled' | 'completed';
  date: string;
}

interface Membership {
  id: string;
  status: 'active' | 'expired' | 'cancelled';
  end_date: string;
}

export const ClassesScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay()); // 0=Sunday
  const [membership, setMembership] = useState<Membership | null>(null);
  const [greeting, setGreeting] = useState('');

  // Date management
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  useEffect(() => {
    const hour = new Date().getHours();
    const firstName = user?.full_name?.split(' ')[0] || 'Member';
    if (hour < 12) setGreeting(`Good morning, ${firstName}`);
    else if (hour < 18) setGreeting(`Good afternoon, ${firstName}`);
    else setGreeting(`Good evening, ${firstName}`);
  }, [user]);

  const fetchMembership = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('memberships')
      .select('id, status, end_date')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('end_date', new Date().toISOString())
      .limit(1)
      .single();
    setMembership(data);
  };

  const fetchClasses = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Get selected date string (YYYY-MM-DD)
      const targetDate = weekDays.find(d => d.getDay() === selectedDay) || today;
      const dateStr = targetDate.toISOString().split('T')[0];
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][selectedDay];

      // 1. Get recurring classes for this day
      const { data: recurringClasses } = await supabase
        .from('classes')
        .select(`
          id, name, start_time, end_time, capacity, day_of_week,
          lead_coach:lead_coach_id(full_name)
        `)
        .eq('day_of_week', dayName)
        .eq('is_active', true)
        .order('start_time');

      // 2. Get my bookings for this date
      const { data: myBookings } = await supabase
        .from('class_enrollments')
        .select('class_id, id')
        .eq('user_id', user.id)
        .eq('session_date', dateStr)
        .eq('status', 'active');

      const bookedClassIds = new Set(myBookings?.map(b => b.class_id));
      const bookingMap = new Map(myBookings?.map(b => [b.class_id, b.id]));

      // 3. Process classes
      const processedClasses = (recurringClasses || []).map(cls => ({
        id: `${cls.id}_${dateStr}`, // Unique ID for list
        class_id: cls.id,
        name: cls.name,
        start_time: cls.start_time,
        end_time: cls.end_time,
        capacity: cls.capacity,
        enrolled_count: 0, // TODO: Fetch real counts via RPC if needed
        lead_coach: cls.lead_coach,
        is_booked: bookedClassIds.has(cls.id),
        booking_id: bookingMap.get(cls.id),
        status: 'scheduled' as const,
        date: dateStr,
      }));

      setClasses(processedClasses);
      await fetchMembership();

    } catch (err: any) {
      console.error('Error fetching classes:', err);
    } finally {
      setLoading(false);
    }
  }, [user, selectedDay]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleBook = async (classId: string, dateStr: string) => {
    if (!membership) {
      Alert.alert('Membership Required', 'You need an active membership to book classes.');
      return;
    }

    try {
      const { error } = await supabase
        .from('class_enrollments')
        .insert({
          user_id: user?.id,
          class_id: classId,
          status: 'active',
          session_date: dateStr,
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

  const isPast = (dateStr: string, endTime: string) => {
    const end = new Date(`${dateStr}T${endTime}`);
    // Adjust for timezone if needed, simple comparison for now
    return end < new Date();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        
        {/* Top Bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.subtitle}>Ready to train?</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.iconButton} 
              onPress={() => (navigation as any).navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={24} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.full_name?.charAt(0)}</Text>
            </View>
          </View>
        </View>

        {/* Membership Warning */}
        {!membership && !loading && (
          <TouchableOpacity style={styles.membershipBanner}>
            <LinearGradient
              colors={[Colors.warning + '40', Colors.warning + '20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bannerContent}
            >
              <Ionicons name="alert-circle" size={20} color={Colors.warning} />
              <View style={styles.bannerTextContainer}>
                <Text style={styles.bannerTitle}>No Active Membership</Text>
                <Text style={styles.bannerSubtitle}>Tap to view options</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.warning} />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Date Strip */}
        <View style={styles.dateStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {weekDays.map((date) => {
              const day = date.getDay();
              const isSelected = day === selectedDay;
              const isToday = date.toDateString() === today.toDateString();
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dateItem, isSelected && styles.dateItemSelected]}
                  onPress={() => setSelectedDay(day)}
                >
                  <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>
                    {isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' })}
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
              <Text style={styles.emptyText}>No classes scheduled</Text>
            </View>
          ) : (
            classes.map((cls) => {
              const passed = isPast(cls.date, cls.end_time);
              const isFull = cls.enrolled_count >= cls.capacity;

              return (
                <View key={cls.id} style={[styles.card, passed && styles.cardDimmed]}>
                  <View style={styles.timeColumn}>
                    <Text style={[styles.timeText, passed && styles.textDimmed]}>{formatTime(cls.start_time)}</Text>
                    <Text style={styles.durationText}>{formatTime(cls.end_time)}</Text>
                  </View>
                  
                  <View style={styles.infoColumn}>
                    <Text style={[styles.className, passed && styles.textDimmed]}>{cls.name}</Text>
                    <View style={styles.coachRow}>
                      <Ionicons name="person-outline" size={12} color={Colors.jaiBlue} />
                      <Text style={styles.coachName}>{cls.lead_coach?.full_name || 'Coach TBA'}</Text>
                    </View>
                    <View style={styles.capacityRow}>
                      <View style={styles.progressBarBg}>
                        <View 
                          style={[
                            styles.progressBarFill, 
                            { width: `${Math.min((cls.enrolled_count / cls.capacity) * 100, 100)}%` }
                          ]} 
                        />
                      </View>
                      <Text style={styles.capacityText}>{cls.enrolled_count}/{cls.capacity}</Text>
                    </View>
                  </View>

                  <View style={styles.actionColumn}>
                    {passed ? (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedText}>DONE</Text>
                      </View>
                    ) : cls.is_booked ? (
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => cls.booking_id && handleCancel(cls.booking_id)}
                      >
                        <Text style={styles.cancelText}>Cancel</Text>
                      </TouchableOpacity>
                    ) : isFull ? (
                      <TouchableOpacity style={styles.waitlistButton}>
                        <Text style={styles.waitlistText}>Waitlist</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.bookButton, !membership && styles.buttonDisabled]}
                        onPress={() => handleBook(cls.class_id, cls.date)}
                        disabled={!membership}
                      >
                        <Text style={styles.bookText}>Book</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  safeArea: { flex: 1 },
  header: { 
    paddingHorizontal: Spacing.lg, 
    paddingVertical: Spacing.md,
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  greeting: { fontSize: 14, color: Colors.jaiBlue, fontWeight: '600', textTransform: 'uppercase' },
  subtitle: { fontSize: 24, fontWeight: '800', color: Colors.white },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconButton: { padding: 4 },
  avatar: { 
    width: 36, height: 36, borderRadius: 18, 
    backgroundColor: Colors.jaiBlue, alignItems: 'center', justifyContent: 'center' 
  },
  avatarText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  
  membershipBanner: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  bannerContent: { 
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md, 
    borderRadius: 12, borderWidth: 1, borderColor: Colors.warning 
  },
  bannerTextContainer: { flex: 1, marginLeft: 12 },
  bannerTitle: { color: Colors.warning, fontWeight: '700', fontSize: 14 },
  bannerSubtitle: { color: Colors.warning, fontSize: 12 },

  dateStrip: { flexDirection: 'row', paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  dateItem: {
    alignItems: 'center', justifyContent: 'center',
    width: 56, height: 64, borderRadius: 12,
    backgroundColor: Colors.cardBg, marginRight: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  dateItemSelected: { backgroundColor: Colors.jaiBlue, borderColor: Colors.jaiBlue },
  dateDay: { fontSize: 11, color: Colors.lightGray, marginBottom: 2, textTransform: 'uppercase' },
  dateNum: { fontSize: 18, fontWeight: '700', color: Colors.white },
  dateTextSelected: { color: Colors.white },

  content: { paddingHorizontal: Spacing.lg },
  card: {
    flexDirection: 'row', backgroundColor: Colors.cardBg,
    borderRadius: 16, padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cardDimmed: { opacity: 0.5 },
  timeColumn: { alignItems: 'center', marginRight: Spacing.md, width: 50 },
  timeText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  durationText: { fontSize: 11, color: Colors.lightGray, marginTop: 2 },
  textDimmed: { color: Colors.darkGray },
  
  infoColumn: { flex: 1 },
  className: { fontSize: 16, fontWeight: '700', color: Colors.white, marginBottom: 4 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  coachName: { fontSize: 12, color: Colors.jaiBlue },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBarBg: { width: 60, height: 4, backgroundColor: Colors.darkGray, borderRadius: 2 },
  progressBarFill: { height: 4, backgroundColor: Colors.success, borderRadius: 2 },
  capacityText: { fontSize: 10, color: Colors.lightGray },

  actionColumn: { marginLeft: Spacing.sm },
  bookButton: {
    backgroundColor: Colors.jaiBlue, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
  },
  bookText: { color: Colors.white, fontWeight: '600', fontSize: 12 },
  cancelButton: {
    backgroundColor: 'rgba(255,107,107,0.1)', paddingHorizontal: 16, paddingVertical: 8, 
    borderRadius: 8, borderWidth: 1, borderColor: '#FF6B6B',
  },
  cancelText: { color: '#FF6B6B', fontWeight: '600', fontSize: 12 },
  waitlistButton: {
    backgroundColor: 'rgba(255,179,0,0.1)', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: '#FFB300',
  },
  waitlistText: { color: '#FFB300', fontWeight: '600', fontSize: 12 },
  completedBadge: {
    backgroundColor: Colors.darkGray, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  completedText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },

  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: Colors.darkGray, marginTop: 12 },
});
