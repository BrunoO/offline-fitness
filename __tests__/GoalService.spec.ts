import { evaluateGoal, validateGoal } from '../src/features/stats/services/GoalService';
import { Activity } from '../src/shared/types/types';

const mockActivities: Activity[] = [
  {
    id: '1',
    name: 'Morning Run',
    type: 'Run',
    distance: 5000,
    elapsed_time: 1800,
    start_date_local: '2023-01-01T09:00:00Z',
    average_speed: 2.778,
    moving_time: 1700,
    elev_high: 100,
    elev_low: 50,
    total_elevation_gain: 50,
    start_latlng: [0, 0],
    end_latlng: [0, 0],
    local_date: '2023-01-01',
    local_time: '09:00:00',
    start_timestamp_utc: Date.parse('2023-01-01T08:00:00Z'),
    timezone: '(GMT+01:00) Europe/Paris',
    start_day: 1,
    start_month: 0,
    start_week: 1,
    start_year: 2023,
    utc_offset: 3600,
    start_date_utc: '2023-01-01T08:00:00Z'
  },
  {
    id: '2',
    name: 'Evening Yoga',
    type: 'Yoga',
    distance: 0,
    elapsed_time: 3600,
    start_date_local: '2023-01-01T19:00:00Z',
    average_speed: 0,
    moving_time: 3600,
    elev_high: 50,
    elev_low: 50,
    total_elevation_gain: 0,
    start_latlng: [0, 0],
    end_latlng: [0, 0],
    local_date: '2023-01-01',
    local_time: '19:00:00',
    start_timestamp_utc: Date.parse('2023-01-01T18:00:00Z'),
    timezone: '(GMT+01:00) Europe/Paris',
    start_day: 1,
    start_month: 0,
    start_week: 1,
    start_year: 2023,
    utc_offset: 3600,
    start_date_utc: '2023-01-01T18:00:00Z'
  }
];

describe('GoalService', () => {
  describe('evaluateGoal', () => {
    it('should evaluate a simple expression', () => {
      const result = evaluateGoal('count() > 1', { activities: mockActivities });
      expect(result).toBe(true);
    });

    it('should evaluate an expression with a sum', () => {
      const result = evaluateGoal('sum("elapsed_time") > 3600', { activities: mockActivities });
      expect(result).toBe(true);
    });

    it('should evaluate an expression with a filtered sum', () => {
      const result = evaluateGoal('sum("elapsed_time", "type == \'Yoga\'") >= 3600', {
        activities: mockActivities
      });
      expect(result).toBe(true);
    });
  });

  describe('validateGoal', () => {
    it('should return null for a valid expression', () => {
      const result = validateGoal('sum("elapsed_time") > 3600');
      expect(result).toBeNull();
    });

    it('should return an error message for an invalid field', () => {
      const result = validateGoal('sum("invalid_field") > 3600');
      expect(typeof result).toBe('string');
    });

    it('should return an error message for a syntax error', () => {
      const result = validateGoal('sum("elapsed_time") >');
      expect(typeof result).toBe('string');
    });
  });
});
