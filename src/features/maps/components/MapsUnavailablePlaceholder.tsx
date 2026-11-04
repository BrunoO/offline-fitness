import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { JSX, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Rendered in place of a Google Map when no Maps API key was provided at build
 * time (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY left empty). Keeps the UI from showing
 * a blank/broken map for users who want a fully offline experience.
 */
export default function MapsUnavailablePlaceholder(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="map" size={48} color={theme.textMuted} />
      </View>
      <Text style={styles.title}>Maps unavailable</Text>
      <Text style={styles.subtitle}>
        Add a Google Maps API key to EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in .env to view tracks on a
        map. Everything else works fully offline.
      </Text>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      backgroundColor: theme.surface
    },
    iconContainer: {
      marginBottom: 12
    },
    icon: {
      fontSize: 48
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textStrong,
      textAlign: 'center',
      marginBottom: 8
    },
    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: 'center',
      lineHeight: 20
    }
  });
