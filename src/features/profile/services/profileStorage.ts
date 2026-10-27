import AsyncStorage from '@react-native-async-storage/async-storage';
import { simpleLogger } from '@/shared';

export interface WeightEntry {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Body weight in kilograms */
  weightKg: number;
}

export interface UserProfile {
  /** Optional age in years */
  age?: number;
  /** Weight history, newest first after load */
  weightEntries: WeightEntry[];
}

const STORAGE_KEY = 'userProfile';

const DEFAULT_PROFILE: UserProfile = { weightEntries: [] };

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function sanitizeEntry(raw: unknown): WeightEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const date = obj.date;
  const weight = obj.weightKg;
  if (typeof date !== 'string' || !isValidDate(date)) return null;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return null;
  return { date, weightKg: weight };
}

export async function loadUserProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PROFILE };
    const obj = parsed as Record<string, unknown>;
    const age = typeof obj.age === 'number' && Number.isFinite(obj.age) ? obj.age : undefined;
    const entriesRaw = Array.isArray(obj.weightEntries) ? obj.weightEntries : [];
    const entries: WeightEntry[] = [];
    for (const e of entriesRaw) {
      const sanitized = sanitizeEntry(e);
      if (sanitized !== null) entries.push(sanitized);
    }
    // Sort newest first, de-duplicate by date (last wins).
    const byDate = new Map<string, WeightEntry>();
    for (const e of entries) byDate.set(e.date, e);
    const sorted = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    return { age, weightEntries: sorted };
  } catch (error) {
    simpleLogger.error('Failed to load user profile', error);
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    simpleLogger.error('Failed to save user profile', error);
    throw error;
  }
}

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseCsvWeightEntries(text: string): { entries: WeightEntry[]; errors: string[] } {
  const entries: WeightEntry[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '') continue;
    // Skip a header row if present.
    if (i === 0 && /date/i.test(line) && /weight/i.test(line)) continue;
    const parts = line.split(/[,;\t]/).map(p => p.trim());
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: expected "date,weight"`);
      continue;
    }
    const date = parts[0];
    const weight = Number.parseFloat(parts[1]);
    if (!isValidDate(date)) {
      errors.push(`Line ${i + 1}: invalid date "${date}" (use YYYY-MM-DD)`);
      continue;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      errors.push(`Line ${i + 1}: invalid weight "${parts[1]}"`);
      continue;
    }
    entries.push({ date, weightKg: weight });
  }
  return { entries, errors };
}
