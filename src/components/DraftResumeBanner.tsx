import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Trash2, List } from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatDuration } from '../utils/calculator';
import { DraftRecoveryModal } from './DraftRecoveryModal';

export const DraftResumeBanner: React.FC = () => {
  const {
    availableDrafts,
    resumeDraft,
    discardDraft,
    isWorkingOut,
    isDraftModalOpen,
    openDraftModal,
    closeDraftModal,
  } = useWorkout();

  if (availableDrafts.length === 0 || isWorkingOut) return null;

  const firstDraft = availableDrafts[0];

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerTitle}>
            {availableDrafts.length === 1 ? 'Unfinished Workout' : `Unfinished Workouts (${availableDrafts.length})`}
          </Text>
          <Text style={styles.bannerSub}>
            {availableDrafts.length === 1
              ? `${firstDraft.workout.name} • ${formatDuration(firstDraft.workout.durationSeconds || 0)}`
              : `${availableDrafts.length} recoverable sessions available`}
          </Text>
        </View>
        <View style={styles.bannerActions}>
          {availableDrafts.length > 1 ? (
            <TouchableOpacity style={styles.reviewBtn} onPress={openDraftModal} activeOpacity={0.7}>
              <List size={14} color="#000000" />
              <Text style={styles.reviewBtnText}>Review & Recover</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.discardBtn}
                onPress={() => discardDraft(firstDraft.workout.id)}
                activeOpacity={0.7}
              >
                <Trash2 size={14} color="#EF4444" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resumeBtn}
                onPress={() => resumeDraft(firstDraft)}
                activeOpacity={0.7}
              >
                <Play size={14} color="#000000" fill="#000000" />
                <Text style={styles.resumeBtnText}>Resume</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <DraftRecoveryModal
        visible={isDraftModalOpen}
        drafts={availableDrafts}
        onResume={(d) => resumeDraft(d)}
        onDiscard={(id) => discardDraft(id)}
        onClose={closeDraftModal}
      />
    </>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E232E',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D3442',
  },
  bannerInfo: { flex: 1, marginRight: 12 },
  bannerTitle: { color: '#F59E0B', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  bannerSub: { color: '#9CA3AF', fontSize: 12 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discardBtn: { padding: 8, borderRadius: 8, backgroundColor: '#2A171B' },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  resumeBtnText: { color: '#000000', fontSize: 13, fontWeight: '700' },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  reviewBtnText: { color: '#000000', fontSize: 13, fontWeight: '700' },
});
