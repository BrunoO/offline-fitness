import React, { JSX, useCallback, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ResolvedTheme, useTheme } from '@/theme';
import { useManualEntry } from '@/features/activities';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface TabConfig {
  label: string;
  outlineIcon: IoniconName;
  focusedIcon: IoniconName;
}

const TAB_CONFIGS: Record<string, TabConfig> = {
  Home: {
    label: 'Home',
    outlineIcon: 'home-outline',
    focusedIcon: 'home'
  },
  Activities: {
    label: 'Activities',
    outlineIcon: 'list-outline',
    focusedIcon: 'list'
  },
  Stats: {
    label: 'Stats',
    outlineIcon: 'bar-chart-outline',
    focusedIcon: 'bar-chart'
  },
  Maps: {
    label: 'Maps',
    outlineIcon: 'map-outline',
    focusedIcon: 'map'
  }
};

function getTabLabel(
  tabBarLabel: unknown,
  title: string | undefined,
  defaultLabel: string
): string {
  if (typeof tabBarLabel === 'string') {
    return tabBarLabel;
  }
  if (title !== undefined) {
    return title;
  }
  return defaultLabel;
}

export function FloatingTabBar({
  state,
  descriptors,
  navigation
}: Readonly<BottomTabBarProps>): JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);
  const { openRecordChooser } = useManualEntry();

  const handleRecordPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    openRecordChooser();
  }, [openRecordChooser]);

  return (
    <View style={styles.outerContainer} pointerEvents="box-none">
      <View style={styles.barPill}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];

          if (route.name === 'RecordAction') {
            return (
              <View key={route.key} style={styles.heroButtonSlot}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Record or add activity"
                  style={({ pressed }) => [
                    styles.heroButton,
                    pressed ? styles.heroButtonPressed : null
                  ]}
                  onPress={handleRecordPress}
                >
                  <Ionicons name="add" size={28} color={theme.onPrimary} />
                </Pressable>
              </View>
            );
          }

          const config = TAB_CONFIGS[route.name];
          if (!config) return null;

          const label = getTabLabel(options.tabBarLabel, options.title, config.label);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true
            });

            if (!isFocused && !event.defaultPrevented) {
              void Haptics.selectionAsync().catch(() => undefined);
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={`${label} tab`}
              style={styles.tabItem}
              onPress={onPress}
            >
              <Ionicons
                name={isFocused ? config.focusedIcon : config.outlineIcon}
                size={22}
                color={isFocused ? theme.primary : theme.textMuted}
              />
              <Text style={[styles.tabLabel, isFocused ? styles.tabLabelFocused : null]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: ResolvedTheme, bottomInset: number) =>
  StyleSheet.create({
    outerContainer: {
      position: 'absolute',
      bottom: Math.max(bottomInset, 8) + 4,
      left: 16,
      right: 16,
      alignItems: 'center',
      zIndex: 50
    },
    barPill: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.border,
      height: 60,
      width: '100%',
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'space-between',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 10
        },
        android: {
          elevation: 8
        }
      })
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      gap: 2
    },
    tabLabel: {
      fontSize: 10,
      fontWeight: '500',
      color: theme.textMuted
    },
    tabLabelFocused: {
      color: theme.primary,
      fontWeight: '700'
    },
    heroButtonSlot: {
      width: 58,
      alignItems: 'center',
      justifyContent: 'center'
    },
    heroButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -16,
      borderWidth: 3,
      borderColor: theme.surface,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 6
        },
        android: {
          elevation: 6
        }
      })
    },
    heroButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.95 }]
    }
  });
