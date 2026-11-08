import { ResolvedTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { JSX, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WeightEntry } from '../services/profileStorage';

interface WeightHistoryListProps {
  entries: WeightEntry[];
  theme: ResolvedTheme;
  onEdit: (entry: WeightEntry) => void;
  onDelete: (date: string) => void;
}

function calculateDelta(
  currentKg: number,
  previousKg: number
): { text: string; status: 'increase' | 'decrease' | 'neutral' } {
  const diff = Math.round((currentKg - previousKg) * 10) / 10;
  if (diff > 0) {
    return { text: `+${diff.toFixed(1)} kg`, status: 'increase' };
  }
  if (diff < 0) {
    return { text: `${diff.toFixed(1)} kg`, status: 'decrease' };
  }
  return { text: '0.0 kg', status: 'neutral' };
}

export function WeightHistoryList({
  entries,
  theme,
  onEdit,
  onDelete
}: Readonly<WeightHistoryListProps>): JSX.Element {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.entriesContainer}>
      <Text style={styles.entriesSubtitle}>Tap an entry to edit</Text>
      <ScrollView style={styles.entriesList} showsVerticalScrollIndicator nestedScrollEnabled>
        {entries.map((entry, index) => {
          const nextEntry = entries[index + 1];
          let deltaInfo: { text: string; status: 'increase' | 'decrease' | 'neutral' } | null =
            null;
          if (nextEntry !== undefined) {
            deltaInfo = calculateDelta(entry.weightKg, nextEntry.weightKg);
          }

          let deltaColor = theme.textMuted;
          if (deltaInfo?.status === 'increase') {
            deltaColor = theme.danger;
          } else if (deltaInfo?.status === 'decrease') {
            deltaColor = theme.success;
          }

          return (
            <View key={entry.date} style={styles.entryRow}>
              {/* Main content button triggers edit */}
              <Pressable
                style={styles.entryMainButton}
                onPress={() => onEdit(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Edit weight entry for ${entry.date}`}
              >
                <View style={styles.entryLeftCol}>
                  <Text style={styles.entryDate}>{entry.date}</Text>
                  <View style={styles.weightLine}>
                    <Text style={styles.entryWeight}>{entry.weightKg.toFixed(1)} kg</Text>
                    {deltaInfo !== null ? (
                      <View style={styles.deltaBadge}>
                        <Text style={[styles.deltaText, { color: deltaColor }]}>
                          {deltaInfo.text}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="pencil" size={16} color={theme.textMuted} style={styles.editIcon} />
              </Pressable>

              {/* Separate delete action button (not nested) */}
              <Pressable
                onPress={() => onDelete(entry.date)}
                accessibilityRole="button"
                accessibilityLabel={`Delete entry ${entry.date}`}
                hitSlop={8}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    entriesContainer: {
      marginTop: 8
    },
    entriesSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginBottom: 6
    },
    entriesList: {
      maxHeight: 280
    },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    entryMainButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingRight: 12
    },
    entryLeftCol: {
      flex: 1
    },
    entryDate: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600'
    },
    weightLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 2
    },
    entryWeight: {
      color: theme.text,
      fontSize: 13
    },
    deltaBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4
    },
    deltaText: {
      fontSize: 12,
      fontWeight: '600'
    },
    editIcon: {
      marginRight: 4
    },
    deleteButton: {
      paddingVertical: 10,
      paddingLeft: 8,
      paddingRight: 4
    }
  });
