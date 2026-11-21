import {
  evaluateGoal,
  GoalExpressionParser,
  validateGoal
} from '../src/features/stats/services/GoalService';
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
    it.each([
      { label: 'a simple expression', expression: 'count() > 1' },
      { label: 'an expression with a sum', expression: 'sum("elapsed_time") > 3600' },
      {
        label: 'an expression with a filtered sum',
        expression: 'sum("elapsed_time", "type == \'Yoga\'") >= 3600'
      }
    ])('should evaluate $label', ({ expression }) => {
      const result = evaluateGoal(expression, { activities: mockActivities });
      expect(result).toBe(true);
    });

    it('parses each filter expression only once per sum/count invocation regardless of activity count', () => {
      const parseSpy = jest.spyOn(GoalExpressionParser.prototype, 'parse');
      try {
        const result = evaluateGoal(
          'sum("elapsed_time", "type == \'Yoga\'") >= 3600 and count("type == \'Run\'") == 1',
          { activities: mockActivities }
        );
        expect(result).toBe(true);
        // 1 parse for the outer goal expression (via parser.evaluate) + 1 for sum filter + 1 for count filter
        expect(parseSpy.mock.calls.filter(call => call[0] === "type == 'Yoga'")).toHaveLength(1);
        expect(parseSpy.mock.calls.filter(call => call[0] === "type == 'Run'")).toHaveLength(1);
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('treats positive numeric results as achieved', () => {
      expect(evaluateGoal('sum("elapsed_time")', { activities: mockActivities })).toBe(true);
      expect(evaluateGoal('0', { activities: mockActivities })).toBe(false);
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
      expect(result).toContain('Invalid field name');
    });

    it('should return an error message for a syntax error', () => {
      const result = validateGoal('sum("elapsed_time") >');
      expect(typeof result).toBe('string');
    });
  });

  describe('GoalExpressionParser security and correctness', () => {
    const parser = new GoalExpressionParser();

    it('evaluates arithmetic, power, and logical operators correctly', () => {
      expect(parser.evaluate('2 + 3 * 4')).toBe(14);
      expect(parser.evaluate('(2 + 3) * 4')).toBe(20);
      expect(parser.evaluate('2 ^ 3')).toBe(8);
      expect(parser.evaluate('10 % 3')).toBe(1);
      expect(parser.evaluate('true and not false')).toBe(true);
      expect(parser.evaluate('false or (10 > 5 and 3 <= 3)')).toBe(true);
    });

    it('evaluates built-in safe math functions', () => {
      expect(parser.evaluate('min(5, 2, 9)')).toBe(2);
      expect(parser.evaluate('max(5, 2, 9)')).toBe(9);
      expect(parser.evaluate('round(3.7)')).toBe(4);
      expect(parser.evaluate('floor(3.7)')).toBe(3);
      expect(parser.evaluate('ceil(3.2)')).toBe(4);
      expect(parser.evaluate('abs(-15)')).toBe(15);
      expect(parser.evaluate('clamp(120, 0, 100)')).toBe(100);
    });

    it('is immune to Prototype Pollution and does not resolve constructor or prototype properties', () => {
      expect(parser.evaluate('constructor', {})).toBeUndefined();
      expect(parser.evaluate('__proto__', {})).toBeUndefined();
      expect(parser.evaluate('toString', {})).toBeUndefined();
    });

    it('throws errors on division by zero', () => {
      expect(() => parser.evaluate('10 / 0')).toThrow('Division by zero');
      expect(() => parser.evaluate('10 % 0')).toThrow('Modulo by zero');
    });

    it('throws errors on unterminated strings or invalid tokens', () => {
      expect(() => parser.evaluate('"unterminated string')).toThrow('Unterminated string literal');
      expect(() => parser.evaluate('2 @ 3')).toThrow('Unexpected character');
    });
  });
});
