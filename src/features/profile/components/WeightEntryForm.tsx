import { ResolvedTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { JSX, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { todayIso } from '../services/profileStorage';

interface WeightEntryFormProps {
  theme: ResolvedTheme;
  editingDateOriginal: string | null;
  newDate: string;
  newWeight: string;
  latestLoggedWeight?: number;
  onDateChange: (date: string) => void;
  onWeightChange: (weight: string) => void;
  onSubmit: () => void;
}

function parseDateIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function getYesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function WeightEntryForm({
  theme,
  editingDateOriginal,
  newDate,
  newWeight,
  latestLoggedWeight,
  onDateChange,
  onWeightChange,
  onSubmit
}: Readonly<WeightEntryFormProps>): JSX.Element {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const todayStr = useMemo(() => todayIso(), []);
  const yesterdayStr = useMemo(() => getYesterdayIso(), []);
  const maxDateObj = useMemo(() => parseDateIso(todayStr), [todayStr]);

  const handleAdjustWeight = useCallback(
    (delta: number) => {
      const current = Number.parseFloat(newWeight.trim());
      const base = Number.isFinite(current) ? current : (latestLoggedWeight ?? 70);
      const updated = Math.round((base + delta) * 10) / 10;
      if (updated > 0 && updated <= 500) {
        onWeightChange(String(updated));
      }
    },
    [latestLoggedWeight, newWeight, onWeightChange]
  );

  const handleDatePickerChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        setShowDatePicker(false);
      }
      if (selectedDate) {
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        onDateChange(`${selectedDate.getFullYear()}-${month}-${day}`);
      }
    },
    [onDateChange]
  );

  return (
    <View style={styles.addForm}>
      <Text style={styles.formSubtitle}>
        {editingDateOriginal ? `Edit entry (${editingDateOriginal})` : 'Log new weight'}
      </Text>

      {/* Date selection row */}
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Date</Text>
        <View style={styles.datePickerRow}>
          <Pressable
            style={styles.dateDisplayButton}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick date"
          >
            <Ionicons name="calendar-outline" size={18} color={theme.primary} />
            <Text style={styles.dateDisplayText}>{newDate}</Text>
          </Pressable>

          <View style={styles.quickDateChips}>
            <Pressable
              style={[styles.quickChip, newDate === todayStr ? styles.quickChipActive : null]}
              onPress={() => onDateChange(todayStr)}
              accessibilityRole="button"
              accessibilityLabel="Select today"
            >
              <Text
                style={[
                  styles.quickChipText,
                  newDate === todayStr ? styles.quickChipTextActive : null
                ]}
              >
                Today
              </Text>
            </Pressable>
            <Pressable
              style={[styles.quickChip, newDate === yesterdayStr ? styles.quickChipActive : null]}
              onPress={() => onDateChange(yesterdayStr)}
              accessibilityRole="button"
              accessibilityLabel="Select yesterday"
            >
              <Text
                style={[
                  styles.quickChipText,
                  newDate === yesterdayStr ? styles.quickChipTextActive : null
                ]}
              >
                Yesterday
              </Text>
            </Pressable>
          </View>
        </View>

        {showDatePicker ? (
          <View style={Platform.OS === 'ios' ? styles.iosDatePickerContainer : null}>
            <DateTimePicker
              value={parseDateIso(newDate)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={maxDateObj}
              onChange={handleDatePickerChange}
            />
            {Platform.OS === 'ios' ? (
              <Pressable
                style={styles.datePickerDoneButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.datePickerDoneText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Weight input row */}
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Weight (kg)</Text>
        <View style={styles.weightInputRow}>
          <TextInput
            style={[styles.input, styles.weightInput]}
            keyboardType="decimal-pad"
            value={newWeight}
            onChangeText={onWeightChange}
            placeholder="e.g. 72.5"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Weight in kilograms"
          />
          <Text style={styles.unitSuffix}>kg</Text>
        </View>

        {/* Quick adjustment buttons */}
        <View style={styles.adjusterRow}>
          <Pressable
            style={styles.adjusterButton}
            onPress={() => handleAdjustWeight(-0.5)}
            accessibilityRole="button"
            accessibilityLabel="Decrease weight by 0.5 kg"
          >
            <Text style={styles.adjusterButtonText}>-0.5</Text>
          </Pressable>
          <Pressable
            style={styles.adjusterButton}
            onPress={() => handleAdjustWeight(-0.1)}
            accessibilityRole="button"
            accessibilityLabel="Decrease weight by 0.1 kg"
          >
            <Text style={styles.adjusterButtonText}>-0.1</Text>
          </Pressable>
          <Pressable
            style={styles.adjusterButton}
            onPress={() => handleAdjustWeight(0.1)}
            accessibilityRole="button"
            accessibilityLabel="Increase weight by 0.1 kg"
          >
            <Text style={styles.adjusterButtonText}>+0.1</Text>
          </Pressable>
          <Pressable
            style={styles.adjusterButton}
            onPress={() => handleAdjustWeight(0.5)}
            accessibilityRole="button"
            accessibilityLabel="Increase weight by 0.5 kg"
          >
            <Text style={styles.adjusterButtonText}>+0.5</Text>
          </Pressable>
        </View>
      </View>

      <Pressable onPress={onSubmit} style={styles.primaryButton}>
        <Text style={styles.primaryButtonLabel}>
          {editingDateOriginal ? 'Update entry' : 'Save entry'}
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    addForm: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 16,
      gap: 12
    },
    formSubtitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textStrong
    },
    fieldBlock: {
      gap: 6
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textMuted
    },
    datePickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    dateDisplayButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.surfaceAlt,
      minHeight: 44
    },
    dateDisplayText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500'
    },
    quickDateChips: {
      flexDirection: 'row',
      gap: 6
    },
    quickChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: theme.surfaceAlt
    },
    quickChipActive: {
      borderColor: theme.primary,
      backgroundColor: theme.surfaceSunken
    },
    quickChipText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600'
    },
    quickChipTextActive: {
      color: theme.primary
    },
    iosDatePickerContainer: {
      marginTop: 8,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 10,
      padding: 8
    },
    datePickerDoneButton: {
      alignSelf: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 6
    },
    datePickerDoneText: {
      color: theme.primary,
      fontWeight: '600',
      fontSize: 13
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
    weightInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    weightInput: {
      flex: 1
    },
    unitSuffix: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600'
    },
    adjusterRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4
    },
    adjusterButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt
    },
    adjusterButtonText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600'
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 12,
      marginTop: 4
    },
    primaryButtonLabel: {
      color: theme.onPrimary,
      fontWeight: '600'
    }
  });
