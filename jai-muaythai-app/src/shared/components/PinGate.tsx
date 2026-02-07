import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Colors';

interface PinGateProps {
  mode: 'set' | 'enter';
  onSuccess: (pin: string) => void;
  onFail?: () => void;
}

export const PinGate: React.FC<PinGateProps> = ({ mode, onSuccess, onFail }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (pin.length === 4) {
      if (mode === 'set') {
        if (step === 'enter') {
          setConfirmPin(pin);
          setPin('');
          setStep('confirm');
          setError('');
        } else {
          if (pin === confirmPin) {
            onSuccess(pin);
          } else {
            setError('PINs do not match. Try again.');
            triggerShake();
            setPin('');
            setConfirmPin('');
            setStep('enter');
          }
        }
      } else {
        // Enter mode - parent handles verification
        onSuccess(pin);
        // Reset pin after a short delay in case it's wrong
        setTimeout(() => {
          setPin('');
        }, 300);
      }
    }
  }, [pin]);

  const handlePress = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const resetPin = () => {
    setPin('');
    setConfirmPin('');
    setStep('enter');
    setError('');
  };

  const getTitle = () => {
    if (mode === 'set') {
      return step === 'enter' ? 'Set Your Earnings PIN' : 'Confirm Your PIN';
    }
    return 'Enter Your PIN';
  };

  const getSubtitle = () => {
    if (mode === 'set') {
      return step === 'enter'
        ? 'Create a 4-digit PIN to protect your earnings'
        : 'Re-enter your PIN to confirm';
    }
    return 'Enter your 4-digit PIN to view earnings';
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A0F', '#0A0A0F', '#0A1520']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {/* Lock Icon */}
        <View style={styles.lockContainer}>
          <LinearGradient
            colors={[Colors.jaiBlue, Colors.neonPurple]}
            style={styles.lockBadge}
          >
            <Ionicons name="lock-closed" size={28} color={Colors.white} />
          </LinearGradient>
        </View>

        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>

        {/* PIN Dots */}
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                pin.length > i && styles.dotFilled,
                error && styles.dotError,
              ]}
            />
          ))}
        </Animated.View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Keypad */}
        <View style={styles.keypad}>
          {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'delete']].map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keypadRow}>
              {row.map((key, keyIndex) => {
                if (key === '') {
                  return <View key={keyIndex} style={styles.keyEmpty} />;
                }
                if (key === 'delete') {
                  return (
                    <TouchableOpacity
                      key={keyIndex}
                      style={styles.keyButton}
                      onPress={handleDelete}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="backspace-outline" size={24} color={Colors.lightGray} />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={keyIndex}
                    style={styles.keyButton}
                    onPress={() => handlePress(key)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.keyText}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {mode === 'set' && step === 'confirm' && (
          <TouchableOpacity onPress={resetPin} style={styles.resetButton}>
            <Text style={styles.resetText}>Start Over</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Export a separate component for wrong pin feedback
export const usePinShake = () => {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  return { shakeAnim, triggerShake };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  lockContainer: {
    marginBottom: 24,
  },
  lockBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.lightGray,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.jaiBlue,
    borderColor: Colors.jaiBlue,
  },
  dotError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: 13,
    color: Colors.error,
    marginTop: 8,
    marginBottom: 8,
  },
  keypad: {
    marginTop: 24,
    width: '100%',
    maxWidth: 280,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  keyButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.white,
  },
  keyEmpty: {
    width: 72,
    height: 72,
  },
  resetButton: {
    marginTop: 20,
  },
  resetText: {
    fontSize: 14,
    color: Colors.jaiBlue,
    fontWeight: '600',
  },
});
