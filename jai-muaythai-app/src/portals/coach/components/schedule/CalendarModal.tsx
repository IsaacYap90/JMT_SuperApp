import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../../../shared/constants/Colors';

interface CalendarModalProps {
  visible: boolean;
  calendarToken: string | null;
  calendarLoading: boolean;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
  onShare: () => void;
  onGenerate: () => void;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({
  visible,
  calendarToken,
  calendarLoading,
  copied,
  onClose,
  onCopy,
  onShare,
  onGenerate,
}) => {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity style={styles.calendarModalContent} activeOpacity={1}>
          {/* Header */}
          <View style={styles.calendarModalHeader}>
            <View style={styles.calendarIconContainer}>
              <Ionicons name="calendar-outline" size={28} color={Colors.jaiBlue} />
            </View>
            <Text style={styles.calendarModalTitle}>Sync Your Schedule</Text>
            <Text style={styles.calendarModalSubtitle}>
              Subscribe to your calendar to see all your classes and PT sessions
            </Text>
          </View>

          {/* Calendar URL Section */}
          <View style={styles.calendarUrlSection}>
            <Text style={styles.calendarUrlLabel}>Your Calendar URL</Text>
            <View style={styles.calendarUrlContainer}>
              <Text style={styles.calendarUrlText} numberOfLines={2}>
                {calendarToken
                  ? `https://xioimcyqglfxqumvbqsg.supabase.co/functions/v1/calendar/${calendarToken}.ics`
                  : 'Generating...'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={onCopy}
              disabled={!calendarToken}
              activeOpacity={0.8}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={Colors.white} />
              <Text style={styles.copyButtonText}>
                {copied ? 'Copied!' : 'Copy URL'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.copyButton, { marginTop: 10 }]}
              onPress={onShare}
              disabled={!calendarToken}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={18} color={Colors.jaiBlue} />
              <Text style={styles.copyButtonText}>Share URL</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={styles.calendarInstructions}>
            <Text style={styles.calendarInstructionsTitle}>How to Subscribe</Text>

            <View style={styles.instructionRow}>
              <View style={styles.instructionIcon}>
                <Text style={styles.instructionIconText}>iPhone</Text>
              </View>
              <View style={styles.instructionContent}>
                <Text style={styles.instructionStep}>1. Open Settings → Calendar → Accounts</Text>
                <Text style={styles.instructionStep}>2. Tap "Add Account" → Other → Add Subscribed Calendar</Text>
                <Text style={styles.instructionStep}>3. Paste the URL above and tap Subscribe</Text>
              </View>
            </View>

            <View style={styles.instructionRow}>
              <View style={styles.instructionIcon}>
                <Text style={styles.instructionIconText}>Android</Text>
              </View>
              <View style={styles.instructionContent}>
                <Text style={styles.instructionStep}>1. Open Calendar app</Text>
                <Text style={styles.instructionStep}>2. Menu → Settings → Add calendar</Text>
                <Text style={styles.instructionStep}>3. Select "From URL" and paste the URL</Text>
              </View>
            </View>
          </View>

          {/* Warning */}
          <View style={styles.calendarWarning}>
            <Ionicons name="warning-outline" size={16} color={Colors.warning} />
            <Text style={styles.calendarWarningText}>
              Keep this URL private - it's unique to you
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.calendarActions}>
            <TouchableOpacity
              style={[styles.calendarButton, styles.calendarRegenerateButton]}
              onPress={onGenerate}
              disabled={calendarLoading}
            >
              <Ionicons name="refresh-outline" size={18} color={Colors.lightGray} />
              <Text style={styles.calendarRegenerateButtonText}>
                {calendarLoading ? 'Generating...' : 'Regenerate URL'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.calendarButton, styles.calendarDoneButton]}
              onPress={onClose}
            >
              <Text style={styles.calendarDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  calendarModalContent: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: 0,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  calendarModalHeader: {
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  calendarIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.jaiBlue + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  calendarModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 4,
  },
  calendarModalSubtitle: {
    fontSize: 14,
    color: Colors.lightGray,
    textAlign: 'center',
  },
  calendarUrlSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  calendarUrlLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.lightGray,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calendarUrlContainer: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarUrlText: {
    fontSize: 12,
    color: Colors.jaiBlue,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.jaiBlue,
    borderRadius: 10,
    paddingVertical: 12,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  calendarInstructions: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  calendarInstructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing.md,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  instructionIcon: {
    width: 70,
    paddingVertical: 4,
    backgroundColor: Colors.darkGray,
    borderRadius: 6,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  instructionIconText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white,
  },
  instructionContent: {
    flex: 1,
  },
  instructionStep: {
    fontSize: 12,
    color: Colors.lightGray,
    marginBottom: 4,
    lineHeight: 18,
  },
  calendarWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warning + '15',
    borderRadius: 8,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  calendarWarningText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
  },
  calendarActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  calendarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  calendarRegenerateButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calendarRegenerateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.lightGray,
  },
  calendarDoneButton: {
    backgroundColor: Colors.jaiBlue,
  },
  calendarDoneButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
});
