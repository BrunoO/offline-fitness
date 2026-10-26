import { ResolvedTheme } from '@/theme';
import { Platform, StyleSheet } from 'react-native';

export const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    similarActivitiesContainer: {
      marginTop: 20,
      padding: 10,
      backgroundColor: theme.surfaceSunken,
      borderRadius: 8
    },
    similarActivityItem: {
      marginVertical: 10,
      padding: 10,
      backgroundColor: theme.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.22,
          shadowRadius: 2.22
        },
        android: {
          elevation: 3
        }
      })
    },
    similarActivityItemTrackMatch: {
      backgroundColor: theme.successSoft,
      borderColor: theme.success
    },
    similarActivityItemTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textStrong,
      marginBottom: 2
    },
    similarActivityItemText: {
      fontSize: 13,
      color: theme.text
    },
    similarActivityTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
      color: theme.textStrong
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.primarySoft,
      borderRadius: 16,
      marginLeft: 8
    },
    chipText: {
      fontSize: 12,
      color: theme.primary,
      fontWeight: '600'
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.scrim,
      justifyContent: 'flex-end'
    },
    modalCard: {
      backgroundColor: theme.surface,
      padding: 16,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8
    }
  });
