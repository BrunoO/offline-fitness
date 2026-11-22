import { StyleSheet } from 'react-native';
import { useTheme } from '@/theme';

export const createActivityEditModalStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16
    },
    modalContainer: {
      width: '100%',
      maxHeight: '92%',
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden'
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text
    },
    headerCloseButton: {
      padding: 6
    },
    tabsRow: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceMuted,
      padding: 4,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      borderRadius: 8
    },
    tabButton: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6
    },
    tabButtonActive: {
      backgroundColor: theme.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2
    },
    tabButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.textMuted
    },
    tabButtonTextActive: {
      fontWeight: '700',
      color: theme.text
    },
    contentScroll: {
      paddingHorizontal: 16,
      paddingBottom: 16
    },
    fieldGroup: {
      marginTop: 12
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted,
      marginBottom: 6
    },
    textInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 15,
      color: theme.text,
      backgroundColor: theme.surface
    },
    chipsScroll: {
      flexDirection: 'row',
      paddingVertical: 4
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      marginRight: 8
    },
    chipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary
    },
    chipText: {
      fontSize: 13,
      color: theme.text,
      fontWeight: '500'
    },
    chipTextActive: {
      color: theme.onPrimary,
      fontWeight: '700'
    },
    customTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8
    },
    customTypeInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
      fontSize: 14,
      color: theme.text,
      marginRight: 8
    },
    customTypeAddButton: {
      backgroundColor: theme.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8
    },
    customTypeAddButtonText: {
      color: theme.onPrimary,
      fontWeight: '600',
      fontSize: 13
    },
    inlineFieldsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12
    },
    inlineFieldItem: {
      flex: 1
    },
    mapContainer: {
      width: '100%',
      aspectRatio: 4 / 3,
      borderRadius: 10,
      overflow: 'hidden',
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.border
    },
    handleSelectorRow: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceMuted,
      padding: 4,
      borderRadius: 8,
      marginTop: 12
    },
    handleButton: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6
    },
    handleButtonActive: {
      backgroundColor: theme.primary
    },
    handleButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text
    },
    handleButtonTextActive: {
      color: theme.onPrimary,
      fontWeight: '700'
    },
    telemetryCard: {
      marginTop: 10,
      padding: 10,
      backgroundColor: theme.surfaceMuted,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border
    },
    telemetryTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textMuted,
      marginBottom: 6
    },
    telemetryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12
    },
    telemetryItem: {
      minWidth: 80
    },
    telemetryLabel: {
      fontSize: 11,
      color: theme.textMuted
    },
    telemetryValue: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text
    },
    sliderContainer: {
      marginTop: 12
    },
    slider: {
      width: '100%',
      height: 40
    },
    steppersRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4
    },
    stepperButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.surfaceMuted,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border
    },
    stepperButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text
    },
    stepperResetButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6
    },
    stepperResetButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.primary
    },
    previewCard: {
      marginTop: 14,
      padding: 12,
      backgroundColor: theme.surfaceMuted,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border
    },
    previewTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 8
    },
    previewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 3
    },
    previewLabel: {
      fontSize: 13,
      color: theme.textMuted
    },
    previewValuesContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6
    },
    previewOldText: {
      fontSize: 13,
      color: theme.textMuted,
      textDecorationLine: 'line-through'
    },
    previewArrow: {
      fontSize: 12,
      color: theme.textMuted
    },
    previewNewText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text
    },
    errorText: {
      color: theme.danger,
      fontSize: 12,
      marginTop: 8
    },
    footerButtonsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.surface
    },
    cancelButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text
    },
    saveButton: {
      backgroundColor: theme.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8
    },
    saveButtonDisabled: {
      opacity: 0.5
    },
    saveButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.onPrimary
    }
  });
