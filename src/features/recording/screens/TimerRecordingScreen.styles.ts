import { ResolvedTheme } from '@/theme';
import { StyleSheet } from 'react-native';

export const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      flex: 1,
      padding: 16
    },
    contentContainer: {
      paddingBottom: 16
    },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 16,
      padding: 16
    },
    cardLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 12,
      textTransform: 'uppercase'
    },
    cardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8
    },
    chip: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    chipSelected: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary
    },
    chipLabel: {
      color: theme.text,
      fontSize: 14
    },
    chipLabelSelected: {
      color: theme.primary,
      fontWeight: '600'
    },
    heroTimer: {
      color: theme.textStrong,
      fontSize: 128,
      fontWeight: '700',
      textAlign: 'center'
    },
    heroLabel: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center'
    },
    statusRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      marginBottom: 12
    },
    statusDot: {
      borderRadius: 6,
      height: 12,
      width: 12
    },
    phase: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600'
    },
    actions: {
      gap: 12
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: 10,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      paddingVertical: 12
    },
    primaryButtonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '600'
    },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      paddingVertical: 12
    },
    secondaryButtonLabel: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600'
    },
    dangerButton: {
      alignItems: 'center',
      backgroundColor: theme.danger,
      borderRadius: 10,
      flexDirection: 'row',
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      paddingVertical: 12
    },
    dangerButtonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '600'
    },
    buttonDisabled: {
      opacity: 0.5
    },
    buttonPressed: {
      opacity: 0.8
    },
    buttonPressedLight: {
      backgroundColor: theme.surfaceMuted
    },
    input: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      marginBottom: 12,
      paddingHorizontal: 12,
      paddingVertical: 12
    },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 12
    },
    summaryItem: {
      alignItems: 'center',
      flex: 1,
      minWidth: 80
    },
    summaryValue: {
      color: theme.textStrong,
      fontSize: 18,
      fontWeight: '700'
    },
    summaryLabel: {
      color: theme.textMuted,
      fontSize: 12
    },
    discardLink: {
      alignItems: 'center',
      paddingVertical: 12
    },
    discardLinkLabel: {
      color: theme.danger,
      fontSize: 14
    },
    errorCard: {
      backgroundColor: theme.surface,
      borderColor: theme.danger,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 16,
      padding: 16
    },
    error: {
      color: theme.danger,
      fontSize: 14
    },
    intervalInputRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12
    },
    intervalInput: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 12
    }
  });
