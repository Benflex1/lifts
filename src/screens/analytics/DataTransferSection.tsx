import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Download, FileSpreadsheet, Share2, Upload } from 'lucide-react-native';
import { CsvImportModal } from '../../components/CsvImportModal';
import { colors } from '../../theme';
import { Gym } from '../../types';
import type { BackupTransfer } from '../../hooks/useBackupTransfer';
import type { CsvImportFlow } from '../../hooks/useCsvImportFlow';

/**
 * ARCH-02: the Tools tab's data-ownership card (backup download / share / restore) and the CSV
 * import modal driven by useCsvImportFlow.
 */
export function DataTransferSection({
  backup,
  csv,
  gyms,
}: {
  backup: BackupTransfer;
  csv: CsvImportFlow;
  gyms: Gym[];
}) {
  return (
    <>
        {/* Data Ownership */}
        <Text style={styles.groupHeading}>Your Data</Text>
        <View style={styles.listCard}>
          <TouchableOpacity
            style={[styles.listRow]}
            onPress={backup.saveBackup}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save Backup to Files"
          >
            <View style={styles.listRowIcon}>
              <Download size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Save Backup to Files</Text>
              <Text style={styles.listRowSub}>Export a full v3 backup file</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.listRow, styles.listRowDivider]}
            onPress={backup.shareBackup}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Share Backup Workout Data"
          >
            <View style={styles.listRowIcon}>
              <Share2 size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Share Backup</Text>
              <Text style={styles.listRowSub}>Send a backup to another app</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.listRow, styles.listRowDivider]}
            onPress={backup.restoreBackup}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Restore & Import Backup Data"
          >
            <View style={styles.listRowIcon}>
              <Upload size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Restore Backup</Text>
              <Text style={styles.listRowSub}>Replace data from a backup file</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.listRow, styles.listRowDivider]}
            onPress={csv.startImport}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Import Workouts from CSV"
          >
            <View style={styles.listRowIcon}>
              <FileSpreadsheet size={18} color={colors.textSoft} />
            </View>
            <View style={styles.listRowText}>
              <Text style={styles.listRowTitle}>Import from Other Apps</Text>
              <Text style={styles.listRowSub}>Hevy, Strong, Lyfta and more (CSV)</Text>
            </View>
            <ChevronRight size={18} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
        <Text style={styles.dataFootnote}>
          Lifts stores workout data locally. Backups are written only to a folder you choose.
        </Text>

      <CsvImportModal
        visible={csv.preview !== null}
        preview={csv.preview}
        fileName={csv.fileName}
        gyms={gyms}
        selectedGymId={csv.gymId}
        onSelectGymId={csv.selectGym}
        skipDuplicates={csv.skipDuplicates}
        onToggleSkipDuplicates={csv.toggleSkipDuplicates}
        onConfirmImport={csv.confirmImport}
        onClose={csv.closePreview}
        isImporting={csv.isImporting}
        onAssignExercise={csv.assignExercise}
        onSetCustomExercise={csv.setCustomExercise}
      />
    </>
  );
}

const styles = StyleSheet.create({
  groupHeading: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: 12,
      marginBottom: 8,
      marginLeft: 4,
    },
  listCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
  listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
      paddingHorizontal: 14,
    },
  listRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderStrong,
    },
  listRowIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor: colors.surfaceHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
  listRowSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
  listRowText: {
      flex: 1,
    },
  listRowTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
  dataFootnote: {
      color: colors.textFaint,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 14,
      paddingHorizontal: 24,
      lineHeight: 17,
    },
});
