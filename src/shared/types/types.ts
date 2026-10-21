import { DrawerNavigationProp, DrawerScreenProps } from '@react-navigation/drawer';

export type Activity = {
  average_speed: number;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  elev_high: number;
  elev_low: number;
  end_latlng: number[];
  id: string;
  name: string;
  // Raw Strava wall-clock timestamp (athlete-local time mislabeled with Z).
  // Never pass to `new Date()` for bucketing — use `local_date` instead.
  start_date_local: string;
  // True UTC instant from Strava `start_date`. Use `start_timestamp_utc` for sorting.
  start_date_utc: string;
  // Athlete-local calendar date (YYYY-MM-DD) derived from `start_date_local` prefix.
  // Canonical field for all day/week/month/year bucketing, calendar display, streaks.
  local_date: string;
  // Athlete-local wall-clock time (HH:MM:SS) derived from `start_date_local`.
  local_time: string;
  // Milliseconds since epoch of the true UTC instant. Canonical for sorting/filtering.
  start_timestamp_utc: number;
  // Strava timezone label, e.g. "(GMT+01:00) Europe/Paris".
  timezone: string;
  start_latlng: number[];
  start_day: number;
  start_month: number;
  start_week: number;
  start_year: number;
  total_elevation_gain: number;
  type: string;
  bounding_box?: [[number, number], [number, number]];
  utc_offset: number;
};

export type ActivityAccessor<T> = (arg0: Activity) => T;

export type RootDrawerParamList = {
  Home: undefined;
  Stats: undefined;
  Logs: undefined;
  Maps: undefined;
  Details:
    | {
        allActivities?: Activity[];
      }
    | undefined;
};

export type StatsTabParamList = {
  RecentWeeksScreen: undefined;
  RecentYearsScreen: undefined;
  RecentMonthsScreen: undefined;
};

export type MapsScreenProps = {
  navigation: DrawerNavigationProp<RootDrawerParamList>;
};

export type DetailsScreenProps = DrawerScreenProps<RootDrawerParamList, 'Details'>;

export type HomeScreenProps = DrawerScreenProps<RootDrawerParamList, 'Home'>;
export type LogScreenProps = DrawerScreenProps<RootDrawerParamList, 'Logs'>;

export type MapsDetailsScreenProps = DrawerScreenProps<RootDrawerParamList, 'Maps'>;

export type StatsTabScreenProps = DrawerScreenProps<RootDrawerParamList, 'Stats'>;

export type RecentYearsScreenProps = Record<string, never>;

export type MonthlyDataScreenProps = Record<string, never>;

export type RecentWeeksScreenProps = Record<string, never>;

export interface ActivityStream {
  coordinates: LatLng[];
  altitude: number[];
  time: number[];
}

export interface ActivityWithStream {
  activity: Activity;
  streamSet: ActivityStream;
}
export interface LatLng {
  latitude: number;
  longitude: number;
}
