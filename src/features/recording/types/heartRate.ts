/**
 * Heart-rate samples captured from a sensor (e.g. the Polar H10) during a
 * recording session. Stored as JSONL alongside the GPS fix log so the replay
 * can fold them into the activity's `heartrate` stream.
 */
export interface HeartRateSample {
  /** UTC epoch milliseconds when the sample was received. */
  t: number;
  /** Beats per minute. */
  bpm: number;
  /** Optional RR intervals in milliseconds, when the sensor provides them. */
  rrMs?: number[];
  /** Sensor contact status, when reported. */
  contact?: boolean;
}
