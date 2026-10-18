import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { AppTouchable } from '../components/ui';
import { ChevronRight, Folder, FolderCog, Play, Plus, Settings2 } from 'lucide-react-native';
import { colors } from '../theme';
import { ActionSheet, Chip, IconButton, ScreenHeader, SectionHeader } from '../components/ui';
import { RoutineEditorModal } from '../components/RoutineEditorModal';
import { FolderManageModal } from '../components/FolderManageModal';
import { SettingsModal } from '../components/SettingsModal';
import { WorkoutStartModal } from '../components/WorkoutStartModal';
import { RoutineCard } from './workout/RoutineCard';
import { WeekSummaryCard } from './workout/WeekSummaryCard';
import { useWorkoutScreenController } from './workout/useWorkoutScreenController';
import { useI18n } from '../i18n';
import { styles } from './workoutStyles';

/**
 * ARCH-13: composition only. Screen state and handlers live in
 * `useWorkoutScreenController`; the week card and each routine card are
 * extracted presentational components.
 */
const WorkoutScreenInner: React.FC = () => {
  const { t } = useI18n();
  const {
    header,
    weekCard,
    quickStart,
    routines,
    actionSheet,
    editorModal,
    folderModal,
    settingsModal,
    startModal,
  } = useWorkoutScreenController();

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow={header.eyebrow}
        title={t('workout.title')}
        right={
          <IconButton
            icon={Settings2}
            onPress={header.onOpenSettings}
            accessibilityLabel={t('workout.openSettings')}
          />
        }
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* This week */}
        {weekCard && <WeekSummaryCard week={weekCard.week} unit={weekCard.unit} />}

        {/* Quick Start */}
        <AppTouchable
          style={styles.quickStartCard}
          onPress={quickStart.onStartEmpty}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('workout.startEmptyA11y')}
        >
          <View style={styles.quickStartIcon}>
            <Play size={20} color={colors.primary} fill={colors.primary} />
          </View>
          <View style={styles.quickStartInfo}>
            <Text style={styles.quickStartTitle}>{t('workout.quickStartTitle')}</Text>
            <Text style={styles.quickStartSubtitle}>{t('workout.quickStartSubtitle')}</Text>
          </View>
          <ChevronRight size={20} color={colors.onPrimary} />
        </AppTouchable>

        {/* Routines */}
        <SectionHeader
          title={t('workout.routines')}
          meta={routines.count > 0 ? String(routines.count) : undefined}
          actionLabel={t('workout.newRoutine')}
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
              accessibilityLabel={t('workout.manageFolders')}
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

        {routines.count === 0 ? (
          <AppTouchable
            style={styles.emptyRoutinesBox}
            onPress={routines.onCreate}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('workout.emptyTitle')}
          >
            <View style={styles.emptyIcon}>
              <Plus size={22} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t('workout.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('workout.emptySubtitle')}</Text>
          </AppTouchable>
        ) : routines.filtered.length === 0 ? (
          <View style={styles.emptyFolderBox}>
            <Text style={styles.emptyText}>{t('workout.emptyText')}</Text>
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet {...actionSheet} />

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
