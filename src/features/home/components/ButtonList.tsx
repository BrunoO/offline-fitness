// https://docs.expo.dev/ui-programming/react-native-styling-buttons/
// https://blog.logrocket.com/create-radio-buttons-react-native/

import { useTheme } from '@/theme';
import React, { JSX, useMemo } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * component that displays a dynamic row of buttons
 * the state of the selected button must be handled by the caller of this component
 * @param items: (unique) text of each of the buttons
 * @param selectedItems: text of the selected buttons
 * @param handleOnPress: function to handle the pressing of a button
 * @returns The ButtonList component.
 */

function ButtonList({
  items,
  selectedItems,
  handleOnPress,
  opacity
}: Readonly<{
  items: string[];
  selectedItems: string[];
  handleOnPress: (item: string) => void;
  opacity?: number;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={{ ...styles.container, opacity: opacity }}>
      {items.map(item => {
        return (
          <Pressable
            key={item}
            style={selectedItems.includes(item) ? styles.buttonSelected : styles.button}
            onPress={() => handleOnPress(item)}
          >
            <Text style={selectedItems.includes(item) ? styles.textSelected : styles.text}>
              {item}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default ButtonList;

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'flex-start',
      paddingBottom: 8
    },

    button: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      elevation: 1
    },
    buttonSelected: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.primary,
      backgroundColor: theme.primary,
      elevation: 2
    },
    text: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: 0.25,
      color: theme.text
    },
    textSelected: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      letterSpacing: 0.25,
      color: theme.onPrimary
    }
  });
