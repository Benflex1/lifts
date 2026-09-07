import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useSettings } from '../context/SettingsContext';
import { WeightUnit } from '../utils/units';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { unit, setUnit } = useSettings();
  const [isSaving, setIsSaving] = useState(false);

  if (!visible) return null;

  const handleUnitChange = async (newUnit: WeightUnit) => {
    if (newUnit === unit || isSaving) return;
    setIsSaving(true);
    try {
      await setUnit(newUnit);
    } catch {
      // Error handled by SettingsContext alert
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Unit Setting Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weight Unit</Text>
            <Text style={styles.sectionSubtitle}>
              Select your preferred unit for recording and displaying lifts.
            </Text>

            <View style={styles.unitOptions}>
              <TouchableOpacity
                style={[
                  styles.unitOption,
                  unit === 'kg' && styles.unitOptionActive,
                ]}
                onPress={() => handleUnitChange('kg')}
                accessibilityRole="button"
                accessibilityLabel="Set unit to Kilograms"
                accessibilityState={{ selected: unit === 'kg' }}
                disabled={isSaving}
              >
                <View style={styles.unitTextContainer}>
                  <Text
                    style={[
                      styles.unitOptionTitle,
                      unit === 'kg' && styles.unitOptionTitleActive,
                    ]}
                  >
                    Kilograms (kg)
                  </Text>
                  <Text style={styles.unitOptionDescription}>Metric system</Text>
                </View>
                {unit === 'kg' && <Check size={20} color="#3B82F6" />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.unitOption,
                  unit === 'lb' && styles.unitOptionActive,
                ]}
                onPress={() => handleUnitChange('lb')}
                accessibilityRole="button"
                accessibilityLabel="Set unit to Pounds"
                accessibilityState={{ selected: unit === 'lb' }}
                disabled={isSaving}
              >
                <View style={styles.unitTextContainer}>
                  <Text
                    style={[
                      styles.unitOptionTitle,
                      unit === 'lb' && styles.unitOptionTitleActive,
                    ]}
                  >
                    Pounds (lb)
                  </Text>
                  <Text style={styles.unitOptionDescription}>Imperial system</Text>
                </View>
                {unit === 'lb' && <Check size={20} color="#3B82F6" />}
              </TouchableOpacity>
            </View>
          </View>

          {isSaving && (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.savingText}>Saving...</Text>
            </View>
          )}

          {/* Footer button */}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#181A20',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#262A34',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F3F4F6',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 14,
    lineHeight: 18,
  },
  unitOptions: {
    gap: 10,
  },
  unitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#262A34',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  unitOptionActive: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  unitTextContainer: {
    flex: 1,
  },
  unitOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  unitOptionTitleActive: {
    color: '#3B82F6',
  },
  unitOptionDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  savingText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  doneButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
