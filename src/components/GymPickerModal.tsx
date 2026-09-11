import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Gym } from '../types';
import { canDismissGymPicker } from '../utils/gym-picker';

export interface GymPickerModalProps {
  visible: boolean;
  gyms: Gym[];
  selectedGymId?: string;
  title?: string;
  description?: string;
  onSelect: (gymId: string) => void | Promise<void>;
  onClose: () => void;
}

export function GymPickerModal({
  visible,
  gyms,
  selectedGymId,
  title = 'Select Gym',
  description,
  onSelect,
  onClose,
}: GymPickerModalProps) {
  const [selectingGymId, setSelectingGymId] = useState<string | null>(null);
  const selectingGymIdRef = useRef<string | null>(null);

  const handleClose = () => {
    if (!canDismissGymPicker(selectingGymIdRef.current)) return;
    onClose();
  };

  const handleSelect = async (gymId: string) => {
    if (selectingGymIdRef.current) return;
    selectingGymIdRef.current = gymId;
    setSelectingGymId(gymId);
    try {
      await onSelect(gymId);
      onClose();
    } catch {
      // Keep the picker open so callers can recover from a save failure.
    } finally {
      selectingGymIdRef.current = null;
      setSelectingGymId(null);
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
              <Text style={styles.title}>{title}</Text>
              {description && <Text style={styles.description}>{description}</Text>}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close gym picker"
              hitSlop={8}
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={gyms}
            keyExtractor={(gym) => gym.id}
            contentContainerStyle={gyms.length === 0 ? styles.emptyList : undefined}
            ListEmptyComponent={<Text style={styles.emptyText}>No gyms available.</Text>}
            renderItem={({ item: gym }) => {
              const selected = selectedGymId === gym.id;
              const selecting = selectingGymId === gym.id;
              return (
                <TouchableOpacity
                  style={[styles.gymRow, selected && styles.gymRowSelected]}
                  onPress={() => handleSelect(gym.id)}
                  disabled={Boolean(selectingGymId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${gym.name}${gym.isDefault ? ', default gym' : ''}`}
                  accessibilityState={{ selected, disabled: Boolean(selectingGymId) }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.swatch, { backgroundColor: gym.color }]} />
                  <View style={styles.gymDetails}>
                    <Text style={styles.gymName}>{gym.name}</Text>
                    {gym.isDefault && <Text style={styles.defaultText}>Default gym</Text>}
                  </View>
                  {selecting ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : selected ? (
                    <Check size={20} color="#3B82F6" />
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
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
    borderColor: '#262A34',
    backgroundColor: '#181A20',
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
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    marginTop: 4,
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 17,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#262A34',
  },
  gymRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    backgroundColor: '#262A34',
  },
  gymRowSelected: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
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
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    paddingVertical: 28,
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
});
