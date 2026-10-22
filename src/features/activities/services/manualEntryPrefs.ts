import {
  MANUAL_CUSTOM_TYPES_KEY,
  MANUAL_LAST_TYPE_KEY,
  retrieveValue,
  storeValue
} from '@/shared/services/storage';
import { simpleLogger } from '@/shared/services/SimpleLogger';

export interface ManualEntryPrefs {
  /** Type selected on the last successful save, if any. */
  lastType: string | null;
  /** User-declared types, oldest first. */
  customTypes: string[];
}

/** Cap: the chip row stays scannable no matter how inventive the user gets. */
const MAX_CUSTOM_TYPES = 20;

function parseCustomTypes(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

/** Last-used type plus user-declared types for the manual-entry sheet. */
export async function loadManualEntryPrefs(): Promise<ManualEntryPrefs> {
  try {
    const [lastType, rawCustom] = await Promise.all([
      retrieveValue(MANUAL_LAST_TYPE_KEY),
      retrieveValue(MANUAL_CUSTOM_TYPES_KEY)
    ]);
    return {
      lastType: lastType?.trim() ? lastType : null,
      customTypes: parseCustomTypes(rawCustom)
    };
  } catch (error) {
    simpleLogger.error('Could not load manual-entry preferences:', error);
    return { lastType: null, customTypes: [] };
  }
}

/** Remembers the type of a saved entry so the next one starts there. */
export async function saveLastManualEntryType(type: string): Promise<void> {
  try {
    await storeValue(MANUAL_LAST_TYPE_KEY, type);
  } catch (error) {
    simpleLogger.error('Could not save last manual-entry type:', error);
  }
}

/**
 * Adds a user-declared type and returns the updated list (oldest first,
 * capped). Case-insensitive dedup keeps "yoga" from doubling "Yoga".
 */
export async function addCustomManualEntryType(type: string): Promise<string[]> {
  const name = type.trim();
  if (!name) return loadManualEntryPrefs().then(prefs => prefs.customTypes);
  try {
    const { customTypes } = await loadManualEntryPrefs();
    if (customTypes.some(existing => existing.toLowerCase() === name.toLowerCase())) {
      return customTypes;
    }
    const next = [...customTypes, name].slice(-MAX_CUSTOM_TYPES);
    await storeValue(MANUAL_CUSTOM_TYPES_KEY, JSON.stringify(next));
    return next;
  } catch (error) {
    simpleLogger.error('Could not save custom manual-entry type:', error);
    return [];
  }
}
