import { ResolvedTheme, useTheme } from '@/theme';
import { simpleLogger, SheetFooter, createSheetFrameStyles } from '@/shared';
import { deviceTodayLocalDateString } from '@/shared/utils/activityDates';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useActivitiesContext } from '../ActivitiesContext';
import {
  buildManualActivity,
  buildManualTypeList,
  MANUAL_ACTIVITY_TYPES,
  MANUAL_DURATION_PRESETS_MIN
} from '../services/manualActivity';
import {
  addCustomManualEntryType,
  loadManualEntryPrefs,
  saveLastManualEntryType
} from '../services/manualEntryPrefs';

interface ManualActivitySheetProps {
  visible: boolean;
  /** Prefilled date 'YYYY-MM-DD' (calendar day tap). Defaults to today. */
  initialDate?: string;
  onClose: () => void;
}

function nowRoundedToFive(): string {
  const now = new Date();
  const minutes = now.getMinutes() - (now.getMinutes() % 5);
  return `${String(now.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function shiftDate(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const shifted = new Date(y, m - 1, d + days);
  return deviceTodayLocalDateString(shifted);
}

/** Stepper readout: "45m" under an hour, "1h 30m" / "2h" above it. */
function formatDurationLabel(durationMin: number): string {
  if (durationMin < 60) {
    return `${durationMin}m`;
  }
  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * One-screen quick-add for GPS-less activities. Every field is prefilled
 * (type Yoga, date today, time now, 60 min) so the common case — Yoga done
 * just now — is type + Save. No native date/time picker: preset chips plus
 * plain text inputs behave identically on iOS, Android and web, and stay
 * unit-testable (the picker's community API differs per platform).
 */
export function ManualActivitySheet({
  visible,
  initialDate,
  onClose
}: Readonly<ManualActivitySheetProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { addActivity, globalActivities } = useActivitiesContext();

  const [activityType, setActivityType] = useState('Yoga');
  const [date, setDate] = useState(deviceTodayLocalDateString());
  const [time, setTime] = useState(nowRoundedToFive());
  const [durationMin, setDurationMin] = useState(60);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Type memory: last-used type (pinned first in the list) and user-declared
  // types, loaded when the sheet opens.
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [pinnedType, setPinnedType] = useState<string | null>(null);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Reset the form every time the sheet opens, honouring the caller's date.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setActivityType('Yoga');
    setPinnedType(null);
    setCustomTypes([]);
    setShowNewType(false);
    setNewTypeName('');
    setDate(initialDate ?? deviceTodayLocalDateString());
    setTime(nowRoundedToFive());
    setDurationMin(60);
    setName('');
    setError(null);
    setIsSaving(false);
    loadManualEntryPrefs()
      .then(prefs => {
        if (cancelled) return;
        setCustomTypes(prefs.customTypes);
        if (prefs.lastType) {
          setPinnedType(prefs.lastType);
          setActivityType(prefs.lastType);
        }
      })
      .catch(loadError => simpleLogger.error('Could not load manual-entry preferences', loadError));
    return () => {
      cancelled = true;
    };
  }, [visible, initialDate]);

  // Most-used first: the user's own archive decides the order, not the
  // built-in list. Recomputed when the sheet opens (customTypes/pinnedType
  // change then) and when the activity set changes underneath it.
  const typeList = useMemo(
    () =>
      buildManualTypeList({
        activities: globalActivities,
        lastType: pinnedType,
        customTypes,
        defaults: MANUAL_ACTIVITY_TYPES
      }),
    [globalActivities, pinnedType, customTypes]
  );

  if (!visible) {
    return <></>;
  }

  const today = deviceTodayLocalDateString();
  const yesterday = shiftDate(today, -1);

  // Digits-only time entry: the user types "1830", the field shows "18:30".
  // Kept as display text so the default ("now") and validation stay unchanged.
  const handleTimeDigitsChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) {
      setTime(digits);
    } else {
      setTime(`${digits.slice(0, 2)}:${digits.slice(2)}`);
    }
  };

  // Declares a new type (or selects the existing one on a case-insensitive
  // match) and remembers it for the next sheet.
  const handleAddCustomType = async () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) {
      setError('Type a name for the new activity type first.');
      return;
    }
    if (trimmed.length > 24) {
      setError('Keep the type name to 24 characters or fewer.');
      return;
    }
    setError(null);
    const existing = typeList.find(type => type.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setActivityType(existing);
      setShowNewType(false);
      setNewTypeName('');
      return;
    }
    const next = await addCustomManualEntryType(trimmed);
    setCustomTypes(next);
    setActivityType(trimmed);
    setShowNewType(false);
    setNewTypeName('');
  };

  const handleSave = async () => {
    if (isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const activity = buildManualActivity({
        type: activityType,
        localDate: date.trim(),
        localTime: time.trim(),
        durationMin,
        name
      });
      await addActivity(activity);
      // Remembered for the next entry. Never fails the save: the prefs
      // service already logs and swallows its own errors.
      await saveLastManualEntryType(activity.type);
      simpleLogger.log('Manual activity saved', {
        activityId: activity.id,
        activityType: activity.type,
        localDate: activity.local_date
      });
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      simpleLogger.error('Manual activity save failed', { error: message });
      setError(message);
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Add activity</Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>Type</Text>
            <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {typeList.map(type => {
                  const selected = type === activityType;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.chip, selected ? styles.chipSelected : null]}
                      onPress={() => setActivityType(type)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                        {type}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[styles.chip, styles.newChip]}
                  onPress={() => {
                    setNewTypeName('');
                    setShowNewType(prev => !prev);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Declare a new activity type"
                >
                  <Text style={styles.chipText}>+ New</Text>
                </Pressable>
              </View>
            </ScrollView>
            {showNewType ? (
              <View style={styles.newTypeRow}>
                <TextInput
                  style={styles.newTypeInput}
                  value={newTypeName}
                  onChangeText={setNewTypeName}
                  placeholder="e.g. Padel"
                  autoCorrect={false}
                  maxLength={24}
                  accessibilityLabel="New activity type name"
                />
                <Pressable
                  style={[styles.chip, styles.chipSelected]}
                  onPress={handleAddCustomType}
                  accessibilityRole="button"
                  accessibilityLabel="Add the new activity type"
                >
                  <Text style={[styles.chipText, styles.chipTextSelected]}>Add</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Date</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, date === today ? styles.chipSelected : null]}
                onPress={() => setDate(today)}
              >
                <Text style={[styles.chipText, date === today ? styles.chipTextSelected : null]}>
                  Today
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, date === yesterday ? styles.chipSelected : null]}
                onPress={() => setDate(yesterday)}
              >
                <Text
                  style={[styles.chipText, date === yesterday ? styles.chipTextSelected : null]}
                >
                  Yesterday
                </Text>
              </Pressable>
              <TextInput
                style={styles.inlineInput}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                autoCorrect={false}
                maxLength={10}
                accessibilityLabel="Activity date YYYY-MM-DD"
              />
            </View>

            <Text style={styles.sectionLabel}>Start time</Text>
            <View style={styles.chipRow}>
              <TextInput
                style={styles.inlineInput}
                value={time}
                onChangeText={handleTimeDigitsChange}
                placeholder="HHMM"
                keyboardType="number-pad"
                autoCorrect={false}
                maxLength={5}
                selectTextOnFocus={true}
                accessibilityLabel="Activity start time, 4 digits"
              />
            </View>

            <Text style={styles.sectionLabel}>Duration</Text>
            <View style={styles.chipRow}>
              {MANUAL_DURATION_PRESETS_MIN.map(preset => (
                <Pressable
                  key={preset}
                  style={[styles.chip, durationMin === preset ? styles.chipSelected : null]}
                  onPress={() => setDurationMin(preset)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      durationMin === preset ? styles.chipTextSelected : null
                    ]}
                  >
                    {preset}m
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.stepperRow}>
              <Pressable
                style={styles.stepperButton}
                onPress={() => setDurationMin(prev => Math.max(5, prev - 5))}
                accessibilityLabel="Decrease duration by 5 minutes"
              >
                <Text style={styles.stepperText}>−5</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{formatDurationLabel(durationMin)}</Text>
              <Pressable
                style={styles.stepperButton}
                onPress={() => setDurationMin(prev => Math.min(24 * 60, prev + 5))}
                accessibilityLabel="Increase duration by 5 minutes"
              >
                <Text style={styles.stepperText}>+5</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Name (optional)</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={`e.g. Morning ${activityType}`}
              autoCorrect={false}
              accessibilityLabel="Activity name, optional"
            />

            {error !== null ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <SheetFooter
            buttons={[
              { label: 'Cancel', onPress: onClose },
              {
                label: isSaving ? 'Saving…' : 'Save',
                onPress: handleSave,
                primary: true,
                disabled: isSaving
              }
            ]}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) => ({
  ...createSheetFrameStyles(theme, { maxHeight: '88%', headerPaddingBottom: 8 }),
  ...StyleSheet.create({
    sectionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      marginTop: 14,
      marginBottom: 8
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt
    },
    chipSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary
    },
    chipText: {
      fontSize: 14,
      color: theme.text
    },
    chipTextSelected: {
      color: theme.onPrimary,
      fontWeight: '600'
    },
    newChip: {
      borderStyle: 'dashed'
    },
    newTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10
    },
    newTypeInput: {
      flex: 1,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 15,
      color: theme.text
    },
    inlineInput: {
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: theme.text,
      minWidth: 120
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginTop: 10
    },
    stepperButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.surfaceSunken
    },
    stepperText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.primary
    },
    stepperValue: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      minWidth: 70,
      textAlign: 'center'
    },
    nameInput: {
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text
    },
    errorBox: {
      marginTop: 12,
      padding: 10,
      backgroundColor: theme.dangerSoft,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.dangerBorder
    },
    errorText: {
      fontSize: 13,
      color: theme.danger
    }
  })
});
