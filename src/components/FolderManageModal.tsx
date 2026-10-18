import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TextInput } from 'react-native';
import { AppTouchable } from './ui';
import { X, Edit2, Trash2, Check } from 'lucide-react-native';
import { renameFolder, deleteFolder } from '../database/db';
import { useDialog } from '../context/DialogContext';
import { colors } from '../theme';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface Props {
  visible: boolean;
  folders: string[];
  onClose: () => void;
  onFoldersChanged: () => void;
}

export const FolderManageModal: React.FC<Props> = ({
  visible,
  folders,
  onClose,
  onFoldersChanged,
}) => {
  const { confirm, notify } = useDialog();
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const handleRename = async (oldName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingFolder(null);
      return;
    }
    try {
      await renameFolder(oldName, newName.trim());
      onFoldersChanged();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to rename folder.' });
    }
    setEditingFolder(null);
    setNewName('');
  };

  const handleDelete = async (name: string) => {
    const shouldDelete = await confirm({
      title: 'Delete Folder',
      message: `Delete "${name}"? Routines will move to "No folder".`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!shouldDelete) return;

    try {
      await deleteFolder(name);
      onFoldersChanged();
    } catch (e) {
      await notify({ title: 'Error', message: 'Failed to delete folder.' });
    }
  };

  // A11Y-04: modal container traps screen-reader focus and takes iOS focus on open.

  const modalA11yRef = useModalAccessibility(visible);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View ref={modalA11yRef} accessibilityViewIsModal style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Manage Folders</Text>
            <AppTouchable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close folder manager"
            >
              <X color={colors.textSecondary} size={22} />
            </AppTouchable>
          </View>

          {folders.length === 0 ? (
            <Text style={styles.emptyText}>No folders yet.</Text>
          ) : (
            folders.map(f => (
              <View key={f} style={styles.folderRow}>
                {editingFolder === f ? (
                  <>
                    <TextInput
                      style={styles.renameInput}
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                      onSubmitEditing={() => handleRename(f)}
                    />
                    <AppTouchable
                      onPress={() => handleRename(f)}
                      style={styles.confirmBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Save new name for ${f}`}
                    >
                      <Check size={18} color={colors.success} />
                    </AppTouchable>
                  </>
                ) : (
                  <>
                    <Text style={styles.folderName}>{f}</Text>
                    <View style={styles.actions}>
                      <AppTouchable
                        onPress={() => {
                          setEditingFolder(f);
                          setNewName(f);
                        }}
                        style={styles.iconBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Rename folder ${f}`}
                      >
                        <Edit2 size={16} color={colors.textSecondary} />
                      </AppTouchable>
                      <AppTouchable
                        onPress={() => handleDelete(f)}
                        style={styles.iconBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete folder ${f}`}
                      >
                        <Trash2 size={16} color={colors.danger} />
                      </AppTouchable>
                    </View>
                  </>
                )}
              </View>
            ))
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  folderName: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  renameInput: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  confirmBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.successSoft },
});
