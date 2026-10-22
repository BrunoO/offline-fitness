import { ResolvedTheme, useTheme } from '@/theme';
import { simpleLogger } from '@/shared';
import { deviceTodayLocalDateString } from '@/shared/utils/activityDates';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useActivitiesContext } from '../ActivitiesContext';
import {
  buildManualActivity,
  MANUAL_ACTIVITY_TYPES,
  MANUAL_DURATION_PRESETS_MIN
} from '../services/manualActivity';

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
  const { addActivity } = useActivitiesContext();

  const [activityType, setActivityType] = useState('Yoga');
  const [date, setDate] = useState(deviceTodayLocalDateString());
  const [time, setTime] = useState(nowRoundedToFive());
  const [durationMin, setDurationMin] = useState(60);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset the form every time the sheet opens, honouring the caller's date.
  useEffect(() => {
    if (visible) {
      setActivityType('Yoga');
      setDate(initialDate ?? deviceTodayLocalDateString());
      setTime(nowRoundedToFive());
      setDurationMin(60);
      setName('');
      setError(null);
      setIsSaving(false);
    }
  }, [visible, initialDate]);

  if (!visible) {
    return <></>;
  }

  const today = deviceTodayLocalDateString();
  const yesterday = shiftDate(today, -1);

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
                {MANUAL_ACTIVITY_TYPES.map(type => {
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
              </View>
            </ScrollView>

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
              <Pressable style={styles.chip} onPress={() => setTime(nowRoundedToFive())}>
                <Text style={styles.chipText}>Now</Text>
              </Pressable>
              {['07:00', '12:00', '18:00'].map(preset => (
                <Pressable
                  key={preset}
                  style={[styles.chip, time === preset ? styles.chipSelected : null]}
                  onPress={() => setTime(preset)}
                >
                  <Text style={[styles.chipText, time === preset ? styles.chipTextSelected : null]}>
                    {preset}
                  </Text>
                </Pressable>
              ))}
              <TextInput
                style={styles.inlineInput}
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                autoCorrect={false}
                maxLength={5}
                accessibilityLabel="Activity start time HH:MM"
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
              <Text style={styles.stepperValue}>
                {durationMin >= 60
                  ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ''}`
                  : `${durationMin}m`}
              </Text>
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

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton, isSaving ? styles.disabledButton : null]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={styles.primaryButtonText}>{isSaving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '88%',
      backgroundColor: theme.surface,
      borderRadius: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4
        },
        android: { elevation: 5 },
        web: { boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }
      })
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 8
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.primary,
      textAlign: 'center'
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 12
    },
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
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border
    },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      minHeight: 42,
      justifyContent: 'center'
    },
    primaryButton: {
      backgroundColor: theme.primary
    },
    primaryButtonText: {
      color: theme.onPrimary,
      fontWeight: '600',
      textAlign: 'center'
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.border
    },
    secondaryButtonText: {
      color: theme.text,
      fontWeight: '600',
      textAlign: 'center'
    },
    disabledButton: {
      opacity: 0.6
    }
  });
