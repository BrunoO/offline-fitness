import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('react-native-worklets', () => ({}));
jest.mock('react-native-reanimated', () => ({
  configureReanimatedLogger: jest.fn(),
  ReanimatedLogLevel: { warn: 'warn' }
}));

const mockAsyncStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockAsyncStorage[key] ?? null)),
  setItem: jest.fn((key: string, val: string) => {
    mockAsyncStorage[key] = val;
    return Promise.resolve();
  })
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: ({ data, renderItem, keyExtractor, ListEmptyComponent }: any) => (
      <View testID="mock-flash-list">
        {data.length === 0 && ListEmptyComponent ? ListEmptyComponent : null}
        {data.map((item: any, index: number) => (
          <View key={keyExtractor ? keyExtractor(item) : index}>
            {renderItem({ item, index })}
          </View>
        ))}
      </View>
    )
  };
});

import { DetailsScreen } from '@/features/activities/screens/DetailsScreen';
import { makeTestActivity } from '../helpers/testActivities';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/theme', () => ({
  useTheme: () => ({
    background: '#FFFFFF',
    surface: '#F8F9FA',
    surfaceSunken: '#F1F3F5',
    text: '#212529',
    textMuted: '#6C757D',
    border: '#DEE2E6',
    primary: '#0D6EFD',
    primarySoft: '#E7F1FF',
    onPrimary: '#FFFFFF',
    danger: '#DC3545'
  })
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  MaterialCommunityIcons: 'MaterialCommunityIcons'
}));

const mockDeleteActivity = jest.fn();
const mockUpdateActivity = jest.fn();
const mockRefreshActivities = jest.fn();
let mockActivities = [
  makeTestActivity({ id: 'act-1', name: 'Morning Jog', type: 'Run' }),
  makeTestActivity({ id: 'act-2', name: 'Lunch Ride', type: 'Ride' })
];

jest.mock('@/features/activities/ActivitiesContext', () => ({
  useActivitiesContext: () => ({
    globalActivities: mockActivities,
    deleteActivity: mockDeleteActivity,
    updateActivity: mockUpdateActivity,
    refreshActivities: mockRefreshActivities,
    fetchingData: false
  })
}));

jest.mock('@/features/activities/ManualEntryContext', () => ({
  useManualEntry: () => ({
    openRecordChooser: jest.fn()
  })
}));

const mockDeleteStreamFiles = jest.fn();
jest.mock('@/features/activities/services/fetchAndStoreStreams', () => ({
  deleteStreamFiles: (id: string) => mockDeleteStreamFiles(id),
  getNoStreamIds: jest.fn().mockResolvedValue(new Set())
}));

jest.mock('@/features/activities/components/ActivityAnalysisView', () => ({
  ActivityAnalysisView: () => null
}));

// Pass through ActivityListItem or render a simplified testable row
jest.mock('@/features/activities/components/ActivityListItem', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    ActivityListItem: ({
      activity,
      deleteActivity,
      editActivity
    }: {
      activity: any;
      deleteActivity: (a: any) => void;
      editActivity: (a: any) => void;
    }) => (
      <View testID={`activity-row-${activity.id}`}>
        <Text>{activity.name}</Text>
        <TouchableOpacity
          testID={`delete-btn-${activity.id}`}
          accessibilityLabel={`Delete ${activity.name}`}
          onPress={() => deleteActivity(activity)}
        >
          <Text>Delete</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID={`edit-btn-${activity.id}`}
          accessibilityLabel={`Edit ${activity.name}`}
          onPress={() => editActivity(activity)}
        >
          <Text>Edit</Text>
        </TouchableOpacity>
      </View>
    )
  };
});

describe('DetailsScreen', () => {
  const mockNavigation = {
    setOptions: jest.fn(),
    setParams: jest.fn()
  };
  const mockRoute = {
    params: undefined
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockAsyncStorage).forEach(k => delete mockAsyncStorage[k]);
    mockActivities = [
      makeTestActivity({ id: 'act-1', name: 'Morning Jog', type: 'Run' }),
      makeTestActivity({ id: 'act-2', name: 'Lunch Ride', type: 'Ride' })
    ];
    jest.spyOn(Alert, 'alert');
  });

  const renderScreen = async () => {
    const rendered = render(<DetailsScreen navigation={mockNavigation as any} route={mockRoute as any} />);
    await act(async () => {
      await Promise.resolve();
    });
    return rendered;
  };

  describe('Deletion Confirmation', () => {
    it('prompts confirmation Alert when delete is triggered and does not delete on Cancel', async () => {
      const { getByTestId } = await renderScreen();

      const deleteBtn = getByTestId('delete-btn-act-1');
      fireEvent.press(deleteBtn);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Activity?',
        'Are you sure you want to delete "Morning Jog"? This action cannot be undone.',
        expect.any(Array)
      );

      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const cancelButton = alertButtons.find((btn: { text: string }) => btn.text === 'Cancel');
      expect(cancelButton).toBeDefined();

      // Trigger Cancel
      if (cancelButton.onPress) {
        cancelButton.onPress();
      }

      expect(mockDeleteActivity).not.toHaveBeenCalled();
      expect(mockDeleteStreamFiles).not.toHaveBeenCalled();
    });

    it('executes deletion and purges stream files when confirmed in Alert', async () => {
      const { getByTestId } = await renderScreen();

      const deleteBtn = getByTestId('delete-btn-act-1');
      fireEvent.press(deleteBtn);

      const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const confirmDeleteButton = alertButtons.find((btn: { text: string }) => btn.text === 'Delete');
      expect(confirmDeleteButton).toBeDefined();
      expect(confirmDeleteButton.style).toBe('destructive');

      // Trigger Delete
      act(() => {
        confirmDeleteButton.onPress();
      });

      expect(mockDeleteActivity).toHaveBeenCalledWith(mockActivities[0]);
      expect(mockDeleteStreamFiles).toHaveBeenCalledWith('act-1');
    });
  });

  describe('Swipe Hint Banner & Empty State', () => {
    it('displays swipe tip banner on initial load when activities exist', async () => {
      const { getByText } = await renderScreen();

      expect(getByText('Tip: Swipe left on an activity to edit or delete')).toBeTruthy();
    });

    it('dismisses swipe tip permanently when close button is pressed', async () => {
      const { getByText, getByLabelText, queryByText } = await renderScreen();

      expect(getByText('Tip: Swipe left on an activity to edit or delete')).toBeTruthy();

      const dismissBtn = getByLabelText('Dismiss swipe tip');
      fireEvent.press(dismissBtn);

      expect(queryByText('Tip: Swipe left on an activity to edit or delete')).toBeNull();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('dismissed_swipe_tip', 'true');
    });

    it('does not display swipe tip if already dismissed in storage', async () => {
      mockAsyncStorage['dismissed_swipe_tip'] = 'true';

      const { queryByText } = await renderScreen();

      expect(queryByText('Tip: Swipe left on an activity to edit or delete')).toBeNull();
    });

    it('displays empty state when no activities match the search filter', async () => {
      const { getByPlaceholderText, getByText } = await renderScreen();

      const searchInput = getByPlaceholderText('Search by name');
      fireEvent.changeText(searchInput, 'NonExistentActivity');

      expect(getByText('No activities match the current filters.')).toBeTruthy();
    });
  });

  describe('Edit Activity Modal Buttons', () => {
    it('renders styled Cancel and Save buttons with accessible labels and minimum touch targets', async () => {
      const { getByTestId, getByLabelText, getByText } = await renderScreen();

      // Open edit modal for first activity
      const editBtn = getByTestId('edit-btn-act-1');
      fireEvent.press(editBtn);

      const cancelBtn = getByLabelText('Cancel editing');
      const saveBtn = getByLabelText('Save activity changes');

      expect(cancelBtn).toBeTruthy();
      expect(saveBtn).toBeTruthy();
      expect(getByText('Cancel')).toBeTruthy();
      expect(getByText('Save')).toBeTruthy();

      // Test cancel action
      fireEvent.press(cancelBtn);
      expect(mockUpdateActivity).not.toHaveBeenCalled();

      // Re-open and test save
      fireEvent.press(editBtn);
      const reSaveBtn = getByLabelText('Save activity changes');
      await act(async () => {
        fireEvent.press(reSaveBtn);
      });

      expect(mockUpdateActivity).toHaveBeenCalledWith(
        mockActivities[0],
        expect.objectContaining({ name: 'Morning Jog' })
      );
    });
  });

  describe('Filtered View & Totals Display', () => {
    it('displays filtered view banner with month label and totals for distance, elevation, and time', async () => {
      const filteredRoute = {
        params: {
          allActivities: [
            makeTestActivity({
              id: 'oct-1',
              name: 'Oct Trail Run',
              type: 'Run',
              distance: 12500, // 12.5 km
              total_elevation_gain: 350, // 350 m
              elapsed_time: 4500, // 1h 15m
              moving_time: 4200
            }),
            makeTestActivity({
              id: 'oct-2',
              name: 'Oct Long Ride',
              type: 'Ride',
              distance: 40000, // 40.0 km
              total_elevation_gain: 650, // 650 m
              elapsed_time: 7200, // 2h
              moving_time: 7000
            })
          ],
          filterLabel: 'Oct 2024',
          useElapsedTime: true
        }
      };

      const rendered = render(
        <DetailsScreen navigation={mockNavigation as any} route={filteredRoute as any} />
      );
      await act(async () => {
        await Promise.resolve();
      });

      // Verify header title was updated
      expect(mockNavigation.setOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Oct 2024 (2)'
        })
      );

      // Verify banner label and count
      expect(rendered.getByText(/Month: Oct 2024/)).toBeTruthy();

      // Verify totals: distance 52.5 km, elevation 1,000 m, elapsed time 03:15
      expect(rendered.getByText('52.5 km')).toBeTruthy();
      expect(rendered.getByText('1,000 m')).toBeTruthy();
      expect(rendered.getByText('03:15')).toBeTruthy();

      // Verify sport breakdown displays both Ride and Run
      expect(rendered.getByText('Ride: 40.0 km')).toBeTruthy();
      expect(rendered.getByText('Run: 12.5 km')).toBeTruthy();

      // Verify clear filter button resets navigation params
      const clearBtn = rendered.getByLabelText('Reset to all activities');
      fireEvent.press(clearBtn);

      expect(mockNavigation.setParams).toHaveBeenCalledWith({
        allActivities: undefined,
        filterLabel: undefined,
        selectedActivityId: undefined
      });
    });

    it('displays merged sibling type indicator in breakdown when EBikeRide is present', async () => {
      const mergedRoute = {
        params: {
          allActivities: [
            makeTestActivity({
              id: 'e-1',
              name: 'Electric Commute',
              type: 'EBikeRide',
              distance: 25000,
              total_elevation_gain: 200,
              elapsed_time: 3600
            }),
            makeTestActivity({
              id: 'r-1',
              name: 'Road Ride',
              type: 'Ride',
              distance: 50000,
              total_elevation_gain: 600,
              elapsed_time: 7200
            })
          ],
          filterLabel: 'Sep 2024',
          useElapsedTime: true
        }
      };

      const rendered = render(
        <DetailsScreen navigation={mockNavigation as any} route={mergedRoute as any} />
      );
      await act(async () => {
        await Promise.resolve();
      });

      expect(rendered.getByText('EBikeRide (Ride): 25.0 km')).toBeTruthy();
      expect(rendered.getByText('Ride: 50.0 km')).toBeTruthy();
      expect(rendered.getByText('75.0 km')).toBeTruthy();
    });

    it('displays empty state with Show all activities button when filtered month has no activities', async () => {
      const emptyMonthRoute = {
        params: {
          allActivities: [],
          filterLabel: 'Nov 2024',
          useElapsedTime: true
        }
      };

      const rendered = render(
        <DetailsScreen navigation={mockNavigation as any} route={emptyMonthRoute as any} />
      );
      await act(async () => {
        await Promise.resolve();
      });

      expect(rendered.getByText('No activities found for Nov 2024.')).toBeTruthy();

      const showAllBtn = rendered.getByLabelText('Show all activities');
      expect(showAllBtn).toBeTruthy();

      fireEvent.press(showAllBtn);
      expect(mockNavigation.setParams).toHaveBeenCalledWith({
        allActivities: undefined,
        filterLabel: undefined,
        selectedActivityId: undefined
      });
    });
  });
});
