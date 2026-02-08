import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../shared/services/supabase';
import { useAuth } from '../../../shared/services/AuthContext';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface PTPackage {
  id: string;
  total_sessions: number;
  sessions_used: number;
  expiry_date: string;
  coach?: { full_name: string; avatar_url: string };
  status: 'active' | 'expired' | 'completed';
}

interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  coach: { full_name: string };
  session_type: string;
}

interface CoachProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio?: string;
  solo_rate?: number;
  tier?: string; // 'Senior', 'Standard', etc.
}

export const PTSessionsScreen: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [packages, setPackages] = useState<PTPackage[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<PTSession[]>([]);
  const [pastSessions, setPastSessions] = useState<PTSession[]>([]);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      await Promise.all([
        fetchPackages(),
        fetchSessions(),
        fetchCoaches(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchPackages = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('pt_packages')
      .select('*, coach:preferred_coach_id(full_name, avatar_url)')
      .eq('user_id', user.id)
      .eq('status', 'active');
    setPackages(data || []);
  };

  const fetchSessions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('pt_sessions')
      .select('*, coach:coach_id(full_name)')
      .eq('member_id', user.id)
      .order('scheduled_at', { ascending: true });

    const now = new Date();
    const upcoming = (data || []).filter(s => new Date(s.scheduled_at) >= now && s.status === 'scheduled');
    const past = (data || []).filter(s => s.status === 'completed' || s.status === 'attended');
    
    setUpcomingSessions(upcoming);
    setPastSessions(past.reverse()); // Most recent completed first
  };

  const fetchCoaches = async () => {
    // Fetch coaches to display in "Book New" section
    const { data } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, solo_rate') // Assuming solo_rate exists on user or join profile
      .eq('role', 'coach')
      .eq('is_active', true);
    setCoaches(data || []);
  };

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleCancelSession = async (session: PTSession) => {
    const sessionTime = new Date(session.scheduled_at);
    const now = new Date();
    const hoursDiff = (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 24) {
      Alert.alert(
        'Late Cancellation Warning',
        'Cancelling within 24 hours of the session will result in 1 session being deducted from your package. Proceed?',
        [
          { text: 'Keep Session', style: 'cancel' },
          { 
            text: 'Confirm Cancel', 
            style: 'destructive',
            onPress: () => performCancellation(session.id)
          }
        ]
      );
    } else {
      Alert.alert(
        'Cancel Session',
        'Are you sure you want to cancel this session?',
        [
          { text: 'No', style: 'cancel' },
          { text: 'Yes, Cancel', onPress: () => performCancellation(session.id) }
        ]
      );
    }
  };

  const performCancellation = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('pt_sessions')
        .update({ status: 'cancelled', cancellation_reason: 'Member requested' })
        .eq('id', sessionId);
      
      if (error) throw error;
      Alert.alert('Success', 'Session cancelled');
      fetchSessions();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-SG', { month: 'short', day: 'numeric', weekday: 'short' }),
      time: d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>My PT</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchAllData} tintColor={Colors.jaiBlue} />}
        >
          {loading ? (
            <ActivityIndicator color={Colors.jaiBlue} style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* Active Packages */}
              {packages.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>ACTIVE PACKAGES</Text>
                  {packages.map(pkg => (
                    <View key={pkg.id} style={styles.packageCard}>
                      <View style={styles.packageHeader}>
                        <View style={styles.coachAvatar}>
                          <Text style={styles.coachInitials}>{pkg.coach?.full_name[0] || 'C'}</Text>
                        </View>
                        <View style={styles.packageInfo}>
                          <Text style={styles.packageName}>10 Session Pack</Text>
                          <Text style={styles.packageCoach}>Coach {pkg.coach?.full_name || 'TBD'}</Text>
                        </View>
                      </View>
                      
                      <View style={styles.progressContainer}>
                        <View style={styles.progressBarBg}>
                          <View 
                            style={[
                              styles.progressBarFill, 
                              { width: `${((pkg.total_sessions - pkg.sessions_used) / pkg.total_sessions) * 100}%` }
                            ]} 
                          />
                        </View>
                        <View style={styles.progressLabels}>
                          <Text style={styles.progressText}>{pkg.total_sessions - pkg.sessions_used} left</Text>
                          <Text style={styles.progressTotal}>{pkg.total_sessions} total</Text>
                        </View>
                      </View>
                      <Text style={styles.expiryText}>Expires {new Date(pkg.expiry_date).toLocaleDateString()}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Upcoming Sessions */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>UPCOMING</Text>
                {upcomingSessions.length === 0 ? (
                  <Text style={styles.emptyText}>No upcoming sessions</Text>
                ) : (
                  upcomingSessions.map(session => {
                    const { date, time } = formatDateTime(session.scheduled_at);
                    return (
                      <View key={session.id} style={styles.sessionCard}>
                        <View style={styles.sessionDateBox}>
                          <Text style={styles.sessionDate}>{date.split(',')[1]}</Text>
                          <Text style={styles.sessionDay}>{date.split(',')[0]}</Text>
                        </View>
                        <View style={styles.sessionInfo}>
                          <Text style={styles.sessionTime}>{time}</Text>
                          <Text style={styles.sessionCoach}>w/ {session.coach?.full_name}</Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.cancelButton}
                          onPress={() => handleCancelSession(session)}
                        >
                          <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Book New PT */}
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>BOOK NEW PT</Text>
                  <TouchableOpacity>
                    <Text style={styles.viewAllText}>View All</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coachList}>
                  {coaches.map(coach => (
                    <TouchableOpacity key={coach.id} style={styles.coachCard}>
                      <View style={styles.coachCardAvatar}>
                        <Text style={styles.coachCardInitials}>{coach.full_name[0]}</Text>
                      </View>
                      <Text style={styles.coachCardName} numberOfLines={1}>{coach.full_name}</Text>
                      <Text style={styles.coachCardRate}>S${coach.solo_rate || 100}</Text>
                      <TouchableOpacity style={styles.bookCoachButton}>
                        <Text style={styles.bookCoachText}>Book</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* History */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>HISTORY ({pastSessions.length})</Text>
                {pastSessions.slice(0, 3).map(session => (
                  <View key={session.id} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{new Date(session.scheduled_at).toLocaleDateString()}</Text>
                    <Text style={styles.historyCoach}>{session.coach?.full_name}</Text>
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedText}>DONE</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
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
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.lightGray, marginBottom: Spacing.md, letterSpacing: 1 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  viewAllText: { color: Colors.jaiBlue, fontSize: 12, fontWeight: '600' },

  // Package Card
  packageCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: Spacing.md,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  packageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  coachAvatar: { 
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.jaiBlue, 
    alignItems: 'center', justifyContent: 'center', marginRight: 12 
  },
  coachInitials: { color: Colors.white, fontWeight: '700' },
  packageInfo: { flex: 1 },
  packageName: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  packageCoach: { color: Colors.lightGray, fontSize: 12 },
  
  progressContainer: { marginBottom: 8 },
  progressBarBg: { height: 6, backgroundColor: Colors.darkGray, borderRadius: 3, marginBottom: 6 },
  progressBarFill: { height: 6, backgroundColor: Colors.success, borderRadius: 3 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { color: Colors.success, fontSize: 12, fontWeight: '600' },
  progressTotal: { color: Colors.darkGray, fontSize: 12 },
  expiryText: { color: Colors.darkGray, fontSize: 11, textAlign: 'right' },

  emptyText: { color: Colors.darkGray, fontStyle: 'italic' },

  // Session Card
  sessionCard: {
    flexDirection: 'row', backgroundColor: Colors.cardBg, borderRadius: 12,
    padding: Spacing.md, marginBottom: Spacing.sm, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  sessionDateBox: { 
    alignItems: 'center', backgroundColor: Colors.black, borderRadius: 8, 
    padding: 8, marginRight: 12, width: 50 
  },
  sessionDate: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  sessionDay: { color: Colors.lightGray, fontSize: 10, textTransform: 'uppercase' },
  sessionInfo: { flex: 1 },
  sessionTime: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  sessionCoach: { color: Colors.jaiBlue, fontSize: 12 },
  cancelButton: { 
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, 
    backgroundColor: 'rgba(255,107,107,0.1)', borderWidth: 1, borderColor: '#FF6B6B' 
  },
  cancelText: { color: '#FF6B6B', fontSize: 11, fontWeight: '600' },

  // Book Coach
  coachList: { marginRight: -Spacing.lg },
  coachCard: {
    width: 120, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 12,
    marginRight: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  coachCardAvatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.darkGray,
    marginBottom: 8, alignItems: 'center', justifyContent: 'center',
  },
  coachCardInitials: { color: Colors.white, fontSize: 18, fontWeight: '700' },
  coachCardName: { color: Colors.white, fontWeight: '600', fontSize: 13, marginBottom: 4 },
  coachCardRate: { color: Colors.success, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  bookCoachButton: {
    backgroundColor: Colors.jaiBlue, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 20, width: '100%', alignItems: 'center',
  },
  bookCoachText: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  // History
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  historyDate: { color: Colors.lightGray, fontSize: 13, width: 80 },
  historyCoach: { color: Colors.white, fontSize: 13, flex: 1 },
  completedBadge: { backgroundColor: Colors.darkGray, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  completedText: { color: Colors.lightGray, fontSize: 10, fontWeight: '700' },
});
