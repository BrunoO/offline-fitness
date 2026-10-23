import { SplitDetector, buildAnnouncementText } from '@/features/recording/services/splits';

describe('buildAnnouncementText', () => {
  it('announces kilometers for intervals >= 950 m', () => {
    expect(buildAnnouncementText(3, 5, 12, 1000)).toBe('Kilometer 3 completed. Pace: 5 minutes 12 seconds.');
  });

  it('announces meters for sub-km intervals', () => {
    expect(buildAnnouncementText(2, 0, 45, 500)).toBe('1000 meters completed. Pace: 45 seconds.');
  });

  it('handles zero minutes', () => {
    expect(buildAnnouncementText(1, 0, 30, 1000)).toBe('Kilometer 1 completed. Pace: 30 seconds.');
  });
});

describe('SplitDetector', () => {
  it('does not fire before the interval is crossed', () => {
    const speak = jest.fn();
    const vibrate = jest.fn();
    const detector = new SplitDetector({ speak, vibrate });
    const event = detector.checkSplit(500, 300000);
    expect(event).toBeNull();
    expect(speak).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('fires when the interval is crossed', () => {
    const speak = jest.fn();
    const vibrate = jest.fn();
    const detector = new SplitDetector({ speak, vibrate, intervalMeters: 1000 });
    const event = detector.checkSplit(1000, 300000);
    expect(event).not.toBeNull();
    expect(event!.splitNumber).toBe(1);
    expect(event!.splitDistanceMeters).toBe(1000);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does not fire again until the next interval', () => {
    const speak = jest.fn();
    const vibrate = jest.fn();
    const detector = new SplitDetector({ speak, vibrate, intervalMeters: 1000 });
    detector.checkSplit(1000, 300000);
    const second = detector.checkSplit(1500, 400000);
    expect(second).toBeNull();
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('fires a second split at 2 km', () => {
    const speak = jest.fn();
    const vibrate = jest.fn();
    const detector = new SplitDetector({ speak, vibrate, intervalMeters: 1000 });
    detector.checkSplit(1000, 300000);
    const second = detector.checkSplit(2000, 600000);
    expect(second).not.toBeNull();
    expect(second!.splitNumber).toBe(2);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('forceSplit fires immediately', () => {
    const speak = jest.fn();
    const vibrate = jest.fn();
    const detector = new SplitDetector({ speak, vibrate });
    const event = detector.forceSplit(250, 60000);
    expect(event).not.toBeNull();
    expect(event.splitNumber).toBe(1);
  });

  it('respects audioEnabled=false', () => {
    const speak = jest.fn();
    const vibrate = jest.fn();
    const detector = new SplitDetector({ speak, vibrate, audioEnabled: false });
    detector.checkSplit(1000, 300000);
    expect(speak).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalled();
  });

  it('respects hapticEnabled=false', () => {
    const speak = jest.fn();
    const vibrate = jest.fn();
    const detector = new SplitDetector({ speak, vibrate, hapticEnabled: false });
    detector.checkSplit(1000, 300000);
    expect(vibrate).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalled();
  });

  it('seed restores state', () => {
    const detector = new SplitDetector({ speak: jest.fn(), vibrate: jest.fn() });
    detector.seed(3, 3000, 900000);
    expect(detector.splitCount).toBe(3);
    expect(detector.lastSplitDistanceMeters).toBe(3000);
    const event = detector.checkSplit(3500, 1000000);
    expect(event).toBeNull(); // 500 m < 1000
    const event2 = detector.checkSplit(4000, 1100000);
    expect(event2).not.toBeNull();
    expect(event2!.splitNumber).toBe(4);
  });

  it('reset clears state', () => {
    const detector = new SplitDetector({ speak: jest.fn(), vibrate: jest.fn() });
    detector.checkSplit(1000, 300000);
    detector.reset();
    expect(detector.splitCount).toBe(0);
    expect(detector.lastSplitDistanceMeters).toBe(0);
  });

  it('computes pace correctly', () => {
    const detector = new SplitDetector({ speak: jest.fn(), vibrate: jest.fn(), intervalMeters: 1000 });
    const event = detector.checkSplit(1000, 300000); // 5 min for 1 km
    expect(event!.paceSecondsPerKm).toBe(300);
    expect(event!.paceFormatted).toBe('5:00');
  });
});
