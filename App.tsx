import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Dumbbell, History, BookOpen, BarChart3 } from 'lucide-react-native';
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

type Tab = 'workout' | 'history' | 'exercises' | 'analytics';

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

          {/* Modern Bottom Navigation Bar */}
          <View style={[styles.bottomNav, { paddingBottom: Math.max(10, insets.bottom) }]}>
            <TouchableOpacity
              style={styles.navTab}
              onPress={() => setCurrentTab('workout')}
              activeOpacity={0.7}
            >
              <Dumbbell
                size={22}
                color={currentTab === 'workout' ? '#3B82F6' : '#6B7280'}
              />
              <Text
                style={[
                  styles.navLabel,
                  currentTab === 'workout' && styles.navLabelActive,
                ]}
              >
                Workout
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navTab}
              onPress={() => setCurrentTab('history')}
              activeOpacity={0.7}
            >
              <History
                size={22}
                color={currentTab === 'history' ? '#3B82F6' : '#6B7280'}
              />
              <Text
                style={[
                  styles.navLabel,
                  currentTab === 'history' && styles.navLabelActive,
                ]}
              >
                History
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navTab}
              onPress={() => setCurrentTab('exercises')}
              activeOpacity={0.7}
            >
              <BookOpen
                size={22}
                color={currentTab === 'exercises' ? '#3B82F6' : '#6B7280'}
              />
              <Text
                style={[
                  styles.navLabel,
                  currentTab === 'exercises' && styles.navLabelActive,
                ]}
              >
                Exercises
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navTab}
              onPress={() => setCurrentTab('analytics')}
              activeOpacity={0.7}
            >
              <BarChart3
                size={22}
                color={currentTab === 'analytics' ? '#3B82F6' : '#6B7280'}
              />
              <Text
                style={[
                  styles.navLabel,
                  currentTab === 'analytics' && styles.navLabelActive,
                ]}
              >
                Analytics
              </Text>
            </TouchableOpacity>
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
        <Dumbbell size={48} color="#3B82F6" />
        <Text style={styles.loadingTitle}>LIFTS</Text>
        <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <Dumbbell size={48} color="#EF4444" />
        <Text style={styles.loadingTitle}>Storage Error</Text>
        <Text style={{ color: '#9CA3AF', textAlign: 'center', marginTop: 10, marginHorizontal: 30 }}>
          {error || 'Unable to open or migrate database.'}
        </Text>
        <TouchableOpacity
          style={{
            marginTop: 24,
            backgroundColor: '#3B82F6',
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
          }}
          onPress={retry}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Retry</Text>
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
    backgroundColor: '#0D0E12',
  },
  screenContent: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#181A20',
    borderTopWidth: 1,
    borderTopColor: '#262A34',
    paddingTop: 8,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  navLabelActive: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0D0E12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 12,
  },
});
