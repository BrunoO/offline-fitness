import {
  normalizeHeader,
  parseActivitiesCsv,
  parseActivityDateUtcMs,
  parseExportNumber
} from '@/features/strava-import/services/csvParser';

/**
 * The CSV fixtures below reproduce the two quirks that broke naive readers of
 * a real Strava export:
 * - `Distance` and `Elapsed Time` appear twice, first as locale-formatted
 *   summary values (kilometres, decimal comma) and then as canonical
 *   metres/seconds;
 * - header names and activity types follow the account language.
 */

const FRENCH_HEADERS = [
  "ID de l'activité",
  "Date de l'activité",
  "Nom de l'activité",
  "Type d'activité",
  'Description de l’activité',
  'Temps écoulé',
  'Distance',
  'Fréquence cardiaque max.',
  'Effort relatif',
  'Déplacement-transport',
  'Note privée sur les activités',
  "Matériel utilisé pour l'activité",
  'Nom du fichier',
  "Poids de l'athlète",
  'Poids du vélo',
  'Temps écoulé',
  'Durée de déplacement',
  'Distance',
  'Vitesse max.',
  'Vitesse moyenne',
  'Dénivelé positif',
  'Dénivelé négatif',
  'Altitude min.',
  'Altitude max.'
];

const ENGLISH_HEADERS = [
  'Activity ID',
  'Activity Date',
  'Activity Name',
  'Activity Type',
  'Activity Description',
  'Elapsed Time',
  'Distance',
  'Max Heart Rate',
  'Relative Effort',
  'Commute',
  'Activity Private Note',
  'Activity Gear',
  'Filename',
  'Athlete Weight',
  'Bike Weight',
  'Elapsed Time',
  'Moving Time',
  'Distance',
  'Max Speed',
  'Average Speed',
  'Elevation Gain',
  'Elevation Loss',
  'Elevation Low',
  'Elevation High'
];

const quoteCell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Builds a CSV row by column index so the fixtures stay aligned with the real
 * layout (which contains duplicate headers for `Distance`/`Elapsed Time`).
 */
const buildCsv = (headers: string[], rows: Record<number, string>[]): string => {
  const lines = [headers.map(quoteCell).join(',')];
  rows.forEach(values => {
    const cells = new Array(headers.length).fill('');
    Object.entries(values).forEach(([index, value]) => {
      cells[Number(index)] = value;
    });
    lines.push(cells.map(quoteCell).join(','));
  });
  return `${lines.join('\n')}\n`;
};

const FRENCH_CSV = buildCsv(FRENCH_HEADERS, [
  {
    0: '20580572834',
    1: '14 oct. 2026, 10:53:00',
    2: 'Marche le midi',
    3: 'Marche',
    5: '3014',
    6: '2,82',
    11: 'Columbia Newton 2',
    12: 'activities/20580572834.gpx',
    15: '3014.0',
    16: '2350.0',
    17: '2825.4',
    18: '2.93',
    19: '1.202',
    20: '9.4',
    21: '9.4',
    22: '203.7',
    23: '210.4'
  },
  {
    0: '18912097028',
    1: '12 oct. 2026, 07:00:00',
    2: 'Yoga du matin',
    3: 'Yoga',
    5: '1800',
    15: '1800.0',
    16: '1800.0'
  },
  {
    0: '20133001843',
    1: '11 sept. 2026, 16:47:07',
    2: 'Natation',
    3: 'Natation',
    5: '2400',
    6: '1,2',
    15: '2400.0',
    16: '2100.0',
    17: '1234.5',
    18: '1.4',
    19: '0.6',
    20: '0',
    21: '0',
    22: '200',
    23: '201'
  },
  {
    0: '11367483784',
    1: '9 mai 2024, 08:14:26',
    2: 'Rando',
    3: 'Randonnée',
    5: '7200',
    6: '9,1',
    12: 'activities/11367483784.fit',
    15: '7200.0',
    16: '6900.0',
    17: '9123.4',
    18: '3.1',
    19: '1.32',
    20: '540.2',
    21: '530.1',
    22: '420',
    23: '980'
  }
]);

const ENGLISH_CSV = buildCsv(ENGLISH_HEADERS, [
  {
    0: '999',
    1: 'Oct 14, 2026, 6:38:07 PM',
    2: 'Evening ride',
    3: 'Ride',
    5: '3600',
    6: '25,4',
    11: 'Bike',
    12: 'activities/999.gpx',
    15: '3600',
    16: '3300',
    17: '25400.0',
    18: '12.5',
    19: '7.7',
    20: '320.1',
    21: '310.4',
    22: '120.5',
    23: '455.9'
  }
]);

describe('parseExportNumber', () => {
  it('reads locale decimals, thousands separators and plain numbers', () => {
    expect(parseExportNumber('4231.2')).toBeCloseTo(4231.2);
    expect(parseExportNumber('4,23')).toBeCloseTo(4.23);
    expect(parseExportNumber('1.234,56')).toBeCloseTo(1234.56);
    expect(parseExportNumber('1,234.56')).toBeCloseTo(1234.56);
    expect(parseExportNumber(' 12\u00a0345 ')).toBeCloseTo(12345);
    expect(parseExportNumber('')).toBe(0);
    expect(parseExportNumber(undefined)).toBe(0);
    expect(parseExportNumber('n/a')).toBe(0);
  });
});

describe('parseActivityDateUtcMs', () => {
  it('parses the French day-first format as UTC', () => {
    expect(parseActivityDateUtcMs('14 oct. 2026, 10:53:00')).toBe(Date.UTC(2026, 9, 14, 10, 53, 0));
    expect(parseActivityDateUtcMs('11 sept. 2026, 16:47:07')).toBe(
      Date.UTC(2026, 8, 11, 16, 47, 7)
    );
    expect(parseActivityDateUtcMs('1 févr. 2021, 08:09:47')).toBe(Date.UTC(2021, 1, 1, 8, 9, 47));
  });

  it('parses the English month-first format, with and without meridiem', () => {
    expect(parseActivityDateUtcMs('Oct 14, 2026, 6:38:07 PM')).toBe(
      Date.UTC(2026, 9, 14, 18, 38, 7)
    );
    expect(parseActivityDateUtcMs('Oct 14, 2026, 6:38:07 AM')).toBe(
      Date.UTC(2026, 9, 14, 6, 38, 7)
    );
    expect(parseActivityDateUtcMs('Oct 14, 2026, 6:38:07')).toBe(Date.UTC(2026, 9, 14, 6, 38, 7));
  });

  it('returns undefined for junk', () => {
    expect(parseActivityDateUtcMs('')).toBeUndefined();
    expect(parseActivityDateUtcMs('yesterday')).toBeUndefined();
  });
});

describe('normalizeHeader', () => {
  it('strips accents, case and trailing punctuation', () => {
    expect(normalizeHeader('Durée de déplacement')).toBe('duree de deplacement');
    expect(normalizeHeader('Vitesse max.')).toBe('vitesse max');
    expect(normalizeHeader('ID de l’activité')).toBe("id de l'activite");
  });
});

describe('parseActivitiesCsv', () => {
  it('uses the metres/seconds columns, not the kilometre summary columns', () => {
    const { rows } = parseActivitiesCsv(FRENCH_CSV);
    const walk = rows.find(row => row.id === '20580572834');

    expect(walk).toBeDefined();
    expect(walk!.distance).toBeCloseTo(2825.4);
    expect(walk!.elapsedTime).toBeCloseTo(3014);
    expect(walk!.movingTime).toBeCloseTo(2350);
    expect(walk!.elevationGain).toBeCloseTo(9.4);
    expect(walk!.elevHigh).toBeCloseTo(210.4);
    expect(walk!.elevLow).toBeCloseTo(203.7);
    expect(walk!.averageSpeed).toBeCloseTo(1.202);
    expect(walk!.fileName).toBe('activities/20580572834.gpx');
  });

  it('reads the start instant as UTC', () => {
    const { rows } = parseActivitiesCsv(FRENCH_CSV);
    const walk = rows.find(row => row.id === '20580572834');
    expect(walk!.startUtcMs).toBe(Date.UTC(2026, 9, 14, 10, 53, 0));
  });

  it('maps localized activity types to canonical Strava types', () => {
    const { rows } = parseActivitiesCsv(FRENCH_CSV);
    const byId = new Map(rows.map(row => [row.id, row]));

    expect(byId.get('20580572834')!.type).toBe('Walk');
    expect(byId.get('18912097028')!.type).toBe('Yoga');
    expect(byId.get('20133001843')!.type).toBe('Swim');
    expect(byId.get('11367483784')!.type).toBe('Hike');
  });

  it('keeps manual entries (no filename) and their metrics', () => {
    const { rows } = parseActivitiesCsv(FRENCH_CSV);
    const yoga = rows.find(row => row.id === '18912097028');
    expect(yoga!.fileName).toBe('');
    expect(yoga!.elapsedTime).toBeCloseTo(1800);
  });

  it('handles the English export layout', () => {
    const { rows } = parseActivitiesCsv(ENGLISH_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('Ride');
    expect(rows[0].distance).toBeCloseTo(25400);
    expect(rows[0].startUtcMs).toBe(Date.UTC(2026, 9, 14, 18, 38, 7));
  });

  it('falls back to column positions when only the core headers are known', () => {
    // Strava keeps the column order across languages; only the aliases are
    // missing here, so the positional layout must rescue every metric.
    const headers = [
      'Activity ID',
      'Activity Date',
      'Activity Name',
      'Activity Type',
      'Description',
      'Verstreken tijd',
      'Afstand',
      'Max hartslag',
      'Relatieve inspanning',
      'Woon-werk',
      'Notitie',
      'Materiaal',
      'Filename',
      'Gewicht atleet',
      'Gewicht fiets',
      'Verstreken tijd 2',
      'Bewegingstijd',
      'Afstand in meters',
      'Max snelheid',
      'Gemiddelde snelheid',
      'Hoogtewinst',
      'Hoogteverlies',
      'Laagste hoogte',
      'Hoogste hoogte'
    ];
    const values = new Array(headers.length).fill('');
    values[0] = '777';
    values[1] = 'Oct 14, 2026, 10:00:00';
    values[2] = 'Rit';
    values[3] = 'Ride';
    values[12] = 'activities/x.gpx';
    values[15] = '3600';
    values[16] = '3000';
    values[17] = '5000';
    values[18] = '5.4';
    values[19] = '1.667';
    values[20] = '60.5';
    values[21] = '60.1';
    values[22] = '100.2';
    values[23] = '200.4';

    const quote = (value: string): string =>
      /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const csv = `${headers.map(quote).join(',')}\n${values.map(quote).join(',')}\n`;

    const { rows, warnings } = parseActivitiesCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('777');
    expect(rows[0].fileName).toBe('activities/x.gpx');
    expect(rows[0].distance).toBeCloseTo(5000);
    expect(rows[0].movingTime).toBeCloseTo(3000);
    expect(rows[0].elevHigh).toBeCloseTo(200.4);
    expect(warnings.join(' ')).toContain('resolved by position');
  });

  it('throws when the CSV is not a Strava export', () => {
    expect(() => parseActivitiesCsv('foo,bar\n1,2\n')).toThrow(
      /does not look like a Strava export/
    );
  });

  it('skips rows with unreadable dates instead of failing the import', () => {
    const csv = FRENCH_CSV.replace('"14 oct. 2026, 10:53:00"', '"not a date"');
    const { rows, warnings } = parseActivitiesCsv(csv);
    expect(rows.map(row => row.id)).not.toContain('20580572834');
    expect(rows).toHaveLength(3);
    expect(warnings.join(' ')).toContain('20580572834');
  });
});
