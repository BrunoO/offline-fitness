import { Platform } from 'react-native';

export const LogLevel = {
  Info: 0,
  Warning: 1,
  Error: 2
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export interface LogEntry {
  timeDelta: number;
  timeDiff: number;
  text: string;
  level: LogLevel;
  date: Date;
}

type SerializableLogValue = string | number | boolean | null | Record<string, unknown>;

function normaliseLogValue(value: unknown): SerializableLogValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? undefined
    };
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return { value: String(value) };
}

function serialiseLogArguments(values: unknown[]): string {
  const normalised = values.map(v => normaliseLogValue(v));
  try {
    if (normalised.length === 1) {
      return JSON.stringify(normalised[0]);
    }
    return JSON.stringify(normalised);
  } catch {
    return '[Unserializable log value]';
  }
}

/**
 * A simple logger class.
 */
export class Logger {
  logs: LogEntry[];
  private creationDate: Date;
  private previousEntryDate: Date;

  /**
   * Creates a new Logger instance.
   */
  constructor() {
    this.logs = [];
    this.creationDate = new Date();
    this.previousEntryDate = this.creationDate;
  }

  /**
   * Clears all logs.
   */
  clearLogs(): void {
    this.logs = [];
    this.creationDate = new Date();
    this.previousEntryDate = this.creationDate;
  }

  /**
   * The internal logging function.
   * @param level The log level.
   * @param data The data to log.
   */
  private internalLog(level: LogLevel, ...data: unknown[]): void {
    const now = new Date();
    const delta = now.getTime() - this.creationDate.getTime();
    const diff = now.getTime() - this.previousEntryDate.getTime();
    this.previousEntryDate = now;

    const text = serialiseLogArguments(data);

    this.logs.push({
      timeDelta: delta,
      timeDiff: diff,
      text,
      level,
      date: now
    });
  }

  /**
   * Logs data at the Info level.
   * @param data The data to log.
   */
  log(...data: unknown[]): void {
    if (Platform.OS === 'web') {
      // Preserve original console behaviour for web debugging

      console.log(...data);
    }
    this.internalLog(LogLevel.Info, ...data);
  }

  /**
   * Logs data at the Warning level.
   * @param data The data to log.
   */
  warn(...data: unknown[]): void {
    if (Platform.OS === 'web') {
      console.warn(...data);
    }
    this.internalLog(LogLevel.Warning, ...data);
  }

  /**
   * Logs data at the Error level.
   * @param data The data to log.
   */
  error(...data: unknown[]): void {
    if (Platform.OS === 'web') {
      console.error(...data);
    }
    this.internalLog(LogLevel.Error, ...data);
  }
}

export const simpleLogger = new Logger();
