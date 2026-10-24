export type StreamData<T> = {
  data: T;
  series_type: string;
  original_size: number;
  resolution: string;
};

export interface DistanceStreamSet {
  distance?: StreamData<number[]>;
}

export interface AltitudeStreamSet {
  altitude?: StreamData<number[]>;
}

export interface TimeStreamSet {
  time?: StreamData<number[]>;
}

export interface LatLngStreamSet {
  latlng?: StreamData<[number, number][]>;
}
export interface HeartrateStreamSet {
  /**
   * Aligned with `time`/`latlng`: one entry per track point, `null` where the
   * sensor had no reading (gap, no contact, before pairing). `null` is not a
   * bpm value, so it must never be plotted or averaged as one.
   */
  heartrate?: StreamData<(number | null)[]>;
}

export interface CadenceStreamSet {
  cadence?: StreamData<number[]>;
}

export interface TemperatureStream {
  temp?: StreamData<number[]>;
}

export interface WattsStreamSet {
  watts?: StreamData<number[]>;
}

export interface SmoothVelocityStream {
  velocity_smooth?: StreamData<number[]>;
}

export type StreamSet = TimeStreamSet &
  DistanceStreamSet &
  LatLngStreamSet &
  AltitudeStreamSet &
  HeartrateStreamSet &
  CadenceStreamSet &
  TemperatureStream &
  WattsStreamSet &
  SmoothVelocityStream;
