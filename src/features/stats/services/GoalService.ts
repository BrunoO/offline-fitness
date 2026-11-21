import { Activity } from '@/shared';
import { EvaluationContext, ExpressionValue, GoalExpressionParser } from './GoalExpressionParser';

export { GoalExpressionParser } from './GoalExpressionParser';

/**
 * The data for a week that is passed to the goal expression evaluation.
 */
export interface WeekData {
  activities: Activity[];
}

/**
 * Evaluates a goal expression for a given week using a safe, dedicated parser.
 *
 * @param expression The expression to evaluate.
 * @param data The data for the week.
 * @returns Whether the expression evaluates to a truthy value.
 */
export function evaluateGoal(expression: string, data: WeekData): boolean {
  const parser = new GoalExpressionParser();

  parser.functions.sum = (fieldName: ExpressionValue, filter?: ExpressionValue) => {
    if (
      typeof fieldName !== 'string' ||
      !isValidActivityField(fieldName) ||
      data.activities.length === 0
    ) {
      return 0;
    }

    const filterExpression =
      typeof filter === 'string' && filter.trim() ? parser.parse(filter) : null;
    let total = 0;
    for (const activity of data.activities) {
      if (
        !filterExpression ||
        filterExpression.evaluate(activity as unknown as EvaluationContext)
      ) {
        total += getNumericFieldValue(activity, fieldName);
      }
    }
    return total;
  };

  parser.functions.count = (filter?: ExpressionValue) => {
    if (typeof filter !== 'string' || !filter.trim()) {
      return data.activities.length;
    }
    if (data.activities.length === 0) {
      return 0;
    }

    const filterExpression = parser.parse(filter);
    let count = 0;
    for (const activity of data.activities) {
      if (filterExpression.evaluate(activity as unknown as EvaluationContext)) {
        count++;
      }
    }
    return count;
  };

  const result = parser.evaluate(expression);

  if (typeof result === 'boolean') {
    return result;
  }

  if (typeof result === 'number') {
    // Preserve the common pattern of treating positive numbers as success.
    return Number.isFinite(result) && result > 0;
  }

  // Fallback to standard truthiness for any other type.
  return Boolean(result);
}

const validActivityFields = [
  'average_speed',
  'distance',
  'elapsed_time',
  'moving_time',
  'elev_high',
  'elev_low',
  'end_latlng',
  'id',
  'name',
  'start_date_local',
  'start_date_utc',
  'local_date',
  'local_time',
  'start_timestamp_utc',
  'timezone',
  'start_latlng',
  'start_day',
  'start_month',
  'start_week',
  'start_year',
  'total_elevation_gain',
  'type',
  'bounding_box',
  'utc_offset'
];

type ValidActivityField = (typeof validActivityFields)[number];

function isValidActivityField(fieldName: string): fieldName is ValidActivityField {
  return (validActivityFields as readonly string[]).includes(fieldName);
}

function getNumericFieldValue(activity: Activity, fieldName: ValidActivityField): number {
  const value = activity[fieldName as keyof Activity];
  if (typeof value === 'number') {
    return value;
  }
  return 0;
}

/**
 * Validates a goal expression.
 * @param expression The expression to validate.
 * @returns `null` if the expression is valid, an error message string otherwise.
 */
export function validateGoal(expression: string): string | null {
  try {
    const parser = new GoalExpressionParser();

    const dummyContext: Record<string, number> = {};
    (validActivityFields as readonly string[]).forEach(field => {
      dummyContext[field] = 0;
    });

    parser.functions.sum = (fieldName: ExpressionValue, filter?: ExpressionValue) => {
      if (typeof fieldName !== 'string' || !isValidActivityField(fieldName)) {
        throw new Error(`Invalid field name: ${String(fieldName)}`);
      }
      if (typeof filter === 'string' && filter.trim()) {
        parser.parse(filter);
      }
      return 0;
    };
    parser.functions.count = (filter?: ExpressionValue) => {
      if (typeof filter === 'string' && filter.trim()) {
        parser.parse(filter);
      }
      return 0;
    };

    parser.evaluate(expression, dummyContext);
    return null;
  } catch (e) {
    if (e instanceof Error) {
      return e.message;
    }
    return 'Unknown error while validating goal expression';
  }
}
