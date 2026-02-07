import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../services/AuthContext';
import { supabase } from '../services/supabase';
import { Colors, Spacing, Fonts } from '../constants/Colors';

export const FirstLoginScreen: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleComplete = async () => {
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    console.log('[FirstLogin] Starting account setup for user:', user?.id, user?.email);
    setLoading(true);
    try {
      // Step 1: Update password in Supabase Auth
      console.log('[FirstLogin] Step 1: Updating password...');
      const { data: authData, error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (authError) {
        console.error('[FirstLogin] Password update failed:', authError.message);
        throw authError;
      }
      console.log('[FirstLogin] Step 1 done. Auth user:', authData?.user?.id);

      // Step 2: Verify we still have a valid session after password change
      console.log('[FirstLogin] Step 2: Checking session...');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[FirstLogin] Session after password change:', session ? `valid, user=${session.user.id}` : 'NULL - this is the problem!');

      if (!session) {
        console.error('[FirstLogin] Session lost after password update! Re-authenticating...');
        // Session was lost — sign in again with the new password
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user?.email || '',
          password: newPassword,
        });
        if (signInError) {
          console.error('[FirstLogin] Re-auth failed:', signInError.message);
          throw signInError;
        }
        console.log('[FirstLogin] Re-authenticated successfully');
      }

      // Step 3: Update user record in database
      console.log('[FirstLogin] Step 3: Updating DB (full_name, is_first_login=false)...');
      const { error: dbError } = await supabase
        .from('users')
        .update({
          full_name: fullName.trim(),
          is_first_login: false,
        })
        .eq('id', user?.id);
      if (dbError) {
        console.error('[FirstLogin] DB update failed:', dbError.message);
        throw dbError;
      }
      console.log('[FirstLogin] Step 3 done. DB updated.');

      // Step 4: Refresh user state in context to trigger navigation
      console.log('[FirstLogin] Step 4: Refreshing user context...');
      if (refreshUser) {
        await refreshUser();
        console.log('[FirstLogin] Step 4 done. User refreshed — should navigate now.');
      } else {
        console.error('[FirstLogin] refreshUser not available!');
      }
    } catch (err: any) {
      console.error('[FirstLogin] Error:', err.message);
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
      console.log('[FirstLogin] Loading set to false');
    }
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#0A0A0F', '#0A1520']} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Icon */}
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#0096FF', '#0064CC']}
                style={styles.iconCircle}
              >
                <Ionicons name="shield-checkmark" size={40} color="#FFFFFF" />
              </LinearGradient>
            </View>

            {/* Title */}
            <Text style={styles.title}>Welcome to Jai Muay Thai</Text>
            <Text style={styles.subtitle}>Please set up your account to continue</Text>

            {/* Form Card */}
            <View style={styles.card}>
              {/* Full Name */}
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor="#555"
                  autoCapitalize="words"
                />
              </View>

              {/* New Password */}
              <Text style={styles.label}>New Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor="#555"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Confirm Password */}
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor="#555"
                  secureTextEntry={!showConfirm}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                  <Ionicons name={showConfirm ? "eye-off" : "eye"} size={20} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={styles.hint}>Minimum 6 characters</Text>

              {/* Submit Button */}
              <TouchableOpacity onPress={handleComplete} disabled={loading}>
                <LinearGradient
                  colors={['#0096FF', '#0064CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.button}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Complete Setup</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: '#AAA',
    marginBottom: 8,
    marginTop: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: '#555',
    marginTop: 8,
    marginBottom: 24,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: '#FFFFFF',
  },
});
