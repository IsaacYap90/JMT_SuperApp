import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { Colors, Spacing } from '../constants/Colors';

const { width, height } = Dimensions.get('window');

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      Alert.alert('Login Failed', error.message);
    }
    setLoading(false);
  };

  // Dev quick login
  const devLogin = async (role: 'master_admin' | 'coach') => {
    setLoading(true);
    const credentials = {
      master_admin: { email: 'test.master_admin@jaimuaythai.dev', password: 'password123' },
      coach: { email: 'test.coach@jaimuaythai.dev', password: 'password123' },
    };

    const { error } = await supabase.auth.signInWithPassword(credentials[role]);
    if (error) {
      Alert.alert('Login Failed', error.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.containerWrapper}>
      {/* Background */}
      <LinearGradient
        colors={['#0A0A0A', '#0A0A15', '#0A1525']}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative Elements */}
      <View style={styles.glowOrb1} />
      <View style={styles.glowOrb2} />
      <View style={styles.glowOrb3} />

      <SafeAreaView style={styles.safeArea}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
            >
          {/* Logo Section */}
          <View style={styles.logoSection}>
            <LinearGradient
              colors={[Colors.jaiBlue, Colors.neonPurple]}
              style={styles.logoContainer}
            >
              <Text style={styles.logoText}>JAI</Text>
            </LinearGradient>
            <Text style={styles.brandName}>JAI MUAY THAI</Text>
            <Text style={styles.tagline}>Train. Fight. Evolve.</Text>
          </View>

          {/* Login Card */}
          <View style={styles.cardOuter}>
            <BlurView intensity={20} tint="dark" style={styles.cardBlur}>
              <View style={styles.cardInner}>
                <Text style={styles.welcomeText}>Welcome Back</Text>
                <Text style={styles.subtitleText}>Sign in to continue</Text>

                {/* Email Input */}
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color={Colors.lightGray} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={Colors.darkGray}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                {/* Password Input */}
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.lightGray} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={Colors.darkGray}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={Colors.lightGray}
                    />
                  </TouchableOpacity>
                </View>

                {/* Forgot Password */}
                <TouchableOpacity style={styles.forgotButton}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>

                {/* Login Button */}
                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[Colors.jaiBlue, Colors.neonPurple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.loginButton}
                  >
                    {loading ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <>
                        <Text style={styles.loginButtonText}>Sign In</Text>
                        <Ionicons name="arrow-forward" size={20} color={Colors.white} />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>

          {/* Dev Quick Login */}
          <View style={styles.devSection}>
            <Text style={styles.devTitle}>Quick Access</Text>
            <View style={styles.devButtons}>
              <TouchableOpacity
                style={styles.devButton}
                onPress={() => devLogin('master_admin')}
                disabled={loading}
              >
                <Ionicons name="shield-outline" size={18} color={Colors.neonPurple} />
                <Text style={styles.devButtonText}>Master Admin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.devButton}
                onPress={() => devLogin('coach')}
                disabled={loading}
              >
                <Ionicons name="fitness-outline" size={18} color={Colors.jaiBlue} />
                <Text style={styles.devButtonText}>Coach</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Powered by</Text>
            <Text style={styles.footerBrand}>Jai Muay Thai</Text>
          </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  containerWrapper: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  glowOrb1: {
    position: 'absolute',
    top: height * 0.1,
    left: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Colors.jaiBlue,
    opacity: 0.1,
  },
  glowOrb2: {
    position: 'absolute',
    top: height * 0.3,
    right: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Colors.neonPurple,
    opacity: 0.08,
  },
  glowOrb3: {
    position: 'absolute',
    bottom: height * 0.15,
    left: width * 0.3,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.cyan,
    opacity: 0.06,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 2,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 13,
    color: Colors.lightGray,
    marginTop: 6,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassStroke,
  },
  cardBlur: {
    overflow: 'hidden',
  },
  cardInner: {
    padding: 24,
    backgroundColor: Colors.glassBg,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 14,
    color: Colors.lightGray,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: Colors.white,
  },
  eyeButton: {
    padding: 4,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    fontSize: 13,
    color: Colors.jaiBlue,
    fontWeight: '500',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
  },
  devSection: {
    marginTop: 32,
    alignItems: 'center',
  },
  devTitle: {
    fontSize: 12,
    color: Colors.darkGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  devButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  devButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: Colors.darkGray,
  },
  footerBrand: {
    fontSize: 12,
    color: Colors.lightGray,
    fontWeight: '600',
    marginTop: 2,
  },
});
