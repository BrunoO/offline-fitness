import { ResolvedTheme } from '@/theme';
import { StyleSheet } from 'react-native';

export const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    headerMeta: {
      fontSize: 13,
      color: theme.textMuted
    },
    headerMetaStale: {
      // Same size, stronger colour: the label itself already says how old the
      // backup is, this only lifts it out of the muted tier.
      fontSize: 13,
      color: theme.textStrong
    },
    section: {
      marginBottom: 24
    },
    sectionHeader: {
      marginBottom: 12
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.primary
    },
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12
    },
    sectionSubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      marginTop: 4,
      fontStyle: 'italic'
    },
    seeAllText: {
      fontSize: 14,
      color: theme.primary,
      fontWeight: '600'
    },
    statusCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 16,
      borderLeftWidth: 4,
      borderLeftColor: theme.success
    },
    errorCard: {
      borderLeftColor: theme.dangerPressed,
      backgroundColor: theme.dangerSoft
    },
    connectionText: {
      fontSize: 16,
      color: theme.text,
      fontWeight: '500'
    },
    infoCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 16
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    infoLabel: {
      fontSize: 16,
      color: theme.text,
      fontWeight: '500'
    },
    infoValueContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    infoValue: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text
    },
    actionButton: {
      padding: 8,
      borderRadius: 6,
      backgroundColor: theme.surfaceSunken
    },
    calendarContainer: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 8,
      overflow: 'hidden'
    },
    mapContainer: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 8,
      minHeight: 200
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 200
    },
    loadingText: {
      fontSize: 16,
      color: theme.textMuted,
      fontStyle: 'italic'
    },
    noDataContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 200
    },
    noDataText: {
      fontSize: 16,
      color: theme.textSubtle,
      fontStyle: 'italic'
    },
    footerCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 16,
      marginTop: 8
    },
    footerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    },
    footerText: {
      alignItems: 'center'
    },
    appTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.primary,
      marginBottom: 4
    },
    versionText: {
      fontSize: 12,
      color: theme.textMuted
    },
    errorContainer: {
      marginTop: 12,
      padding: 12,
      backgroundColor: theme.dangerSoft,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.dangerBorder
    },
    errorTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.danger,
      marginBottom: 4
    },
    errorText: {
      fontSize: 13,
      color: theme.danger,
      marginBottom: 8,
      lineHeight: 18
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.surface,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.dangerBorder
    },
    retryText: {
      fontSize: 13,
      fontWeight: '500',
      marginLeft: 4
    }
  });
