import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../shared/services/AuthContext';
import { supabase } from '../../../shared/services/supabase';
import { Colors, Spacing } from '../../../shared/constants/Colors';

interface Membership {
  id: string;
  type: { name: string; price: number };
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled';
}

export const ProfileScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    fetchMembership();
  }, [user]);

  const fetchMembership = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('memberships')
        .select(`
          id, start_date, end_date, status,
          type:membership_type_id(name, price)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();
      setMembership(data);
    } catch (err) {
      // No active membership
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = () => {
    if (!membership) return 0;
    const end = new Date(membership.end_date);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const daysLeft = getDaysRemaining();
  const statusColor = daysLeft > 30 ? Colors.success : daysLeft > 7 ? '#FFB300' : '#FF6B6B';

  const handleRenew = () => {
    Alert.alert('Renew Membership', 'Payment integration coming soon! Please visit the counter.');
  };

  const handleChangePassword = () => {
    Alert.alert('Change Password', 'An email has been sent to reset your password.');
    if (user?.email) supabase.auth.resetPasswordForEmail(user.email);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          
          {/* User Header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.full_name?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.name}>{user?.full_name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <Text style={styles.memberSince}>Member since {new Date(user?.created_at || '').getFullYear()}</Text>
            </View>
          </View>

          {/* Membership Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MY MEMBERSHIP</Text>
            {loading ? (
              <ActivityIndicator color={Colors.jaiBlue} />
            ) : membership ? (
              <View style={styles.membershipCard}>
                <View style={styles.membershipRow}>
                  <View>
                    <Text style={styles.planName}>{membership.type.name}</Text>
                    <Text style={styles.planStatus}>Active • {daysLeft} days left</Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                </View>
                
                <View style={styles.dateRow}>
                  <Text style={styles.dateLabel}>Valid until</Text>
                  <Text style={styles.dateValue}>{new Date(membership.end_date).toLocaleDateString()}</Text>
                </View>

                {daysLeft < 30 && (
                  <TouchableOpacity style={styles.renewButton} onPress={handleRenew}>
                    <Text style={styles.renewText}>Renew Now</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.noMembershipCard}>
                <Ionicons name="card-outline" size={32} color={Colors.darkGray} />
                <Text style={styles.noMembershipText}>No Active Membership</Text>
                <TouchableOpacity style={styles.buyButton} onPress={handleRenew}>
                  <Text style={styles.buyButtonText}>View Plans</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SETTINGS</Text>
            
            <TouchableOpacity style={styles.settingItem} onPress={handleChangePassword}>
              <View style={styles.settingLeft}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.lightGray} />
                <Text style={styles.settingText}>Change Password</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.darkGray} />
            </TouchableOpacity>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <Ionicons name="notifications-outline" size={20} color={Colors.lightGray} />
                <Text style={styles.settingText}>Notifications</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: Colors.darkGray, true: Colors.jaiBlue }}
                thumbColor={Colors.white}
              />
            </View>

            <TouchableOpacity style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.lightGray} />
                <Text style={styles.settingText}>Privacy Policy</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.darkGray} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>Version 1.0.0 (Beta)</Text>
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
  content: { padding: Spacing.lg, paddingBottom: 40 },

  // Header
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xl },
  avatar: { 
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.jaiBlue, 
    alignItems: 'center', justifyContent: 'center', marginRight: 16 
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: Colors.white },
  profileInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: Colors.white },
  email: { fontSize: 14, color: Colors.lightGray, marginTop: 2 },
  memberSince: { fontSize: 12, color: Colors.darkGray, marginTop: 4 },

  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.lightGray, marginBottom: Spacing.md, letterSpacing: 1 },

  // Membership
  membershipCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  membershipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  planName: { fontSize: 18, fontWeight: '700', color: Colors.white },
  planStatus: { fontSize: 13, color: Colors.lightGray, marginTop: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { fontSize: 13, color: Colors.darkGray },
  dateValue: { fontSize: 14, fontWeight: '600', color: Colors.white },
  renewButton: {
    backgroundColor: Colors.jaiBlue, borderRadius: 8, paddingVertical: 10, 
    alignItems: 'center', marginTop: 16,
  },
  renewText: { color: Colors.white, fontWeight: '600', fontSize: 14 },

  noMembershipCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: Spacing.lg,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  noMembershipText: { color: Colors.lightGray, marginTop: 8, marginBottom: 16 },
  buyButton: {
    backgroundColor: Colors.jaiBlue + '20', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
  },
  buyButtonText: { color: Colors.jaiBlue, fontWeight: '600' },

  // Settings
  settingItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingText: { fontSize: 16, color: Colors.white },

  logoutButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)', borderRadius: 12, 
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
    borderWidth: 1, borderColor: '#FF6B6B',
  },
  logoutText: { color: '#FF6B6B', fontWeight: '700', fontSize: 16 },
  versionText: { textAlign: 'center', color: Colors.darkGray, fontSize: 12, marginTop: 24 },
});
