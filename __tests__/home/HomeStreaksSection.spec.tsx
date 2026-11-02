import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeStreaksSection } from '@/features/home/components/HomeStreaksSection';
import { resolveThemeById } from '@/theme';
import { createStyles } from '@/features/home/screens/HomeScreen.styles';
import { YearConsistencyStats } from '@/features/stats';

describe('HomeStreaksSection', () => {
  const theme = resolveThemeById('twilight', 'dark');
  const styles = createStyles(theme);

  const mockDayStreak = { current: 4, best: 12 };
  const mockWeekStreak = { current: 3, best: 8 };
  const mockGoalStreak = { current: 2, best: 5 };

  it('renders streak rows when no currentYearStats is provided', () => {
    const { getByText, queryByText } = render(
      <HomeStreaksSection
        dayStreak={mockDayStreak}
        weekStreak={mockWeekStreak}
        goalWeekStreak={mockGoalStreak}
        styles={styles}
      />
    );

    expect(getByText('Consistency & Streaks')).toBeTruthy();
    expect(getByText('4 current • 12 best')).toBeTruthy();
    expect(getByText('3 current • 8 best')).toBeTruthy();
    expect(getByText('2 current • 5 best')).toBeTruthy();
    expect(queryByText('Annual trends')).toBeNull();
  });

  it('renders annual consistency stats and navigates when onSeeAnnualTrends is provided', () => {
    const mockYearStats: YearConsistencyStats = {
      year: 2026,
      activeDays: 145,
      totalDays: 200,
      activeDaysPercent: 72.5,
      totalActivities: 160,
      activitiesPerWeek: 4.2,
      longestStreakDays: 9,
      isCurrentYear: true
    };

    const handleSeeTrends = jest.fn();

    const { getByText, getByLabelText } = render(
      <HomeStreaksSection
        dayStreak={mockDayStreak}
        weekStreak={mockWeekStreak}
        goalWeekStreak={mockGoalStreak}
        currentYearStats={mockYearStats}
        onSeeAnnualTrends={handleSeeTrends}
        styles={styles}
      />
    );

    expect(getByText('2026 Active Days')).toBeTruthy();
    expect(getByText('145 / 200 days (73%)')).toBeTruthy();
    expect(getByText('2026 Frequency')).toBeTruthy();
    expect(getByText('4.2 activities / wk')).toBeTruthy();

    const button = getByLabelText('See annual consistency trends');
    expect(button).toBeTruthy();
    fireEvent.press(button);
    expect(handleSeeTrends).toHaveBeenCalledTimes(1);
  });
});
