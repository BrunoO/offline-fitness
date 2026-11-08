import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { JSX, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
  VictoryZoomContainer
} from 'victory-native';
import type { DomainTuple } from 'victory-core';
import { WeightEntry } from '../services/profileStorage';

type TimeRangeOption = '1M' | '3M' | '6M' | '1Y' | 'ALL';

interface WeightPoint {
  x: number;
  y: number;
  dateStr: string;
}

function resolveDeltaColor(diff: number, theme: ResolvedTheme): string {
  if (diff > 0) return theme.danger;
  if (diff < 0) return theme.success;
  return theme.textMuted;
}

/**
 * Calculates start timestamp for a given time range option relative to the latest data point.
 */
function getRangeStartTimestamp(latestMs: number, range: TimeRangeOption): number | null {
  const d = new Date(latestMs);
  switch (range) {
    case '1M':
      d.setMonth(d.getMonth() - 1);
      return d.getTime();
    case '3M':
      d.setMonth(d.getMonth() - 3);
      return d.getTime();
    case '6M':
      d.setMonth(d.getMonth() - 6);
      return d.getTime();
    case '1Y':
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    case 'ALL':
    default:
      return null;
  }
}

/**
 * Renders the body-weight history as an interactive line chart with zoom, pan, and stats.
 */
export function WeightChart({ entries }: Readonly<{ entries: WeightEntry[] }>): JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  const [width, setWidth] = useState(0);

  const [activeRange, setActiveRange] = useState<TimeRangeOption>('ALL');
  const [zoomDomainX, setZoomDomainX] = useState<DomainTuple | undefined>(undefined);
  const [selectedPoint, setSelectedPoint] = useState<WeightPoint | null>(null);

  // Chronological order (oldest to newest) for line chart progression
  const data: WeightPoint[] = useMemo(
    () =>
      [...entries]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map(entry => ({
          x: new Date(`${entry.date}T00:00:00`).getTime(),
          y: entry.weightKg,
          dateStr: entry.date
        })),
    [entries]
  );

  // Stats calculation over all entries
  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const weights = data.map(d => d.y);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const latest = data.at(-1)?.y ?? 0;
    const first = data[0].y;
    const totalDiff = Math.round((latest - first) * 10) / 10;
    return {
      min,
      max,
      latest,
      first,
      totalDiff
    };
  }, [data]);

  const handleSelectRange = useCallback(
    (range: TimeRangeOption) => {
      setActiveRange(range);
      setSelectedPoint(null);
      if (data.length < 2) return;
      const latestPoint = data.at(-1);
      if (!latestPoint) return;
      const latestMs = latestPoint.x;
      const startMs = getRangeStartTimestamp(latestMs, range);
      if (startMs === null) {
        setZoomDomainX(undefined);
      } else {
        const earliestMs = Math.max(data[0].x, startMs);
        setZoomDomainX([earliestMs, latestMs]);
      }
    },
    [data]
  );

  const handleResetZoom = useCallback(() => {
    setActiveRange('ALL');
    setZoomDomainX(undefined);
    setSelectedPoint(null);
  }, []);

  const handleZoomDomainChange = useCallback((domain: { x: DomainTuple; y: DomainTuple }) => {
    if (domain?.x) {
      setZoomDomainX(domain.x);
    }
  }, []);

  if (entries.length < 2 || !stats) {
    return null;
  }

  const minY = stats.min;
  const maxY = stats.max;
  const padding = 1;

  const totalDeltaText =
    stats.totalDiff > 0 ? `+${stats.totalDiff.toFixed(1)} kg` : `${stats.totalDiff.toFixed(1)} kg`;
  const totalDeltaColor = resolveDeltaColor(stats.totalDiff, theme);

  return (
    <View style={styles.container} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {/* Chart Header with Title and Range Filters */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Weight trend</Text>
          <Text style={styles.subtitle}>Pinch &amp; drag to zoom/pan</Text>
        </View>
        <View style={styles.rangeRow}>
          {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeRangeOption[]).map(r => (
            <Pressable
              key={r}
              style={[styles.rangePill, activeRange === r ? styles.rangePillActive : null]}
              onPress={() => handleSelectRange(r)}
              accessibilityRole="button"
              accessibilityLabel={`Filter chart to ${r}`}
            >
              <Text
                style={[
                  styles.rangePillText,
                  activeRange === r ? styles.rangePillTextActive : null
                ]}
              >
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Stats Summary Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Current</Text>
          <Text style={styles.statValue}>{stats.latest.toFixed(1)} kg</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Min / Max</Text>
          <Text style={styles.statValue}>
            {stats.min.toFixed(1)} / {stats.max.toFixed(1)}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Total Change</Text>
          <Text style={[styles.statValue, { color: totalDeltaColor }]}>{totalDeltaText}</Text>
        </View>
      </View>

      {/* Selected Point Inspection Banner */}
      {selectedPoint ? (
        <View style={styles.inspectBanner}>
          <Ionicons name="information-circle-outline" size={14} color={theme.primary} />
          <Text style={styles.inspectText}>
            {selectedPoint.dateStr}:{' '}
            <Text style={styles.inspectWeight}>{selectedPoint.y.toFixed(1)} kg</Text>
          </Text>
          <Pressable
            onPress={() => setSelectedPoint(null)}
            accessibilityRole="button"
            accessibilityLabel="Clear point selection"
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={16} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Zoom / Pan Victory Chart */}
      {width > 0 ? (
        <VictoryChart
          theme={chartTheme}
          width={width}
          height={210}
          domain={{
            y: [minY - padding, maxY + padding]
          }}
          padding={{ top: 12, bottom: 28, left: 42, right: 14 }}
          containerComponent={
            <VictoryZoomContainer
              zoomDimension="x"
              allowZoom
              allowPan
              zoomDomain={zoomDomainX ? { x: zoomDomainX } : undefined}
              onZoomDomainChange={handleZoomDomainChange}
            />
          }
        >
          <VictoryAxis
            tickCount={5}
            tickFormat={(value: number) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
            }}
          />
          <VictoryAxis dependentAxis tickFormat={(value: number) => `${value}`} />
          <VictoryLine
            data={data}
            style={{
              data: { stroke: theme.primary, strokeWidth: 2 }
            }}
          />
          <VictoryScatter
            data={data}
            size={({ datum }) => (datum.dateStr === selectedPoint?.dateStr ? 5 : 3)}
            events={[
              {
                target: 'data',
                eventHandlers: {
                  onPressIn: (_evt, targetProps) => {
                    const datum = targetProps?.datum as WeightPoint | undefined;
                    if (datum) {
                      setSelectedPoint(datum);
                    }
                    return [];
                  }
                }
              }
            ]}
            style={{
              data: {
                fill: ({ datum }) =>
                  datum.dateStr === selectedPoint?.dateStr ? theme.danger : theme.primary
              }
            }}
          />
        </VictoryChart>
      ) : null}

      {/* Reset Zoom Button when zoomed */}
      {zoomDomainX ? (
        <Pressable
          style={styles.resetButton}
          onPress={handleResetZoom}
          accessibilityRole="button"
          accessibilityLabel="Reset chart zoom"
        >
          <Ionicons name="refresh-outline" size={14} color={theme.primary} />
          <Text style={styles.resetButtonText}>Reset Zoom</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      marginTop: 8,
      marginBottom: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingVertical: 10,
      overflow: 'hidden'
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      marginBottom: 8
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textStrong
    },
    subtitle: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 1
    },
    rangeRow: {
      flexDirection: 'row',
      gap: 4
    },
    rangePill: {
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt
    },
    rangePillActive: {
      borderColor: theme.primary,
      backgroundColor: theme.surfaceSunken
    },
    rangePillText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.textMuted
    },
    rangePillTextActive: {
      color: theme.primary
    },
    statsBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 8,
      marginHorizontal: 12,
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginBottom: 6
    },
    statItem: {
      alignItems: 'center'
    },
    statLabel: {
      fontSize: 10,
      color: theme.textMuted,
      fontWeight: '500',
      textTransform: 'uppercase'
    },
    statValue: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      marginTop: 1
    },
    inspectBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.surfaceSunken,
      paddingVertical: 4,
      paddingHorizontal: 10,
      marginHorizontal: 12,
      borderRadius: 6,
      marginBottom: 4
    },
    inspectText: {
      fontSize: 12,
      color: theme.text
    },
    inspectWeight: {
      fontWeight: '700',
      color: theme.primary
    },
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      alignSelf: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      marginTop: 4
    },
    resetButtonText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.primary
    }
  });
