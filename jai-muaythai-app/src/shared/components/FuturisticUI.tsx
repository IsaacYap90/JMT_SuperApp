import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Shadows } from '../constants/Colors';

// Gradient Text Component
export const GradientText: React.FC<{
  children: string;
  style?: TextStyle;
  colors?: string[];
}> = ({ children, style, colors = [Colors.jaiBlue, Colors.neonPurple] }) => (
  <Text style={[styles.gradientTextFallback, style]}>{children}</Text>
);

// Glass Card Component
export const GlassCard: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
}> = ({ children, style, intensity = 20 }) => (
  <View style={[styles.glassCardOuter, style]}>
    <BlurView intensity={intensity} tint="dark" style={styles.glassCardBlur}>
      <View style={styles.glassCardInner}>
        {children}
      </View>
    </BlurView>
  </View>
);

// Gradient Button Component
export const GradientButton: React.FC<{
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  colors?: string[];
}> = ({ title, onPress, style, disabled, colors = [Colors.jaiBlue, Colors.neonPurple] }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    style={[disabled && { opacity: 0.5 }]}
  >
    <LinearGradient
      colors={colors as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.gradientButton, style]}
    >
      <Text style={styles.gradientButtonText}>{title}</Text>
    </LinearGradient>
  </TouchableOpacity>
);

// Outline Button Component
export const OutlineButton: React.FC<{
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  color?: string;
}> = ({ title, onPress, style, color = Colors.jaiBlue }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={[styles.outlineButton, { borderColor: color }, style]}
  >
    <Text style={[styles.outlineButtonText, { color }]}>{title}</Text>
  </TouchableOpacity>
);

// Stat Card with Glow
export const StatCard: React.FC<{
  value: string | number;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  style?: ViewStyle;
}> = ({ value, label, icon, color = Colors.jaiBlue, style }) => (
  <View style={[styles.statCard, style]}>
    <View style={[styles.statGlow, { backgroundColor: color }]} />
    <View style={styles.statContent}>
      {icon && <View style={styles.statIcon}>{icon}</View>}
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  </View>
);

// Section Header
export const SectionHeader: React.FC<{
  title: string;
  action?: { label: string; onPress: () => void };
}> = ({ title, action }) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionTitleRow}>
      <View style={[styles.sectionAccent, { backgroundColor: Colors.jaiBlue }]} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {action && (
      <TouchableOpacity onPress={action.onPress}>
        <Text style={styles.sectionAction}>{action.label}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// Futuristic Badge
export const Badge: React.FC<{
  label: string;
  color?: string;
  variant?: 'solid' | 'outline' | 'glow';
}> = ({ label, color = Colors.jaiBlue, variant = 'solid' }) => {
  if (variant === 'glow') {
    return (
      <View style={[styles.badgeGlow, { backgroundColor: color }]}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
    );
  }

  if (variant === 'outline') {
    return (
      <View style={[styles.badgeOutline, { borderColor: color }]}>
        <Text style={[styles.badgeText, { color }]}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
};

// Divider with glow
export const GlowDivider: React.FC<{ color?: string }> = ({ color = Colors.jaiBlue }) => (
  <View style={styles.dividerContainer}>
    <LinearGradient
      colors={['transparent', color, 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.divider}
    />
  </View>
);

// Header Action Button
export const HeaderButton: React.FC<{
  icon: React.ReactNode;
  onPress: () => void;
  badge?: number;
}> = ({ icon, onPress, badge }) => (
  <TouchableOpacity style={styles.headerButton} onPress={onPress} activeOpacity={0.7}>
    {icon}
    {badge !== undefined && badge > 0 && (
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeText}>{badge > 9 ? '9+' : badge}</Text>
      </View>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  gradientTextFallback: {
    color: Colors.jaiBlue,
    fontWeight: 'bold',
  },
  glassCardOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassStroke,
  },
  glassCardBlur: {
    overflow: 'hidden',
  },
  glassCardInner: {
    padding: 16,
    backgroundColor: Colors.glassBg,
  },
  gradientButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  gradientButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  outlineButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.15,
  },
  statContent: {
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    color: Colors.lightGray,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.lightGray,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionAction: {
    fontSize: 13,
    color: Colors.jaiBlue,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOutline: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  badgeGlow: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: Colors.jaiBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
  },
  dividerContainer: {
    height: 1,
    marginVertical: 16,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.white,
  },
});
