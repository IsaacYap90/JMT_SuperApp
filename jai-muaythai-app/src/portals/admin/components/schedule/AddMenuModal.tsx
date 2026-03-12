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

interface AddMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onAddClass: () => void;
  onAddPTSession: () => void;
}

export const AddMenuModal: React.FC<AddMenuModalProps> = ({
  visible,
  onClose,
  onAddClass,
  onAddPTSession,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.addMenuOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.addMenuContent}>
          <TouchableOpacity
            style={styles.addMenuItem}
            onPress={() => {
              onClose();
              onAddClass();
            }}
          >
            <View style={[styles.addMenuIcon, { backgroundColor: Colors.jaiBlue + '20' }]}>
              <Ionicons name="fitness-outline" size={24} color={Colors.jaiBlue} />
            </View>
            <View style={styles.addMenuText}>
              <Text style={styles.addMenuTitle}>Add Class</Text>
              <Text style={styles.addMenuSubtitle}>Schedule a recurring class</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addMenuItem}
            onPress={() => {
              onClose();
              onAddPTSession();
            }}
          >
            <View style={[styles.addMenuIcon, { backgroundColor: Colors.warning + '20' }]}>
              <Ionicons name="barbell-outline" size={24} color={Colors.warning} />
            </View>
            <View style={styles.addMenuText}>
              <Text style={styles.addMenuTitle}>Add PT Session</Text>
              <Text style={styles.addMenuSubtitle}>Schedule a personal training session</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.lightGray} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addMenuCancel}
            onPress={onClose}
          >
            <Text style={styles.addMenuCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  addMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  addMenuContent: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.black,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addMenuText: {
    flex: 1,
  },
  addMenuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: 2,
  },
  addMenuSubtitle: {
    fontSize: 12,
    color: Colors.lightGray,
  },
  addMenuCancel: {
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  addMenuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.lightGray,
  },
});
