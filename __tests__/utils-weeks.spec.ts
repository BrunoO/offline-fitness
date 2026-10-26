import * as Utils from '../src/shared/utils/utils';

describe('lastWeeksFrom', () => {
  let Jan23: Date, May23: Date, Dec24_30: Date;

  beforeEach(() => {
    Jan23 = new Date(2023, 0, 1);
    May23 = new Date(2023, 4, 1);
    Dec24_30 = new Date(2024, 11, 30);
  });
  it('should provide 1 week', () => {
    let result = Utils.lastWeeksFrom(May23, 1);
    expect(result).toHaveLength(1);
    let weekId = result[0] as Utils.WeekIdentifier;
    expect(weekId.weekNumber).toBe(18);
    expect(weekId.year).toBe(2023);
    expect(weekId.weekIsoDate.getTime()).toBe(Date.UTC(2023, 4, 1));
  });
  it('should provide 2 weeks from Jan to Dec', () => {
    let result = Utils.lastWeeksFrom(Jan23, 2);
    expect(result).toHaveLength(2);
    let weekId = result[1] as Utils.WeekIdentifier;
    expect(weekId.weekNumber).toBe(52);
    expect(weekId.year).toBe(2022);
    expect(weekId.weekIsoDate.getTime()).toBe(Date.UTC(2022, 11, 26));
  });
  it('should provide 12 weeks from March 15, 2023', () => {
    let result = Utils.lastWeeksFrom(new Date(2023, 2, 15), 12);
    expect(result).toHaveLength(12);
    let weekId = result[0] as Utils.WeekIdentifier;
    expect(weekId.weekNumber).toBe(52);
    expect(weekId.year).toBe(2022);
    expect(weekId.weekIsoDate.getTime()).toBe(Date.UTC(2022, 11, 26));
  });
  it('should provide 12 weeks from Dec 24, 2024', () => {
    let result = Utils.lastWeeksFrom(Dec24_30, 12);
    expect(result).toHaveLength(12);
    let weekId = result[11] as Utils.WeekIdentifier;
    expect(weekId.weekNumber).toBe(1);
    expect(weekId.year).toBe(2025);
  });
  it('should not mutate the caller Date argument', () => {
    const initialTime = May23.getTime();
    Utils.lastWeeksFrom(May23, 4);
    expect(May23.getTime()).toBe(initialTime);
  });
});

describe('week_of_year', () => {
  it('should work for 1 jan 2023', () => {
    expect(Utils.week_of_year(2023, 0, 1)).toBe(52);
  });
  it('should work for 21 mar 2023', () => {
    expect(Utils.week_of_year(2023, 2, 21)).toBe(12);
  });
  it('should work for 3 jan 2022', () => {
    expect(Utils.week_of_year(2022, 0, 3)).toBe(1);
  });
  it('should work for 2 jan 2022', () => {
    expect(Utils.week_of_year(2022, 0, 2)).toBe(52);
  });
  it('should work for 2 jan 2021', () => {
    expect(Utils.week_of_year(2021, 0, 2)).toBe(53);
  });
  it('should work for 29 feb 2020', () => {
    expect(Utils.week_of_year(2020, 1, 29)).toBe(9);
  });
});

describe('getCurrentWeekNumber', () => {
  it('should work for 1 may 2023', () => {
    let result = Utils.getCurrentWeekNumber(new Date(2023, 4, 1));
    expect(result).toBe(18);
  });
});

describe('number of weeks so far in year', () => {
  it('should work for 30 dec 2024', () => {
    let total_weeks = Utils.totalWeeksTillToday(2024, new Date(2024, 11, 30));
    expect(total_weeks).toBe(52);
  });
});

describe('matchingWeekNumber', () => {
  it('should work for 1 week interval', () => {
    let recentWeeks = Utils.lastWeeksFrom(new Date(2023, 0, 4), 1);
    let result = Utils.matchingWeekNumber(2023, 1, recentWeeks[0], recentWeeks[0]);
    expect(result).toBe(true);
  });

  it('should work for 1 week interval and week outside interval', () => {
    let recentWeeks = Utils.lastWeeksFrom(new Date(2023, 0, 4), 1);
    let result = Utils.matchingWeekNumber(2023, 2, recentWeeks[0], recentWeeks[0]);
    expect(result).toBe(false);
  });

  it('should work for 3 week interval', () => {
    let recentWeeks = Utils.lastWeeksFrom(new Date(2023, 0, 4), 3);
    let result = Utils.matchingWeekNumber(
      2022,
      52,
      recentWeeks[0],
      recentWeeks[recentWeeks.length - 1]
    );
    expect(result).toBe(true);
  });

  it('should work for 3 week interval and week before interval', () => {
    let recentWeeks = Utils.lastWeeksFrom(new Date(2023, 0, 4), 3);
    let result = Utils.matchingWeekNumber(
      2022,
      50,
      recentWeeks[0],
      recentWeeks[recentWeeks.length - 1]
    );
    expect(result).toBe(false);
  });

  it('should work for 3 week interval and week after interval', () => {
    let recentWeeks = Utils.lastWeeksFrom(new Date(2023, 0, 4), 3);
    let result = Utils.matchingWeekNumber(
      2023,
      2,
      recentWeeks[0],
      recentWeeks[recentWeeks.length - 1]
    );
    expect(result).toBe(false);
  });
});
