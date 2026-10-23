import { ResolvedTheme } from '@/theme';
import { StyleSheet } from 'react-native';

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const RADIUS = { card: 16, pill: 24, chip: 20, button: 14 } as const;
export const METERS_PER_KILOMETER = 1000;

export const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      flex: 1
    },
    header: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.sm
    },
    title: {
      color: theme.textStrong,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -0.5
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: SPACING.xs
    },
    card: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.lg
    },
    cardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      marginBottom: SPACING.sm
    },
    cardLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase'
    },
    sessionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.sm
    },
    statusDot: {
      borderRadius: 6,
      height: 12,
      width: 12
    },
    phase: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '700'
    },
    recordingPulse: {
      marginLeft: SPACING.xs
    },
    cardHint: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: SPACING.xs
    },
    gpsRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      marginTop: SPACING.xs
    },
    heroStat: {
      alignItems: 'center',
      marginBottom: SPACING.md,
      marginTop: SPACING.sm
    },
    heroValue: {
      color: theme.text,
      fontVariant: ['tabular-nums'],
      fontSize: 48,
      fontWeight: '800',
      letterSpacing: -1
    },
    heroLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '500',
      marginTop: SPACING.xs,
      textTransform: 'uppercase'
    },
    tapHint: {
      color: theme.textMuted,
      fontSize: 11,
      fontStyle: 'italic',
      marginBottom: SPACING.xs
    },
    heroIconRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      justifyContent: 'center'
    },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: SPACING.sm
    },
    tile: {
      marginBottom: SPACING.md,
      width: '33.33%'
    },
    tilePressed: {
      opacity: 0.6
    },
    tileHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.xs,
      marginBottom: SPACING.xs
    },
    tileLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '500'
    },
    tileValue: {
      color: theme.text,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
      fontWeight: '600'
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: SPACING.sm
    },
    chip: {
      borderColor: theme.border,
      borderRadius: RADIUS.chip,
      borderWidth: 1,
      marginBottom: SPACING.sm,
      marginRight: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm
    },
    chipSelected: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary
    },
    chipPressed: {
      opacity: 0.7
    },
    chipLabel: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500'
    },
    chipLabelSelected: {
      color: theme.textStrong,
      fontWeight: '700'
    },
    actions: {
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.lg
    },
    actionRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.lg
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: RADIUS.button,
      flex: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      paddingVertical: SPACING.md
    },
    primaryButtonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      paddingVertical: SPACING.md
    },
    secondaryButtonLabel: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600'
    },
    dangerButton: {
      alignItems: 'center',
      backgroundColor: theme.danger,
      borderRadius: RADIUS.button,
      flex: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      paddingVertical: SPACING.md
    },
    dangerButtonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    discardLink: {
      alignItems: 'center',
      marginTop: SPACING.md,
      paddingVertical: SPACING.sm
    },
    discardLinkLabel: {
      color: theme.textMuted,
      fontSize: 14,
      textDecorationLine: 'underline'
    },
    buttonDisabled: {
      opacity: 0.5
    },
    buttonPressed: {
      opacity: 0.85
    },
    buttonPressedLight: {
      backgroundColor: theme.surfaceMuted
    },
    button: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: RADIUS.pill,
      marginTop: SPACING.sm,
      paddingVertical: SPACING.md
    },
    buttonLabel: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    input: {
      borderColor: theme.border,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      color: theme.text,
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm
    },
    profileBadge: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: theme.primarySoft,
      borderRadius: RADIUS.chip,
      flexDirection: 'row',
      gap: SPACING.xs,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs
    },
    profileBadgeLabel: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '600'
    },
    recoveryRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.sm
    },
    recoveryInfo: {
      flex: 1
    },
    recoveryTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600'
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: SPACING.md
    },
    summaryItem: {
      alignItems: 'center'
    },
    summaryValue: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700'
    },
    summaryLabel: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: SPACING.xs
    },
    errorCard: {
      alignItems: 'center',
      backgroundColor: theme.dangerSoft,
      borderColor: theme.danger,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginHorizontal: SPACING.lg,
      marginTop: SPACING.md,
      padding: SPACING.md
    },
    error: {
      color: theme.danger,
      flex: 1,
      fontSize: 14
    },
    linkButton: {
      marginTop: SPACING.xs
    },
    linkButtonLabel: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '600'
    }
  });
