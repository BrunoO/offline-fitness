import { act, render } from '@testing-library/react-native';
import React from 'react';
import { makeTestActivity } from '../helpers/testActivities';

const mockActivities = [
  makeTestActivity({ id: '1', type: 'Run', start_date_utc: '2023-02-25T15:14:44Z' }),
  makeTestActivity({ id: '2', type: 'Ride', start_date_utc: '2024-06-11T08:00:00Z' })
];

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve())
}));

jest.mock('@/features/activities', () => ({
  useActivitiesContext: () => ({
    globalActivities: mockActivities,
    myActivitiesDiscovered: new Set(['Run', 'Ride']),
    refreshActivities: jest.fn(),
    fetchingData: false
  }),
  useProcessedActivities: () => ({
    myActivitiesToUse: ['Run', 'Ride'],
    allActivitiesToUse: mockActivities
  })
}));

jest.mock('@/features/activities/ActivitiesContext', () => ({
  useActivitiesDataContext: () => ({
    globalActivities: mockActivities,
    myActivitiesDiscovered: new Set(['Run', 'Ride'])
  })
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RecentYearsScreen } = require('@/features/stats/screens/RecentYearsScreen');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ThemeProvider } = require('@/theme');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SettingsProvider } = require('@/features/stats/StatsTabSettingsContext');

type RenderedNode = {
  props?: Record<string, unknown>;
  children?: RenderedNode[];
};

/**
 * Collects every SVG `d` attribute in the rendered tree.
 * @param node The node to walk.
 * @param found The accumulator.
 * @returns The accumulator.
 */
function collectPaths(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') {
    return found;
  }
  const candidate = node as RenderedNode;
  const d = candidate.props?.d;
  if (typeof d === 'string') {
    found.push(d);
  }
  (candidate.children ?? []).forEach(child => collectPaths(child, found));
  return found;
}

/**
 * Mounts the screen and lets its effects settle, so the charts are actually
 * rendered.
 * @returns The rendered tree helper.
 */
async function renderYearsScreen() {
  const view = render(
    <ThemeProvider>
      <SettingsProvider>
        <RecentYearsScreen />
      </SettingsProvider>
    </ThemeProvider>
  );
  // The settings context finishes loading after mount; flush it before reading the tree.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('RecentYearsScreen', () => {
  it('renders without crashing', async () => {
    const view = await renderYearsScreen();
    expect(view.toJSON()).not.toBeNull();
  });

  // react-native-svg parses path data in Java on Android, and an IllegalArgumentException
  // there is a hard app crash, not a recoverable error. Victory produces NaN geometry when
  // a chart theme drops a property it relies on, so the rendered paths must stay numeric.
  it('renders SVG paths that contain no NaN coordinates', async () => {
    const view = await renderYearsScreen();

    const paths = collectPaths(view.toJSON());
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach(d => {
      expect(d).not.toMatch(/NaN|Infinity/);
    });
  });
});
