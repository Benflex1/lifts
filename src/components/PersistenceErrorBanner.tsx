import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { usePersistenceError, useWorkoutActions } from '../context/WorkoutContext';
import { useDialog } from '../context/DialogContext';
import { Workout } from '../types';
import { colors } from '../theme';
import { errorMessage } from '../utils/invariant';
import { saveBackupJson } from '../utils/saveBackup';

interface PersistenceErrorBannerProps {
  workout: Workout | null;
}

/**
 * Non-dismissible warning shown when the session controller could not write the
 * active workout draft. Offers a retry and a share-a-copy fallback so an app kill
 * cannot silently lose the session.
 */
export function PersistenceErrorBanner({ workout }: PersistenceErrorBannerProps) {
  const persistenceError = usePersistenceError();
  const { retryPersistence } = useWorkoutActions();
  const { notify } = useDialog();
  const [retrying, setRetrying] = useState(false);

  if (!persistenceError) {
    return null;
  }

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryPersistence();
    } catch (error: unknown) {
      await notify({
        title: 'Still not saving',
        message:
          errorMessage(error) ||
          'The workout could not be saved. Try again, or share a copy before closing the app.',
      });
    } finally {
      setRetrying(false);
    }
  };

  const handleShare = async () => {
    if (!workout) return;
    try {
      if (Platform.OS === 'web') {
        await saveBackupJson(
          JSON.stringify(workout, null, 2),
          `lifts-unsaved-workout-${workout.id}.json`,
        );
        return;
      }
      await Share.share({
        title: `${workout.name} (unsaved workout)`,
        message: JSON.stringify(workout, null, 2),
      });
    } catch (error: unknown) {
      await notify({
        title: 'Could not share',
        message: errorMessage(error) || 'Sharing is not available on this device.',
      });
    }
  };

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <View style={styles.messageRow}>
        <AlertTriangle size={18} color={colors.danger} style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Changes are not being saved</Text>
          <Text style={styles.description}>
            {persistenceError.message || 'Storage is unavailable. Keep the app open and retry.'}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleShare}
          disabled={!workout}
          accessibilityRole="button"
          accessibilityLabel={
            Platform.OS === 'web' ? 'Save a copy of the workout' : 'Share a copy of the workout'
          }
        >
          <Text style={styles.secondaryButtonText}>
            {Platform.OS === 'web' ? 'Save copy' : 'Share copy'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={handleRetry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel="Retry saving the workout"
        >
          {retrying ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.retryButtonText}>Retry</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.dangerSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    marginTop: 1,
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    color: colors.dangerLight,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
  },
  secondaryButtonText: {
    color: colors.dangerLight,
    fontSize: 13,
    fontWeight: '600',
  },
  retryButton: {
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.danger,
  },
  retryButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
});
