import {
  ChartTheme,
  createChartTheme,
  DEFAULT_PALETTE_ID,
  getPalette,
  isKnownPalette,
  PALETTES,
  PALETTE_ORDER,
  resolveTheme,
  resolveThemeById
} from '@/theme';
import { VictoryTheme } from 'victory-native';
import { getBaseProps } from 'victory-legend/es/helper-methods';

/**
 * Computes the relative luminance of a hex colour.
 * @param hex The colour, as a #rrggbb string.
 * @returns The relative luminance, between 0 and 1.
 */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(offset => {
    const raw = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Computes the WCAG contrast ratio between two colours.
 * @param a The first colour.
 * @param b The second colour.
 * @returns The contrast ratio, between 1 and 21.
 */
function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const [high, low] = first > second ? [first, second] : [second, first];
  return (high + 0.05) / (low + 0.05);
}

const SCHEMES = ['light', 'dark'] as const;

describe('palette registry', () => {
  it('exposes every registered palette in the display order', () => {
    expect(PALETTE_ORDER.length).toBe(Object.keys(PALETTES).length);
    PALETTE_ORDER.forEach(id => {
      expect(isKnownPalette(id)).toBe(true);
      expect(getPalette(id).id).toBe(id);
    });
  });

  it('falls back to the default palette for an unknown id', () => {
    expect(isKnownPalette('not-a-palette')).toBe(false);
    expect(getPalette('not-a-palette').id).toBe(DEFAULT_PALETTE_ID);
  });

  it('keeps the same number of chart series and tints in both schemes', () => {
    PALETTE_ORDER.forEach(id => {
      const palette = getPalette(id);
      expect(palette.chartSeries.light.length).toBe(palette.chartSeries.dark.length);
      expect(palette.chartTints.light.length).toBe(4);
      expect(palette.chartTints.dark.length).toBe(4);
    });
  });
});

describe('theme resolution', () => {
  it('resolves a complete theme for every palette and scheme', () => {
    PALETTE_ORDER.forEach(id => {
      SCHEMES.forEach(scheme => {
        const theme = resolveThemeById(id, scheme);
        expect(theme.scheme).toBe(scheme);
        expect(theme.paletteId).toBe(id);
        expect(theme.primary).toMatch(/^#[0-9A-Fa-f]{6}$/i);
        expect(theme.text).toMatch(/^#[0-9A-Fa-f]{6}$/i);
        expect(theme.chartSeries).toHaveLength(getPalette(id).chartSeries[scheme].length);
        expect(theme.log.logLevel.Error).toMatch(/^#[0-9A-Fa-f]{6}$/i);
      });
    });
  });

  it('resolves an unknown palette id to the default palette', () => {
    const resolved = resolveThemeById('nope', 'light');
    const fallback = resolveTheme(getPalette(DEFAULT_PALETTE_ID), 'light');
    expect(resolved.primary).toBe(fallback.primary);
  });

  it('gives each palette its own accent', () => {
    const primaries = PALETTE_ORDER.map(id => getPalette(id).primary.light);
    expect(new Set(primaries).size).toBe(primaries.length);
  });
});

describe('accessibility floor', () => {
  // The legacy palette reproduces the look the app shipped with, including its
  // contrast weaknesses. It is held to the historical values here and is
  // replaced by a new default palette; the floor below applies to every
  // palette introduced with the theme.
  const EXEMPT = ['legacy'];

  PALETTE_ORDER.filter(id => !EXEMPT.includes(id)).forEach(id => {
    SCHEMES.forEach(scheme => {
      it(`keeps ${id} readable in the ${scheme} scheme`, () => {
        const theme = resolveThemeById(id, scheme);

        // Body text and labels need 4.5:1 against the card they sit on.
        expect(contrast(theme.primary, theme.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.onPrimary, theme.primary)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.success, theme.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.textMuted, theme.surface)).toBeGreaterThanOrEqual(4.5);

        // Chart fills only need to be distinguishable: 3:1.
        theme.chartSeries.forEach(series => {
          expect(contrast(series, theme.surface)).toBeGreaterThanOrEqual(3);
        });
      });
    });
  });

  it('keeps the legacy palette on the values the app shipped with', () => {
    const theme = resolveThemeById('legacy', 'light');
    expect(theme.primary).toBe('#F4511E');
    expect(theme.success).toBe('#8BC34A');
    expect(theme.chartSeries).toEqual([
      '#F4511E',
      '#FFF59D',
      '#DCE775',
      '#8BC34A',
      '#00796B',
      '#006064'
    ]);
  });

  // The legacy palette is the only one allowed to miss the floor, because it
  // reproduces the look the app shipped with. The palette the app actually
  // starts on must never be one of them.
  it('starts on a palette that meets the accessibility floor', () => {
    expect(EXEMPT).not.toContain(DEFAULT_PALETTE_ID);

    SCHEMES.forEach(scheme => {
      const theme = resolveThemeById(DEFAULT_PALETTE_ID, scheme);
      expect(contrast(theme.primary, theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.onPrimary, theme.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.success, theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.textMuted, theme.surface)).toBeGreaterThanOrEqual(4.5);
      theme.chartSeries.forEach(series => {
        expect(contrast(series, theme.surface)).toBeGreaterThanOrEqual(3);
      });
    });
  });
});

describe('chart theme', () => {
  it('derives the axis and grid colours from the app theme', () => {
    const theme = resolveThemeById('twilight', 'light');
    const chartTheme = createChartTheme(theme);
    expect(chartTheme.axis?.style?.axis?.stroke).toBe(theme.chartAxis);
    expect(chartTheme.axis?.style?.grid?.stroke).toBe(theme.chartGrid);
    expect(chartTheme.axis?.style?.tickLabels?.fill).toBe(theme.textMuted);
    expect(chartTheme.bar?.style?.data?.fill).toBe(theme.primary);
  });

  // A Victory theme is not only colours. `fontSize` drives the legend symbol
  // size, `size` the tick length, `type` which symbol gets drawn. When the
  // palette theme replaced a Material style object instead of merging onto it,
  // those were dropped, Victory computed the legend symbol from `undefined`,
  // and react-native-svg's native path parser threw on the resulting NaN and
  // took the app down on the "Last years" tab.
  const MATERIAL_GEOMETRY: { path: string[]; property: string }[] = [
    { path: ['axis', 'style', 'axis'], property: 'strokeLinecap' },
    { path: ['axis', 'style', 'grid'], property: 'pointerEvents' },
    { path: ['axis', 'style', 'ticks'], property: 'size' },
    { path: ['axis', 'style', 'tickLabels'], property: 'fontFamily' },
    { path: ['axis', 'style', 'axisLabel'], property: 'textAnchor' },
    { path: ['legend', 'style', 'labels'], property: 'fontSize' },
    { path: ['legend', 'style', 'data'], property: 'type' },
    { path: ['bar', 'style', 'data'], property: 'strokeWidth' }
  ];

  const resolvePath = (source: unknown, keyPath: string[]): unknown =>
    keyPath.reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      source
    );

  it('keeps Material geometry properties that only a palette is overridden', () => {
    const theme = resolveThemeById(DEFAULT_PALETTE_ID, 'light');
    const chartTheme = createChartTheme(theme) as unknown as Record<string, unknown>;

    MATERIAL_GEOMETRY.forEach(({ path, property }) => {
      const materialValue = resolvePath(VictoryTheme.material, path) as Record<string, unknown>;
      const themedValue = resolvePath(chartTheme, path) as Record<string, unknown>;
      expect({ at: path.join('.'), property, value: themedValue?.[property] }).toEqual({
        at: path.join('.'),
        property,
        value: materialValue[property]
      });
    });
  });

  it('gives the dependent axis the same typography as the axis', () => {
    // Material ships no `dependentAxis` block at all, so the palette theme has
    // to seed one or the dependent axis renders without Material's metrics.
    const theme = resolveThemeById(DEFAULT_PALETTE_ID, 'light');
    const chartTheme = createChartTheme(theme);
    expect(chartTheme.dependentAxis?.style?.tickLabels).toEqual(chartTheme.axis?.style?.tickLabels);
  });

  interface LegendSymbol {
    x: number;
    y: number;
    size: number;
  }

  /**
   * Runs Victory's own legend layout and returns the props it would hand to the
   * symbol component, i.e. the arguments of the `circle(x, y, size)` path helper.
   */
  function legendSymbolGeometry(chartTheme: ChartTheme): LegendSymbol[] {
    const props = getBaseProps(
      {
        theme: chartTheme,
        data: [
          { name: 'This Year (2026)', symbol: { fill: '#000000' } },
          { name: 'YTD (2025)', symbol: { fill: '#000000' } }
        ],
        orientation: 'horizontal',
        gutter: 20,
        x: 50,
        y: 0
      },
      // The legend always measures its title, so it needs a title component.
      { titleComponent: { props: {} } }
    );
    return Object.keys(props)
      .filter(key => key !== 'parent' && key !== 'all')
      .map(key => props[key].data as LegendSymbol);
  }

  it('lays out legend symbols with finite geometry', () => {
    SCHEMES.forEach(scheme => {
      PALETTE_ORDER.forEach(id => {
        const chartTheme = createChartTheme(resolveThemeById(id, scheme));
        legendSymbolGeometry(chartTheme).forEach(symbol => {
          // All three feed every number in the symbol's SVG path, so a
          // non-finite one is what crashed the app on Android.
          expect(Number.isFinite(symbol.size)).toBe(true);
          expect(Number.isFinite(symbol.x)).toBe(true);
          expect(Number.isFinite(symbol.y)).toBe(true);
        });
      });
    });
  });

  it('detects a theme that replaces the Material legend labels', () => {
    // Guards the assertion above: this is exactly what the palette theme used
    // to do, and it produced the crash.
    const theme = resolveThemeById(DEFAULT_PALETTE_ID, 'light');
    const chartTheme = createChartTheme(theme);
    const brokenTheme = {
      ...chartTheme,
      legend: {
        ...chartTheme.legend,
        style: { ...chartTheme.legend?.style, labels: { fill: theme.text } }
      }
    };
    expect(legendSymbolGeometry(brokenTheme)[0].size).toBeNaN();
  });
});
