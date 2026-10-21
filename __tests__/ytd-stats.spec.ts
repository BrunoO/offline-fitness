import { calculateYTDStats } from '../src/features/stats/services/ytd-stats';
import { Activity } from '../src/shared/types/types';

describe('YTD Stats Calculator', () => {
  const fixedCurrentYear = 2024;
  const fixedPreviousYear = 2023;

  const mockActivities: Activity[] = [
    // Current Year Activities
    {
      id: '1',
      start_year: fixedCurrentYear,
      start_month: 0,
      start_day: 10,
      start_date_local: `${fixedCurrentYear}-01-10T10:00:00Z`,
      start_date_utc: `${fixedCurrentYear}-01-10T10:00:00Z`,
      local_date: `${fixedCurrentYear}-01-10`,
      local_time: '10:00:00',
      start_timestamp_utc: Date.parse(`${fixedCurrentYear}-01-10T10:00:00Z`),
      timezone: '(GMT+00:00) UTC',
      utc_offset: 0,
      distance: 10000,
      moving_time: 3600,
      total_elevation_gain: 100,
      type: 'Run'
    } as Activity,
    {
      id: '2',
      start_year: fixedCurrentYear,
      start_month: 1,
      start_day: 15,
      start_date_local: `${fixedCurrentYear}-02-15T10:00:00Z`,
      start_date_utc: `${fixedCurrentYear}-02-15T10:00:00Z`,
      local_date: `${fixedCurrentYear}-02-15`,
      local_time: '10:00:00',
      start_timestamp_utc: Date.parse(`${fixedCurrentYear}-02-15T10:00:00Z`),
      timezone: '(GMT+00:00) UTC',
      utc_offset: 0,
      distance: 20000,
      moving_time: 7200,
      total_elevation_gain: 200,
      type: 'Ride'
    } as Activity,

    // Previous Year Activities
    {
      id: '3',
      start_year: fixedPreviousYear,
      start_month: 0,
      start_day: 5,
      start_date_local: `${fixedPreviousYear}-01-05T10:00:00Z`,
      start_date_utc: `${fixedPreviousYear}-01-05T10:00:00Z`,
      local_date: `${fixedPreviousYear}-01-05`,
      local_time: '10:00:00',
      start_timestamp_utc: Date.parse(`${fixedPreviousYear}-01-05T10:00:00Z`),
      timezone: '(GMT+00:00) UTC',
      utc_offset: 0,
      distance: 5000,
      moving_time: 1800,
      total_elevation_gain: 50,
      type: 'Run'
    } as Activity,
    {
      id: '4',
      start_year: fixedPreviousYear,
      start_month: 2,
      start_day: 20,
      start_date_local: `${fixedPreviousYear}-03-20T10:00:00Z`,
      start_date_utc: `${fixedPreviousYear}-03-20T10:00:00Z`,
      local_date: `${fixedPreviousYear}-03-20`,
      local_time: '10:00:00',
      start_timestamp_utc: Date.parse(`${fixedPreviousYear}-03-20T10:00:00Z`),
      timezone: '(GMT+00:00) UTC',
      utc_offset: 0,
      distance: 15000,
      moving_time: 5400,
      total_elevation_gain: 150,
      type: 'Ride'
    } as Activity,
    {
      id: '5',
      start_year: fixedPreviousYear,
      start_month: 11,
      start_day: 1,
      start_date_local: `${fixedPreviousYear}-12-01T10:00:00Z`,
      start_date_utc: `${fixedPreviousYear}-12-01T10:00:00Z`,
      local_date: `${fixedPreviousYear}-12-01`,
      local_time: '10:00:00',
      start_timestamp_utc: Date.parse(`${fixedPreviousYear}-12-01T10:00:00Z`),
      timezone: '(GMT+00:00) UTC',
      utc_offset: 0,
      distance: 10000,
      moving_time: 3600,
      total_elevation_gain: 100,
      type: 'Run'
    } as Activity
  ];

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should calculate YTD stats correctly when date is after Mar 20', () => {
    jest.setSystemTime(new Date(`${fixedCurrentYear}-04-01T10:00:00Z`));

    const ytdStats = calculateYTDStats(mockActivities);
    const { currentYear: currentYearStats, previousYear: previousYearStats } = ytdStats;

    // Current year assertions
    expect(currentYearStats.totalDistance).toBe(30000);
    expect(currentYearStats.totalTime).toBe(10800);
    expect(currentYearStats.totalElevation).toBe(300);
    expect(currentYearStats.totalActivities).toBe(2);

    // Previous year assertions
    expect(previousYearStats.totalDistance).toBe(20000);
    expect(previousYearStats.totalTime).toBe(7200);
    expect(previousYearStats.totalElevation).toBe(200);
    expect(previousYearStats.totalActivities).toBe(2);
  });

  it('should calculate YTD stats correctly when date is between Jan 10 and Feb 15', () => {
    jest.setSystemTime(new Date(`${fixedCurrentYear}-02-01T10:00:00Z`));

    const ytdStats = calculateYTDStats(mockActivities);
    const { currentYear: currentYearStats, previousYear: previousYearStats } = ytdStats;

    // Current year assertions
    expect(currentYearStats.totalDistance).toBe(10000);
    expect(currentYearStats.totalTime).toBe(3600);
    expect(currentYearStats.totalElevation).toBe(100);
    expect(currentYearStats.totalActivities).toBe(1);

    // Previous year assertions
    expect(previousYearStats.totalDistance).toBe(5000);
    expect(previousYearStats.totalTime).toBe(1800);
    expect(previousYearStats.totalElevation).toBe(50);
    expect(previousYearStats.totalActivities).toBe(1);
  });

  it('should generate the correct number of data points', () => {
    const mockDate = new Date(`${fixedCurrentYear}-04-01T10:00:00Z`);
    jest.setSystemTime(mockDate);

    const ytdStats = calculateYTDStats(mockActivities);
    const dayOfYear = Math.floor(
      (mockDate.getTime() - new Date(mockDate.getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    expect(ytdStats.currentYear.data.length).toBe(dayOfYear);
    expect(ytdStats.previousYear.data.length).toBe(dayOfYear);
  });
});
