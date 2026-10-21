import { VictoryTheme } from 'victory-native';
import { ResolvedTheme } from './types';

/** The shape of a Victory theme object. */
export type ChartTheme = typeof VictoryTheme.material;

/**
 * Builds a Victory theme from the resolved app theme.
 *
 * Charts used to hardcode `VictoryTheme.material`, which kept Material's own
 * greys and blue accents no matter what the app looked like. Deriving the
 * theme from the app tokens keeps axes, grid lines and labels in step with
 * the palette.
 * @param theme The resolved theme.
 * @returns A Victory theme.
 */
export function createChartTheme(theme: ResolvedTheme): ChartTheme {
  const material = VictoryTheme.material;
  return {
    ...material,
    axis: {
      ...material.axis,
      style: {
        ...material.axis?.style,
        axis: { stroke: theme.chartAxis, strokeWidth: 1 },
        grid: { stroke: theme.chartGrid, strokeDasharray: '2,5' },
        ticks: { stroke: 'transparent' },
        tickLabels: { fill: theme.textMuted, fontSize: 10 },
        axisLabel: { fill: theme.text, fontSize: 12, fontWeight: '600' }
      }
    },
    dependentAxis: {
      ...material.dependentAxis,
      style: {
        ...material.dependentAxis?.style,
        axis: { stroke: theme.chartAxis, strokeWidth: 1 },
        grid: { stroke: theme.chartGrid, strokeDasharray: '2,5' },
        ticks: { stroke: 'transparent' },
        tickLabels: { fill: theme.textMuted, fontSize: 10 },
        axisLabel: { fill: theme.text, fontSize: 12, fontWeight: '600' }
      }
    },
    bar: {
      ...material.bar,
      style: {
        ...material.bar?.style,
        data: { ...material.bar?.style?.data, fill: theme.primary, stroke: theme.primary }
      }
    },
    line: {
      ...material.line,
      style: {
        ...material.line?.style,
        data: { ...material.line?.style?.data, stroke: theme.primary }
      }
    },
    area: {
      ...material.area,
      style: {
        ...material.area?.style,
        data: { ...material.area?.style?.data, fill: theme.primary, stroke: theme.primary }
      }
    },
    legend: {
      ...material.legend,
      style: {
        ...material.legend?.style,
        border: { ...material.legend?.style?.border, stroke: theme.border },
        data: { ...material.legend?.style?.data, fill: theme.text },
        labels: { fill: theme.text },
        title: { ...material.legend?.style?.title, fill: theme.text }
      }
    }
  };
}
