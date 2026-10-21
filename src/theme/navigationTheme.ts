import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';
import { ResolvedTheme } from './types';

/**
 * Builds a React Navigation theme from the resolved app theme.
 *
 * The drawer and the bottom tab bar take their active/inactive tints from the
 * navigation theme, not from the app's own colours. Without this, the Stats
 * tab label stays blue while the rest of the app follows the palette.
 * @param theme The resolved app theme.
 * @returns A React Navigation theme.
 */
export function createNavigationTheme(theme: ResolvedTheme): Theme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: theme.primary,
      background: theme.surfaceAlt,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      notification: theme.danger
    }
  };
}
