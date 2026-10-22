import { ResolvedTheme, useTheme } from '@/theme';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface SheetFooterButton {
  label: string;
  onPress: () => void;
  /** Filled primary vs outlined secondary. Defaults to secondary. */
  primary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Shared action row for bottom sheets (manual entry, day sheet, settings):
 * right-aligned buttons over a top border. One implementation so the sheets
 * never drift apart — and so the ~45-line button style block plus the
 * Pressable pair are not copy-pasted per sheet (Sonar duplication).
 */
export function SheetFooter({
  buttons
}: Readonly<{ buttons: readonly SheetFooterButton[] }>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.actions}>
      {buttons.map(button => {
        const primary = button.primary === true;
        return (
          <Pressable
            key={button.label}
            style={[
              styles.button,
              primary ? styles.primaryButton : styles.secondaryButton,
              button.disabled === true ? styles.disabledButton : null
            ]}
            onPress={button.onPress}
            disabled={button.disabled}
            accessibilityLabel={button.accessibilityLabel ?? button.label}
            accessibilityRole="button"
          >
            <Text style={primary ? styles.primaryButtonText : styles.secondaryButtonText}>
              {button.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border
    },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      minHeight: 42,
      justifyContent: 'center'
    },
    primaryButton: {
      backgroundColor: theme.primary
    },
    primaryButtonText: {
      color: theme.onPrimary,
      fontWeight: '600',
      textAlign: 'center'
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.border
    },
    secondaryButtonText: {
      color: theme.text,
      fontWeight: '600',
      textAlign: 'center'
    },
    disabledButton: {
      opacity: 0.6
    }
  });
