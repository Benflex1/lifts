import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Play, Trash2, X, Clock, Dumbbell } from 'lucide-react-native';
import { WorkoutDraft } from '../database/contract';
import { formatDuration } from '../utils/calculator';

interface DraftRecoveryModalProps {
  visible: boolean;
  drafts: WorkoutDraft[];
  onResume: (draft: WorkoutDraft) => void;
  onDiscard: (draftId: string) => void;
  onClose: () => void;
}

export function DraftRecoveryModal({
  visible,
  drafts,
  onResume,
  onDiscard,
  onClose,
}: DraftRecoveryModalProps) {
  if (!visible) return null;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return isoString;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Recover Unfinished Workouts</Text>
              <Text style={styles.subtitle}>
                You have {drafts.length} saved unfinished workout {drafts.length === 1 ? 'draft' : 'drafts'}.
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={drafts}
            keyExtractor={(item) => item.workout.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const exerciseCount = item.workout.exercises?.length || 0;
              const completedSetsCount = item.workout.exercises?.reduce(
                (acc, ex) => acc + (ex.sets?.filter((s) => s.isCompleted).length || 0),
                0
              ) || 0;

              return (
                <View style={styles.card}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.workoutName}>{item.workout.name || 'Untitled Workout'}</Text>
                    <Text style={styles.cardMeta}>
                      Saved {formatDate(item.savedAt)}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View style={styles.badge}>
                        <Clock size={12} color="#9CA3AF" />
                        <Text style={styles.badgeText}>
                          {formatDuration(item.workout.durationSeconds || 0)}
                        </Text>
                      </View>
                      <View style={styles.badge}>
                        <Dumbbell size={12} color="#9CA3AF" />
                        <Text style={styles.badgeText}>
                          {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} • {completedSetsCount} sets
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.discardBtn}
                      onPress={() => onDiscard(item.workout.id)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.resumeBtn}
                      onPress={() => onResume(item)}
                      activeOpacity={0.7}
                    >
                      <Play size={14} color="#000000" fill="#000000" />
                      <Text style={styles.resumeText}>Resume</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#181A20',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#262A34',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262A34',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#262A34',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#1E232E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2D3442',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardInfo: {
    flex: 1,
    marginRight: 12,
  },
  workoutName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#262A34',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discardBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#2A171B',
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  resumeText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});
