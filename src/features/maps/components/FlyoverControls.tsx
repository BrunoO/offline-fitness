import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SPEED_OPTIONS = [0.5, 1, 2, 4];
const SLIDER_STEP = 0.001;
const MIN_SLIDER_VAL = 0;
const MAX_SLIDER_VAL = 1;
const SPARKLINE_MAX_HEIGHT = 24;

export interface FlyoverControlsProps {
  isPlaying: boolean;
  progress: number;
  speedMultiplier: number;
  elevationProfile?: readonly number[];
  onTogglePlay: () => void;
  onRestart: () => void;
  onSeek: (targetProgress: number) => void;
  onSetSpeed: (multiplier: number) => void;
  onSlidingStart?: () => void;
  onSlidingComplete?: (targetProgress: number) => void;
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 18,
      backgroundColor:
        theme.scheme === 'dark' ? 'rgba(24, 24, 27, 0.94)' : 'rgba(255, 255, 255, 0.96)',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6
    },
    sparklineRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: SPARKLINE_MAX_HEIGHT,
      paddingHorizontal: 10,
      marginBottom: 2,
      gap: 2
    },
    sparklineBarTouch: {
      flex: 1,
      height: SPARKLINE_MAX_HEIGHT,
      justifyContent: 'flex-end'
    },
    sparklineBar: {
      width: '100%',
      borderRadius: 2
    },
    sliderRow: {
      width: '100%',
      marginBottom: 8
    },
    slider: {
      width: '100%',
      height: 36
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    playbackButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12
    },
    circleButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3
    },
    secondaryButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center'
    },
    speedPillsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6
    },
    speedPill: {
      paddingVertical: 6,
      paddingHorizontal: 9,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: 'transparent'
    },
    speedPillActive: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary
    },
    speedPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textMuted
    },
    speedPillTextActive: {
      color: theme.primary,
      fontWeight: '700'
    }
  });

interface SparklineBarDescriptor {
  id: string;
  slotIndex: number;
  progress: number;
  barHeight: number;
}

function buildSparklineBars(
  elevationProfile: readonly number[] | undefined
): SparklineBarDescriptor[] {
  if (!elevationProfile || elevationProfile.length <= 1) {
    return [];
  }
  const lastIdx = elevationProfile.length - 1;
  const bars: SparklineBarDescriptor[] = [];
  for (let slotIndex = 0; slotIndex < elevationProfile.length; slotIndex++) {
    const normHeight = elevationProfile[slotIndex];
    const barProgress = slotIndex / lastIdx;
    bars.push({
      id: `elev-slot-${slotIndex}-${normHeight.toFixed(3)}`,
      slotIndex,
      progress: barProgress,
      barHeight: Math.max(4, Math.round(normHeight * SPARKLINE_MAX_HEIGHT))
    });
  }
  return bars;
}

export default function FlyoverControls({
  isPlaying,
  progress,
  speedMultiplier,
  elevationProfile,
  onTogglePlay,
  onRestart,
  onSeek,
  onSetSpeed,
  onSlidingStart,
  onSlidingComplete
}: Readonly<FlyoverControlsProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const sparklineBars = useMemo(() => buildSparklineBars(elevationProfile), [elevationProfile]);

  return (
    <View
      style={styles.container}
      accessibilityRole="toolbar"
      accessibilityLabel="Flyover playback controls"
    >
      {sparklineBars.length > 0 ? (
        <View
          testID="flyover-elevation-sparkline"
          style={styles.sparklineRow}
          accessibilityLabel="Elevation profile scrubber"
        >
          {sparklineBars.map(bar => {
            const isReached = bar.progress <= progress + 0.005;
            return (
              <Pressable
                key={bar.id}
                testID={`flyover-elevation-bar-${bar.slotIndex}`}
                style={styles.sparklineBarTouch}
                onPress={() => {
                  onSeek(bar.progress);
                  onSlidingComplete?.(bar.progress);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Seek to ${Math.round(bar.progress * 100)}% distance`}
              >
                <View
                  style={[
                    styles.sparklineBar,
                    {
                      height: bar.barHeight,
                      backgroundColor: isReached ? theme.primary : theme.border,
                      opacity: isReached ? 0.9 : 0.45
                    }
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.sliderRow}>
        <Slider
          style={styles.slider}
          minimumValue={MIN_SLIDER_VAL}
          maximumValue={MAX_SLIDER_VAL}
          step={SLIDER_STEP}
          value={progress}
          minimumTrackTintColor={theme.primary}
          maximumTrackTintColor={theme.surfaceMuted}
          thumbTintColor={theme.primary}
          onSlidingStart={onSlidingStart}
          onValueChange={onSeek}
          onSlidingComplete={onSlidingComplete}
          accessibilityLabel="Route progress scrubber"
        />
      </View>

      <View style={styles.actionsRow}>
        <View style={styles.playbackButtons}>
          <TouchableOpacity
            style={styles.circleButton}
            onPress={onTogglePlay}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause playback' : 'Play flyover'}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={theme.onPrimary}
              style={isPlaying ? undefined : { marginLeft: 2 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onRestart}
            accessibilityRole="button"
            accessibilityLabel="Restart flyover from beginning"
          >
            <Ionicons name="reload" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>

        <View
          style={styles.speedPillsContainer}
          accessibilityRole="radiogroup"
          accessibilityLabel="Playback speed"
        >
          {SPEED_OPTIONS.map(speed => {
            const isActive = speedMultiplier === speed;
            return (
              <TouchableOpacity
                key={speed}
                style={[styles.speedPill, isActive ? styles.speedPillActive : null]}
                onPress={() => onSetSpeed(speed)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${speed} times speed`}
              >
                <Text style={[styles.speedPillText, isActive ? styles.speedPillTextActive : null]}>
                  {speed}x
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
