import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { JSX } from 'react';
import { Pressable, Text } from 'react-native';

interface IconButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label?: string;
  onPress: () => void;
  textStyle?: object;
  buttonStyle?: object;
  color?: string;
  accessibilityLabel?: string;
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
 * @param {string} [props.color] - The optional color for the icon. Defaults to theme.text.
 * @param {string} [props.accessibilityLabel] - Optional accessibility label. Defaults to label.
 *
 * @returns {JSX.Element} The rendered button component.
 */
export const IconButton = ({
  icon,
  label,
  onPress,
  textStyle,
  buttonStyle,
  color,
  accessibilityLabel
}: IconButtonProps): JSX.Element => {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={buttonStyle}
      onPress={onPress}
    >
      <MaterialIcons name={icon} size={24} color={color ?? theme.text} />
      {label ? <Text style={textStyle}>{label}</Text> : null}
    </Pressable>
  );
};
