// Theme - Public API
// The app's colour system: palettes, the resolver, the provider and the hook.

export { createChartTheme } from './chartTheme';
export type { ChartTheme } from './chartTheme';
export { createNavigationTheme } from './navigationTheme';
export {
  DEFAULT_PALETTE_ID,
  getPalette,
  isKnownPalette,
  PALETTES,
  PALETTE_ORDER
} from './palettes';
export { resolveTheme, resolveThemeById } from './resolve';
export { PALETTE_STORAGE_KEY, ThemeProvider, useThemeContext } from './ThemeProvider';
export type { ThemeContextValue } from './ThemeProvider';
export { useTheme } from './useTheme';
export type {
  ColorScheme,
  LogColors,
  PaletteDefinition,
  ResolvedTheme,
  SchemeColor,
  SchemeSeries
} from './types';
