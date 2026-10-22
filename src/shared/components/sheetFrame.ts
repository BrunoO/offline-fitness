import { ResolvedTheme } from '@/theme';
import { Platform, StyleSheet } from 'react-native';

export interface SheetFrameOptions {
  /** Card height cap, e.g. '88%'. Kept per-sheet so visuals never change. */
  maxHeight: `${number}%`;
  /** Header bottom padding — the only other value the sheets disagree on. */
  headerPaddingBottom: number;
}

/**
 * Shared centered-modal frame (backdrop, card, header, title, scroll
 * padding) for `SettingsModal` and `ManualActivitySheet`. The two values the
 * sheets disagree on stay parameters, so extracting the ~40-line style block
 * changes no pixel. (`DayActivitiesSheet` is a bottom sheet with its own
 * frame and stays separate.)
 */
export function createSheetFrameStyles(theme: ResolvedTheme, options: SheetFrameOptions) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: options.maxHeight,
      backgroundColor: theme.surface,
      borderRadius: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4
        },
        android: { elevation: 5 },
        web: { boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }
      })
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: options.headerPaddingBottom
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.primary,
      textAlign: 'center'
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 12
    }
  });
}
