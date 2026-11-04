import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ActivityListItem } from '@/features/activities/components/ActivityListItem';
import { makeTestActivity } from '../helpers/testActivities';

jest.mock('@/theme', () => ({
  useTheme: () => ({
    background: '#FFFFFF',
    surface: '#F8F9FA',
    swipeReveal: '#E9ECEF',
    text: '#212529',
    primary: '#0D6EFD',
    primarySoft: '#E7F1FF',
    onPrimary: '#FFFFFF',
    danger: '#DC3545'
  })
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons'
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View
    },
    useSharedValue: (val: number) => ({ value: val, get: () => val }),
    useDerivedValue: (fn: () => any) => ({ value: fn() }),
    useAnimatedStyle: (fn: () => any) => fn(),
    interpolate: (_val: number, _inRange: number[], outRange: number[]) => outRange[0],
    withSpring: (val: number) => val
  };
});

// Mock ReanimatedSwipeable to render both children and right actions
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children, renderRightActions }: any, _ref: any) => (
    <View testID="mock-swipeable">
      {children}
      {renderRightActions ? renderRightActions() : null}
    </View>
  ));
});

describe('ActivityListItem', () => {
  const mockActivity = makeTestActivity({
    id: 'test-act-1',
    name: 'Morning Run',
    type: 'Run',
    distance: 10000,
    moving_time: 3600
  });

  const mockOnPress = jest.fn();
  const mockDeleteActivity = jest.fn();
  const mockEditActivity = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders activity details with distance and pace for a Run and responds to row press', () => {
    const { getByText } = render(
      <ActivityListItem
        activity={mockActivity}
        onPress={mockOnPress}
        selectedActivityId={null}
        deleteActivity={mockDeleteActivity}
        editActivity={mockEditActivity}
      />
    );

    // Row text contains distance (10.0 km) and pace (6:00 /km) for a Run
    expect(getByText(/10\.0 km/)).toBeTruthy();
    expect(getByText(/6:00 \/km/)).toBeTruthy();

    fireEvent.press(getByText(/6:00 \/km/));
    expect(mockOnPress).toHaveBeenCalledWith('test-act-1');
  });

  it('renders speed in km/h for cycling activities', () => {
    const rideActivity = makeTestActivity({
      id: 'test-ride-1',
      name: 'Morning Ride',
      type: 'Ride',
      distance: 25000,
      moving_time: 3600
    });

    const { getByText } = render(
      <ActivityListItem
        activity={rideActivity}
        onPress={mockOnPress}
        selectedActivityId={null}
        deleteActivity={mockDeleteActivity}
        editActivity={mockEditActivity}
      />
    );

    expect(getByText(/25\.0 km/)).toBeTruthy();
    expect(getByText(/25\.0 km\/h/)).toBeTruthy();
  });

  it('omits average speed suffix for Yoga and activities with no distance', () => {
    const yogaActivity = makeTestActivity({
      id: 'test-yoga-1',
      name: 'Evening Yoga',
      type: 'Yoga',
      distance: 0,
      moving_time: 1800,
      elapsed_time: 1800
    });

    const { getByText, queryByText } = render(
      <ActivityListItem
        activity={yogaActivity}
        onPress={mockOnPress}
        selectedActivityId={null}
        deleteActivity={mockDeleteActivity}
        editActivity={mockEditActivity}
      />
    );

    expect(getByText(/Evening Yoga \(Yoga\)/)).toBeTruthy();
    expect(queryByText(/at avg/)).toBeNull();
  });

  it('provides accessible buttons for edit and delete in swipe actions', () => {
    const { getByLabelText } = render(
      <ActivityListItem
        activity={mockActivity}
        onPress={mockOnPress}
        selectedActivityId={null}
        deleteActivity={mockDeleteActivity}
        editActivity={mockEditActivity}
      />
    );

    const editBtn = getByLabelText('Edit activity');
    const deleteBtn = getByLabelText('Delete activity');

    expect(editBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();

    fireEvent.press(editBtn);
    expect(mockEditActivity).toHaveBeenCalledWith(mockActivity);

    fireEvent.press(deleteBtn);
    expect(mockDeleteActivity).toHaveBeenCalledWith(mockActivity);
  });
});
