import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, MapPin, X } from 'lucide-react-native';
import { Gym } from '../types';
import { resolveInitialStartGymId } from '../workout/gym-session';

export interface WorkoutStartModalProps {
  visible: boolean;
  workoutName: string;
  gyms: Gym[];
  selectedGymId?: string;
  onStart: (gymId: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}

export function WorkoutStartModal({
  visible,
  workoutName,
  gyms,
  selectedGymId,
  onStart,
  onClose,
}: WorkoutStartModalProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedGymId);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedId(selectedGymId || resolveInitialStartGymId(gyms));
  }, [gyms, selectedGymId, visible]);

  const selectedGym = gyms.find((gym) => gym.id === selectedId);

  const handleClose = () => {
    if (!isStarting) onClose();
  };

  const handleStart = async () => {
    if (!selectedGym || isStarting) return;

    setIsStarting(true);
    try {
      const started = await onStart(selectedGym.id);
      if (started !== false) onClose();
    } catch {
      // Keep the setup sheet open so the caller can recover from a start failure.
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <View style={styles.container} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Start Workout</Text>
              <Text style={styles.workoutName} numberOfLines={1}>
                {workoutName}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel workout start"
              disabled={isStarting}
              hitSlop={8}
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <MapPin size={16} color="#38BDF8" />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Where are you training?</Text>
              <Text style={styles.sectionDescription}>
                We’ll load the most relevant previous sets for this gym.
              </Text>
            </View>
          </View>

          <View style={styles.gymList}>
            {gyms.map((gym) => {
              const selected = gym.id === selectedId;
              return (
                <TouchableOpacity
                  key={gym.id}
                  style={[styles.gymRow, selected && styles.gymRowSelected]}
                  onPress={() => setSelectedId(gym.id)}
                  disabled={isStarting}
                  accessibilityRole="radio"
                  accessibilityLabel={`${gym.name}${gym.isDefault ? ', default gym' : ''}`}
                  accessibilityState={{ checked: selected, disabled: isStarting }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.swatch, { backgroundColor: gym.color }]} />
                  <View style={styles.gymDetails}>
                    <Text style={styles.gymName}>{gym.name}</Text>
                    {gym.isDefault && <Text style={styles.defaultText}>Default gym</Text>}
                  </View>
                  {selected && <Check size={20} color="#38BDF8" />}
                </TouchableOpacity>
              );
            })}
            {gyms.length === 0 && (
              <Text style={styles.emptyText}>No gyms are available yet.</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.startButton, (!selectedGym || isStarting) && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={!selectedGym || isStarting}
            accessibilityRole="button"
            accessibilityLabel={`Start workout at ${selectedGym?.name || 'selected gym'}`}
            accessibilityState={{ disabled: !selectedGym || isStarting, busy: isStarting }}
          >
            {isStarting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.startButtonText}>Start Workout</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleClose}
            disabled={isStarting}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
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
    maxWidth: 440,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2D3748',
    backgroundColor: '#181A20',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  headerCopy: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  workoutName: {
    marginTop: 4,
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#262A34',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 9,
    backgroundColor: '#0C4A6E',
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionDescription: {
    marginTop: 3,
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 17,
  },
  gymList: {
    gap: 8,
  },
  gymRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    backgroundColor: '#262A34',
  },
  gymRowSelected: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  swatch: {
    width: 18,
    height: 18,
    marginRight: 12,
    borderRadius: 9,
  },
  gymDetails: {
    flex: 1,
  },
  gymName: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '600',
  },
  defaultText: {
    marginTop: 2,
    color: '#9CA3AF',
    fontSize: 12,
  },
  emptyText: {
    paddingVertical: 18,
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
  startButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  cancelButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
});
