import { VictoryTheme } from 'victory-native';
import { ResolvedTheme } from './types';

/** The shape of a Victory theme object. */
export type ChartTheme = typeof VictoryTheme.material;

/** Any value that can appear inside a Victory theme object. */
type ThemeValue = string | number | boolean | null | undefined | ThemeValue[] | ThemeObject;

/** A plain object inside a Victory theme object. */
interface ThemeObject {
  [key: string]: ThemeValue;
}

function isThemeObject(value: ThemeValue | undefined): value is ThemeObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Copies `overrides` onto a shallow copy of `base`, merging nested style
 * objects instead of replacing them.
 *
 * Victory theme styles carry geometry, not only colour: `fontSize` decides the
 * legend symbol size, `size` the tick length, `type` which symbol to draw, and
 * `textAnchor` plus `padding` where labels sit. A theme that swaps a whole
 * style object for a colour-only one drops those properties, Victory then
 * derives layout from `undefined`, and `undefined / 2.5` is NaN. react-native-svg
 * parses path data natively and throws `IllegalArgumentException` on NaN, which
 * takes the app down instead of degrading a chart.
 *
 * So a palette theme overrides colours on top of Material; it never replaces a
 * Material style.
 */
function mergeTheme(base: ThemeObject, overrides: ThemeObject): ThemeObject {
  const merged: ThemeObject = { ...base };

  Object.keys(overrides).forEach(key => {
    const override = overrides[key];
    const existing = merged[key];
    merged[key] =
      isThemeObject(override) && isThemeObject(existing)
        ? mergeTheme(existing, override)
        : override;
  });

  return merged;
}

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
  const material = VictoryTheme.material as unknown as ThemeObject;

  const axisColors = {
    style: {
      axis: { stroke: theme.chartAxis, strokeWidth: 1 },
      grid: { stroke: theme.chartGrid, strokeDasharray: '2,5' },
      ticks: { stroke: 'transparent' },
      tickLabels: { fill: theme.textMuted, fontSize: 10 },
      axisLabel: { fill: theme.text, fontSize: 12, fontWeight: '600' }
    }
  };

  // Material ships an `axis` block but no `dependentAxis`, so a dependent axis
  // inherits no Material typography. Seed it from `axis` before applying the
  // palette so both axes resolve the same font metrics.
  const base: ThemeObject = material.dependentAxis
    ? material
    : { ...material, dependentAxis: material.axis };

  return mergeTheme(base, {
    axis: axisColors,
    dependentAxis: axisColors,
    bar: {
      style: {
        data: { fill: theme.primary, stroke: theme.primary }
      }
    },
    line: {
      style: {
        data: { stroke: theme.primary }
      }
    },
    area: {
      style: {
        data: { fill: theme.primary, stroke: theme.primary }
      }
    },
    legend: {
      style: {
        border: { stroke: theme.border },
        data: { fill: theme.text },
        labels: { fill: theme.text },
        title: { fill: theme.text }
      }
    }
  }) as unknown as ChartTheme;
}
