import {
  computeHeartRateZones,
  formatMaxHrSourceLabel,
  resolveMaxHeartRate
} from '@/features/heart-rate';
import { simpleLogger } from '@/shared';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ResolvedTheme, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { JSX, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  loadUserProfile,
  MAX_CUSTOM_MAX_HR_BPM,
  MIN_CUSTOM_MAX_HR_BPM,
  parseCsvWeightEntries,
  saveUserProfile,
  todayIso,
  type UserProfile,
  type WeightEntry
} from '../services/profileStorage';
import { WeightChart } from '../components/WeightChart';
import { WeightEntryForm } from '../components/WeightEntryForm';
import { WeightHistoryList } from '../components/WeightHistoryList';

export function ProfileScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile>({ weightEntries: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [ageInput, setAgeInput] = useState('');
  const [maxHrInput, setMaxHrInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDateOriginal, setEditingDateOriginal] = useState<string | null>(null);
  const [initialEditWeight, setInitialEditWeight] = useState<number | undefined>(undefined);
  const [newDate, setNewDate] = useState(todayIso());
  const [newWeight, setNewWeight] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      const loaded = await loadUserProfile();
      if (!isMounted) return;
      setProfile(loaded);
      setAgeInput(loaded.age !== undefined ? String(loaded.age) : '');
      setMaxHrInput(loaded.maxHeartRate !== undefined ? String(loaded.maxHeartRate) : '');
      setIsLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (next: UserProfile) => {
    setProfile(next);
    try {
      await saveUserProfile(next);
    } catch (error) {
      simpleLogger.error('Profile save failed', error);
      Alert.alert('Save failed', 'Could not save your profile. Please try again.');
    }
  }, []);

  const handleAgeChange = useCallback((value: string) => {
    setAgeInput(value);
  }, []);

  const handleAgeBlur = useCallback(() => {
    const trimmed = ageInput.trim();
    if (trimmed === '') {
      void persist({ ...profile, age: undefined });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) {
      Alert.alert('Invalid age', 'Please enter an age between 1 and 120, or leave it blank.');
      setAgeInput(profile.age !== undefined ? String(profile.age) : '');
      return;
    }
    void persist({ ...profile, age: parsed });
  }, [ageInput, persist, profile]);

  const handleMaxHrChange = useCallback((value: string) => {
    setMaxHrInput(value);
  }, []);

  const handleMaxHrBlur = useCallback(() => {
    const trimmed = maxHrInput.trim();
    if (trimmed === '') {
      void persist({ ...profile, maxHeartRate: undefined });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_CUSTOM_MAX_HR_BPM ||
      parsed > MAX_CUSTOM_MAX_HR_BPM
    ) {
      Alert.alert(
        'Invalid max heart rate',
        `Please enter a value between ${MIN_CUSTOM_MAX_HR_BPM} and ${MAX_CUSTOM_MAX_HR_BPM} bpm, or leave it blank.`
      );
      setMaxHrInput(profile.maxHeartRate !== undefined ? String(profile.maxHeartRate) : '');
      return;
    }
    void persist({ ...profile, maxHeartRate: parsed });
  }, [maxHrInput, persist, profile]);

  const maxHrResolution = useMemo(() => resolveMaxHeartRate({ profile }), [profile]);

  const previewZones = useMemo(
    () => computeHeartRateZones(maxHrResolution.maxHr),
    [maxHrResolution.maxHr]
  );

  const handleOpenAddForm = useCallback(() => {
    setEditingDateOriginal(null);
    setInitialEditWeight(undefined);
    setNewDate(todayIso());
    const latest = profile.weightEntries[0]?.weightKg;
    setNewWeight(latest !== undefined ? String(latest) : '');
    setShowAddForm(true);
  }, [profile.weightEntries]);

  const handleEditEntry = useCallback((entry: WeightEntry) => {
    setEditingDateOriginal(entry.date);
    setInitialEditWeight(entry.weightKg);
    setNewDate(entry.date);
    setNewWeight(String(entry.weightKg));
    setShowAddForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowAddForm(false);
    setEditingDateOriginal(null);
    setInitialEditWeight(undefined);
    setNewWeight('');
    setNewDate(todayIso());
  }, []);

  const handleAddEntry = useCallback(() => {
    const trimmedWeight = newWeight.trim();
    const weight = Number.parseFloat(trimmedWeight);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(newDate) ||
      Number.isNaN(new Date(`${newDate}T00:00:00`).getTime())
    ) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    if (newDate > todayIso()) {
      Alert.alert('Invalid date', 'Date cannot be in the future.');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 500) {
      Alert.alert('Invalid weight', 'Enter a weight in kg between 0 and 500.');
      return;
    }
    // If editing and changing the date, remove the old date record first.
    // If newDate already exists in the profile, byDate.set(newDate, ...) merges/overwrites
    // that date's record (one weight entry per calendar day by domain design).
    const filtered = editingDateOriginal
      ? profile.weightEntries.filter(e => e.date !== editingDateOriginal)
      : profile.weightEntries;

    const byDate = new Map(filtered.map(e => [e.date, e]));
    byDate.set(newDate, { date: newDate, weightKg: Math.round(weight * 10) / 10 });
    const nextEntries = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    void persist({ ...profile, weightEntries: nextEntries });
    setNewWeight('');
    setNewDate(todayIso());
    setEditingDateOriginal(null);
    setInitialEditWeight(undefined);
    setShowAddForm(false);
  }, [editingDateOriginal, newDate, newWeight, persist, profile]);

  const handleDeleteEntry = useCallback(
    (date: string) => {
      Alert.alert('Delete entry', `Remove the weight recorded on ${date}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const nextEntries = profile.weightEntries.filter(e => e.date !== date);
            void persist({ ...profile, weightEntries: nextEntries });
            if (editingDateOriginal === date) {
              handleCloseForm();
            }
          }
        }
      ]);
    },
    [editingDateOriginal, handleCloseForm, persist, profile]
  );

  const handleImport = useCallback(() => {
    const { entries, errors } = parseCsvWeightEntries(csvText);
    setImportErrors(errors);
    if (entries.length === 0) {
      if (errors.length === 0) Alert.alert('Nothing to import', 'Paste CSV rows first.');
      return;
    }
    const byDate = new Map(profile.weightEntries.map(e => [e.date, e]));
    for (const e of entries) byDate.set(e.date, e);
    const nextEntries = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    void persist({ ...profile, weightEntries: nextEntries });
    const suffix = entries.length === 1 ? 'y' : 'ies';
    const skippedMsg = errors.length > 0 ? ` (${errors.length} skipped)` : '';
    Alert.alert('Imported', `${entries.length} entr${suffix} imported${skippedMsg}.`);
    setCsvText('');
    setShowImport(false);
  }, [csvText, persist, profile]);

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'text/*', '*/*'],
        copyToCacheDirectory: true
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      const file = new File(asset.uri);
      const content = await file.text();
      setCsvText(content);
      setImportErrors([]);
    } catch (error) {
      simpleLogger.error('CSV file pick failed', error);
      Alert.alert('Import failed', 'Could not read the selected file.');
    }
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.note}>
          Optional. Used for heart-rate stats (zones, calories, predicted max HR). Leave blank to
          keep private.
        </Text>

        {/* Biometrics: Age & Max HR */}
        <View style={styles.biometricsRow}>
          <View style={styles.biometricField}>
            <Text style={styles.sectionTitle}>Age</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={ageInput}
              onChangeText={handleAgeChange}
              onBlur={handleAgeBlur}
              placeholder="e.g. 30"
              placeholderTextColor={theme.textMuted}
              accessibilityLabel="Age in years"
            />
            <Text style={styles.hint}>Years (1–120). Optional.</Text>
          </View>
          <View style={styles.biometricField}>
            <Text style={styles.sectionTitle}>Max Heart Rate</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={maxHrInput}
              onChangeText={handleMaxHrChange}
              onBlur={handleMaxHrBlur}
              placeholder={`e.g. ${maxHrResolution.maxHr}`}
              placeholderTextColor={theme.textMuted}
              accessibilityLabel="Maximum heart rate in bpm"
            />
            <Text style={styles.hint}>BPM (100–240). Overrides 220 − age.</Text>
          </View>
        </View>

        {/* 5-Zone HR Preview Card */}
        <View style={styles.zonesPreviewCard}>
          <View style={styles.zonesPreviewHeader}>
            <Text style={styles.zonesPreviewTitle}>Heart-Rate Zones</Text>
            <Text style={styles.zonesPreviewSubtitle}>
              Max HR {maxHrResolution.maxHr} bpm ({formatMaxHrSourceLabel(maxHrResolution.source)})
            </Text>
          </View>
          <View style={styles.zonesPreviewList}>
            {previewZones.map((zone, idx) => {
              const color = theme.heartRateZones[idx] ?? theme.primary;
              const rangeLabel =
                zone.zone === 5 ? `≥ ${zone.minBpm} bpm` : `${zone.minBpm}–${zone.maxBpm} bpm`;
              const pctLabel =
                zone.zone === 5
                  ? '90–100%+'
                  : `${Math.round(zone.minPct * 100)}–${Math.round(zone.maxPct * 100)}%`;
              return (
                <View key={zone.code} style={styles.zonePreviewRow}>
                  <View style={styles.zonePreviewLeft}>
                    <View style={[styles.zonePreviewDot, { backgroundColor: color }]} />
                    <Text style={styles.zonePreviewCode}>{zone.code}</Text>
                    <Text style={styles.zonePreviewName}>{zone.name}</Text>
                  </View>
                  <View style={styles.zonePreviewRight}>
                    <Text style={styles.zonePreviewPct}>{pctLabel}</Text>
                    <Text style={styles.zonePreviewBpm}>{rangeLabel}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Weight history */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Body weight (kg)</Text>
          <Pressable
            onPress={showAddForm ? handleCloseForm : handleOpenAddForm}
            style={styles.smallButton}
            accessibilityRole="button"
            accessibilityLabel={showAddForm ? 'Cancel form' : 'Add weight entry'}
          >
            <Ionicons name={showAddForm ? 'close' : 'add'} size={18} color={theme.primary} />
            <Text style={styles.smallButtonLabel}>{showAddForm ? 'Cancel' : 'Add entry'}</Text>
          </Pressable>
        </View>

        {showAddForm ? (
          <WeightEntryForm
            theme={theme}
            editingDateOriginal={editingDateOriginal}
            newDate={newDate}
            newWeight={newWeight}
            latestLoggedWeight={profile.weightEntries[0]?.weightKg}
            initialEditWeight={initialEditWeight}
            onDateChange={setNewDate}
            onWeightChange={setNewWeight}
            onSubmit={handleAddEntry}
          />
        ) : null}

        {profile.weightEntries.length >= 2 ? <WeightChart entries={profile.weightEntries} /> : null}

        {profile.weightEntries.length === 0 ? (
          <Text style={styles.muted}>No weight entries yet.</Text>
        ) : (
          <WeightHistoryList
            entries={profile.weightEntries}
            theme={theme}
            onEdit={handleEditEntry}
            onDelete={handleDeleteEntry}
          />
        )}

        <Pressable onPress={() => setShowImport(true)} style={styles.secondaryButton}>
          <Ionicons name="document-text-outline" size={18} color={theme.text} />
          <Text style={styles.secondaryButtonLabel}>Import CSV</Text>
        </Pressable>
      </ScrollView>

      {/* Import modal */}
      <Modal
        animationType="slide"
        transparent
        visible={showImport}
        onRequestClose={() => setShowImport(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator>
              <Text style={styles.modalTitle}>Import weight CSV</Text>
              <Text style={styles.modalNote}>
                Paste rows with date and weight. One entry per line: &quot;YYYY-MM-DD,kg&quot;. A
                header row is ignored. Dates already present are replaced.
              </Text>
              <Pressable onPress={handlePickFile} style={styles.secondaryButton}>
                <Ionicons name="document-attach-outline" size={18} color={theme.text} />
                <Text style={styles.secondaryButtonLabel}>Choose file</Text>
              </Pressable>
              <TextInput
                style={styles.csvInput}
                multiline
                value={csvText}
                onChangeText={setCsvText}
                placeholder={'date,weight\n2026-01-01,72.5'}
                placeholderTextColor={theme.textMuted}
              />
              {importErrors.length > 0 ? (
                <ScrollView style={styles.errorBox}>
                  {importErrors.map((e, i) => (
                    <Text key={`${e}-${i}`} style={styles.errorText}>
                      {e}
                    </Text>
                  ))}
                </ScrollView>
              ) : null}
            </ScrollView>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => {
                  setShowImport(false);
                  setImportErrors([]);
                }}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleImport} style={styles.modalImportButton}>
                <Text style={styles.modalImportLabel}>Parse & merge</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surfaceAlt
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 8
    },
    note: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 20,
      lineHeight: 18
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginTop: 12,
      marginBottom: 8
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 8
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      backgroundColor: theme.surface,
      minHeight: 44
    },
    hint: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4,
      marginBottom: 8
    },
    biometricsRow: {
      flexDirection: 'row',
      gap: 12
    },
    biometricField: {
      flex: 1
    },
    zonesPreviewCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginTop: 6,
      marginBottom: 8
    },
    zonesPreviewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10
    },
    zonesPreviewTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textStrong
    },
    zonesPreviewSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '500'
    },
    zonesPreviewList: {
      gap: 6
    },
    zonePreviewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4
    },
    zonePreviewLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6
    },
    zonePreviewDot: {
      width: 8,
      height: 8,
      borderRadius: 4
    },
    zonePreviewCode: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textStrong,
      width: 22
    },
    zonePreviewName: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.text
    },
    zonePreviewRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10
    },
    zonePreviewPct: {
      fontSize: 12,
      color: theme.textMuted
    },
    zonePreviewBpm: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      minWidth: 86,
      textAlign: 'right'
    },
    muted: {
      fontSize: 13,
      color: theme.textMuted,
      marginVertical: 8
    },
    smallButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface
    },
    smallButtonLabel: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '600'
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 16,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface
    },
    secondaryButtonLabel: {
      color: theme.text,
      fontWeight: '600'
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: theme.scrim,
      padding: 20
    },
    modalCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 20,
      maxHeight: '80%',
      width: '100%'
    },
    modalScroll: {
      maxHeight: 320
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 8
    },
    modalNote: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 12,
      lineHeight: 18
    },
    csvInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      backgroundColor: theme.surfaceSunken,
      minHeight: 140,
      maxHeight: 220,
      textAlignVertical: 'top'
    },
    errorBox: {
      maxHeight: 80,
      marginTop: 8
    },
    errorText: {
      color: theme.danger,
      fontSize: 12
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 12
    },
    modalCancelButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8
    },
    modalCancelLabel: {
      color: theme.textMuted
    },
    modalImportButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: theme.primary
    },
    modalImportLabel: {
      color: theme.onPrimary,
      fontWeight: '600'
    }
  });
