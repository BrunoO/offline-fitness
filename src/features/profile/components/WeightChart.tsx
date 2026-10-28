import { createChartTheme, ResolvedTheme, useTheme } from '@/theme';
import React, { JSX, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryScatter } from 'victory-native';
import { WeightEntry } from '../services/profileStorage';

/**
 * Renders the body-weight history as a line chart.
 * @param entries Weight entries (newest-first or any order; sorted internally).
 * @returns A chart component, or null when there is not enough data.
 */
export function WeightChart({ entries }: Readonly<{ entries: WeightEntry[] }>): JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chartTheme = useMemo(() => createChartTheme(theme), [theme]);
  const [width, setWidth] = useState(0);

  const data = useMemo(
    () =>
      [...entries]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map(entry => ({
          x: new Date(`${entry.date}T00:00:00`).getTime(),
          y: entry.weightKg
        })),
    [entries]
  );

  if (entries.length < 2) {
    return null;
  }

  const minY = Math.min(...data.map(point => point.y));
  const maxY = Math.max(...data.map(point => point.y));
  const padding = 1; // kg of headroom so the line is not glued to the axes

  return (
    <View style={styles.container} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <Text style={styles.title}>Weight trend</Text>
      {width > 0 ? (
        <VictoryChart
          theme={chartTheme}
          width={width}
          height={200}
          domain={{ y: [minY - padding, maxY + padding] }}
          padding={{ top: 8, bottom: 28, left: 40, right: 12 }}
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
            size={2.5}
            style={{
              data: { fill: theme.primary }
            }}
          />
        </VictoryChart>
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
      paddingVertical: 8,
      overflow: 'hidden'
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 2
    }
  });
