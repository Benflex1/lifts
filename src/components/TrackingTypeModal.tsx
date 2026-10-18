import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { TrackingType } from '../types';
import { TRACKING_TYPE_OPTIONS } from '../workout/tracking';
import { colors } from '../theme';

export interface TrackingTypeModalProps {
  visible: boolean;
  exerciseName?: string;
  selectedType: TrackingType;
  onSelect: (type: TrackingType) => void;
  onClose: () => void;
}

/** Picks what an exercise's sets record. Only reachable with tracking types turned on in Settings. */
export function TrackingTypeModal({ visible, exerciseName, selectedType, onSelect, onClose }: TrackingTypeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.container} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Track Sets As</Text>
              <Text style={styles.description} numberOfLines={2}>
                {exerciseName ? `${exerciseName} keeps this choice for future workouts.` : 'This exercise keeps this choice for future workouts.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView>
            {TRACKING_TYPE_OPTIONS.map((option) => {
              const selected = option.type === selectedType;
              return (
                <TouchableOpacity
                  key={option.type}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => {
                    onSelect(option.type);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{option.label}</Text>
                    <Text style={styles.example}>{option.example}</Text>
                  </View>
                  {selected ? <Check size={20} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerCopy: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  rowText: {
    flex: 1,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  example: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 12,
  },
});
