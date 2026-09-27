import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Dumbbell, History, BookOpen, TrendingUp } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StorageProvider, useStorage } from './src/context/StorageContext';
import { WorkoutProvider, useWorkout } from './src/context/WorkoutContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { WorkoutScreen } from './src/screens/WorkoutScreen';
import { ActiveWorkoutScreen } from './src/screens/ActiveWorkoutScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ExercisesScreen } from './src/screens/ExercisesScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';

import { ActiveWorkoutMiniBar } from './src/components/ActiveWorkoutMiniBar';
import { DraftResumeBanner } from './src/components/DraftResumeBanner';
import { ReadOnlyBanner } from './src/components/ReadOnlyBanner';
import { DialogProvider } from './src/context/DialogContext';
import { WorkoutSummaryModal } from './src/components/WorkoutSummaryModal';
import { Workout } from './src/types';
import { saveCompletedWorkout } from './src/database/db';
import { colors } from './src/theme';

type Tab = 'workout' | 'history' | 'exercises' | 'analytics';

const TABS: { key: Tab; label: string; icon: typeof Dumbbell }[] = [
  { key: 'workout', label: 'Workout', icon: Dumbbell },
  { key: 'history', label: 'History', icon: History },
  { key: 'exercises', label: 'Exercises', icon: BookOpen },
  { key: 'analytics', label: 'Progress', icon: TrendingUp },
];

function MainAppContent() {
  const { isWorkingOut, isMinimized, gyms } = useWorkout();
  const insets = useSafeAreaInsets();
  const [currentTab, setCurrentTab] = useState<Tab>('workout');
  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(null);
  const [historyWorkoutUpdate, setHistoryWorkoutUpdate] = useState<Workout | null>(null);

  const handleWorkoutCompleted = (workout: Workout) => {
    setCompletedWorkout(workout);
    setHistoryWorkoutUpdate(null);
    setCurrentTab('history');
  };

  const handleSummaryDismissed = () => {
    setCompletedWorkout(null);
    setHistoryWorkoutUpdate(null);
    setCurrentTab('history');
  };

  const handleSummaryWorkoutUpdate = async (updated: Workout) => {
    await saveCompletedWorkout(updated);
    setCompletedWorkout(updated);
    setHistoryWorkoutUpdate(updated);
  };

  return (
    <View style={styles.appWrapper}>
      <StatusBar style="light" />

      {/* Completion summary modal surviving logger unmount */}
      <WorkoutSummaryModal
        workout={completedWorkout}
        visible={completedWorkout !== null}
        gyms={gyms}
        onUpdate={handleSummaryWorkoutUpdate}
        onDismiss={handleSummaryDismissed}
      />

      {isWorkingOut && !isMinimized ? (
        <View style={styles.appWrapper}>
          <ReadOnlyBanner />
          <ActiveWorkoutScreen onFinish={handleWorkoutCompleted} />
        </View>
      ) : (
        <>
          {/* Screen Views */}
          <View style={styles.screenContent}>
            <ReadOnlyBanner />
            {currentTab === 'workout' && <WorkoutScreen />}
            {currentTab === 'history' && <HistoryScreen workoutUpdate={historyWorkoutUpdate} />}
            {currentTab === 'exercises' && <ExercisesScreen />}
            {currentTab === 'analytics' && <AnalyticsScreen />}
          </View>

          {/* Paused Workout Card — placed in bottom thumb zone */}
          <DraftResumeBanner />

          {/* Persistent Mini Bar when workout is active in background */}
          <ActiveWorkoutMiniBar />

          {/* Bottom Navigation Bar */}
          <View style={[styles.bottomNav, { paddingBottom: Math.max(10, insets.bottom) }]}>
            {TABS.map(tab => {
              const active = currentTab === tab.key;
              const Icon = tab.icon;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.navTab}
                  onPress={() => setCurrentTab(tab.key)}
                  activeOpacity={0.7}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}>
                    <Icon
                      size={21}
                      color={active ? colors.primary : colors.textMuted}
                      strokeWidth={active ? 2.4 : 2}
                    />
                  </View>
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function AppRoot() {
  const { isReady, error, retry } = useStorage();

  if (!isReady && !error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={styles.logoTile}>
          <Dumbbell size={34} color={colors.onPrimary} />
        </View>
        <Text style={styles.loadingTitle}>Lifts</Text>
        <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={[styles.logoTile, { backgroundColor: colors.dangerSoft }]}>
          <Dumbbell size={34} color={colors.danger} />
        </View>
        <Text style={styles.loadingTitle}>Storage Error</Text>
        <Text style={styles.errorText}>{error || 'Unable to open or migrate database.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retry} accessibilityRole="button">
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SettingsProvider>
      <WorkoutProvider>
        <MainAppContent />
      </WorkoutProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StorageProvider>
        <DialogProvider>
          <AppRoot />
        </DialogProvider>
      </StorageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appWrapper: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenContent: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: 6,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navIconWrap: {
    width: 52,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconWrapActive: {
    backgroundColor: colors.primarySoft,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  navLabelActive: {
    color: colors.text,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoTile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 16,
  },
  errorText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  retryBtnText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
