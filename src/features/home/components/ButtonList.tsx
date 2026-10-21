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
            <Text style={styles.text}>{item}</Text>
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
      justifyContent: 'space-around',
      paddingBottom: 15
    },

    button: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 4,
      elevation: 3,
      backgroundColor: theme.surfaceMuted
    },
    buttonSelected: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 4,
      elevation: 3,
      backgroundColor: theme.primary
    },
    text: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: 'bold',
      letterSpacing: 0.25,
      color: theme.onPrimary
    }
  });
