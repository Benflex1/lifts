import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import {
  ChevronRight,
  Folder,
  FolderCog,
  Play,
  Plus,
  Repeat,
  Settings2,
} from 'lucide-react-native';
import { colors } from '../theme';
import { ActionSheet, Chip, IconButton, ScreenHeader, SectionHeader } from '../components/ui';
import { RoutineEditorModal } from '../components/RoutineEditorModal';
import { FolderManageModal } from '../components/FolderManageModal';
import { SettingsModal } from '../components/SettingsModal';
import { WorkoutStartModal } from '../components/WorkoutStartModal';
import { ProgramCard } from '../components/ProgramCard';
import { ProgramEditorModal } from '../components/ProgramEditorModal';
import { RoutineCard } from './workout/RoutineCard';
import { WeekSummaryCard } from './workout/WeekSummaryCard';
import { useWorkoutScreenController } from './workout/useWorkoutScreenController';
import { styles } from './workoutStyles';

/**
 * ARCH-13: composition only. Screen state and handlers live in
 * `useWorkoutScreenController`; the week card and each routine card are
 * extracted presentational components.
 */
const WorkoutScreenInner: React.FC = () => {
  const {
    header,
    weekCard,
    programs,
    quickStart,
    routines,
    actionSheet,
    programMenuSheet,
    programPickSheet,
    programEditorModal,
    editorModal,
    folderModal,
    settingsModal,
    startModal,
  } = useWorkoutScreenController();

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow={header.eyebrow}
        title="Workout"
        right={
          <IconButton
            icon={Settings2}
            onPress={header.onOpenSettings}
            accessibilityLabel="Open settings"
          />
        }
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Up next in each rotation */}
        {programs.states.map((state) => (
          <ProgramCard
            key={state.program.folderName}
            state={state}
            onStart={() => programs.onStart(state.next)}
            onMenu={() => programs.onMenu(state)}
          />
        ))}

        {/* This week */}
        {weekCard && <WeekSummaryCard week={weekCard.week} unit={weekCard.unit} />}

        {/* Quick Start */}
        {/* With a rotation up next, the empty workout steps back so one start button leads. */}
        <TouchableOpacity
          style={[styles.quickStartCard, quickStart.hasPrograms && styles.quickStartQuiet]}
          onPress={quickStart.onStartEmpty}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start empty workout"
        >
          <View style={[styles.quickStartIcon, quickStart.hasPrograms && styles.quickStartIconQuiet]}>
            <Play
              size={quickStart.hasPrograms ? 16 : 20}
              color={colors.primary}
              fill={colors.primary}
            />
          </View>
          <View style={styles.quickStartInfo}>
            <Text
              style={[styles.quickStartTitle, quickStart.hasPrograms && styles.quickStartTitleQuiet]}
            >
              Start Empty Workout
            </Text>
            <Text
              style={[
                styles.quickStartSubtitle,
                quickStart.hasPrograms && styles.quickStartSubtitleQuiet,
              ]}
            >
              Log exercises as you go
            </Text>
          </View>
          <ChevronRight
            size={20}
            color={quickStart.hasPrograms ? colors.textMuted : colors.onPrimary}
          />
        </TouchableOpacity>

        {/* Routines */}
        <SectionHeader
          title="Routines"
          meta={routines.count > 0 ? String(routines.count) : undefined}
          actionLabel="+ New"
          onAction={routines.onCreate}
          style={styles.sectionHeader}
        />

        {routines.showFolderChips && (
          <View style={styles.folderChipsHeader}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.folderChipsContainer}
              style={styles.folderChipsScroll}
            >
              {routines.folders.map(f => (
                <Chip
                  key={f}
                  label={f}
                  selected={routines.selectedFolder === f}
                  onPress={() => routines.onSelectFolder(f)}
                  leading={
                    f !== 'All' ? (
                      <Folder
                        size={13}
                        color={routines.selectedFolder === f ? colors.bg : colors.textMuted}
                      />
                    ) : undefined
                  }
                />
              ))}
            </ScrollView>
            <IconButton
              icon={FolderCog}
              size={36}
              iconSize={17}
              onPress={routines.onOpenFolderManager}
              accessibilityLabel="Manage folders"
            />
          </View>
        )}

        {routines.filtered.map(routine => (
          <RoutineCard
            key={routine.id}
            routine={routine}
            showFolderTag={routines.selectedFolder === 'All'}
            onOpenMenu={routines.onOpenMenu}
            onStart={routines.onStart}
          />
        ))}

        {routines.canMakeRotation && (
          <TouchableOpacity
            style={styles.makeRotation}
            onPress={routines.onOpenProgramEditor}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={
              routines.isDormantRotation
                ? `Edit ${routines.selectedFolder} rotation`
                : `Make ${routines.selectedFolder} a rotation`
            }
          >
            <View style={styles.makeRotationIcon}>
              <Repeat size={16} color={colors.primaryLight} />
            </View>
            <View style={styles.makeRotationText}>
              <Text style={styles.makeRotationTitle}>
                {routines.isDormantRotation ? 'Rotation paused' : 'Make this folder a rotation'}
              </Text>
              <Text style={styles.makeRotationSubtitle}>
                {routines.isDormantRotation
                  ? 'Add a routine to resume it, or stop it'
                  : 'Always know which workout is next'}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {routines.count === 0 ? (
          <TouchableOpacity
            style={styles.emptyRoutinesBox}
            onPress={routines.onCreate}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <View style={styles.emptyIcon}>
              <Plus size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Create your first routine</Text>
            <Text style={styles.emptyText}>Save your go-to workouts and start them in one tap.</Text>
          </TouchableOpacity>
        ) : routines.filtered.length === 0 ? (
          <View style={styles.emptyFolderBox}>
            <Text style={styles.emptyText}>No routines in this folder.</Text>
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet {...actionSheet} />

      <ActionSheet {...programMenuSheet} />

      <ActionSheet {...programPickSheet} />

      <ProgramEditorModal {...programEditorModal} />

      {/* Routine Editor Modal */}
      <RoutineEditorModal {...editorModal} />

      <FolderManageModal {...folderModal} />

      <SettingsModal {...settingsModal} />

      <WorkoutStartModal {...startModal} />
    </View>
  );
};

/** Memoized so hidden (kept-alive) tabs skip re-rendering when the app shell updates. */
export const WorkoutScreen = React.memo(WorkoutScreenInner);
