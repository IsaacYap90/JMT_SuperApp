import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface ScheduleItem {
  id: string;
  type: 'class' | 'pt';
  time: string;
  title: string;
  subtitle: string;
  status: string;
  date: Date;
  data: any;
}

export const UnifiedScheduleScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    const firstName = user?.full_name?.split(' ')[0] || 'Member';
    if (hour < 12) setGreeting(`Good morning, ${firstName}`);
    else if (hour < 18) setGreeting(`Good afternoon, ${firstName}`);
    else setGreeting(`Good evening, ${firstName}`);
  }, [user]);

  const fetchSchedule = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);

      // 1. Fetch PT Sessions (Upcoming)
      const { data: ptData } = await supabase
        .from('pt_sessions')
        .select(`
          id, scheduled_at, duration_minutes, status, session_type,
          coach:coach_id(full_name)
        `)
        .eq('member_id', user.id)
        .gte('scheduled_at', today.toISOString())
        .lte('scheduled_at', nextWeek.toISOString())
        .order('scheduled_at');

      // 2. Fetch Class Bookings (Upcoming)
      const { data: bookingData } = await supabase
        .from('class_enrollments')
        .select(`
          id, session_date, status,
          class:class_id(name, start_time, end_time, lead_coach_id)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gte('session_date', today.toISOString().split('T')[0])
        .lte('session_date', nextWeek.toISOString().split('T')[0]);

      // 3. Merge & Sort
      const items: ScheduleItem[] = [];

      ptData?.forEach((pt: any) => {
        items.push({
          id: pt.id,
          type: 'pt',
          time: new Date(pt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          title: 'PT Session',
          subtitle: `w/ ${pt.coach?.full_name}`,
          status: pt.status,
          date: new Date(pt.scheduled_at),
          data: pt,
        });
      });

      bookingData?.forEach((booking: any) => {
        // Construct full date for sorting
        const dateTime = new Date(`${booking.session_date}T${booking.class.start_time}`);
        
        items.push({
          id: booking.id,
          type: 'class',
          time: formatTime(booking.class.start_time),
          title: booking.class.name,
          subtitle: 'Group Class',
          status: booking.status,
          date: dateTime,
          data: booking,
        });
      });

      // Sort by date/time
      items.sort((a, b) => a.date.getTime() - b.date.getTime());
      setSchedule(items);

    } catch (err) {
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  const getDayHeader = (date: Date) => {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

    return date.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  // Group items by day
  const groupedSchedule = schedule.reduce((acc: Record<string, ScheduleItem[]>, item) => {
    const header = getDayHeader(item.date);
    if (!acc[header]) acc[header] = [];
    acc[header].push(item);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.subtitle}>My Training</Text>
          </View>
          <TouchableOpacity 
            style={styles.iconButton} 
            onPress={() => (navigation as any).navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchSchedule} tintColor={Colors.jaiBlue} />}
        >
          {loading ? (
            <ActivityIndicator color={Colors.jaiBlue} style={{ marginTop: 40 }} />
          ) : schedule.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.darkGray} />
              <Text style={styles.emptyText}>No upcoming sessions</Text>
              <TouchableOpacity style={styles.bookButton} onPress={() => (navigation as any).navigate('Classes')}> 
                 {/* Note: 'Classes' tab will be hidden/renamed? Or we keep it as 'Book Class'? */}
                 <Text style={styles.bookButtonText}>Book a Class</Text>
              </TouchableOpacity>
            </View>
          ) : (
            Object.entries(groupedSchedule).map(([header, items]) => (
              <View key={header} style={styles.daySection}>
                <Text style={styles.dayHeader}>{header}</Text>
                {items.map((item) => (
                  <View key={item.id} style={[styles.card, item.type === 'pt' ? styles.ptCard : styles.classCard]}>
                    <View style={styles.timeColumn}>
                      <Text style={styles.timeText}>{item.time}</Text>
                    </View>
                    <View style={styles.infoColumn}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                    </View>
                    <View style={styles.typeBadge}>
                      <Text style={[styles.typeText, { color: item.type === 'pt' ? Colors.warning : Colors.jaiBlue }]}>
                        {item.type === 'pt' ? 'PT' : 'CLASS'}
                      </Text>
                    </View>
                  </View>
                ))}
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
  header: { 
    paddingHorizontal: Spacing.lg, 
    paddingVertical: Spacing.md,
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  greeting: { fontSize: 14, color: Colors.jaiBlue, fontWeight: '600', textTransform: 'uppercase' },
  subtitle: { fontSize: 28, fontWeight: '800', color: Colors.white },
  iconButton: { padding: 4 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  
  daySection: { marginBottom: Spacing.lg },
  dayHeader: { fontSize: 14, fontWeight: '700', color: Colors.lightGray, marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  
  card: {
    flexDirection: 'row', backgroundColor: Colors.cardBg,
    borderRadius: 16, padding: Spacing.md, marginBottom: 8,
    borderWidth: 1, alignItems: 'center',
  },
  classCard: { borderColor: Colors.jaiBlue + '40', borderLeftWidth: 4, borderLeftColor: Colors.jaiBlue },
  ptCard: { borderColor: Colors.warning + '40', borderLeftWidth: 4, borderLeftColor: Colors.warning },

  timeColumn: { width: 60 },
  timeText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  
  infoColumn: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.white, marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: Colors.lightGray },

  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: Colors.black },
  typeText: { fontSize: 10, fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: Colors.darkGray, fontSize: 16, marginBottom: 20 },
  bookButton: { backgroundColor: Colors.jaiBlue, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  bookButtonText: { color: Colors.white, fontWeight: '600' },
});
