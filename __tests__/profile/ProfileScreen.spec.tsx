import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { ThemeProvider } from '@/theme';
import * as profileStorage from '@/features/profile/services/profileStorage';

jest.mock('@/features/profile/services/profileStorage', () => {
  const actual = jest.requireActual('@/features/profile/services/profileStorage');
  return {
    ...actual,
    loadUserProfile: jest.fn(),
    saveUserProfile: jest.fn()
  };
});

// Mock DateTimePicker
jest.mock('@react-native-community/datetimepicker', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ testID, onChange }: { testID?: string; onChange?: (e: unknown, d?: Date) => void }) => {
      return (
        <View
          testID={testID ?? 'date-time-picker'}
          accessibilityRole="adjustable"
          onAccessibilityAction={() => {
            onChange?.({}, new Date(2026, 2, 15));
          }}
        />
      );
    }
  };
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 }
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('ProfileScreen date and weight inputs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileStorage.loadUserProfile as jest.Mock).mockResolvedValue({
      age: 28,
      weightEntries: [
        { date: '2026-03-20', weightKg: 75.0 },
        { date: '2026-03-10', weightKg: 76.5 }
      ]
    });
    (profileStorage.saveUserProfile as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders profile loaded data and history deltas', async () => {
    const { getAllByText, findByText } = renderWithProviders(<ProfileScreen />);

    expect(await findByText('2026-03-20')).toBeTruthy();
    // 75.0 kg appears in both chart summary and history list
    expect(getAllByText('75.0 kg').length).toBeGreaterThanOrEqual(1);
    // Delta between 75.0 and 76.5 is -1.5 kg (in summary change & history item)
    expect(getAllByText('-1.5 kg').length).toBeGreaterThanOrEqual(1);
  });

  it('opens add form prefilled with latest weight and handles adjust buttons', async () => {
    const { getByText, getByLabelText, findByText } = renderWithProviders(<ProfileScreen />);

    await findByText('2026-03-20');
    const addButton = getByText('Add entry');
    fireEvent.press(addButton);

    // Form opens with latest weight prefilled: '75'
    const weightInput = getByLabelText('Weight in kilograms');
    expect(weightInput.props.value).toBe('75');

    // Press +0.5 button
    const plusHalf = getByLabelText('Increase weight by 0.5 kg');
    fireEvent.press(plusHalf);
    expect(weightInput.props.value).toBe('75.5');

    // Press -0.1 button
    const minusPointOne = getByLabelText('Decrease weight by 0.1 kg');
    fireEvent.press(minusPointOne);
    expect(weightInput.props.value).toBe('75.4');

    // Save entry
    const saveButton = getByText('Save entry');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(profileStorage.saveUserProfile).toHaveBeenCalledTimes(1);
    });
  });

  it('allows picking date via DateTimePicker and quick date chips', async () => {
    const { getByText, getByLabelText, findByText, getByTestId } = renderWithProviders(
      <ProfileScreen />
    );

    await findByText('2026-03-20');
    fireEvent.press(getByText('Add entry'));

    // Open DateTimePicker modal
    fireEvent.press(getByLabelText('Pick date'));
    const picker = getByTestId('date-time-picker');
    expect(picker).toBeTruthy();

    // Trigger mock date selection (2026-03-15)
    fireEvent(picker, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(getByText('2026-03-15')).toBeTruthy();

    // Select "Yesterday" chip
    const yesterdayChip = getByLabelText('Select yesterday');
    fireEvent.press(yesterdayChip);

    // Select "Today" chip
    const todayChip = getByLabelText('Select today');
    fireEvent.press(todayChip);
    expect(getByText(profileStorage.todayIso())).toBeTruthy();
  });

  it('allows tapping an entry to edit its date and weight', async () => {
    const { getByText, getByLabelText, findByText } = renderWithProviders(<ProfileScreen />);

    await findByText('2026-03-20');
    const editEntryButton = getByLabelText('Edit weight entry for 2026-03-20');
    fireEvent.press(editEntryButton);

    expect(getByText('Edit entry (2026-03-20)')).toBeTruthy();
    const weightInput = getByLabelText('Weight in kilograms');
    expect(weightInput.props.value).toBe('75');

    // Clearing input and adjusting falls back to initialEditWeight (75), not latest entry if different
    fireEvent.changeText(weightInput, '');
    const plusPointOne = getByLabelText('Increase weight by 0.1 kg');
    fireEvent.press(plusPointOne);
    expect(weightInput.props.value).toBe('75.1');

    fireEvent.changeText(weightInput, '74.2');
    const updateButton = getByText('Update entry');
    fireEvent.press(updateButton);

    await waitFor(() => {
      expect(profileStorage.saveUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          weightEntries: expect.arrayContaining([
            { date: '2026-03-20', weightKg: 74.2 },
            { date: '2026-03-10', weightKg: 76.5 }
          ])
        })
      );
    });
  });

  it('allows deleting an entry without triggering edit', async () => {
    const { getByLabelText, findByText, queryByText } = renderWithProviders(<ProfileScreen />);

    await findByText('2026-03-20');
    const deleteButton = getByLabelText('Delete entry 2026-03-20');
    fireEvent.press(deleteButton);

    // Form should NOT have opened in edit mode
    expect(queryByText('Edit entry (2026-03-20)')).toBeNull();
  });
});
