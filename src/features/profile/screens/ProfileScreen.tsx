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
  parseCsvWeightEntries,
  saveUserProfile,
  todayIso,
  type UserProfile
} from '../services/profileStorage';
import { WeightChart } from '../components/WeightChart';

export function ProfileScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile>({ weightEntries: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [ageInput, setAgeInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
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
    if (!Number.isFinite(weight) || weight <= 0 || weight > 500) {
      Alert.alert('Invalid weight', 'Enter a weight in kg between 0 and 500.');
      return;
    }
    const byDate = new Map(profile.weightEntries.map(e => [e.date, e]));
    byDate.set(newDate, { date: newDate, weightKg: weight });
    const nextEntries = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    void persist({ ...profile, weightEntries: nextEntries });
    setNewWeight('');
    setNewDate(todayIso());
    setShowAddForm(false);
  }, [newDate, newWeight, persist, profile]);

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
          }
        }
      ]);
    },
    [persist, profile]
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.note}>
          Optional. Used for heart-rate stats (zones, calories, predicted max HR). Leave blank to
          keep private.
        </Text>

        {/* Age */}
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
        <Text style={styles.hint}>Years. Optional.</Text>

        {/* Weight history */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Body weight (kg)</Text>
          <Pressable
            onPress={() => setShowAddForm(prev => !prev)}
            style={styles.smallButton}
            accessibilityRole="button"
            accessibilityLabel="Add weight entry"
          >
            <Ionicons name={showAddForm ? 'close' : 'add'} size={18} color={theme.primary} />
            <Text style={styles.smallButtonLabel}>{showAddForm ? 'Cancel' : 'Add entry'}</Text>
          </Pressable>
        </View>

        {showAddForm ? (
          <View style={styles.addForm}>
            <View style={styles.addFormRow}>
              <TextInput
                style={[styles.input, styles.addFormInput]}
                value={newDate}
                onChangeText={setNewDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textMuted}
                accessibilityLabel="Date"
              />
              <TextInput
                style={[styles.input, styles.addFormInput]}
                keyboardType="decimal-pad"
                value={newWeight}
                onChangeText={setNewWeight}
                placeholder="kg"
                placeholderTextColor={theme.textMuted}
                accessibilityLabel="Weight in kg"
              />
            </View>
            <Pressable onPress={handleAddEntry} style={styles.primaryButton}>
              <Text style={styles.primaryButtonLabel}>Save entry</Text>
            </Pressable>
            <Pressable
              onPress={() => setNewDate(todayIso())}
              style={styles.linkButton}
              accessibilityRole="button"
            >
              <Text style={styles.linkLabel}>Use today</Text>
            </Pressable>
          </View>
        ) : null}

        {profile.weightEntries.length >= 2 ? <WeightChart entries={profile.weightEntries} /> : null}

        {profile.weightEntries.length === 0 ? (
          <Text style={styles.muted}>No weight entries yet.</Text>
        ) : (
          profile.weightEntries.map(entry => (
            <View key={entry.date} style={styles.entryRow}>
              <View>
                <Text style={styles.entryDate}>{entry.date}</Text>
                <Text style={styles.entryWeight}>{entry.weightKg} kg</Text>
              </View>
              <Pressable
                onPress={() => handleDeleteEntry(entry.date)}
                accessibilityRole="button"
                accessibilityLabel={`Delete entry ${entry.date}`}
              >
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
              </Pressable>
            </View>
          ))
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
    addForm: {
      marginBottom: 12,
      gap: 8
    },
    addFormRow: {
      flexDirection: 'row',
      gap: 8
    },
    addFormInput: {
      flex: 1
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 12
    },
    primaryButtonLabel: {
      color: theme.onPrimary,
      fontWeight: '600'
    },
    linkButton: {
      alignItems: 'center',
      paddingVertical: 6
    },
    linkLabel: {
      color: theme.primary,
      fontSize: 13
    },
    entryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    entryDate: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600'
    },
    entryWeight: {
      color: theme.textMuted,
      fontSize: 13
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
      maxHeight: '80%'
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
