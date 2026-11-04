import React, { JSX, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ResolvedTheme, useTheme } from '@/theme';
import { StatsSegment, STATS_SEGMENTS } from '@/constants';

interface SegmentOption {
  key: StatsSegment;
  label: string;
}

const SEGMENTS: readonly SegmentOption[] = [
  { key: STATS_SEGMENTS.Weeks, label: 'Weeks' },
  { key: STATS_SEGMENTS.Months, label: 'Months' },
  { key: STATS_SEGMENTS.Years, label: 'Years' },
  { key: STATS_SEGMENTS.Records, label: 'Records' }
] as const;

interface StatsSegmentedControlProps {
  selectedSegment: StatsSegment;
  onSelectSegment: (segment: StatsSegment) => void;
}

export function StatsSegmentedControl({
  selectedSegment,
  onSelectSegment
}: Readonly<StatsSegmentedControlProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handlePress = useCallback(
    (segment: StatsSegment) => {
      if (segment !== selectedSegment) {
        void Haptics.selectionAsync().catch(() => undefined);
        onSelectSegment(segment);
      }
    },
    [selectedSegment, onSelectSegment]
  );

  return (
    <View style={styles.container}>
      <View style={styles.segmentedTrack}>
        {SEGMENTS.map(item => {
          const isSelected = item.key === selectedSegment;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${item.label} stats tab`}
              style={[styles.segmentButton, isSelected ? styles.segmentButtonActive : null]}
              onPress={() => handlePress(item.key)}
            >
              <Text style={[styles.segmentLabel, isSelected ? styles.segmentLabelActive : null]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.surface
    },
    segmentedTrack: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: theme.border
    },
    segmentButton: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10
    },
    segmentButtonActive: {
      backgroundColor: theme.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2
    },
    segmentLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted
    },
    segmentLabelActive: {
      color: theme.onPrimary,
      fontWeight: '700'
    }
  });
