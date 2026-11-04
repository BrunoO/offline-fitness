import { ResolvedTheme } from '@/theme';
import { Platform, StyleSheet } from 'react-native';

export const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    container: {
      flex: 1
    },
    scrollView: {
      flex: 1
    },
    scrollContent: {
      paddingBottom: 32
    },
    tabBarContainer: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.surface
    },
    tabBarTrack: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 3,
      borderWidth: 1,
      borderColor: theme.border
    },
    tabButton: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9
    },
    tabButtonActive: {
      backgroundColor: theme.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2
    },
    tabLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted
    },
    tabLabelActive: {
      color: theme.onPrimary,
      fontWeight: 'bold'
    },
    chartSectionCard: {
      marginHorizontal: 12,
      marginTop: 14,
      paddingTop: 10,
      paddingBottom: 4,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden'
    },
    chartHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      marginBottom: 4
    },
    chartSectionTitle: {
      fontSize: 15,
      fontWeight: 'bold',
      color: theme.textStrong
    },
    chartSectionSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2
    },
    scrubPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12
    },
    scrubPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textStrong
    },
    heroCard: {
      marginHorizontal: 12,
      marginTop: 12,
      marginBottom: 8,
      padding: 16,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4
        },
        android: {
          elevation: 2
        }
      })
    },
    heroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12
    },
    heroIconContainer: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10
    },
    heroIcon: {
      fontSize: 20
    },
    heroHeaderText: {
      flex: 1
    },
    heroTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.textStrong
    },
    heroSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2
    },
    heroGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -6
    },
    heroMetricItem: {
      width: '50%',
      paddingHorizontal: 6,
      paddingVertical: 6
    },
    heroMetricValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.textStrong
    },
    heroMetricLabel: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2
    },
    sectionCard: {
      marginHorizontal: 12,
      marginTop: 16,
      padding: 14,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 3
        },
        android: {
          elevation: 1
        }
      })
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.textStrong,
      marginBottom: 10
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle
    },
    detailRowLast: {
      borderBottomWidth: 0
    },
    detailLabel: {
      fontSize: 13,
      color: theme.textMuted
    },
    detailValue: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.textStrong,
      maxWidth: '60%',
      textAlign: 'right'
    },
    rawToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
      marginTop: 4
    },
    rawToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.primary
    },
    rawContainer: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: theme.borderSubtle
    },
    splitsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 6,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    splitsHeaderCell: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      color: theme.textMuted
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle
    },
    splitRowLast: {
      borderBottomWidth: 0
    },
    splitKmCell: {
      width: 44,
      fontSize: 13,
      fontWeight: '600',
      color: theme.textStrong
    },
    splitPaceBarTrack: {
      flex: 1,
      height: 24,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 6,
      overflow: 'hidden',
      justifyContent: 'center',
      marginRight: 8,
      position: 'relative'
    },
    splitPaceBarFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: theme.primarySoft,
      borderRightWidth: 2,
      borderRightColor: theme.primary
    },
    splitPaceBarFillFastest: {
      backgroundColor: theme.successSoft,
      borderRightColor: theme.success
    },
    splitPaceTextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8
    },
    splitPaceText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textStrong
    },
    splitFastestBadge: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.success
    },
    splitMetaCell: {
      width: 56,
      fontSize: 12,
      fontWeight: '500',
      color: theme.text,
      textAlign: 'right'
    },
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
    similarActivityItemTrackReverseMatch: {
      backgroundColor: theme.surfaceMuted,
      borderColor: theme.chartReverse
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
