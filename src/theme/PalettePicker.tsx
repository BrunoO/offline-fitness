import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PALETTES, PALETTE_ORDER } from './palettes';
import { useThemeContext } from './ThemeProvider';
import { ResolvedTheme } from './types';
import { useTheme } from './useTheme';

export interface PalettePickerProps {
  /**
   * Called after the palette changed, with the id of the new palette.
   * Useful to close a modal that hosts the picker.
   */
  onChange?: (paletteId: string) => void;
}

/**
 * Lets the user pick the app's colour palette.
 *
 * The choice is applied immediately and persisted by the theme provider, so it
 * survives a restart. Each row previews the palette it stands for: the swatch
 * is the brand accent and the dots are the first entries of its chart series,
 * in the colour scheme currently in use.
 * @param props The component props.
 * @returns A React component.
 */
export function PalettePicker({ onChange }: Readonly<PalettePickerProps>): React.JSX.Element {
  const theme = useTheme();
  const { paletteId, setPaletteId } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.list}>
      {PALETTE_ORDER.map(id => {
        const palette = PALETTES[id];
        const isSelected = id === paletteId;
        const primary = palette.primary[theme.scheme];
        const series = palette.chartSeries[theme.scheme];

        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${palette.label} palette`}
            onPress={() => {
              setPaletteId(id);
              onChange?.(id);
            }}
            style={[
              styles.row,
              isSelected
                ? { borderColor: primary, backgroundColor: palette.primarySoft[theme.scheme] }
                : null
            ]}
          >
            <View style={[styles.swatch, { backgroundColor: primary }]} />
            <View style={styles.labels}>
              <Text style={styles.label}>{palette.label}</Text>
              <Text style={styles.meta}>{primary.toUpperCase()}</Text>
            </View>
            <View style={styles.series}>
              {series.slice(0, 4).map((color, index) => (
                <View
                  key={`${id}-${index}`}
                  style={[styles.seriesDot, { backgroundColor: color }]}
                />
              ))}
            </View>
            {isSelected ? <Text style={[styles.check, { color: primary }]}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    list: {
      gap: 8
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: 8
    },
    labels: {
      flex: 1
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text
    },
    meta: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2
    },
    series: {
      flexDirection: 'row',
      gap: 3
    },
    seriesDot: {
      width: 9,
      height: 9,
      borderRadius: 3
    },
    check: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.primary
    }
  });
