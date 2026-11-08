import { ResolvedTheme, useTheme } from '@/theme';
import React, { JSX, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  formatMaxHrSourceLabel,
  formatZoneDuration,
  type HeartRateZoneDistribution
} from '../services/heartRateZones';

export interface HeartRateZonesCardProps {
  distribution: HeartRateZoneDistribution;
  /** When true, omits the outer card border/padding so it can sit inside another card. */
  embedded?: boolean;
}

export function HeartRateZonesCard({
  distribution,
  embedded = false
}: Readonly<HeartRateZonesCardProps>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { zones, maxHrResolution } = distribution;
  const sourceLabel = formatMaxHrSourceLabel(maxHrResolution.source);

  return (
    <View style={embedded ? styles.embeddedContainer : styles.cardContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Heart-Rate Zones</Text>
        <Text style={styles.subtitle}>
          Max HR {maxHrResolution.maxHr} bpm ({sourceLabel})
        </Text>
      </View>

      <View style={styles.rowsContainer}>
        {zones.map((bucket, idx) => {
          const zoneColor = theme.heartRateZones[idx] ?? theme.primary;
          const pctRounded = Math.round(bucket.percentage);
          const barWidthPct = bucket.seconds > 0 ? Math.max(4, Math.min(100, pctRounded)) : 0;
          const rangeText =
            bucket.zone === 5 ? `≥ ${bucket.minBpm} bpm` : `${bucket.minBpm}–${bucket.maxBpm} bpm`;

          return (
            <View key={bucket.code} style={styles.zoneRow}>
              <View style={styles.zoneLabelCol}>
                <View style={styles.zoneHeaderInline}>
                  <View style={[styles.zoneDot, { backgroundColor: zoneColor }]} />
                  <Text style={styles.zoneCodeText}>{bucket.code}</Text>
                  <Text style={styles.zoneNameText} numberOfLines={1}>
                    {bucket.name}
                  </Text>
                </View>
                <Text style={styles.zoneRangeText}>{rangeText}</Text>
              </View>

              <View style={styles.barCol}>
                <View style={styles.barTrack}>
                  {barWidthPct > 0 ? (
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${barWidthPct}%`,
                          backgroundColor: zoneColor
                        }
                      ]}
                    />
                  ) : null}
                </View>
              </View>

              <View style={styles.metricsCol}>
                <Text style={styles.durationText}>{formatZoneDuration(bucket.seconds)}</Text>
                <Text style={styles.pctText}>{pctRounded}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    cardContainer: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginVertical: 8
    },
    embeddedContainer: {
      paddingTop: 12,
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textStrong
    },
    subtitle: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '500'
    },
    rowsContainer: {
      gap: 8
    },
    zoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    zoneLabelCol: {
      width: 112
    },
    zoneHeaderInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5
    },
    zoneDot: {
      width: 8,
      height: 8,
      borderRadius: 4
    },
    zoneCodeText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textStrong
    },
    zoneNameText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      flexShrink: 1
    },
    zoneRangeText: {
      fontSize: 11,
      color: theme.textMuted,
      marginLeft: 13
    },
    barCol: {
      flex: 1,
      justifyContent: 'center'
    },
    barTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.surfaceSunken,
      overflow: 'hidden'
    },
    barFill: {
      height: '100%',
      borderRadius: 5
    },
    metricsCol: {
      width: 78,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'baseline',
      gap: 6
    },
    durationText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text
    },
    pctText: {
      width: 32,
      textAlign: 'right',
      fontSize: 12,
      fontWeight: '700',
      color: theme.textMuted
    }
  });
