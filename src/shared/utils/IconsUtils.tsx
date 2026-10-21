import { MaterialIcons } from '@expo/vector-icons';
import { JSX } from 'react';
import { Pressable, Text } from 'react-native';

interface IconButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label?: string;
  onPress: () => void;
  textStyle?: object;
  buttonStyle?: object;
}

/**
 * A customizable button component that displays an icon and an optional label.
 *
 * @param {Object} props - The properties object.
 * @param {string} props.icon - The name of the icon to display.
 * @param {string} [props.label] - The optional label to display next to the icon.
 * @param {() => void} props.onPress - The function to call when the button is pressed.
 * @param {TextStyle} [props.textStyle] - The optional style to apply to the label text.
 * @param {ViewStyle} [props.buttonStyle] - The optional style to apply to the button.
 *
 * @returns {JSX.Element} The rendered button component.
 */
export const IconButton = ({
  icon,
  label,
  onPress,
  textStyle,
  buttonStyle
}: IconButtonProps): JSX.Element => (
  <Pressable style={buttonStyle} onPress={onPress}>
    <MaterialIcons name={icon} size={32} color="black" />
    {label ? <Text style={textStyle}>{label}</Text> : null}
  </Pressable>
);
