import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  coach: { full_name: string };
  session_type: string;
  payment_approved: boolean;
}

export const PTSessionsScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<PTSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pt_sessions')
        .select(`
          id, scheduled_at, duration_minutes, status, session_type, payment_approved,
          coach:coach_id(full_name)
        `)
        .eq('member_id', user.id)
        .order('scheduled_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Error fetching PT sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-SG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>My PT Sessions</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchSessions} tintColor={Colors.jaiBlue} />}
        >
          {loading ? (
            <ActivityIndicator color={Colors.jaiBlue} style={{ marginTop: 40 }} />
          ) : sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="fitness-outline" size={48} color={Colors.darkGray} />
              <Text style={styles.emptyText}>No PT sessions history</Text>
            </View>
          ) : (
            sessions.map((session) => (
              <View key={session.id} style={styles.card}>
                <View style={styles.row}>
                  <View>
                    <Text style={styles.dateText}>{formatDate(session.scheduled_at)}</Text>
                    <Text style={styles.coachText}>Coach: {session.coach?.full_name}</Text>
                  </View>
                  <View style={styles.statusContainer}>
                    <View style={[
                      styles.badge,
                      { backgroundColor: session.status === 'completed' ? Colors.success + '20' : Colors.warning + '20' }
                    ]}>
                      <Text style={[
                        styles.badgeText,
                        { color: session.status === 'completed' ? Colors.success : Colors.warning }
                      ]}>
                        {session.status}
                      </Text>
                    </View>
                  </View>
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
  content: { padding: Spacing.lg },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 16, fontWeight: '600', color: Colors.white },
  coachText: { fontSize: 13, color: Colors.lightGray, marginTop: 4 },
  statusContainer: { alignItems: 'flex-end' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: Colors.darkGray, marginTop: 12 },
});
