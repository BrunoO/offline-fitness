import { renderHook, waitFor } from '@testing-library/react-native';
import { useLoadedStream } from '@/features/activities/hooks/useLoadedStream';
import { makeTestActivity } from '../helpers/testActivities';

const mockGetActivityStreams = jest.fn();

jest.mock('@/features/activities/services/fetchAndStoreStreams', () => ({
  getActivityStreams: (...args: unknown[]) => mockGetActivityStreams(...args)
}));

describe('useLoadedStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined initially', () => {
    mockGetActivityStreams.mockResolvedValue([]);
    const item = makeTestActivity({ id: 'act-1' });
    const { result } = renderHook(() => useLoadedStream(item));
    expect(result.current.loadedStream).toBeUndefined();
  });

  it('loads the stream when available', async () => {
    const stream = { streamSet: { time: [1, 2], coordinates: [[1, 2]] } };
    mockGetActivityStreams.mockResolvedValue([stream]);
    const item = makeTestActivity({ id: 'act-1' });
    const { result } = renderHook(() => useLoadedStream(item));
    await waitFor(() => expect(result.current.loadedStream).toBe(stream));
    expect(mockGetActivityStreams).toHaveBeenCalledWith([item]);
  });

  it('stays undefined when no stream is found', async () => {
    mockGetActivityStreams.mockResolvedValue([]);
    const item = makeTestActivity({ id: 'act-1' });
    const { result } = renderHook(() => useLoadedStream(item));
    await waitFor(() => expect(mockGetActivityStreams).toHaveBeenCalled());
    expect(result.current.loadedStream).toBeUndefined();
  });
});
