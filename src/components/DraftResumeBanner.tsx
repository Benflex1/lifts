import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Trash2, List } from 'lucide-react-native';
import { useWorkout } from '../context/WorkoutContext';
import { formatDuration } from '../utils/calculator';
import { DraftRecoveryModal } from './DraftRecoveryModal';
import { useDialog } from '../context/DialogContext';
import { getPausedWorkoutCountLabel } from '../workout/session-copy';
import { colors } from '../theme';

export const DraftResumeBanner: React.FC = () => {
  const { confirm } = useDialog();
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

  const handleDiscard = async (id: string) => {
    const shouldDiscard = await confirm({
      title: 'Discard Draft?',
      message: 'Are you sure you want to discard this unfinished workout? Logged sets will be deleted.',
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (shouldDiscard) {
      await discardDraft(id);
    }
  };

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerTitle}>
            {getPausedWorkoutCountLabel(availableDrafts.length)}
          </Text>
          <Text style={styles.bannerSub}>
            {availableDrafts.length === 1
              ? `Saved session • ${firstDraft.workout.name} • ${formatDuration(firstDraft.workout.durationSeconds || 0)}`
              : `${availableDrafts.length} saved paused sessions available`}
          </Text>
        </View>
        <View style={styles.bannerActions}>
          {availableDrafts.length > 1 ? (
            <TouchableOpacity style={styles.reviewBtn} onPress={openDraftModal} activeOpacity={0.7}>
              <List size={14} color={colors.black} />
              <Text style={styles.reviewBtnText}>Review & Continue</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.discardBtn}
                onPress={() => handleDiscard(firstDraft.workout.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Discard paused workout"
              >
                <Trash2 size={14} color={colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resumeBtn}
                onPress={() => resumeDraft(firstDraft)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Continue paused workout"
              >
                <Play size={14} color={colors.black} fill={colors.black} />
                <Text style={styles.resumeBtnText}>Continue</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <DraftRecoveryModal
        visible={isDraftModalOpen}
        drafts={availableDrafts}
        onResume={(d) => resumeDraft(d)}
        onDiscard={handleDiscard}
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
    backgroundColor: colors.surfaceAlt,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  bannerInfo: { flex: 1, marginRight: 12 },
  bannerTitle: { color: colors.warning, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  bannerSub: { color: colors.textSecondary, fontSize: 12 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discardBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.dangerSoft },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.success,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  resumeBtnText: { color: colors.black, fontSize: 13, fontWeight: '700' },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  reviewBtnText: { color: colors.black, fontSize: 13, fontWeight: '700' },
});
