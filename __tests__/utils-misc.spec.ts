import * as Utils from '../src/shared/utils/utils';

describe('seconds_to_label', () => {
  it('should work for 0 seconds', () => {
    let result = Utils.seconds_to_label(0);
    expect(result).toBe('00:00');
  });

  it('should work for 59 seconds', () => {
    let result = Utils.seconds_to_label(59);
    expect(result).toBe('00:00');
  });

  it('should work for 1 minute', () => {
    let result = Utils.seconds_to_label(60);
    expect(result).toBe('00:01');
  });

  it('should work for 3601 seconds ', () => {
    let result = Utils.seconds_to_label(3601);
    expect(result).toBe('01:00');
  });

  it('should work for 24h', () => {
    let result = Utils.seconds_to_label(24 * 3600);
    expect(result).toBe('24:00');
  });

  it('should work for 99h', () => {
    let result = Utils.seconds_to_label(99 * 3600);
    expect(result).toBe('99:00');
  });

  it('should work for 1000h', () => {
    let result = Utils.seconds_to_label(1000 * 3600);
    expect(result).toBe('1000:00');
  });

  it('should work for 1000h and 50 minutes', () => {
    let result = Utils.seconds_to_label(1000 * 3600 + 50 * 60);
    expect(result).toBe('1000:50');
  });

  it('should work for 10 minutes', () => {
    let result = Utils.seconds_to_label(10 * 60);
    expect(result).toBe('00:10');
  });
});

describe('calculateBoundingBox', () => {
  it('should return undefined for empty coordinates', () => {
    expect(Utils.calculateBoundingBox([])).toBeUndefined();
  });

  it('should calculate the correct bounding box', () => {
    const coords = [
      { latitude: 1, longitude: 1 },
      { latitude: 2, longitude: 2 },
      { latitude: 0, longitude: 0 }
    ];
    expect(Utils.calculateBoundingBox(coords)).toEqual([
      [0, 0],
      [2, 2]
    ]);
  });
});

describe('calculateSpeedKmh', () => {
  it('should return 0 for 0 moving time', () => {
    expect(Utils.calculateSpeedKmh(1000, 0)).toBe(0);
  });

  it('should calculate speed correctly', () => {
    // 1000m in 100s = 10m/s = 36km/h
    expect(Utils.calculateSpeedKmh(1000, 100)).toBe(36);
  });
});

describe('minMaxDateRange', () => {
  it('should return the correct min and max dates', () => {
    const activities = [
      { start_year: 2023, start_month: 0, start_day: 1 },
      { start_year: 2023, start_month: 1, start_day: 1 },
      { start_year: 2022, start_month: 11, start_day: 31 }
    ] as unknown as Parameters<typeof Utils.minMaxDateRange>[0];
    const { minDate, maxDate } = Utils.minMaxDateRange(activities);
    expect(minDate).toEqual(new Date(2022, 11, 31));
    expect(maxDate).toEqual(new Date(2023, 1, 1));
  });
});

describe('dropColumn', () => {
  it('should drop the specified column', () => {
    const table = [
      [1, 2, 3],
      [4, 5, 6]
    ];
    expect(Utils.dropColumn(table, 1)).toEqual([
      [1, 3],
      [4, 6]
    ]);
  });
});

describe('formatYearlyTable', () => {
  it('should format the table correctly', () => {
    const table = [
      [2023, 10, 20],
      [-1, 30, 40]
    ];
    const formatFn = (val: number) => `${val}km`;
    expect(Utils.formatYearlyTable(table, formatFn)).toEqual([
      ['2023', '10km', '20km'],
      ['Total', '30km', '40km']
    ]);
  });
});

describe('activityToString', () => {
  it('should format the activity to a string correctly', () => {
    const activity = {
      name: 'My Run',
      type: 'Run',
      start_day: 1,
      start_month: 0,
      start_year: 2023,
      local_time: '16:14:44',
      elapsed_time: 3661 // 1h 1m 1s
    } as unknown as Parameters<typeof Utils.activityToString>[0];
    expect(Utils.activityToString(activity)).toBe(
      'My Run (Run) on 1/1/2023 at 16:14 for 01:01'
    );
  });

  it('should omit the time when local_time is missing', () => {
    const activity = {
      name: 'My Run',
      type: 'Run',
      start_day: 1,
      start_month: 0,
      start_year: 2023,
      local_time: '',
      elapsed_time: 3661
    } as unknown as Parameters<typeof Utils.activityToString>[0];
    expect(Utils.activityToString(activity)).toBe('My Run (Run) on 1/1/2023 for 01:01');
  });
});

describe('sortRowsOnYearDescending ', () => {
  it('should work for basic arrays', () => {
    let origArray = [
      [2022, 123],
      [1999, 15],
      [1999, 1],
      [2023, 456]
    ];
    let result = origArray.sort(Utils.sortRowsOnYearDescending);
    expect(result[0][0]).toBe(2023);
    expect(result[0][1]).toBe(456);
    expect(result[1][0]).toBe(2022);
    expect(result[1][1]).toBe(123);
    expect(result[2][0]).toBe(1999);
    expect(result[3][0]).toBe(1999);
  });
});
