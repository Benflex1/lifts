import React, { useEffect, useState } from 'react';
import {
  AppState,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useSettings } from '../context/SettingsContext';
import { WeightUnit } from '../utils/units';
import { GymProfilesModal } from './GymProfilesModal';
import { useWorkout } from '../context/WorkoutContext';
import { colors } from '../theme';
import { ExactAlarmStatus, getExactAlarmStatus, openExactAlarmSettings } from '../utils/exactAlarms';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const {
    unit,
    setUnit,
    gymTrackingEnabled,
    setGymTrackingEnabled,
    healthSyncEnabled,
    setHealthSyncEnabled,
  } = useSettings();
  const { activeWorkout, refreshGyms } = useWorkout();
  const [isSaving, setIsSaving] = useState(false);
  const [showGymProfiles, setShowGymProfiles] = useState(false);
  const [exactAlarmStatus, setExactAlarmStatus] = useState<ExactAlarmStatus>('unsupported');

  // Re-check when the modal opens and when the user returns from system settings.
  useEffect(() => {
    if (!visible) return;
    setExactAlarmStatus(getExactAlarmStatus());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setExactAlarmStatus(getExactAlarmStatus());
    });
    return () => subscription.remove();
  }, [visible]);

  if (!visible) return null;

  const handleUnitChange = async (newUnit: WeightUnit) => {
    if (newUnit === unit || isSaving) return;
    setIsSaving(true);
    try {
      await setUnit(newUnit);
    } catch {
      // Error handled by SettingsContext notification.
    } finally {
      setIsSaving(false);
    }
  };

  const handleGymTrackingChange = async (enabled: boolean) => {
    if (isSaving || enabled === gymTrackingEnabled) return;
    setIsSaving(true);
    try {
      await setGymTrackingEnabled(enabled);
    } catch {
      // Error handled by SettingsContext notification.
    } finally {
      setIsSaving(false);
    }
  };

  const handleHealthSyncChange = async (enabled: boolean) => {
    if (isSaving || enabled === healthSyncEnabled) return;
    setIsSaving(true);
    try {
      await setHealthSyncEnabled(enabled);
    } catch {
      // Error handled by SettingsContext notification.
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setShowGymProfiles(false);
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={handleClose}
        accessibilityViewIsModal={true}
      >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.settingHeaderRow}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.sectionTitle}>Gym Tracking</Text>
                <Text style={styles.sectionSubtitle}>
                  Keep workout history and machine suggestions separated by gym.
                </Text>
              </View>
              <Switch
                value={gymTrackingEnabled}
                onValueChange={handleGymTrackingChange}
                disabled={isSaving}
                trackColor={{ false: colors.control, true: colors.primary }}
                thumbColor={gymTrackingEnabled ? colors.text : colors.textSecondary}
                accessibilityLabel="Gym Tracking"
                accessibilityRole="switch"
                accessibilityState={{ checked: gymTrackingEnabled, disabled: isSaving }}
              />
            </View>
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => setShowGymProfiles(true)}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Manage gyms"
            >
              <Text style={styles.manageButtonText}>Manage Gyms</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS !== 'web' && (
            <View style={styles.section}>
              <View style={styles.settingHeaderRow}>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.sectionTitle}>Sync completed workouts</Text>
                  <Text style={styles.sectionSubtitle}>
                    Lifts writes workout sessions to Apple Health or Health Connect and does not read health data.
                  </Text>
                </View>
                <Switch
                  value={healthSyncEnabled}
                  onValueChange={handleHealthSyncChange}
                  disabled={isSaving}
                  trackColor={{ false: colors.control, true: colors.primary }}
                  thumbColor={healthSyncEnabled ? colors.text : colors.textSecondary}
                  accessibilityLabel="Sync completed workouts"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: healthSyncEnabled, disabled: isSaving }}
                />
              </View>
            </View>
          )}

          {exactAlarmStatus === 'denied' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>On-time rest alerts</Text>
              <Text style={styles.sectionSubtitle}>
                Android can delay rest-timer alerts while your phone is locked. Allow Lifts to set alarms and reminders so they arrive on time.
              </Text>
              <TouchableOpacity
                style={styles.manageButton}
                onPress={() => openExactAlarmSettings()}
                accessibilityRole="button"
                accessibilityLabel="Allow alarms and reminders"
              >
                <Text style={styles.manageButtonText}>Allow Alarms & Reminders</Text>
              </TouchableOpacity>
            </View>
          )}

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
                {unit === 'kg' && <Check size={20} color={colors.primary} />}
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
                {unit === 'lb' && <Check size={20} color={colors.primary} />}
              </TouchableOpacity>
            </View>
          </View>

          {isSaving && (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.savingText}>Saving...</Text>
            </View>
          )}

          {/* Footer button */}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
      </Modal>
      <GymProfilesModal
        visible={showGymProfiles}
        onClose={() => setShowGymProfiles(false)}
        activeWorkoutGymId={activeWorkout?.gymId}
        onGymsChanged={refreshGyms}
      />
    </>
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
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  section: {
    marginBottom: 20,
  },
  settingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  unitOptions: {
    gap: 10,
  },
  manageButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.control,
    backgroundColor: colors.border,
  },
  manageButtonText: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  unitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.control,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  unitOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  unitTextContainer: {
    flex: 1,
  },
  unitOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSoft,
  },
  unitOptionTitleActive: {
    color: colors.primary,
  },
  unitOptionDescription: {
    fontSize: 12,
    color: colors.textSecondary,
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
    color: colors.textSecondary,
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
