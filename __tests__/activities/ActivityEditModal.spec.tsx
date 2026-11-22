import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityEditModal } from '@/features/activities/components/ActivityEditModal';
import type { StreamSet } from '@/features/activities/types/stravaActivityStream.model';
import type { Activity } from '@/shared';

jest.mock('@/theme', () => ({
  useTheme: () => ({
    surface: '#FFFFFF',
    surfaceMuted: '#F0F0F0',
    border: '#E0E0E0',
    text: '#111111',
    textMuted: '#666666',
    primary: '#FC4C02',
    onPrimary: '#FFFFFF',
    danger: '#FF3B30'
  })
}));

jest.mock('@/features/activities/services/manualEntryPrefs', () => ({
  loadManualEntryPrefs: jest.fn().mockResolvedValue({ customTypes: [] }),
  addCustomManualEntryType: jest.fn().mockResolvedValue([])
}));

jest.mock('@/features/maps/components/MiniMapComponent', () => {
  const { View, Text } = jest.requireActual('react-native');
  return function MockMiniMap() {
    return (
      <View testID="mock-mini-map">
        <Text>Mock Map</Text>
      </View>
    );
  };
});

const mockActivity: Activity = {
  id: 'act-modal-1',
  name: 'Evening Jog',
  type: 'Run',
  distance: 3000,
  elapsed_time: 900,
  moving_time: 850,
  average_speed: 3.53,
  total_elevation_gain: 30,
  elev_high: 100,
  elev_low: 70,
  start_latlng: [45.18, 5.72],
  end_latlng: [45.19, 5.73],
  start_date_local: '2026-06-01T18:00:00Z',
  local_date: '2026-06-01',
  local_time: '18:00:00',
  start_date_utc: '2026-06-01T16:00:00.000Z',
  start_timestamp_utc: 1780339200000,
  timezone: '(GMT+02:00) Europe/Paris',
  utc_offset: 7200,
  start_year: 2026,
  start_month: 5,
  start_day: 1,
  start_week: 23,
  average_heartrate: 145,
  max_heartrate: 165
};

const mockStream: StreamSet = {
  time: {
    data: [0, 10, 20, 30, 40, 50],
    series_type: 'time',
    original_size: 6,
    resolution: 'high'
  },
  latlng: {
    data: [
      [45.18, 5.72],
      [45.181, 5.721],
      [45.182, 5.722],
      [45.183, 5.723],
      [45.184, 5.724],
      [45.185, 5.725]
    ],
    series_type: 'latlng',
    original_size: 6,
    resolution: 'high'
  },
  altitude: {
    data: [70, 75, 80, 85, 90, 95],
    series_type: 'altitude',
    original_size: 6,
    resolution: 'high'
  },
  heartrate: {
    data: [140, 145, 150, 155, 160, 165],
    series_type: 'heartrate',
    original_size: 6,
    resolution: 'high'
  }
};

describe('ActivityEditModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  it('renders Details tab prefilled with activity metadata', () => {
    const { getByDisplayValue, getByText } = render(
      <ActivityEditModal
        visible={true}
        activity={mockActivity}
        globalActivities={[mockActivity]}
        rawStream={mockStream}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    expect(getByDisplayValue('Evening Jog')).toBeTruthy();
    expect(getByText('Run')).toBeTruthy();
    expect(getByText('Trim / Shorten')).toBeTruthy();
  });

  it('allows editing the name and saving without trim alert', async () => {
    const { getByDisplayValue, getByLabelText } = render(
      <ActivityEditModal
        visible={true}
        activity={mockActivity}
        globalActivities={[mockActivity]}
        rawStream={mockStream}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    const nameInput = getByDisplayValue('Evening Jog');
    fireEvent.changeText(nameInput, 'Sunset Easy Jog');

    const saveBtn = getByLabelText('Save activity changes');
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sunset Easy Jog' }),
      undefined
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('switches to Trim tab, uses steppers, and confirms destructive trim on Save', async () => {
    const { getByLabelText, getByText } = render(
      <ActivityEditModal
        visible={true}
        activity={mockActivity}
        globalActivities={[mockActivity]}
        rawStream={mockStream}
        initialTab="trim"
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    expect(getByText('Trim End (Cut Tail)')).toBeTruthy();

    // Step -10 seconds on end handle (moves from index 5 (t=50) to index 4 (t=40))
    const minus10Btn = getByLabelText('Minus 10 seconds');
    fireEvent.press(minus10Btn);

    const saveBtn = getByLabelText('Save activity changes');
    fireEvent.press(saveBtn);

    // Should prompt confirmation alert
    expect(Alert.alert).toHaveBeenCalledWith(
      'Trim recording?',
      expect.stringContaining('This will permanently shorten the recording'),
      expect.any(Array)
    );

    // Simulate clicking "Trim & Save" in Alert
    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const confirmBtn = alertButtons.find((btn: { text: string }) => btn.text === 'Trim & Save');
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn.onPress();
    });

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        elapsed_time: expect.any(Number)
      }),
      expect.objectContaining({
        time: expect.any(Object)
      })
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('displays summary without strikethrough or arrow when untrimmed, and shows diff when trimmed', () => {
    const { getByLabelText, getByText, queryAllByText } = render(
      <ActivityEditModal
        visible={true}
        activity={mockActivity}
        globalActivities={[mockActivity]}
        rawStream={mockStream}
        initialTab="trim"
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    // Untrimmed: no "→" arrow present in summary
    expect(queryAllByText('→')).toHaveLength(0);
    // Shows current distance cleanly
    expect(getByText('3.00 km')).toBeTruthy();

    // Now step -10 seconds on end handle
    const minus10Btn = getByLabelText('Minus 10 seconds');
    fireEvent.press(minus10Btn);

    // Trimmed: "→" arrows appear for comparing before and after
    expect(queryAllByText('→').length).toBeGreaterThan(0);
  });

  it('closes when Cancel is pressed', () => {
    const { getByLabelText } = render(
      <ActivityEditModal
        visible={true}
        activity={mockActivity}
        globalActivities={[mockActivity]}
        rawStream={mockStream}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    const cancelBtn = getByLabelText('Cancel editing');
    fireEvent.press(cancelBtn);

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnSave).not.toHaveBeenCalled();
  });
});
