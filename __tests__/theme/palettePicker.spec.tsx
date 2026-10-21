import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import {
  DEFAULT_PALETTE_ID,
  PALETTE_ORDER,
  PALETTES,
  PalettePicker,
  ThemeProvider,
  useThemeContext
} from '@/theme';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve())
}));

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

/**
 * Renders the primary colour of the active theme as text, so a test can
 * observe that the palette actually changed.
 */
function PrimaryProbe() {
  const { theme } = useThemeContext();
  return <Text>{`primary:${theme.primary.toUpperCase()}`}</Text>;
}

/**
 * Walks the rendered tree for a node carrying a background colour.
 * @param node The node to search.
 * @param color The background colour to look for.
 * @returns True when the colour is present.
 */
function hasBackgroundColor(node: unknown, color: string): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }
  const candidate = node as { props?: { style?: unknown }; children?: unknown[] };
  const style = candidate.props?.style;
  if (style) {
    const flat = Array.isArray(style) ? style.flat(3) : [style];
    if (
      flat.some(entry => typeof entry === 'object' && entry !== null && 'backgroundColor' in entry)
    ) {
      const match = flat.find(entry =>
        typeof entry === 'object' && entry !== null && 'backgroundColor' in entry
          ? (entry as { backgroundColor?: string }).backgroundColor === color
          : false
      );
      if (match) {
        return true;
      }
    }
  }
  return (candidate.children ?? []).some(child => hasBackgroundColor(child, color));
}

describe('PalettePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists every registered palette', () => {
    render(
      <ThemeProvider>
        <PalettePicker />
      </ThemeProvider>
    );

    const rows = screen.getAllByRole('radio');
    expect(rows).toHaveLength(PALETTE_ORDER.length);
    PALETTE_ORDER.forEach(id => {
      expect(screen.getByLabelText(`${PALETTES[id].label} palette`)).toBeTruthy();
    });
  });

  it('marks the active palette as selected', () => {
    render(
      <ThemeProvider>
        <PalettePicker />
      </ThemeProvider>
    );

    const selected = screen
      .getAllByRole('radio')
      .filter(row => row.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe(
      `${PALETTES[DEFAULT_PALETTE_ID].label} palette`
    );
  });

  it('applies the chosen palette and persists it', () => {
    const onChange = jest.fn();
    render(
      <ThemeProvider>
        <PrimaryProbe />
        <PalettePicker onChange={onChange} />
      </ThemeProvider>
    );

    expect(
      screen.getByText(`primary:${PALETTES[DEFAULT_PALETTE_ID].primary.light.toUpperCase()}`)
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText(`${PALETTES.alpine.label} palette`));

    expect(onChange).toHaveBeenCalledWith('alpine');
    expect(mockedStorage.setItem).toHaveBeenCalledWith('paletteId', 'alpine');
    // The app's colours follow the choice straight away.
    expect(screen.getByText(`primary:${PALETTES.alpine.primary.light.toUpperCase()}`)).toBeTruthy();
  });

  it('previews each palette with its own accent colour', () => {
    render(
      <ThemeProvider>
        <PalettePicker />
      </ThemeProvider>
    );

    const tree = screen.toJSON();
    PALETTE_ORDER.forEach(id => {
      expect(hasBackgroundColor(tree, PALETTES[id].primary.light)).toBe(true);
    });
  });
});
