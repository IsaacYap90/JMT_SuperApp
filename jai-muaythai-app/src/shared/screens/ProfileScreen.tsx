import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { useAuth } from '../services/AuthContext';
import { Colors, Spacing, Fonts } from '../constants/Colors';

export const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, signOut } = useAuth();
  const [coachProfile, setCoachProfile] = useState<any>(null);

  useEffect(() => {
    if (user?.role === 'coach') {
      fetchCoachProfile();
    }
  }, [user?.id]);

  const fetchCoachProfile = async () => {
    const { data } = await supabase
      .from('coach_profiles')
      .select('*')
      .eq('user_id', user?.id)
      .single();

    if (data) {
      setCoachProfile(data);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'master_admin': return Colors.error;
      case 'admin': return Colors.warning;
      case 'coach': return Colors.jaiBlue;
      default: return Colors.darkGray;
    }
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'master_admin': return 'Master Admin';
      case 'admin': return 'Admin';
      case 'coach': return 'Coach';
      case 'member': return 'Member';
      default: return 'User';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarTextLarge}>
              {user?.full_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.profileName}>{user?.full_name || 'No Name'}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor() }]}>
            <Text style={styles.roleBadgeText}>{getRoleLabel()}</Text>
          </View>
        </View>

        {/* Coach-specific info */}
        {user?.role === 'coach' && coachProfile && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Coach Details</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Level</Text>
              <Text style={styles.infoValue}>
                {coachProfile.level === 'coach' ? 'Coach' : 'Assistant Coach'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Employment</Text>
              <Text style={styles.infoValue}>
                {coachProfile.employment_type === 'full_time' ? 'Full-Time' : 'Part-Time'}
              </Text>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rate per Class</Text>
              <Text style={styles.infoValue}>${coachProfile.rate_per_class}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rate per PT</Text>
              <Text style={styles.infoValue}>${coachProfile.rate_per_pt}</Text>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Annual Leave</Text>
              <Text style={styles.infoValue}>{coachProfile.annual_leave_balance} days</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>MC Balance</Text>
              <Text style={styles.infoValue}>{coachProfile.mc_balance} days</Text>
            </View>
          </View>
        )}

        {/* Account Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Account</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{user?.phone || 'Not set'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsCard}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Change Password</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 60,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: Colors.jaiBlue,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  profileCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 16,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.jaiBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarTextLarge: {
    fontSize: 32,
    fontFamily: Fonts.bold,
    color: Colors.white,
  },
  profileName: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: Colors.white,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
    marginBottom: 12,
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
  infoCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.lightGray,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.white,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  actionsCard: {
    backgroundColor: Colors.darkCharcoal,
    borderRadius: 12,
    padding: Spacing.md,
    gap: 10,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.black,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: Colors.white,
  },
  logoutButton: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.white,
  },
});
