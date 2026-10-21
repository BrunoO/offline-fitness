import { getPalette } from './palettes';
import { ColorScheme, LogColors, PaletteDefinition, ResolvedTheme } from './types';

/**
 * The neutral half of a theme.
 *
 * These tokens are shared by every palette: the surfaces, the lines and the
 * text ramp stay the same whichever accent is active, so changing palette
 * never reflows the layout or shifts the reading experience.
 */
interface NeutralTokens {
  onPrimary: string;
  danger: string;
  dangerPressed: string;
  dangerSoft: string;
  dangerBorder: string;
  warning: string;
  info: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  surfaceMuted: string;
  surfaceInverse: string;
  border: string;
  borderStrong: string;
  borderSubtle: string;
  text: string;
  textStrong: string;
  textMuted: string;
  textSubtle: string;
  textOnSurface: string;
  textInverse: string;
  chartGrid: string;
  chartAxis: string;
  chartComparison: string;
  chartZeroFill: string;
  chartZeroStroke: string;
  mapTrack: string[];
  swipeReveal: string;
  scrim: string;
  log: LogColors;
}

const NEUTRALS: Record<ColorScheme, NeutralTokens> = {
  light: {
    onPrimary: '#FFFFFF',
    danger: '#D32F2F',
    dangerPressed: '#FF5722',
    dangerSoft: '#FFEBEE',
    dangerBorder: '#FFCDD2',
    warning: '#FFA000',
    info: '#1976D2',
    surface: '#FFFFFF',
    surfaceAlt: '#F9FAFB',
    surfaceSunken: '#F3F4F6',
    surfaceMuted: '#E5E7EB',
    surfaceInverse: '#282C34',
    border: '#E5E7EB',
    borderStrong: '#D1D5DB',
    borderSubtle: '#E2E8F0',
    text: '#374151',
    textStrong: '#111827',
    textMuted: '#6B7280',
    textSubtle: '#9CA3AF',
    textOnSurface: '#FFFFFF',
    textInverse: '#FFFFFF',
    chartGrid: '#E5E7EB',
    chartAxis: '#90A4AE',
    chartComparison: '#90A4AE',
    chartZeroFill: '#E0E0E0',
    chartZeroStroke: '#BDBDBD',
    mapTrack: ['#00FF00', '#FFFF00', '#FF0000'],
    swipeReveal: '#FFEFD5',
    scrim: 'rgba(0, 0, 0, 0.5)',
    log: {
      text: '#1f2937',
      background: '#f3f4f6',
      logItemBackground: '#FFFFFF',
      timestamp: '#666666',
      logLevel: {
        Error: '#D32F2F',
        Warning: '#FFA000',
        Info: '#1976D2',
        Default: '#757575'
      }
    }
  },
  dark: {
    onPrimary: '#0F1117',
    danger: '#EF5350',
    dangerPressed: '#EF5350',
    dangerSoft: '#2A1416',
    dangerBorder: '#4A1F22',
    warning: '#FFC107',
    info: '#60A5FA',
    surface: '#171A21',
    surfaceAlt: '#0F1117',
    surfaceSunken: '#22262F',
    surfaceMuted: '#282C34',
    surfaceInverse: '#E5E7EB',
    border: '#2A2E39',
    borderStrong: '#374151',
    borderSubtle: '#374151',
    text: '#E5E7EB',
    textStrong: '#F9FAFB',
    textMuted: '#9CA3AF',
    textSubtle: '#6B7280',
    textOnSurface: '#0F1117',
    textInverse: '#0F1117',
    chartGrid: '#2A2E39',
    chartAxis: '#90A4AE',
    chartComparison: '#94A3B8',
    chartZeroFill: '#2A2E39',
    chartZeroStroke: '#374151',
    mapTrack: ['#00FF00', '#FFFF00', '#FF0000'],
    swipeReveal: '#3A3222',
    scrim: 'rgba(0, 0, 0, 0.6)',
    log: {
      text: '#f3f4f6',
      background: '#111827',
      logItemBackground: '#1f2937',
      timestamp: '#CCCCCC',
      logLevel: {
        Error: '#EF5350',
        Warning: '#FFC107',
        Info: '#03A9F4',
        Default: '#B0BEC5'
      }
    }
  }
};

/**
 * Merges a palette with the neutral ramp of a colour scheme.
 * @param palette The palette to resolve.
 * @param scheme The colour scheme to resolve for.
 * @returns The resolved theme.
 */
export function resolveTheme(palette: PaletteDefinition, scheme: ColorScheme): ResolvedTheme {
  const n = NEUTRALS[scheme];
  return {
    scheme,
    paletteId: palette.id,

    primary: palette.primary[scheme],
    primaryPressed: palette.primaryPressed[scheme],
    primarySoft: palette.primarySoft[scheme],
    onPrimary: n.onPrimary,

    success: palette.success[scheme],
    successSoft: palette.successSoft[scheme],
    danger: n.danger,
    dangerPressed: n.dangerPressed,
    dangerSoft: n.dangerSoft,
    dangerBorder: n.dangerBorder,
    warning: n.warning,
    info: n.info,

    surface: n.surface,
    surfaceAlt: n.surfaceAlt,
    surfaceSunken: n.surfaceSunken,
    surfaceMuted: n.surfaceMuted,
    surfaceInverse: n.surfaceInverse,

    border: n.border,
    borderStrong: n.borderStrong,
    borderSubtle: n.borderSubtle,

    text: n.text,
    textStrong: n.textStrong,
    textMuted: n.textMuted,
    textSubtle: n.textSubtle,
    textOnSurface: n.textOnSurface,
    textInverse: n.textInverse,

    chartSeries: palette.chartSeries[scheme],
    chartTints: palette.chartTints[scheme],
    chartGrid: n.chartGrid,
    chartAxis: n.chartAxis,
    chartComparison: n.chartComparison,
    chartZeroFill: n.chartZeroFill,
    chartZeroStroke: n.chartZeroStroke,

    mapTrack: n.mapTrack,

    swipeReveal: n.swipeReveal,
    scrim: n.scrim,

    log: n.log
  };
}

/**
 * Resolves a palette id and a colour scheme into a theme.
 * @param paletteId The palette id. Unknown ids fall back to the default palette.
 * @param scheme The colour scheme to resolve for.
 * @returns The resolved theme.
 */
export function resolveThemeById(paletteId: string, scheme: ColorScheme): ResolvedTheme {
  return resolveTheme(getPalette(paletteId), scheme);
}
