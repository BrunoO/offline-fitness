import { useActivitiesContext } from '@/features/activities';
import { ResolvedTheme, useTheme } from '@/theme';
import { IconButton, StatsTabParamList, StatsTabScreenProps } from '@/shared';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CodeEditor, { CodeEditorSyntaxStyles } from '@rivascva/react-native-code-editor';
import React, { JSX, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { validateGoal } from '../services/GoalService';
import { useSettings } from '../StatsTabSettingsContext';
import { RecentMonthsScreen } from './RecentMonthsScreen';
import { RecentWeeksScreen } from './RecentWeeksScreen';
import { RecentYearsScreen } from './RecentYearsScreen';

type IoniconName = keyof typeof Ionicons.glyphMap;

const Tab = createBottomTabNavigator<StatsTabParamList>();

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: theme.scrim,
      paddingHorizontal: 16
    },
    modalContainer: {
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 0,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16
        },
        android: {
          elevation: 16
        },
        web: {
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
        }
      }),
      maxHeight: '95%',
      minHeight: '85%',
      width: '100%'
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    modalTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.textStrong,
      letterSpacing: -0.5
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceSunken,
      justifyContent: 'center',
      alignItems: 'center'
    },
    modalContent: {
      paddingHorizontal: 24,
      paddingVertical: 20,
      flex: 1
    },
    settingSection: {
      marginBottom: 28
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8
    },
    settingValue: {
      fontSize: 14,
      color: theme.textMuted,
      marginBottom: 12
    },
    sliderContainer: {
      width: '100%',
      height: 40,
      marginBottom: 8
    },
    toggleContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      marginBottom: 8
    },
    toggleLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.text,
      flex: 1
    },
    toggleStatus: {
      fontSize: 14,
      color: theme.textMuted,
      marginRight: 12
    },
    codeEditorContainer: {
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      overflow: 'hidden'
    },
    codeEditorLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 12
    },
    validationContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12
    },
    validationBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1
    },
    validationBadgeValid: {
      backgroundColor: theme.successSoft,
      borderColor: theme.success
    },
    validationBadgeInvalid: {
      backgroundColor: theme.dangerSoft,
      borderColor: theme.danger
    },
    validationText: {
      fontSize: 12,
      fontWeight: '600',
      marginLeft: 6
    },
    validationTextValid: {
      color: theme.success
    },
    validationTextInvalid: {
      color: theme.danger
    },
    validateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.primary,
      borderRadius: 8
    },
    validateButtonText: {
      color: theme.onPrimary,
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 6
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      paddingHorizontal: 24,
      paddingBottom: 24,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      minWidth: 100,
      justifyContent: 'center'
    },
    saveButton: {
      backgroundColor: theme.success
    },
    cancelButton: {
      backgroundColor: theme.surfaceSunken,
      borderWidth: 1,
      borderColor: theme.border
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8
    },
    saveButtonText: {
      color: theme.onPrimary
    },
    cancelButtonText: {
      color: theme.text
    }
  });

/**
 * The stats tab of the app.
 * @param navigation The navigation object.
 * @returns A React component.
 */
/** Valid/invalid badge shown after an explicit validation of the goal. */
function ValidationBadge({
  status
}: Readonly<{ status: 'valid' | 'invalid' | null }>): JSX.Element | null {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (status === null) return null;
  const isValid = status === 'valid';
  return (
    <View
      style={[
        styles.validationBadge,
        isValid ? styles.validationBadgeValid : styles.validationBadgeInvalid
      ]}
    >
      <Ionicons
        name={isValid ? 'checkmark-circle' : 'alert-circle'}
        size={16}
        color={isValid ? theme.success : theme.danger}
      />
      <Text
        style={[
          styles.validationText,
          isValid ? styles.validationTextValid : styles.validationTextInvalid
        ]}
      >
        {isValid ? 'Valid' : 'Invalid'}
      </Text>
    </View>
  );
}

/** Label, status text and Switch for one staged boolean setting. */
function SettingToggle({
  label,
  value,
  onChange
}: Readonly<{
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}>): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.settingSection}>
      <View style={styles.toggleContainer}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleStatus}>{value ? 'Enabled' : 'Disabled'}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor={value ? theme.onPrimary : theme.surfaceSunken}
        />
      </View>
    </View>
  );
}

const SettingsModal = ({
  isSettingsVisible,
  setIsSettingsVisible
}: {
  isSettingsVisible: boolean;
  setIsSettingsVisible: (visible: boolean) => void;
}) => {
  const theme = useTheme();
  const isDark = theme.scheme === 'dark';
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    numberRecentWeeks,
    numberRecentMonths,
    useElapsedTime,
    mergeSimilarActivities,
    weeklyGoal,
    setMergeSimilarActivities,
    setNumberRecentWeeks,
    setNumberRecentMonths,
    setUseElapsedTime,
    setWeeklyGoal
  } = useSettings();

  const [tempNumberRecentWeeks, setTempNumberRecentWeeks] = useState(numberRecentWeeks);
  const [tempNumberRecentMonths, setTempNumberRecentMonths] = useState(numberRecentMonths);
  const [tempUseElapsedTime, setTempUseElapsedTime] = useState(useElapsedTime);
  const [tempMergeSimilarActivities, setTempMergeSimilarActivities] =
    useState(mergeSimilarActivities);
  const [tempWeeklyGoal, setTempWeeklyGoal] = useState(weeklyGoal);
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid' | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    if (isSettingsVisible) {
      setTempNumberRecentWeeks(numberRecentWeeks);
      setTempNumberRecentMonths(numberRecentMonths);
      setTempUseElapsedTime(useElapsedTime);
      setTempMergeSimilarActivities(mergeSimilarActivities);
      setTempWeeklyGoal(weeklyGoal);
    }
  }, [
    isSettingsVisible,
    numberRecentWeeks,
    numberRecentMonths,
    useElapsedTime,
    mergeSimilarActivities,
    weeklyGoal
  ]);

  useEffect(() => {
    setValidationStatus(null);
  }, [tempWeeklyGoal]);

  // Force remount when theme changes or modal opens to fix React 19 rendering issues
  useEffect(() => {
    // Delay slightly to ensure proper rendering
    const timer = setTimeout(() => {
      setEditorKey(prev => prev + 1);
    }, 50);
    return () => clearTimeout(timer);
  }, [isDark]);

  const editorStyle = useMemo(
    () => ({
      height: 120,
      fontSize: 14,
      inputLineHeight: 18,
      highlighterLineHeight: 18,
      backgroundColor: theme.surfaceMuted,
      // In React 19, transparent input doesn't work properly, use visible text color as fallback
      inputColor: isDark ? theme.textMuted : 'rgba(0,0,0,0)'
    }),
    [isDark, theme]
  );

  const syntaxStyle = useMemo(
    () => (isDark ? CodeEditorSyntaxStyles.atomOneDark : CodeEditorSyntaxStyles.atomOneLight),
    [isDark]
  );

  const onValidate = () => {
    const errorMessage = validateGoal(tempWeeklyGoal);
    setValidationStatus(errorMessage === null ? 'valid' : 'invalid');
  };

  const handleSave = () => {
    const errorMessage = validateGoal(tempWeeklyGoal);
    if (errorMessage === null) {
      setNumberRecentWeeks(tempNumberRecentWeeks);
      setNumberRecentMonths(tempNumberRecentMonths);
      setUseElapsedTime(tempUseElapsedTime);
      setMergeSimilarActivities(tempMergeSimilarActivities);
      setWeeklyGoal(tempWeeklyGoal);
      setIsSettingsVisible(false);
    } else {
      Alert.alert(
        'Error',
        `The expression is invalid:\n${errorMessage}\n\nPlease fix it before saving.`
      );
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isSettingsVisible}
      onRequestClose={() => setIsSettingsVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Settings</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsSettingsVisible(false)}
            >
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Number of Recent Weeks */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Number of Recent Weeks</Text>
              <Text style={styles.settingValue}>{tempNumberRecentWeeks} weeks</Text>
              <View style={styles.sliderContainer}>
                <Slider
                  style={{ flex: 1 }}
                  minimumValue={1}
                  maximumValue={52}
                  step={1}
                  value={tempNumberRecentWeeks}
                  onValueChange={(value: number) => setTempNumberRecentWeeks(value)}
                  minimumTrackTintColor={theme.primary}
                  maximumTrackTintColor={theme.border}
                />
              </View>
            </View>

            {/* Number of Recent Months */}
            <View style={styles.settingSection}>
              <Text style={styles.settingLabel}>Number of Recent Months</Text>
              <Text style={styles.settingValue}>{tempNumberRecentMonths} months</Text>
              <View style={styles.sliderContainer}>
                <Slider
                  style={{ flex: 1 }}
                  minimumValue={1}
                  maximumValue={36}
                  step={1}
                  value={tempNumberRecentMonths}
                  onValueChange={(value: number) => setTempNumberRecentMonths(value)}
                  minimumTrackTintColor={theme.primary}
                  maximumTrackTintColor={theme.border}
                />
              </View>
            </View>

            {/* Use Elapsed Time Toggle */}
            <SettingToggle
              label="Use Elapsed Time"
              value={tempUseElapsedTime}
              onChange={setTempUseElapsedTime}
            />

            {/* Merge Similar Activities Toggle */}
            <SettingToggle
              label="Merge Similar Activities"
              value={tempMergeSimilarActivities}
              onChange={setTempMergeSimilarActivities}
            />

            {/* Appearance moved to the app's Settings (drawer → Settings): the
                palette is app-wide, and it applied straight away inside this
                modal's staged Save/Cancel controls, so Cancel silently did not
                revert it. */}

            {/* Weekly Goal */}
            <View style={styles.settingSection}>
              <View style={styles.codeEditorContainer}>
                <Text style={styles.codeEditorLabel}>Weekly Goal Expression</Text>
                <View
                  style={{
                    backgroundColor: theme.surfaceMuted,
                    borderRadius: 8,
                    overflow: 'hidden',
                    minHeight: 120,
                    flex: 1
                  }}
                >
                  <View style={{ flex: 1 }} key={`editor-wrapper-${editorKey}`}>
                    <CodeEditor
                      key={`code-editor-${isDark ? 'dark' : 'light'}-${editorKey}`}
                      style={editorStyle}
                      language="javascript"
                      syntaxStyle={syntaxStyle}
                      onChange={setTempWeeklyGoal}
                      initialValue={tempWeeklyGoal}
                    />
                  </View>
                </View>
                <View style={styles.validationContainer}>
                  <ValidationBadge status={validationStatus} />
                  <TouchableOpacity style={styles.validateButton} onPress={onValidate}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={theme.onPrimary} />
                    <Text style={styles.validateButtonText}>Validate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => setIsSettingsVisible(false)}
            >
              <Ionicons name="close-circle-outline" size={18} color={theme.text} />
              <Text style={[styles.actionButtonText, styles.cancelButtonText]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={handleSave}>
              <Ionicons name="save-outline" size={18} color={theme.onPrimary} />
              <Text style={[styles.actionButtonText, styles.saveButtonText]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export function StatsTab({ navigation }: Readonly<Partial<StatsTabScreenProps>>): JSX.Element {
  useActivitiesContext();
  const [isSettingsVisible, setIsSettingsVisible] = React.useState(false);

  React.useLayoutEffect(() => {
    navigation?.setOptions({
      // NOSONAR - React Navigation render prop must close over isSettingsVisible
      headerRight: () => (
        <View style={{ marginRight: 10 }}>
          <IconButton icon="settings" onPress={() => setIsSettingsVisible(true)} />
        </View>
      )
    });
  }, [navigation]);

  return (
    <View style={{ flex: 1 }}>
      <SettingsModal
        isSettingsVisible={isSettingsVisible}
        setIsSettingsVisible={setIsSettingsVisible}
      />
      <Tab.Navigator>
        <Tab.Screen
          name="RecentWeeksScreen"
          component={RecentWeeksScreen}
          options={getTabOptions('Last weeks', 'bar-chart-outline')}
        />
        <Tab.Screen
          name="RecentMonthsScreen"
          component={RecentMonthsScreen}
          options={getTabOptions('Last months', 'trending-up-outline')}
        />
        <Tab.Screen
          name="RecentYearsScreen"
          component={RecentYearsScreen}
          options={getTabOptions('Last years', 'calculator-outline')}
        />
      </Tab.Navigator>
    </View>
  );
}

/**
 * Gets the options for a tab in the stats tab navigator.
 * @param label The label for the tab.
 * @param iconName The name of the icon for the tab.
 * @returns The options for the tab.
 */
function getTabOptions(label: string, iconName: IoniconName) {
  return {
    headerShown: false,
    tabBarLabel: label,
    // The tint comes from the navigation theme, which follows the active palette.
    tabBarIcon: (tabInfo: { focused: boolean; color: string; size: number }) => (
      <Ionicons name={iconName} size={tabInfo.size} color={tabInfo.color} />
    )
  };
}
