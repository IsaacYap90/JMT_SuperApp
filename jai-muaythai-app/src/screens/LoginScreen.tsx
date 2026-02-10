import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../shared/services/supabase';
import { Colors, Spacing, Fonts } from '../shared/constants/Colors';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tapCount, setTapCount] = useState(0);
  const [showDevMode, setShowDevMode] = useState(false);

  const handleLogoTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (newCount >= 5) {
      setShowDevMode(true);
      setTapCount(0);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(authError.message);
      }
      // On success, navigation will happen automatically via AuthContext
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // DEV MODE: Quick login to test portals
  const devLogin = async (role: 'member' | 'coach' | 'admin' | 'master_admin') => {
    await supabase.auth.signOut();
    setLoading(true);

    try {
      // Create or get test user in Supabase
      const testEmail = `test.${role}@jaimuaythai.dev`;

      // Sign up (will fail silently if exists)
      await supabase.auth.signUp({
        email: testEmail,
        password: 'testpassword123',
      });

      // Sign in
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: 'testpassword123',
      });

      if (authError) throw authError;

      // Upsert user profile (insert or update if exists)
      const { error: upsertError } = await supabase
        .from('users')
        .upsert({
          id: authData.user?.id,
          email: testEmail,
          full_name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
          role: role,
        }, {
          onConflict: 'id'
        });

      if (upsertError) throw upsertError;

    } catch (err: any) {
      // Silent fail for dev mode
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <TouchableOpacity onPress={handleLogoTap} activeOpacity={0.8}>
            <Image
              source={require('../../assets/logo.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <Text style={styles.title}>JAI MUAY THAI</Text>
          <Text style={styles.slogan}>Live with passion, Fight with heart</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formContainer}>
          <Text style={styles.welcomeTitle}>Welcome Back</Text>

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="#666"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError('');
            }}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#666"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError('');
            }}
            secureTextEntry
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.signInButton}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.signInButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={() => {
              if (!email) {
                setError('Please enter your email address first');
                return;
              }
              supabase.auth.resetPasswordForEmail(email);
              setError('Password reset email sent (if account exists)');
            }}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Dev Mode - Hidden */}
        {showDevMode && (
          <View style={styles.devContainer}>
            <Text style={styles.devTitle}>DEV MODE</Text>
            <Text style={styles.devSubtitle}>Quick login to test portals</Text>

            <View style={styles.buttonGrid}>
              <TouchableOpacity
                style={[styles.devButton, { backgroundColor: Colors.jaiBlue }]}
                onPress={() => devLogin('member')}
                disabled={loading}
              >
                <Text style={styles.devButtonText}>Member</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.devButton, { backgroundColor: Colors.success }]}
                onPress={() => devLogin('coach')}
                disabled={loading}
              >
                <Text style={styles.devButtonText}>Coach</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.devButton, { backgroundColor: Colors.warning }]}
                onPress={() => devLogin('admin')}
                disabled={loading}
              >
                <Text style={styles.devButtonText}>Admin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.devButton, { backgroundColor: Colors.error }]}
                onPress={() => devLogin('master_admin')}
                disabled={loading}
              >
                <Text style={styles.devButtonText}>Master</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.heading,
    color: Colors.jaiBlue,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  slogan: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: '#666',
    fontStyle: 'italic',
  },
  formContainer: {
    width: '100%',
  },
  welcomeTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 14,
    fontFamily: Fonts.medium,
    marginBottom: 12,
    textAlign: 'center',
  },
  signInButton: {
    width: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signInButtonText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: '#000000',
  },
  forgotPasswordButton: {
    marginTop: 16,
    alignSelf: 'center',
  },
  forgotPasswordText: {
    color: Colors.jaiBlue,
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  devContainer: {
    width: '100%',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 32,
  },
  devTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  devSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: '#666',
    marginBottom: 16,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  devButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  devButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: '#000000',
  },
});
