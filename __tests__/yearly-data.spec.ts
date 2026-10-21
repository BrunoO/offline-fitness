import { yearlyData } from '@/features/stats/services/stats';
import { Activity } from '@/shared';
import { makeTestActivity } from './helpers/testActivities';

/**
 * Flattens a yearly table and reports every non-finite cell.
 * @param table The table produced by `yearlyData`.
 * @returns The non-finite cells.
 */
function nonFiniteCells(table: number[][]): number[] {
  return table.flat().filter(cell => !Number.isFinite(cell));
}

describe('yearlyData', () => {
  it('sums each type per year and totals the row', () => {
    const activities = [
      makeTestActivity({
        id: '1',
        type: 'Run',
        distance: 5000,
        start_date_utc: '2024-03-01T10:00:00Z'
      }),
      makeTestActivity({
        id: '2',
        type: 'Run',
        distance: 3000,
        start_date_utc: '2024-06-01T10:00:00Z'
      }),
      makeTestActivity({
        id: '3',
        type: 'Ride',
        distance: 20000,
        start_date_utc: '2024-07-01T10:00:00Z'
      })
    ];
    const table = yearlyData(['Run', 'Ride'], activities, a => a.distance);
    const year2024 = table.find(row => row[0] === 2024)!;
    expect(year2024[1]).toBe(8000);
    expect(year2024[2]).toBe(20000);
    expect(year2024[3]).toBe(28000);
  });

  // A cell that reaches a chart as NaN becomes NaN coordinates in an SVG path,
  // and react-native-svg's native parser throws on those — a hard app crash.
  it('keeps a type that the list never initialised out of NaN', () => {
    const activities = [
      makeTestActivity({ id: '1', type: 'Run', distance: 5000 }),
      makeTestActivity({ id: '2', type: 'Skateboard', distance: 4000 })
    ];
    const table = yearlyData(['Run'], activities, a => a.distance);
    expect(nonFiniteCells(table)).toEqual([]);
    const totalRow = table[table.length - 1];
    expect(totalRow[0]).toBe(-1);
  });

  it('keeps a non-numeric field out of NaN', () => {
    const activities = [
      makeTestActivity({ id: '1', type: 'Run', distance: 5000 }),
      makeTestActivity({ id: '2', type: 'Run', distance: NaN })
    ];
    const table = yearlyData(['Run'], activities, a => a.distance);
    expect(nonFiniteCells(table)).toEqual([]);
    const yearRow = table.find(row => row[0] === 2023)!;
    expect(yearRow[1]).toBe(5000);
  });

  it('survives a stored activity whose distance is missing', () => {
    // What a half-written AsyncStorage record looks like after an interrupted
    // import: the field is absent, so the accessor hands back undefined.
    const broken = makeTestActivity({ id: '1', type: 'Run' }) as Partial<Activity>;
    delete broken.distance;
    const table = yearlyData(['Run'], [broken as Activity], a => a.distance);
    expect(nonFiniteCells(table)).toEqual([]);
    const yearRow = table.find(row => row[0] === 2023)!;
    expect(yearRow[1]).toBe(0);
  });
});
