import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Edit2, Plus, Trash2, X } from 'lucide-react-native';
import { createGym, deleteGym, getGyms, setDefaultGym, updateGym } from '../database/db';
import { Gym } from '../types';
import { GYM_COLOR_PALETTE, validateGymColor, validateGymName } from '../workout/gym-profile';
import { useDialog } from '../context/DialogContext';
import { GymPickerModal } from './GymPickerModal';

export interface GymProfilesModalProps {
  visible: boolean;
  onClose: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function GymProfilesModal({ visible, onClose }: GymProfilesModalProps) {
  const { confirm, notify } = useDialog();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingGymId, setEditingGymId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(GYM_COLOR_PALETTE[0]);
  const [deletingGymId, setDeletingGymId] = useState<string | null>(null);
  const [replacementPickerVisible, setReplacementPickerVisible] = useState(false);

  const resetForm = () => {
    setEditingGymId(null);
    setName('');
    setColor(GYM_COLOR_PALETTE[0]);
  };

  const refreshGyms = async () => {
    const list = await getGyms();
    setGyms(list);
    return list;
  };

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    getGyms()
      .then((list) => {
        if (active) setGyms(list);
      })
      .catch(async (error) => {
        if (active) await notify({ title: 'Gym Error', message: errorMessage(error, 'Failed to load gyms.') });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, notify]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const validName = validateGymName(name);
      const validColor = validateGymColor(color);
      if (editingGymId) {
        await updateGym(editingGymId, { name: validName, color: validColor });
      } else {
        await createGym(validName, validColor);
      }
      await refreshGyms();
      resetForm();
    } catch (error) {
      await notify({ title: 'Gym Error', message: errorMessage(error, 'Failed to save gym.') });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (gym: Gym) => {
    setEditingGymId(gym.id);
    setName(gym.name);
    setColor(gym.color);
  };

  const handleSetDefault = async (gym: Gym) => {
    if (gym.isDefault || saving) return;
    setSaving(true);
    try {
      await setDefaultGym(gym.id);
      await refreshGyms();
    } catch (error) {
      await notify({ title: 'Gym Error', message: errorMessage(error, 'Failed to set default gym.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (gym: Gym) => {
    if (saving) return;
    const confirmed = await confirm({
      title: 'Delete Gym',
      message: `Delete "${gym.name}"? Its workouts and drafts will be moved to another gym.`,
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingGymId(gym.id);
    setReplacementPickerVisible(true);
  };

  const handleReplacementSelect = async (replacementGymId: string) => {
    if (!deletingGymId) return;
    try {
      await deleteGym(deletingGymId, replacementGymId);
      setReplacementPickerVisible(false);
      setDeletingGymId(null);
      await refreshGyms();
    } catch (error) {
      await notify({ title: 'Gym Error', message: errorMessage(error, 'Failed to delete gym.') });
      throw error;
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>Manage Gyms</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close gym management"
                hitSlop={8}
              >
                <X size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.form}>
                <Text style={styles.formTitle}>{editingGymId ? 'Edit Gym' : 'Add Gym'}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Gym name"
                  placeholderTextColor="#6B7280"
                  maxLength={80}
                  accessibilityLabel="Gym name"
                  returnKeyType="done"
                  editable={!saving}
                />
                <Text style={styles.paletteLabel}>Color</Text>
                <View style={styles.palette}>
                  {GYM_COLOR_PALETTE.map((paletteColor) => {
                    const selected = color === paletteColor;
                    return (
                      <TouchableOpacity
                        key={paletteColor}
                        style={[styles.colorButton, { backgroundColor: paletteColor }, selected && styles.colorButtonSelected]}
                        onPress={() => setColor(paletteColor)}
                        accessibilityRole="button"
                        accessibilityLabel={`Choose gym color ${paletteColor}`}
                        accessibilityState={{ selected }}
                        disabled={saving}
                      >
                        {selected && <Check size={18} color="#FFFFFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.formActions}>
                  {editingGymId && (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={resetForm}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel gym edit"
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleSave}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={editingGymId ? 'Save gym changes' : 'Add gym'}
                  >
                    {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Plus size={18} color="#FFFFFF" />}
                    <Text style={styles.primaryButtonText}>{editingGymId ? 'Save Changes' : 'Add Gym'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.listTitle}>Your Gyms</Text>
              {loading ? (
                <ActivityIndicator style={styles.loader} size="small" color="#3B82F6" />
              ) : gyms.length === 0 ? (
                <Text style={styles.emptyText}>No gyms available.</Text>
              ) : (
                gyms.map((gym) => (
                  <View key={gym.id} style={styles.gymRow}>
                    <View style={[styles.swatch, { backgroundColor: gym.color }]} />
                    <View style={styles.gymDetails}>
                      <Text style={styles.gymName}>{gym.name}</Text>
                      {gym.isDefault && <Text style={styles.defaultText}>Default gym</Text>}
                    </View>
                    <View style={styles.rowActions}>
                      {!gym.isDefault && (
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleSetDefault(gym)}
                          disabled={saving}
                          accessibilityRole="button"
                          accessibilityLabel={`Set ${gym.name} as default gym`}
                        >
                          <Check size={18} color="#10B981" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleEdit(gym)}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${gym.name}`}
                      >
                        <Edit2 size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDelete(gym)}
                        disabled={saving || gyms.length < 2}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${gym.name}`}
                        accessibilityState={{ disabled: saving || gyms.length < 2 }}
                      >
                        <Trash2 size={18} color={gyms.length < 2 ? '#4B5563' : '#EF4444'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <GymPickerModal
        visible={replacementPickerVisible}
        gyms={gyms.filter((gym) => gym.id !== deletingGymId)}
        title="Move Workouts To"
        onSelect={handleReplacementSelect}
        onClose={() => {
          setReplacementPickerVisible(false);
          setDeletingGymId(null);
        }}
      />
    </>
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
    maxWidth: 500,
    maxHeight: '90%',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    backgroundColor: '#181A20',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#262A34',
  },
  form: {
    padding: 14,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: '#20242E',
  },
  formTitle: {
    marginBottom: 10,
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 15,
    backgroundColor: '#262A34',
  },
  paletteLabel: {
    marginTop: 14,
    marginBottom: 8,
    color: '#9CA3AF',
    fontSize: 13,
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 22,
  },
  colorButtonSelected: {
    borderColor: '#FFFFFF',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  primaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: '#3B82F6',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: '#374151',
  },
  secondaryButtonText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  listTitle: {
    marginBottom: 10,
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    paddingVertical: 24,
  },
  emptyText: {
    paddingVertical: 24,
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
  gymRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#262A34',
    borderRadius: 10,
    backgroundColor: '#20242E',
  },
  swatch: {
    width: 18,
    height: 18,
    marginRight: 10,
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
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#262A34',
  },
});
