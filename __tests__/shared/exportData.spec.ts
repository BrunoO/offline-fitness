import { exportData } from '@/shared/services/exportData';
import * as Sharing from 'expo-sharing';
import { makeTestActivity } from '../helpers/testActivities';

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(() => Promise.resolve())
}));

// The global expo-file-system mock from jest.setup.js, taken by requireMock so
// the in-memory document listing and the set/clear helpers stay reachable.
const fsMock = jest.requireMock('expo-file-system') as {
  Paths: { document: string };
  Directory: new (path: string) => { list: () => { name: string }[] };
  __setMockFiles: (files: Record<string, string>) => void;
  __clearMockFiles: () => void;
};

const shareAsyncMock = Sharing.shareAsync as jest.MockedFunction<typeof Sharing.shareAsync>;

/**
 * Lists the export zips still present in the (mock) document directory.
 * @returns Their names.
 */
function remainingChunks(): string[] {
  return new fsMock.Directory(fsMock.Paths.document)
    .list()
    .filter(entry => /^offline_fitness_export.*\.zip$/.test(entry.name))
    .map(entry => entry.name);
}

function makeActivities(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeTestActivity({ id: String(i), distance: 1000 + i })
  );
}

describe('exportData', () => {
  beforeEach(() => {
    fsMock.__clearMockFiles();
    jest.clearAllMocks();
  });

  it('shares each chunk and deletes it once the share sheet returns', async () => {
    // 501 activities with CHUNK_SIZE 500 produce two chunks.
    await exportData(jest.fn(), makeActivities(501));

    expect(shareAsyncMock).toHaveBeenCalledTimes(2);
    expect(remainingChunks()).toEqual([]);
  });

  it('removes chunks a previous interrupted export left behind', async () => {
    fsMock.__setMockFiles({
      [`${fsMock.Paths.document}offline_fitness_export_part_1_of_9.zip`]: 'stale',
      [`${fsMock.Paths.document}offline_fitness_export.zip`]: 'stale',
      [`${fsMock.Paths.document}unrelated.json`]: 'keep'
    });

    await exportData(jest.fn(), makeActivities(1));

    expect(remainingChunks()).toEqual([]);
    expect(shareAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('reports completion through the progress callback', async () => {
    const setProgress = jest.fn();
    await exportData(setProgress, makeActivities(1));
    expect(setProgress).toHaveBeenLastCalledWith(1);
  });
});
