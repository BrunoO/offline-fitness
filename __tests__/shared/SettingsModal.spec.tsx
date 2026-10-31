import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SettingsModal } from '@/shared/components/SettingsModal';

jest.mock('@/theme', () => {
  const dummyTheme = {
    background: '#FFFFFF',
    surface: '#F8F9FA',
    surfaceSunken: '#F1F3F5',
    text: '#212529',
    textSecondary: '#6C757D',
    border: '#DEE2E6',
    primary: '#0D6EFD',
    onPrimary: '#FFFFFF',
    danger: '#DC3545',
    onDanger: '#FFFFFF'
  };
  return {
    useTheme: () => dummyTheme,
    PalettePicker: () => null
  };
});

jest.mock('@/features/backup', () => ({
  BackupSection: () => null
}));

const mockSetTotalActivitiesStored = jest.fn();
const mockSetGlobalActivities = jest.fn();
let mockTotalActivities = 5;

jest.mock('@/features/activities', () => ({
  useActivitiesContext: () => ({
    totalActivitiesStored: mockTotalActivities,
    setTotalActivitiesStored: mockSetTotalActivitiesStored,
    setGlobalActivities: mockSetGlobalActivities
  })
}));

const mockRemoveAllActivities = jest.fn().mockResolvedValue(undefined);
const mockGetAllActivitiesKeys = jest.fn().mockResolvedValue([]);

jest.mock('@/shared', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SheetFooter: ({ buttons }: { buttons: Array<{ label: string; onPress: () => void }> }) => (
      <View testID="sheet-footer">
        {buttons.map(b => (
          <View key={b.label} testID={`sheet-btn-${b.label}`} />
        ))}
      </View>
    ),
    createSheetFrameStyles: () => ({
      modalOverlay: {},
      backdropPressable: {},
      sheetContent: {},
      sheetHeader: {},
      sheetTitle: {},
      closeButton: {},
      sheetScroll: {},
      sheetScrollContent: {}
    }),
    getAllActivitiesKeys: () => mockGetAllActivitiesKeys(),
    removeAllActivities: () => mockRemoveAllActivities(),
    simpleLogger: {
      log: jest.fn(),
      error: jest.fn(),
      info: jest.fn()
    }
  };
});

jest.mock('@/features/recording/services/gpsTracker', () => ({
  GpsTracker: {
    isIgnoringBatteryOptimizations: jest.fn().mockResolvedValue(true),
    openBatteryOptimizationSettings: jest.fn(),
    hasExactAlarmPermission: jest.fn().mockResolvedValue(true),
    openExactAlarmSettings: jest.fn()
  }
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

describe('SettingsModal Danger Zone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTotalActivities = 5;
    jest.spyOn(Alert, 'alert');
  });

  it('renders Danger Zone section with local activities count', () => {
    const { getByText } = render(<SettingsModal visible={true} onClose={jest.fn()} />);

    expect(getByText('Danger Zone')).toBeTruthy();
    expect(getByText('Activities stored locally')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
    expect(getByText('Clear local activities')).toBeTruthy();
  });

  it('confirms and clears local activities successfully', async () => {
    const { getByLabelText } = render(<SettingsModal visible={true} onClose={jest.fn()} />);

    const clearBtn = getByLabelText('Clear local activities');
    fireEvent.press(clearBtn);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Clear Local Activities',
      expect.stringContaining('This deletes all activity records'),
      expect.any(Array)
    );

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const deleteButton = alertButtons.find((btn: { text: string }) => btn.text === 'Delete');
    expect(deleteButton).toBeDefined();

    // Trigger confirmation delete action
    await act(async () => {
      await deleteButton.onPress();
    });

    expect(mockRemoveAllActivities).toHaveBeenCalledTimes(1);
    expect(mockGetAllActivitiesKeys).toHaveBeenCalledTimes(1);
    expect(mockSetTotalActivitiesStored).toHaveBeenCalledWith(0);
    expect(mockSetGlobalActivities).toHaveBeenCalledWith([]);
  });

  it('disables the clear button when no activities are stored', () => {
    mockTotalActivities = 0;
    const { getByLabelText } = render(<SettingsModal visible={true} onClose={jest.fn()} />);

    const clearBtn = getByLabelText('Clear local activities');
    expect(clearBtn.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(clearBtn);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
