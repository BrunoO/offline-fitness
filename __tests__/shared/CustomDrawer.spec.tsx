import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CustomDrawerContent } from '@/shared/components/CustomDrawer';

const mockOpenRecordChooser = jest.fn();
jest.mock('@/features/activities', () => ({
  useManualEntry: () => ({
    openRecordChooser: mockOpenRecordChooser
  })
}));

const mockExportData = jest.fn().mockImplementation(async () => {});
jest.mock('@/shared', () => ({
  exportData: (cb: (progress: number) => void) => mockExportData(cb),
  simpleLogger: {
    log: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('@/features/stats', () => ({
  ProgressOverlay: () => null
}));

// Mock @react-navigation/drawer
jest.mock('@react-navigation/drawer', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    DrawerContentScrollView: ({ children }: { children: React.ReactNode }) => (
      <View testID="drawer-scroll-view">{children}</View>
    ),
    DrawerItemList: () => <View testID="drawer-item-list" />,
    DrawerItem: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <TouchableOpacity testID={`drawer-item-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </TouchableOpacity>
    )
  };
});

describe('CustomDrawerContent', () => {
  const mockNavigation = {
    closeDrawer: jest.fn(),
    navigate: jest.fn()
  } as unknown as Parameters<typeof CustomDrawerContent>[0]['navigation'];

  const mockOnOpenSettings = jest.fn();

  const defaultProps = {
    state: {} as any,
    navigation: mockNavigation,
    descriptors: {} as any,
    onOpenSettings: mockOnOpenSettings
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders standard navigation items and omits retired anti-pattern items', () => {
    const { getByText, queryByText } = render(<CustomDrawerContent {...defaultProps} />);

    // Expected items
    expect(getByText('Add activity')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Profile')).toBeTruthy();
    expect(getByText('Export Data')).toBeTruthy();

    // Anti-patterns that were removed
    expect(queryByText('Close drawer')).toBeNull();
    expect(queryByText('Close App')).toBeNull();
    expect(queryByText('Clear Local Activities')).toBeNull();
  });

  it('handles "Add activity" press', () => {
    const { getByText } = render(<CustomDrawerContent {...defaultProps} />);
    fireEvent.press(getByText('Add activity'));

    expect(mockNavigation.closeDrawer).toHaveBeenCalled();
    expect(mockOpenRecordChooser).toHaveBeenCalled();
  });

  it('handles "Settings" press', () => {
    const { getByText } = render(<CustomDrawerContent {...defaultProps} />);
    fireEvent.press(getByText('Settings'));

    expect(mockNavigation.closeDrawer).toHaveBeenCalled();
    expect(mockOnOpenSettings).toHaveBeenCalled();
  });

  it('handles "Profile" press', () => {
    const { getByText } = render(<CustomDrawerContent {...defaultProps} />);
    fireEvent.press(getByText('Profile'));

    expect(mockNavigation.closeDrawer).toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Profile');
  });

  it('handles "Export Data" press', async () => {
    const { getByText } = render(<CustomDrawerContent {...defaultProps} />);
    fireEvent.press(getByText('Export Data'));

    expect(mockNavigation.closeDrawer).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockExportData).toHaveBeenCalled();
    });
  });
});
