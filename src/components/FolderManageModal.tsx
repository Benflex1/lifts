import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { X, Edit2, Trash2, Check } from 'lucide-react-native';
import { renameFolder, deleteFolder } from '../database/db';
import { useDialog } from '../context/DialogContext';

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Manage Folders</Text>
            <TouchableOpacity onPress={onClose}>
              <X color="#9CA3AF" size={22} />
            </TouchableOpacity>
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
                    <TouchableOpacity onPress={() => handleRename(f)} style={styles.confirmBtn}>
                      <Check size={18} color="#10B981" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.folderName}>{f}</Text>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingFolder(f);
                          setNewName(f);
                        }}
                        style={styles.iconBtn}
                      >
                        <Edit2 size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(f)}
                        style={styles.iconBtn}
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </TouchableOpacity>
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
  container: { backgroundColor: '#181A20', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#262A34' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#6B7280', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  folderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#262A34' },
  folderName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 8, backgroundColor: '#20242E' },
  renameInput: { flex: 1, backgroundColor: '#262A34', borderRadius: 8, color: '#FFFFFF', fontSize: 15, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  confirmBtn: { padding: 8, borderRadius: 8, backgroundColor: '#132E27' },
});
