import {
  SplitDetector,
  buildAnnouncementText,
  formatSpokenDuration
} from '@/features/recording/services/splits';

describe('formatSpokenDuration', () => {
  it('formats seconds, minutes, and hours naturally', () => {
    expect(formatSpokenDuration(0)).toBe('0 seconds');
    expect(formatSpokenDuration(1000)).toBe('1 second');
    expect(formatSpokenDuration(45_000)).toBe('45 seconds');
    expect(formatSpokenDuration(60_000)).toBe('1 minute');
    expect(formatSpokenDuration(312_000)).toBe('5 minutes 12 seconds');
    expect(formatSpokenDuration(3_600_000)).toBe('1 hour');
    expect(formatSpokenDuration(7_530_000)).toBe('2 hours 5 minutes 30 seconds');
  });
});

describe('buildAnnouncementText', () => {
  it('announces kilometers for intervals >= 950 m', () => {
    expect(buildAnnouncementText(3, 5, 12, 1000)).toBe(
      'Kilometer 3 completed. Pace: 5 minutes 12 seconds.'
    );
  });

  it('announces meters for sub-km intervals', () => {
    expect(buildAnnouncementText(2, 0, 45, 500)).toBe('1000 meters completed. Pace: 45 seconds.');
  });

  it('handles zero minutes', () => {
    expect(buildAnnouncementText(1, 0, 30, 1000)).toBe('Kilometer 1 completed. Pace: 30 seconds.');
  });

  it('includes total elapsed time, heart rate, and cycling speed (km/h) when provided', () => {
    expect(
      buildAnnouncementText(2, 4, 30, 1000, {
        profile: 'running',
        totalElapsedMs: 540_000,
        heartRateBpm: 158.4
      })
    ).toBe(
      'Kilometer 2 completed. Pace: 4 minutes 30 seconds. Total time: 9 minutes. Heart rate: 158 beats per minute.'
    );

    expect(
      buildAnnouncementText(5, 2, 0, 1000, {
        profile: 'cycling',
        speedKmh: 30,
        totalElapsedMs: 600_000,
        heartRateBpm: 142
      })
    ).toBe(
      'Kilometer 5 completed. Speed: 30.0 kilometers per hour. Total time: 10 minutes. Heart rate: 142 beats per minute.'
    );
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
    const detector = new SplitDetector({
      speak: jest.fn(),
      vibrate: jest.fn(),
      intervalMeters: 1000
    });
    const event = detector.checkSplit(1000, 300000); // 5 min for 1 km
    expect(event!.paceSecondsPerKm).toBe(300);
    expect(event!.paceFormatted).toBe('5:00');
  });

  it('speaks richer announcements with cycling speed, total time, and BLE heart rate', () => {
    const speak = jest.fn();
    const detector = new SplitDetector({
      profile: 'cycling',
      intervalMeters: 1000,
      getHeartRateBpm: () => 148,
      speak,
      vibrate: jest.fn()
    });

    detector.checkSplit(1000, 120_000); // 1 km in 2 min = 30.0 km/h
    expect(speak).toHaveBeenCalledWith(
      'Kilometer 1 completed. Speed: 30.0 kilometers per hour. Total time: 2 minutes. Heart rate: 148 beats per minute.'
    );
  });
});
