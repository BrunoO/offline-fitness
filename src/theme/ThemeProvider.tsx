import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useColorScheme } from 'react-native';
import { DEFAULT_PALETTE_ID, isKnownPalette } from './palettes';
import { resolveThemeById } from './resolve';
import { ColorScheme, ResolvedTheme } from './types';

/** The AsyncStorage key the selected palette is persisted under. */
export const PALETTE_STORAGE_KEY = 'paletteId';

export interface ThemeContextValue {
  /** The resolved theme every component should read its colours from. */
  theme: ResolvedTheme;
  /** The id of the active palette. */
  paletteId: string;
  /** Selects a palette and persists the choice. */
  setPaletteId: (id: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Provides the resolved theme to the whole app.
 *
 * The active palette is persisted, so a user who picks one keeps it across
 * restarts. The colour scheme follows the device setting.
 * @param children The children to render.
 * @returns A React component.
 */
export function ThemeProvider({ children }: Readonly<PropsWithChildren>): React.JSX.Element {
  const colorScheme = useColorScheme();
  const scheme: ColorScheme = colorScheme === 'dark' ? 'dark' : 'light';
  const [paletteIdState, setPaletteIdState] = useState<string>(DEFAULT_PALETTE_ID);

  useEffect(() => {
    let cancelled = false;
    const loadPalette = async () => {
      try {
        const stored = await AsyncStorage.getItem(PALETTE_STORAGE_KEY);
        if (!cancelled && stored && isKnownPalette(stored)) {
          setPaletteIdState(stored);
        }
      } catch {
        // Storage is unavailable — keep the default palette.
      }
    };
    void loadPalette();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPaletteId = useCallback((id: string) => {
    if (!isKnownPalette(id)) {
      return;
    }
    setPaletteIdState(id);
    AsyncStorage.setItem(PALETTE_STORAGE_KEY, id).catch(() => undefined);
  }, []);

  const theme = useMemo(() => resolveThemeById(paletteIdState, scheme), [paletteIdState, scheme]);
  const value = useMemo(
    () => ({ theme, paletteId: paletteIdState, setPaletteId }),
    [theme, paletteIdState, setPaletteId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Reads the theme context.
 * @returns The theme context value.
 */
export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used inside a ThemeProvider');
  }
  return context;
}
