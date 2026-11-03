import { ResolvedTheme } from '@/theme';
import { StyleSheet } from 'react-native';

/**
 * Shared style factory for the metric-badge cards (AnnualConsistencyCard and
 * PerformanceTrendsCard). Extracted to avoid duplicating the identical style
 * definitions across the two cards.
 */
export const createMetricCardStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      flex: 1
    },
    sportChipsContainer: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
      paddingHorizontal: 2
    },
    sportChip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: theme.surfaceSunken
    },
    sportChipActive: {
      backgroundColor: theme.primary
    },
    sportChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text
    },
    sportChipTextActive: {
      color: theme.onPrimary
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12
    },
    badgeCard: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: theme.surfaceSunken,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1.5,
      borderColor: 'transparent'
    },
    badgeCardSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.surface
    },
    badgeLabel: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '600',
      marginBottom: 2
    },
    badgeValue: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text
    },
    badgeValueSelected: {
      color: theme.primary
    },
    badgeSubValue: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 1
    },
    changeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2
    },
    changeText: {
      fontSize: 11,
      fontWeight: '600'
    },
    chartWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4
    },
    chartScroll: {
      flexGrow: 1,
      justifyContent: 'center'
    }
  });

export type MetricCardStyles = ReturnType<typeof createMetricCardStyles>;
