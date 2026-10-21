/**
 * Theme types.
 *
 * A *palette* describes only the chromatic choices of the app (brand accent,
 * success tone, chart series). Neutrals, surfaces and semantic colours are
 * shared by every palette so that switching palette never reflows the layout
 * or changes the reading experience — only the accent changes.
 */

/** The two colour schemes the app supports. */
export type ColorScheme = 'light' | 'dark';

/** A colour that differs between the light and the dark scheme. */
export interface SchemeColor {
  light: string;
  dark: string;
}

/** An ordered series of colours that differs between schemes. */
export interface SchemeSeries {
  light: string[];
  dark: string[];
}

/**
 * The chromatic half of a theme.
 *
 * Every palette must keep the same shape, so the resolver can merge it with
 * the shared neutral ramp without knowing which palette it is dealing with.
 */
export interface PaletteDefinition {
  /** Stable identifier, persisted when the user picks a palette. */
  id: string;
  /** Human-readable name, shown in the palette picker. */
  label: string;
  /** The brand accent: section titles, icons, primary buttons, chart strokes. */
  primary: SchemeColor;
  /** The pressed / active state of the brand accent. */
  primaryPressed: SchemeColor;
  /** A tinted background derived from the brand accent. */
  primarySoft: SchemeColor;
  /** Goal achieved, selected state, healthy counters. */
  success: SchemeColor;
  /** A tinted background derived from the success colour. */
  successSoft: SchemeColor;
  /** Ordered colours used to distinguish data series in charts. */
  chartSeries: SchemeSeries;
  /** Four light tints used to band the quarters of the year-to-date chart. */
  chartTints: SchemeSeries;
}

/** Colours used by the log viewer. */
export interface LogColors {
  text: string;
  background: string;
  logItemBackground: string;
  timestamp: string;
  logLevel: {
    Error: string;
    Warning: string;
    Info: string;
    Default: string;
  };
}

/**
 * A fully resolved theme: a palette merged with the neutral ramp for one
 * colour scheme. This is what components consume.
 */
export interface ResolvedTheme {
  /** The scheme this theme was resolved for. */
  scheme: ColorScheme;
  /** The id of the palette this theme was resolved from. */
  paletteId: string;

  // Brand
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;

  // Semantic
  success: string;
  successSoft: string;
  danger: string;
  dangerPressed: string;
  dangerSoft: string;
  dangerBorder: string;
  warning: string;
  info: string;

  // Surfaces
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  surfaceMuted: string;
  surfaceInverse: string;

  // Lines
  border: string;
  borderStrong: string;
  borderSubtle: string;

  // Text
  text: string;
  textStrong: string;
  textMuted: string;
  textSubtle: string;
  textOnSurface: string;
  textInverse: string;

  // Charts
  chartSeries: string[];
  chartTints: string[];
  chartGrid: string;
  chartAxis: string;
  chartComparison: string;
  chartZeroFill: string;
  chartZeroStroke: string;

  // Map
  mapTrack: string[];

  // Interaction
  swipeReveal: string;
  scrim: string;

  // Log viewer
  log: LogColors;
}
