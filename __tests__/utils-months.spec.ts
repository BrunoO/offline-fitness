import * as Utils from '../src/shared/utils/utils';

// https://stackoverflow.com/questions/7556591/is-the-javascript-date-object-always-one-day-off

describe('isMonthBetweens', () => {
  let Jan23: Date, May23: Date;

  beforeEach(() => {
    Jan23 = new Date(2023, 0, 1);
    May23 = new Date(2023, 4, 1);
  });
  it.each([
    { case: 'inside interval', year: 2023, month: 2 },
    { case: 'beginning of interval', year: 2023, month: 0 },
    { case: 'end of interval', year: 2023, month: 4 }
  ])('should match $case', ({ year, month }) => {
    const result = Utils.isMonthBetween(year, month, Jan23, May23);
    expect(result).toBe(true);
  });
  it('should not match before interval', () => {
    let result = Utils.isMonthBetween(2014, 2, Jan23, May23);
    expect(result).toBe(false);
  });
  it('should not match after interval', () => {
    const Jan23 = new Date(2023, 0, 1);
    const May23 = new Date(2023, 4, 1);
    let result = Utils.isMonthBetween(2030, 2, Jan23, May23);
    expect(result).toBe(false);
  });
});

describe('lastMonthsFrom', () => {
  it('should work for 1 month', () => {
    let result = Utils.lastMonthsFrom(new Date(2023, 2, 15), 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toStrictEqual(new Date(2023, 2, 1));
  });
  it('should work for 2 months', () => {
    let result = Utils.lastMonthsFrom(new Date(2023, 3, 15), 2);
    expect(result).toHaveLength(2);
    expect(result[1]).toStrictEqual(new Date(2023, 2, 1));
  });
  it('should work for last year', () => {
    let result = Utils.lastMonthsFrom(new Date(2023, 2, 15), 12);
    expect(result).toHaveLength(12);
    expect(result[11]).toStrictEqual(new Date(2022, 3, 1));
  });
});
