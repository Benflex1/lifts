import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
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
import {
  AutomaticBackupState,
  chooseAutomaticBackupFolder,
  getAutomaticBackupState,
  runAutomaticBackup,
  setAutomaticBackupEnabled,
} from '../utils/automaticBackup';
import { useDialog } from '../context/DialogContext';

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
    remoteImagesEnabled,
    setRemoteImagesEnabled,
  } = useSettings();
  const { activeWorkout, refreshGyms } = useWorkout();
  const [isSaving, setIsSaving] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [automaticBackup, setAutomaticBackup] = useState<AutomaticBackupState>({
    directoryUri: null,
    enabled: false,
    lastSuccessAt: null,
    lastError: null,
  });
  const [showGymProfiles, setShowGymProfiles] = useState(false);
  const [exactAlarmStatus, setExactAlarmStatus] = useState<ExactAlarmStatus>('unsupported');
  const { notify } = useDialog();

  const refreshAutomaticBackupState = useCallback(async () => {
    try {
      setAutomaticBackup(await getAutomaticBackupState());
    } catch (error) {
      console.error('Unable to load automatic backup settings', error);
    }
  }, []);

  // Re-check when the modal opens and when the user returns from system settings.
  useEffect(() => {
    if (!visible) return;
    setExactAlarmStatus(getExactAlarmStatus());
    void refreshAutomaticBackupState();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setExactAlarmStatus(getExactAlarmStatus());
        void refreshAutomaticBackupState();
      }
    });
    return () => subscription.remove();
  }, [visible, refreshAutomaticBackupState]);

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

  const handleRemoteImagesChange = async (enabled: boolean) => {
    if (isSaving || enabled === remoteImagesEnabled) return;
    setIsSaving(true);
    try {
      await setRemoteImagesEnabled(enabled);
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

  const handleChooseBackupFolder = async () => {
    if (isBackupBusy) return;
    setIsBackupBusy(true);
    try {
      const directoryUri = await chooseAutomaticBackupFolder(automaticBackup.directoryUri);
      if (directoryUri) await refreshAutomaticBackupState();
    } catch (error: any) {
      await notify({
        title: 'Backup Folder Error',
        message: error?.message || 'Unable to select a backup folder.',
      });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleAutomaticBackupChange = async (enabled: boolean) => {
    if (isBackupBusy || enabled === automaticBackup.enabled) return;
    setIsBackupBusy(true);
    try {
      await setAutomaticBackupEnabled(enabled);
      await refreshAutomaticBackupState();
    } catch (error: any) {
      await notify({
        title: 'Automatic Backup Error',
        message: error?.message || 'Unable to update automatic backup settings.',
      });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleBackupNow = async () => {
    if (isBackupBusy || !automaticBackup.directoryUri) return;
    setIsBackupBusy(true);
    try {
      await runAutomaticBackup({ force: true });
      await refreshAutomaticBackupState();
      await notify({
        title: 'Backup Saved',
        message: 'Your latest backup was saved. Lifts keeps the newest 10 backups in this folder.',
      });
    } catch (error: any) {
      await refreshAutomaticBackupState();
      await notify({
        title: 'Backup Failed',
        message: error?.message || 'Unable to save a backup. Choose the folder again and retry.',
      });
    } finally {
      setIsBackupBusy(false);
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

          <ScrollView style={styles.settingsContent} keyboardShouldPersistTaps="handled">
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

          <View style={styles.section}>
            <View style={styles.settingHeaderRow}>
              <View style={styles.settingTextContainer}>
                <Text style={styles.sectionTitle}>Exercise Photos</Text>
                <Text style={styles.sectionSubtitle}>
                  Load exercise photos from GitHub. Off shows the built-in illustrations and stops those requests.
                </Text>
              </View>
              <Switch
                value={remoteImagesEnabled}
                onValueChange={handleRemoteImagesChange}
                disabled={isSaving}
                trackColor={{ false: colors.control, true: colors.primary }}
                thumbColor={remoteImagesEnabled ? colors.text : colors.textSecondary}
                accessibilityLabel="Exercise Photos"
                accessibilityRole="switch"
                accessibilityState={{ checked: remoteImagesEnabled, disabled: isSaving }}
              />
            </View>
          </View>

          {Platform.OS === 'android' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Automatic Backups</Text>
              <Text style={styles.sectionSubtitle}>
                Save a full backup after each completed workout and keep the newest 10 copies.
              </Text>
              <Text style={styles.backupStatus}>
                {automaticBackup.directoryUri ? 'Backup folder selected on this device.' : 'Choose a folder for your backups.'}
              </Text>
              <TouchableOpacity
                style={styles.manageButton}
                onPress={handleChooseBackupFolder}
                disabled={isBackupBusy}
                accessibilityRole="button"
                accessibilityLabel={automaticBackup.directoryUri ? 'Change automatic backup folder' : 'Choose automatic backup folder'}
              >
                <Text style={styles.manageButtonText}>
                  {automaticBackup.directoryUri ? 'Change Backup Folder' : 'Choose Backup Folder'}
                </Text>
              </TouchableOpacity>
              <View style={[styles.settingHeaderRow, styles.backupSwitchRow]}>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.backupSwitchTitle}>After each workout</Text>
                </View>
                <Switch
                  value={automaticBackup.enabled}
                  onValueChange={handleAutomaticBackupChange}
                  disabled={isBackupBusy || !automaticBackup.directoryUri}
                  trackColor={{ false: colors.control, true: colors.primary }}
                  thumbColor={automaticBackup.enabled ? colors.text : colors.textSecondary}
                  accessibilityLabel="Back up automatically after each workout"
                  accessibilityRole="switch"
                  accessibilityState={{
                    checked: automaticBackup.enabled,
                    disabled: isBackupBusy || !automaticBackup.directoryUri,
                  }}
                />
              </View>
              <TouchableOpacity
                style={[styles.manageButton, styles.backupNowButton]}
                onPress={handleBackupNow}
                disabled={isBackupBusy || !automaticBackup.directoryUri}
                accessibilityRole="button"
                accessibilityLabel="Back up now"
              >
                {isBackupBusy ? (
                  <ActivityIndicator size="small" color={colors.textSoft} />
                ) : (
                  <Text style={styles.manageButtonText}>Back Up Now</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.backupStatus}>
                {automaticBackup.lastSuccessAt
                  ? `Last backup: ${new Date(automaticBackup.lastSuccessAt).toLocaleString()}`
                  : 'No backup saved yet.'}
              </Text>
              {!!automaticBackup.lastError && (
                <Text style={styles.backupError}>
                  Latest attempt failed: {automaticBackup.lastError}
                </Text>
              )}
            </View>
          )}

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
                Android can delay the end-of-rest buzz while your phone is locked. Allow Lifts to set alarms and reminders so it buzzes on time.
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
          </ScrollView>

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
    maxHeight: '90%',
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
  settingsContent: {
    flexShrink: 1,
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
  backupSwitchRow: {
    marginTop: 8,
    marginBottom: 8,
  },
  backupSwitchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSoft,
  },
  backupNowButton: {
    marginTop: 0,
    marginBottom: 8,
  },
  backupStatus: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  backupError: {
    fontSize: 12,
    color: colors.dangerLight,
    marginTop: 6,
    lineHeight: 17,
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
