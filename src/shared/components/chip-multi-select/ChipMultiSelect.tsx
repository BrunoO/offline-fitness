import { ResolvedTheme, useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

export interface ChipMultiSelectProps {
  items: string[];
  selectedItems: Set<string> | string[];
  onChange: (next: Set<string>) => void;
  includeAll?: boolean;
  containerStyle?: ViewStyle;
}

export function ChipMultiSelect({
  items,
  selectedItems,
  onChange,
  includeAll = true,
  containerStyle
}: Readonly<ChipMultiSelectProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const selectedSet: Set<string> =
    selectedItems instanceof Set ? selectedItems : new Set(selectedItems);

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  return (
    <View style={[styles.chipsRow, containerStyle]}>
      {includeAll ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Show all"
          onPress={clearAll}
          style={[styles.chip, selectedSet.size === 0 ? styles.chipSelected : null]}
        >
          <Text style={[styles.chipText, selectedSet.size === 0 ? styles.chipTextSelected : null]}>
            All
          </Text>
        </TouchableOpacity>
      ) : null}
      {items.map(item => {
        const isOn = selectedSet.has(item);
        return (
          <TouchableOpacity
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`Toggle ${item}`}
            onPress={() => toggle(item)}
            style={[styles.chip, isOn ? styles.chipSelected : null]}
          >
            <Text style={[styles.chipText, isOn ? styles.chipTextSelected : null]}>{item}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      rowGap: 6,
      justifyContent: 'center',
      marginBottom: 8
    },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 16,
      backgroundColor: theme.surfaceMuted
    },
    chipSelected: {
      backgroundColor: theme.primary
    },
    chipText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600'
    },
    chipTextSelected: {
      color: theme.onPrimary
    }
  });
