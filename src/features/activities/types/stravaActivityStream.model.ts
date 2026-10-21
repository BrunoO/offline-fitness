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
  heartrate?: StreamData<number[]>;
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
