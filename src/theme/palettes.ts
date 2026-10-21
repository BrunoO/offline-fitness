import { PaletteDefinition } from './types';

/**
 * The palette registry.
 *
 * Adding a palette is a data-only change: define it here and it becomes
 * available to the resolver (and to the picker, when that ships). Every
 * palette is checked against the accessibility floor by the theme unit tests.
 */

/**
 * The palette the app shipped with before the theme layer existed. It is kept
 * so the new theme reproduces the previous look exactly, and so users who
 * liked it can keep it.
 */
const legacy: PaletteDefinition = {
  id: 'legacy',
  label: 'Legacy orange',
  primary: { light: '#F4511E', dark: '#FF7043' },
  primaryPressed: { light: '#E64A19', dark: '#FF8A65' },
  primarySoft: { light: '#FFF3E0', dark: '#2A1E1A' },
  success: { light: '#8BC34A', dark: '#9CCC65' },
  successSoft: { light: '#E8F5E8', dark: '#1E2A1E' },
  chartSeries: {
    light: ['#F4511E', '#FFF59D', '#DCE775', '#8BC34A', '#00796B', '#006064'],
    dark: ['#F4511E', '#FFF59D', '#DCE775', '#8BC34A', '#00796B', '#006064']
  },
  chartTints: {
    light: ['#e3f2fd', '#f3e5f5', '#e8f5e8', '#fff3e0'],
    dark: ['#1e2a3a', '#2a2338', '#1e2a1e', '#2a1e1a']
  }
};

/** Violet brand. The strongest distance from the Strava orange. */
const twilight: PaletteDefinition = {
  id: 'twilight',
  label: 'Twilight',
  primary: { light: '#6D28D9', dark: '#A78BFA' },
  primaryPressed: { light: '#5B21B6', dark: '#C4B5FD' },
  primarySoft: { light: '#F3EEFF', dark: '#241E3A' },
  success: { light: '#047857', dark: '#34D399' },
  successSoft: { light: '#ECFDF5', dark: '#0D2B22' },
  chartSeries: {
    light: ['#6D28D9', '#2563EB', '#0891B2', '#047857', '#B45309', '#BE123C'],
    dark: ['#A78BFA', '#60A5FA', '#22D3EE', '#34D399', '#FBBF24', '#FB7185']
  },
  chartTints: {
    light: ['#ede9fe', '#e0e7ff', '#dbeafe', '#ccfbf1'],
    dark: ['#241e3a', '#1e2a44', '#1b2b3a', '#12302a']
  }
};

/** Teal brand. Calm and data-forward; teal was already present in the app. */
const alpine: PaletteDefinition = {
  id: 'alpine',
  label: 'Alpine',
  primary: { light: '#0F766E', dark: '#2DD4BF' },
  primaryPressed: { light: '#115E59', dark: '#5EEAD4' },
  primarySoft: { light: '#ECFDF5', dark: '#0D2B28' },
  success: { light: '#15803D', dark: '#4ADE80' },
  successSoft: { light: '#ECFDF5', dark: '#10281A' },
  chartSeries: {
    light: ['#0F766E', '#0891B2', '#2563EB', '#7C3AED', '#B45309', '#BE123C'],
    dark: ['#2DD4BF', '#22D3EE', '#60A5FA', '#A78BFA', '#FBBF24', '#FB7185']
  },
  chartTints: {
    light: ['#ccfbf1', '#cffafe', '#dbeafe', '#d1fae5'],
    dark: ['#0d2b28', '#0d2b33', '#1b2b3a', '#10281a']
  }
};

/** Burnt sienna brand. Keeps the warm character, drops the Strava resemblance. */
const terracotta: PaletteDefinition = {
  id: 'terracotta',
  label: 'Terracotta',
  primary: { light: '#B45309', dark: '#FBBF24' },
  primaryPressed: { light: '#92400E', dark: '#FCD34D' },
  primarySoft: { light: '#FFF7ED', dark: '#2B1F10' },
  success: { light: '#15803D', dark: '#4ADE80' },
  successSoft: { light: '#ECFDF5', dark: '#10281A' },
  chartSeries: {
    light: ['#B45309', '#7C3AED', '#2563EB', '#0F766E', '#B91C1C', '#A16207'],
    dark: ['#FBBF24', '#C4B5FD', '#60A5FA', '#2DD4BF', '#F87171', '#FCD34D']
  },
  chartTints: {
    light: ['#ffedd5', '#fed7aa', '#ffedd5', '#fef3c7'],
    dark: ['#2b1f10', '#33230f', '#2b1f10', '#2b2410']
  }
};

/** Deep red brand. Highest contrast, but close to the error and track reds. */
const crimson: PaletteDefinition = {
  id: 'crimson',
  label: 'Crimson',
  primary: { light: '#A61B29', dark: '#FB7185' },
  primaryPressed: { light: '#7F1D1D', dark: '#FDA4AF' },
  primarySoft: { light: '#FDF2F4', dark: '#2C1418' },
  success: { light: '#15803D', dark: '#4ADE80' },
  successSoft: { light: '#ECFDF5', dark: '#10281A' },
  chartSeries: {
    light: ['#A61B29', '#7C3AED', '#2563EB', '#0F766E', '#B45309', '#BE123C'],
    dark: ['#FB7185', '#C4B5FD', '#60A5FA', '#2DD4BF', '#FBBF24', '#FDA4AF']
  },
  chartTints: {
    light: ['#ffe4e6', '#fce7f3', '#ffe4e6', '#fee2e2'],
    dark: ['#2c1418', '#2c1424', '#2c1418', '#2b1618']
  }
};

/** Every palette known to the app, keyed by id. */
export const PALETTES: Record<string, PaletteDefinition> = {
  twilight,
  legacy,
  alpine,
  terracotta,
  crimson
};

/** The palette used when the user has not chosen one. */
export const DEFAULT_PALETTE_ID = 'twilight';

/** The palettes in the order they are offered to the user. */
export const PALETTE_ORDER: string[] = ['twilight', 'legacy', 'alpine', 'terracotta', 'crimson'];

/**
 * Looks up a palette by id.
 * @param id The palette id.
 * @returns The palette, or the default palette when the id is unknown.
 */
export function getPalette(id: string): PaletteDefinition {
  return PALETTES[id] ?? PALETTES[DEFAULT_PALETTE_ID];
}

/**
 * Whether a palette id is known to the app.
 * @param id The palette id.
 * @returns True when the id resolves to a registered palette.
 */
export function isKnownPalette(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PALETTES, id);
}
