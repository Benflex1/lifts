import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Clock, Sparkles, AlertCircle, X, Check } from 'lucide-react-native';
import { Workout } from '../types';
import { formatDuration } from '../utils/calculator';
import {
  secondsToHoursMinutes,
  parseDurationInput,
  estimateWorkoutDuration,
} from '../workout/duration';

interface Props {
  visible: boolean;
  initialDurationSeconds: number;
  workout?: Workout | null;
  title?: string;
  subtitle?: string;
  showSafetyPrompt?: boolean;
  onSave: (durationSeconds: number) => void;
  onClose: () => void;
}

export const WorkoutDurationModal: React.FC<Props> = ({
  visible,
  initialDurationSeconds,
  workout,
  title,
  subtitle,
  showSafetyPrompt = false,
  onSave,
  onClose,
}) => {
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [showCustomInputs, setShowCustomInputs] = useState(!showSafetyPrompt);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      const { hours: h, minutes: m } = secondsToHoursMinutes(initialDurationSeconds);
      setHours(h > 0 ? String(h) : '');
      setMinutes(String(m));
      setShowCustomInputs(!showSafetyPrompt);
    }
    wasVisibleRef.current = visible;
  }, [visible, initialDurationSeconds, showSafetyPrompt]);

  const estimatedDuration = workout ? estimateWorkoutDuration(workout) : 3600;

  const handleApplyEstimate = () => {
    onSave(estimatedDuration);
    onClose();
  };

  const handleKeepOriginal = () => {
    onSave(initialDurationSeconds);
    onClose();
  };

  const handleSaveCustom = () => {
    const totalSeconds = parseDurationInput(hours, minutes);
    onSave(totalSeconds);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconCircle}>
              {showSafetyPrompt ? (
                <AlertCircle size={22} color="#F59E0B" />
              ) : (
                <Clock size={22} color="#38BDF8" />
              )}
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {title || (showSafetyPrompt ? 'Did this workout really take this long?' : 'Adjust Workout Time')}
              </Text>
              <Text style={styles.subtitle}>
                {subtitle ||
                  (showSafetyPrompt
                    ? `Recorded duration: ${formatDuration(initialDurationSeconds)}. It looks like the session may have been left running.`
                    : 'Set how long this workout lasted.')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Prompt Choices for 4hr+ Safety */}
          {showSafetyPrompt && !showCustomInputs && (
            <View style={styles.safetyOptions}>
              <TouchableOpacity
                style={styles.estimatePrimaryButton}
                onPress={handleApplyEstimate}
                accessibilityRole="button"
                accessibilityLabel="Auto-estimate workout duration"
              >
                <Sparkles size={18} color="#000000" />
                <View style={styles.buttonTextGroup}>
                  <Text style={styles.estimatePrimaryText}>Auto-estimate Duration</Text>
                  <Text style={styles.estimateSubText}>
                    ~{formatDuration(estimatedDuration)} (based on completed sets)
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionButton}
                onPress={() => setShowCustomInputs(true)}
                accessibilityRole="button"
                accessibilityLabel="Change workout duration manually"
              >
                <Clock size={18} color="#38BDF8" />
                <Text style={styles.optionButtonText}>Enter Custom Time</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionButtonSecondary}
                onPress={handleKeepOriginal}
                accessibilityRole="button"
                accessibilityLabel="Keep recorded duration"
              >
                <Check size={18} color="#9CA3AF" />
                <Text style={styles.optionButtonSecondaryText}>
                  Keep {formatDuration(initialDurationSeconds)}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Time Input Fields (when custom inputs visible or regular mode) */}
          {showCustomInputs && (
            <View style={styles.inputsSection}>
              <View style={styles.timeInputsRow}>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={styles.timeInput}
                    value={hours}
                    onChangeText={(text) => setHours(text.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.inputLabel}>HOURS</Text>
                </View>

                <Text style={styles.timeSeparator}>:</Text>

                <View style={styles.inputGroup}>
                  <TextInput
                    style={styles.timeInput}
                    value={minutes}
                    onChangeText={(text) => setMinutes(text.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    placeholderTextColor="#6B7280"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.inputLabel}>MINUTES</Text>
                </View>
              </View>

              {workout && (
                <TouchableOpacity
                  style={styles.estimateChip}
                  onPress={() => {
                    const { hours: eh, minutes: em } = secondsToHoursMinutes(estimatedDuration);
                    setHours(eh > 0 ? String(eh) : '');
                    setMinutes(String(em));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Auto-calculate duration suggestion"
                >
                  <Sparkles size={14} color="#F59E0B" />
                  <Text style={styles.estimateChipText}>
                    Estimate from sets: {formatDuration(estimatedDuration)}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCustom}>
                  <Check size={18} color="#000000" />
                  <Text style={styles.saveBtnText}>Save Time</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#262A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  safetyOptions: {
    gap: 10,
    marginTop: 4,
  },
  estimatePrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    padding: 14,
  },
  buttonTextGroup: {
    flex: 1,
  },
  estimatePrimaryText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  estimateSubText: {
    color: '#3F2204',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#262A34',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 14,
  },
  optionButtonText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  optionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1E232E',
    borderRadius: 12,
    padding: 12,
  },
  optionButtonSecondaryText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  inputsSection: {
    marginTop: 6,
  },
  timeInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  inputGroup: {
    alignItems: 'center',
    gap: 6,
  },
  timeInput: {
    width: 80,
    height: 56,
    backgroundColor: '#262A34',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  inputLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeSeparator: {
    color: '#6B7280',
    fontSize: 28,
    fontWeight: '800',
    paddingBottom: 18,
  },
  estimateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 18,
    alignSelf: 'center',
  },
  estimateChipText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cancelBtnText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
