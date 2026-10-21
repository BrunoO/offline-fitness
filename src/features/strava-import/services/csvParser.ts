import Papa from 'papaparse';
import { ExportedActivityRow, ParsedExport } from '../types/import.types';

/**
 * Parser for `activities.csv` inside a Strava export archive.
 *
 * Three quirks drive this file's design, all verified against a real export:
 *
 * 1. Header names are localized to the account language, so columns are
 *    matched by alias (English + French + common European abbreviations).
 * 2. `Distance` and `Elapsed Time` appear TWICE. The first occurrences are
 *    locale-formatted summary values (e.g. `4,23` km, integer seconds); the
 *    later ones are the canonical meters/seconds used by the activity. The
 *    last occurrence wins.
 * 3. Activity dates are UTC (`15 oct. 2023, 05:50:05` matches the `...Z`
 *    timestamp of the same activity's GPX byte for byte), so no timezone is
 *    applied here — conversion to athlete-local time happens in
 *    `activityMapper.ts`.
 */

type FieldKey =
  | 'id'
  | 'date'
  | 'startTime'
  | 'name'
  | 'type'
  | 'filename'
  | 'elapsedTime'
  | 'movingTime'
  | 'distance'
  | 'maxSpeed'
  | 'averageSpeed'
  | 'elevationGain'
  | 'elevationLoss'
  | 'elevLow'
  | 'elevHigh';

interface FieldSpec {
  aliases: string[];
  /** Which occurrence to use when the same header appears more than once. */
  prefer: 'first' | 'last';
  /**
   * Column index in Strava's export layout, used only as a fallback when the
   * header text is in a language this table does not know. Verified against
   * the live format: the column order is the same in every language.
   */
  knownIndex: number;
}

const FIELD_SPECS: Record<FieldKey, FieldSpec> = {
  id: {
    aliases: ['activity id', "id de l'activité", 'id de l’activité'],
    prefer: 'first',
    knownIndex: 0
  },
  date: {
    aliases: ['activity date', "date de l'activité", 'date de l’activité'],
    prefer: 'first',
    knownIndex: 1
  },
  startTime: {
    aliases: ['start time', 'heure de début', 'startzeit', 'hora de inicio'],
    prefer: 'first',
    knownIndex: 48
  },
  name: {
    aliases: ['activity name', "nom de l'activité", 'nom de l’activité', 'aktivitätsname'],
    prefer: 'first',
    knownIndex: 2
  },
  type: {
    aliases: ['activity type', "type d'activité", 'type d’activité', 'aktivitätstyp'],
    prefer: 'first',
    knownIndex: 3
  },
  filename: {
    aliases: ['filename', 'nom du fichier', 'dateiname', 'nombre de archivo'],
    prefer: 'first',
    knownIndex: 12
  },
  // The canonical elapsed-time column comes after the localized summary one.
  elapsedTime: {
    aliases: ['elapsed time', 'temps écoulé', 'tiempo transcurrido'],
    prefer: 'last',
    knownIndex: 15
  },
  movingTime: {
    aliases: ['moving time', 'durée de déplacement', 'bewegungszeit', 'tiempo en movimiento'],
    prefer: 'first',
    knownIndex: 16
  },
  distance: {
    aliases: ['distance', 'distanz', 'distancia'],
    prefer: 'last',
    knownIndex: 17
  },
  maxSpeed: {
    aliases: [
      'max speed',
      'vitesse max.',
      'vitesse max',
      'max. geschwindigkeit',
      'velocidad máxima'
    ],
    prefer: 'first',
    knownIndex: 18
  },
  averageSpeed: {
    aliases: [
      'average speed',
      'vitesse moyenne',
      'durchschnittsgeschwindigkeit',
      'velocidad media'
    ],
    prefer: 'first',
    knownIndex: 19
  },
  elevationGain: {
    aliases: ['elevation gain', 'dénivelé positif', 'höhenmeter', 'desnivel positivo'],
    prefer: 'first',
    knownIndex: 20
  },
  elevationLoss: {
    aliases: ['elevation loss', 'dénivelé négatif', 'desnivel negativo'],
    prefer: 'first',
    knownIndex: 21
  },
  elevLow: {
    aliases: ['elevation low', 'altitude min.', 'altitude min', 'niedrigste höhe'],
    prefer: 'first',
    knownIndex: 22
  },
  elevHigh: {
    aliases: ['elevation high', 'altitude max.', 'altitude max', 'höchste höhe'],
    prefer: 'first',
    knownIndex: 23
  }
};

/** Lowercase, accent-free, whitespace-collapsed, trailing punctuation removed. */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.:;]+$/, '');
}

/**
 * Resolves every field to a column index. Alias matches win; the known
 * positional layout is only used for fields whose header is unrecognized.
 */
export function resolveColumns(header: string[]): {
  columns: Partial<Record<FieldKey, number>>;
  unresolved: FieldKey[];
  usedFallback: boolean;
} {
  const normalized = header.map(normalizeHeader);
  const columns: Partial<Record<FieldKey, number>> = {};
  let usedFallback = false;

  (Object.keys(FIELD_SPECS) as FieldKey[]).forEach(key => {
    const spec = FIELD_SPECS[key];
    const aliases = spec.aliases.map(normalizeHeader);
    const matches: number[] = [];
    normalized.forEach((value, index) => {
      if (aliases.includes(value)) matches.push(index);
    });

    if (matches.length > 0) {
      columns[key] = spec.prefer === 'last' ? matches[matches.length - 1] : matches[0];
    }
  });

  // Only trust positions when the aliases proved that this really is a Strava
  // export (id + date + filename resolved by name).
  const layoutConfirmed =
    columns.id !== undefined && columns.date !== undefined && columns.filename !== undefined;

  const unresolved: FieldKey[] = [];
  (Object.keys(FIELD_SPECS) as FieldKey[]).forEach(key => {
    if (columns[key] !== undefined) return;
    const index = FIELD_SPECS[key].knownIndex;
    if (layoutConfirmed && index < header.length) {
      columns[key] = index;
      usedFallback = true;
    } else {
      unresolved.push(key);
    }
  });

  return { columns, unresolved, usedFallback };
}

const MONTHS: Record<string, number> = {
  // English
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  // French
  janv: 1,
  fevr: 2,
  mars: 3,
  avr: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  aout: 8,
  sept: 9,
  octo: 10,
  dece: 12,
  // German
  mär: 3,
  maer: 3,
  okt: 10,
  dez: 12,
  // Spanish / Italian / Portuguese share most abbreviations
  ene: 1,
  abr: 4,
  ago: 8,
  dic: 12,
  gen: 1,
  mag: 5,
  giu: 6,
  lug: 7,
  set: 9,
  ott: 10,
  fev: 2,
  out: 10
};

function monthFromToken(token: string): number | undefined {
  const key = normalizeHeader(token).replace(/\./g, '');
  if (!key) return undefined;
  return MONTHS[key] ?? MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)];
}

/**
 * Parses Strava's localized activity date into a UTC instant.
 * Accepts `14 oct. 2026, 10:53:00`, `Oct 14, 2026, 10:53:00 AM` and the
 * 12-hour variants used by some locales.
 */
export function parseActivityDateUtcMs(value: string): number | undefined {
  const cleaned = value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;

  const dayFirst = cleaned.match(
    /^(\d{1,2}) ([^\s,]+)\.? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/
  );
  const monthFirst = cleaned.match(
    /^([^\s,]+)\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/
  );

  let day: number;
  let monthToken: string;
  let year: number;
  let hour: number;
  let minute: number;
  let second: number;
  let meridiem: string | undefined;

  if (dayFirst) {
    day = Number(dayFirst[1]);
    monthToken = dayFirst[2];
    year = Number(dayFirst[3]);
    hour = Number(dayFirst[4]);
    minute = Number(dayFirst[5]);
    second = Number(dayFirst[6] ?? 0);
    meridiem = dayFirst[7];
  } else if (monthFirst) {
    monthToken = monthFirst[1];
    day = Number(monthFirst[2]);
    year = Number(monthFirst[3]);
    hour = Number(monthFirst[4]);
    minute = Number(monthFirst[5]);
    second = Number(monthFirst[6] ?? 0);
    meridiem = monthFirst[7];
  } else {
    return undefined;
  }

  const month = monthFromToken(monthToken);
  if (!month) return undefined;

  if (meridiem) {
    const isPm = meridiem.toLowerCase() === 'pm';
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
  }

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/**
 * Optional `Start Time` column. When present and ISO-8601 it is the most
 * precise source of the start instant; naive values are treated as UTC to match
 * the `Activity Date` column.
 */
function parseStartTimeColumn(value: string): number | undefined {
  const cleaned = value.replace(/\u00a0/g, ' ').trim();
  if (!cleaned) return undefined;

  const naive = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/
  );
  if (naive) {
    return Date.UTC(
      Number(naive[1]),
      Number(naive[2]) - 1,
      Number(naive[3]),
      Number(naive[4]),
      Number(naive[5]),
      Number(naive[6] ?? 0)
    );
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(cleaned)) {
    const parsed = Date.parse(cleaned);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

/**
 * Locale-tolerant numeric parse: `4,23` and `1.234,56` and `4231.2` all work.
 */
export function parseExportNumber(raw: string | undefined): number {
  if (raw === undefined || raw === null) return 0;
  let value = raw
    .replace(/\u00a0/g, ' ')
    .replace(/[\s\u202f']/g, '')
    .trim();
  if (!value) return 0;

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    value = value.replace(',', '.');
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Localized activity type -> canonical Strava type used across the app.
 * Nothing in the archive is guaranteed to be English: the CSV follows the
 * account language while the GPX `<type>` element is always English.
 */
const ACTIVITY_TYPE_ALIASES: Record<string, string[]> = {
  Ride: ['ride', 'velo', 'bike', 'cycling', 'radfahren', 'bicicleta', 'ciclismo', 'fietsen'],
  EBikeRide: [
    'ebikeride',
    'e-bike ride',
    'ebike',
    'e-bike',
    'velo electrique',
    'e-bike-fahrt',
    'bicicleta electrica'
  ],
  MountainBikeRide: ['mountainbikeride', 'mountain bike ride', 'vtt', 'mountainbike', 'mtb'],
  GravelRide: ['gravelride', 'gravel ride', 'gravel'],
  VirtualRide: ['virtualride', 'virtual ride', 'home trainer', 'velo virtuel'],
  Run: ['run', 'course', 'course a pied', 'laufen', 'carrera', 'corsa', 'hardlopen'],
  TrailRun: ['trailrun', 'trail run', 'trail', 'course de trail'],
  Walk: ['walk', 'marche', 'spazieren', 'caminata', 'wandelen'],
  Hike: ['hike', 'randonnee', 'wanderung', 'senderismo', 'escursionismo'],
  Swim: ['swim', 'natation', 'schwimmen', 'natacion', 'nuoto', 'zwemmen'],
  Yoga: ['yoga'],
  Workout: [
    'workout',
    'entrainement',
    'training',
    'entrenamiento',
    'allenamento',
    'trainingseinheit'
  ],
  WeightTraining: ['weighttraining', 'weight training', 'musculation', 'krafttraining'],
  Crossfit: ['crossfit'],
  Rowing: ['rowing', 'aviron', 'rudern', 'remo'],
  VirtualRow: ['virtualrow', 'virtual row', 'rameur'],
  Kayaking: ['kayaking', 'kayak'],
  Canoeing: ['canoeing', 'canoe'],
  StandUpPaddling: ['standuppaddling', 'stand up paddling', 'paddle', 'sup'],
  Surfing: ['surfing', 'surf'],
  Windsurf: ['windsurf', 'windsurfing', 'planche a voile'],
  Kitesurf: ['kitesurf', 'kitesurfing'],
  Sail: ['sail', 'voile'],
  Skiing: ['skiing', 'alpine ski', 'ski alpin', 'ski'],
  Snowboard: ['snowboard', 'snowboarding'],
  NordicSki: ['nordicski', 'nordic ski', 'ski de fond'],
  BackcountrySki: ['backcountryski', 'ski de randonnee'],
  IceSkate: ['iceskate', 'ice skate', 'patinage'],
  InlineSkate: ['inlineskate', 'roller', 'rollerblade'],
  RockClimbing: ['rockclimbing', 'escalade', 'climbing', 'klettern'],
  Elliptical: ['elliptical', 'elliptique'],
  StairStepper: ['stairstepper', 'stair stepper', 'stepper'],
  Golf: ['golf'],
  Soccer: ['soccer', 'football'],
  Tennis: ['tennis'],
  Badminton: ['badminton'],
  Pickleball: ['pickleball'],
  Squash: ['squash'],
  Racquetball: ['racquetball'],
  TableTennis: ['tabletennis', 'table tennis', 'ping pong'],
  PhysicalTherapy: ['physicaltherapy', 'physical therapy', 'kinesitherapie'],
  Pilates: ['pilates'],
  Handcycle: ['handcycle'],
  Wheelchair: ['wheelchair', 'fauteuil roulant']
};

/** GPX `<type>` values Strava writes, all English and lowercase. */
const GPX_TYPE_ALIASES: Record<string, string> = {
  walking: 'Walk',
  cycling: 'Ride',
  biking: 'Ride',
  ebikeride: 'EBikeRide',
  'e-bike': 'EBikeRide',
  swimming: 'Swim',
  hiking: 'Hike',
  running: 'Run',
  skiing: 'Skiing',
  snowboarding: 'Snowboard',
  rowing: 'Rowing',
  kayaking: 'Kayaking',
  inline_skating: 'InlineSkate',
  yoga: 'Yoga',
  workout: 'Workout',
  other: 'Workout'
};

const TYPE_LOOKUP = new Map<string, string>();
Object.entries(ACTIVITY_TYPE_ALIASES).forEach(([canonical, aliases]) => {
  TYPE_LOOKUP.set(normalizeHeader(canonical), canonical);
  aliases.forEach(alias => TYPE_LOOKUP.set(normalizeHeader(alias), canonical));
});

/** Maps a localized CSV type (or an English GPX type) to a canonical type. */
export function mapActivityType(raw: string | undefined, gpxType?: string): string | undefined {
  if (raw) {
    const direct = TYPE_LOOKUP.get(normalizeHeader(raw));
    if (direct) return direct;
  }
  if (gpxType) {
    const fromGpx = GPX_TYPE_ALIASES[gpxType.trim().toLowerCase()];
    if (fromGpx) return fromGpx;
  }
  return undefined;
}

/**
 * Parses the whole CSV into rows. Rows without an id or a readable date are
 * skipped and reported as warnings.
 */
export function parseActivitiesCsv(csvText: string): ParsedExport {
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false
  });

  const warnings: string[] = [];
  if (parsed.errors && parsed.errors.length > 0) {
    warnings.push(`CSV reported ${parsed.errors.length} parse warning(s)`);
  }

  const data = parsed.data;
  if (!data || data.length < 2) {
    throw new Error('activities.csv is empty or has no data rows');
  }

  const header = (data[0] as string[]).map(cell => String(cell ?? ''));
  const { columns, unresolved, usedFallback } = resolveColumns(header);

  if (unresolved.length > 0) {
    warnings.push(`Unrecognized CSV columns: ${unresolved.join(', ')}`);
  }
  if (usedFallback) {
    warnings.push('Some CSV columns were resolved by position (unexpected header language)');
  }

  if (columns.id === undefined || columns.date === undefined) {
    throw new Error('activities.csv does not look like a Strava export (id/date columns missing)');
  }

  const cell = (row: string[], key: FieldKey): string => {
    const index = columns[key];
    if (index === undefined) return '';
    return String(row[index] ?? '').trim();
  };

  const rows: ExportedActivityRow[] = [];
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as string[];
    if (!row || row.length === 0) continue;

    const id = cell(row, 'id');
    if (!id) {
      skipped++;
      continue;
    }

    const startUtcMs =
      parseStartTimeColumn(cell(row, 'startTime')) ?? parseActivityDateUtcMs(cell(row, 'date'));
    if (startUtcMs === undefined) {
      skipped++;
      if (skipped <= 5)
        warnings.push(`Skipped activity ${id}: unreadable date "${cell(row, 'date')}"`);
      continue;
    }

    const rawType = cell(row, 'type');
    const fileName = cell(row, 'filename');

    rows.push({
      id,
      startUtcMs,
      name: cell(row, 'name'),
      // Resolved against the GPX `<type>` later when the CSV value is unknown.
      type: mapActivityType(rawType) ?? '',
      distance: parseExportNumber(cell(row, 'distance')),
      movingTime: parseExportNumber(cell(row, 'movingTime')),
      elapsedTime: parseExportNumber(cell(row, 'elapsedTime')),
      elevationGain: parseExportNumber(cell(row, 'elevationGain')),
      elevHigh: parseExportNumber(cell(row, 'elevHigh')),
      elevLow: parseExportNumber(cell(row, 'elevLow')),
      averageSpeed: parseExportNumber(cell(row, 'averageSpeed')),
      fileName
    });
  }

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} activit${skipped === 1 ? 'y' : 'ies'} with unreadable rows`);
  }
  if (rows.length === 0) {
    throw new Error('activities.csv contained no usable activities');
  }

  return { rows, warnings };
}
