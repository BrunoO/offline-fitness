import { ResolvedTheme, useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Activity, calculateSpeedKmh, seconds_to_label } from '@/shared';
import { ActivityStats } from '@/features/stats';

interface LastActivitySummaryProps {
  activity: Activity | null;
  stats?: ActivityStats | null;
  allActivities?: Activity[];
  onActivityChange?: (activity: Activity) => void;
}

/**
 * A component that displays the last activity information in a summary table format.
 * @param props The component props.
 * @returns A React component.
 */
export function LastActivitySummary({
  activity,
  stats,
  allActivities = [],
  onActivityChange
}: Readonly<LastActivitySummaryProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!activity) {
    return <></>;
  }

  // Get activity-specific icon based on type
  const getActivityIcon = (activityType: string): string => {
    switch (activityType.toLowerCase()) {
      case 'run':
      case 'running':
        return '🏃‍♂️';
      case 'ride':
      case 'ebikeride':
      case 'cycling':
        return '🚲';
      case 'walk':
      case 'walking':
        return '🚶‍♂️';
      case 'swim':
      case 'swimming':
        return '🏊‍♂️';
      case 'hike':
      case 'hiking':
        return '🥾';
      case 'yoga':
        return '🧘‍♀️';
      case 'weighttraining':
      case 'weight training':
        return '🏋️‍♂️';
      case 'crossfit':
        return '💪';
      case 'elliptical':
        return '🔄';
      case 'stair stepper':
      case 'stairs':
        return '🪜';
      case 'rowing':
        return '🚣‍♂️';
      case 'kayaking':
        return '🛶';
      case 'snowboarding':
        return '🏂';
      case 'skiing':
        return '⛷️';
      case 'ice skating':
        return '⛸️';
      case 'inline skating':
        return '🛼';
      case 'rock climbing':
        return '🧗‍♂️';
      case 'tennis':
        return '🎾';
      case 'basketball':
        return '🏀';
      case 'soccer':
        return '⚽';
      case 'golf':
        return '⛳';
      case 'baseball':
        return '⚾';
      case 'volleyball':
        return '🏐';
      case 'badminton':
        return '🏸';
      case 'table tennis':
        return '🏓';
      case 'squash':
        return '🏏';
      case 'racquetball':
        return '🎾';
      case 'handball':
        return '🤾‍♂️';
      case 'rugby':
        return '🏉';
      case 'american football':
        return '🏈';
      case 'australian football':
        return '🏉';
      case 'cricket':
        return '🏏';
      case 'hockey':
        return '🏒';
      case 'lacrosse':
        return '🥍';
      case 'water polo':
        return '🤽‍♂️';
      case 'surfing':
        return '🏄‍♂️';
      case 'windsurfing':
        return '🏄‍♂️';
      case 'kitesurfing':
        return '🏄‍♂️';
      case 'sailing':
        return '⛵';
      case 'stand up paddling':
        return '🏄‍♂️';
      case 'workout':
        return '🏋️‍♀️';
      case 'virtual ride':
        return '🚲';
      case 'virtual run':
        return '🏃‍♂️';
      case 'ebike ride':
        return '🚲';
      case 'velomobile':
        return '🚲';
      case 'handcycle':
        return '🚲';
      case 'wheelchair':
        return '♿';
      default:
        return '🏃‍♂️'; // Default fallback
    }
  };

  // Find current activity index in the list
  const currentIndex = allActivities.findIndex(a => a.id === activity.id);
  const hasPrevious = currentIndex < allActivities.length - 1;
  const hasNext = currentIndex > 0;

  const handlePrevious = () => {
    if (hasPrevious && onActivityChange) {
      const previousActivity = allActivities[currentIndex + 1];
      onActivityChange(previousActivity);
    }
  };

  const handleNext = () => {
    if (hasNext && onActivityChange) {
      const nextActivity = allActivities[currentIndex - 1];
      onActivityChange(nextActivity);
    }
  };

  const formatDate = (day: number, month: number, year: number) => {
    return `${day}/${month + 1}/${year}`;
  };

  const formatDistance = (distance: number) => {
    return `${(distance / 1000).toFixed(1)} km`;
  };

  const formatElevation = (elevation: number) => {
    return `${elevation.toFixed(0)} m`;
  };

  const getMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  const formatRank = (rank?: number) => {
    if (!rank) return '';
    const medal = getMedal(rank);
    return medal ? `${medal} #${rank}` : `#${rank}`;
  };

  return (
    <View style={styles.container}>
      {/* Activity Navigation Stepper */}
      <View style={styles.stepperContainer}>
        <TouchableOpacity
          style={[styles.stepperButton, !hasPrevious && styles.stepperButtonDisabled]}
          onPress={handlePrevious}
          disabled={!hasPrevious}
        >
          <Text style={[styles.stepperIcon, !hasPrevious && styles.stepperIconDisabled]}>◀</Text>
        </TouchableOpacity>

        <View style={styles.stepperInfo}>
          <Text style={styles.stepperTitle}>Activity</Text>
          <Text style={styles.stepperCounter}>
            {currentIndex + 1} of {allActivities.length}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.stepperButton, !hasNext && styles.stepperButtonDisabled]}
          onPress={handleNext}
          disabled={!hasNext}
        >
          <Text style={[styles.stepperIcon, !hasNext && styles.stepperIconDisabled]}>▶</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryTable}>
        {/* Compact two-column layout for basic activity info */}
        <View style={styles.compactRow}>
          <View style={styles.leftColumn}>
            <View style={styles.compactItem}>
              <Text style={styles.compactIcon}>{getActivityIcon(activity.type)}</Text>
              <Text style={styles.compactText} numberOfLines={1}>
                {activity.name}
              </Text>
            </View>
            <View style={styles.compactItem}>
              <Text style={styles.compactIcon}>{getActivityIcon(activity.type)}</Text>
              <Text style={styles.compactText}>{activity.type}</Text>
            </View>
            <View style={styles.compactItem}>
              <Text style={styles.compactIcon}>⏱️</Text>
              <Text style={styles.compactText}>{seconds_to_label(activity.elapsed_time)}</Text>
            </View>
            {activity.moving_time > 0 && activity.distance > 0 ? (
              <View style={styles.compactItem}>
                <Text style={styles.compactIcon}>🚀</Text>
                <Text style={styles.compactText}>
                  {calculateSpeedKmh(activity.distance, activity.moving_time).toFixed(1)} km/h
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.rightColumn}>
            <View style={styles.compactItem}>
              <Text style={styles.compactIcon}>📅</Text>
              <Text style={styles.compactText}>
                {formatDate(activity.start_day, activity.start_month, activity.start_year)}
              </Text>
            </View>
            {activity.local_time ? (
              <View style={styles.compactItem}>
                <Text style={styles.compactIcon}>🕐</Text>
                <Text style={styles.compactText}>{activity.local_time.slice(0, 5)}</Text>
              </View>
            ) : null}
            <View style={styles.compactItem}>
              <Text style={styles.compactIcon}>📏</Text>
              <Text style={styles.compactText}>{formatDistance(activity.distance)}</Text>
            </View>
            <View style={styles.compactItem}>
              <Text style={styles.compactIcon}>⛰️</Text>
              <Text style={styles.compactText}>
                {formatElevation(activity.total_elevation_gain)}
              </Text>
            </View>
          </View>
        </View>

        {stats ? (
          <>
            <View style={[styles.summaryRow, styles.statsSeparator]}>
              <Text style={styles.statsHeader}>Year Comparison</Text>
              <Text style={styles.statsSubHeader}>
                vs {stats.totalActivities} similar activities
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryCellLabel}>Distance Rank</Text>
              <Text style={styles.summaryCell}>
                Longer than {stats.distancePercentile.toFixed(0)}% {formatRank(stats.distanceRank)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryCellLabel}>Elevation Rank</Text>
              <Text style={styles.summaryCell}>
                Higher than {stats.elevationGainPercentile.toFixed(0)}%{' '}
                {formatRank(stats.elevationGainRank)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryCellLabel}>Speed Rank</Text>
              <Text style={styles.summaryCell}>
                Faster than {stats.speedPercentile.toFixed(0)}% {formatRank(stats.speedRank)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      marginVertical: 10,
      paddingHorizontal: 16,
      width: '100%'
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      paddingHorizontal: 8
    },
    stepperButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.primary,
      minWidth: 40,
      alignItems: 'center'
    },
    stepperButtonDisabled: {
      backgroundColor: theme.surfaceSunken,
      opacity: 0.5
    },
    stepperIcon: {
      fontSize: 16,
      color: theme.onPrimary,
      fontWeight: 'bold'
    },
    stepperIconDisabled: {
      color: theme.surfaceSunken
    },
    stepperInfo: {
      alignItems: 'center',
      flex: 1
    },
    stepperTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.primary
    },
    stepperCounter: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2
    },
    summaryTable: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      backgroundColor: theme.surface,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 1
          },
          shadowOpacity: 0.1,
          shadowRadius: 2
        },
        android: {
          elevation: 2
        },
        web: {
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
        }
      }),
      width: '100%'
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    summaryCellLabel: {
      fontWeight: 'bold',
      flex: 1,
      color: theme.text,
      fontSize: 14
    },
    summaryCell: {
      flex: 1,
      textAlign: 'right',
      color: theme.text,
      fontSize: 14
    },
    compactRow: {
      flexDirection: 'row',
      paddingVertical: 12,
      paddingHorizontal: 12
    },
    leftColumn: {
      flex: 1,
      paddingRight: 8
    },
    rightColumn: {
      flex: 1,
      paddingLeft: 8
    },
    compactItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6
    },
    compactIcon: {
      fontSize: 16,
      marginRight: 8,
      width: 20
    },
    compactText: {
      flex: 1,
      fontSize: 14,
      color: theme.text
    },
    statsSeparator: {
      backgroundColor: theme.surfaceSunken,
      borderTopWidth: 2,
      borderTopColor: theme.primary,
      marginTop: 5
    },
    statsHeader: {
      fontWeight: 'bold',
      color: theme.primary,
      fontSize: 16
    },
    statsSubHeader: {
      fontSize: 12,
      color: theme.textMuted,
      fontStyle: 'italic'
    }
  });
