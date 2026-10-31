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

  it('renders activity details and responds to row press', () => {
    const { getByText } = render(
      <ActivityListItem
        activity={mockActivity}
        onPress={mockOnPress}
        selectedActivityId={null}
        deleteActivity={mockDeleteActivity}
        editActivity={mockEditActivity}
      />
    );

    // Row text contains speed and name
    expect(getByText(/10\.0 km\/h/)).toBeTruthy();

    fireEvent.press(getByText(/10\.0 km\/h/));
    expect(mockOnPress).toHaveBeenCalledWith('test-act-1');
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
