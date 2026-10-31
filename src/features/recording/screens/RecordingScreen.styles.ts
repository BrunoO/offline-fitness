import { ResolvedTheme } from '@/theme';
import { StyleSheet } from 'react-native';

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
const RADIUS = { card: 16, pill: 24, chip: 20, button: 14 } as const;
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
    liveStatsHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between'
    },
    rateToggleButton: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: RADIUS.chip,
      borderWidth: 1,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs
    },
    rateToggleLabel: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600'
    },
    cardLabel: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase'
    },
    sessionHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between'
    },
    sessionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.sm
    },
    sessionLockBadge: {
      alignItems: 'center',
      backgroundColor: theme.primarySoft,
      borderColor: theme.border,
      borderRadius: RADIUS.chip,
      borderWidth: 1,
      flexDirection: 'row',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs
    },
    sessionLockBadgeLabel: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600'
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
      paddingRight: SPACING.sm,
      width: '50%'
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
      gap: SPACING.sm
    },
    lockScreenButton: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      marginTop: SPACING.sm,
      paddingVertical: SPACING.md
    },
    lockScreenButtonLabel: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600'
    },
    unlockContainer: {
      alignItems: 'center',
      width: '100%'
    },
    unlockButton: {
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      overflow: 'hidden',
      position: 'relative',
      width: '100%'
    },
    unlockProgressFill: {
      backgroundColor: theme.primarySoft,
      bottom: 0,
      left: 0,
      position: 'absolute',
      top: 0
    },
    unlockContent: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.md,
      justifyContent: 'center',
      paddingVertical: SPACING.md
    },
    unlockTextColumn: {
      alignItems: 'flex-start'
    },
    unlockButtonLabel: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700'
    },
    unlockSubtext: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '500',
      marginTop: 2
    },
    unlockHint: {
      color: theme.textMuted,
      fontSize: 13,
      fontStyle: 'italic',
      marginTop: SPACING.xs,
      textAlign: 'center'
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
      gap: SPACING.sm,
      justifyContent: 'space-between',
      marginTop: SPACING.sm
    },
    recoveryInfo: {
      flex: 1
    },
    recoveryActions: {
      flexDirection: 'row',
      gap: SPACING.xs
    },
    recoverySaveButton: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: RADIUS.button,
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm
    },
    recoveryDiscardButton: {
      alignItems: 'center',
      backgroundColor: theme.danger,
      borderRadius: RADIUS.button,
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm
    },
    recoveryTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600'
    },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: SPACING.md,
      rowGap: SPACING.md
    },
    summaryItem: {
      alignItems: 'center',
      minWidth: '30%'
    },
    summaryValue: {
      color: theme.text,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
      fontWeight: '700'
    },
    summaryLabel: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: SPACING.xs
    },
    splitsSection: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      marginTop: SPACING.md,
      paddingTop: SPACING.md
    },
    splitsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.xs,
      marginTop: SPACING.xs
    },
    splitHeaderLabel: {
      color: theme.textMuted,
      flex: 1,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase'
    },
    splitHeaderLabelRight: {
      color: theme.textMuted,
      flex: 1,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'right',
      textTransform: 'uppercase'
    },
    splitRow: {
      borderTopColor: theme.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: SPACING.xs
    },
    splitCellText: {
      color: theme.text,
      flex: 1,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      fontWeight: '500'
    },
    splitCellTextRight: {
      color: theme.text,
      flex: 1,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
      textAlign: 'right'
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
