import { useThemeContext } from './ThemeProvider';
import { ResolvedTheme } from './types';

/**
 * Reads the resolved theme.
 *
 * Components must read their colours from here rather than from module-level
 * constants, so that changing the palette or the colour scheme re-renders
 * them with the right colours.
 * @returns The resolved theme.
 */
export function useTheme(): ResolvedTheme {
  return useThemeContext().theme;
}
