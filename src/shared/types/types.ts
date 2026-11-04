// Type-only import: this module must stay a runtime leaf so the archive-import
// core (which reaches it through `week_of_year` in `utils.ts`) stays loadable
// outside React Native. See `docs/desktop-import-plan.md` and the guard in
// `__tests__/stravaImport/importCorePortability.spec.ts`.
import type { BottomTabNavigationProp, BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type {
  CompositeNavigationProp,
  CompositeScreenProps,
  NavigatorScreenParams
} from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps
} from '@react-navigation/native-stack';
import type { StatsSegment } from '@/constants';

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
  /** Optional average heart rate in bpm (recorded or imported). */
  average_heartrate?: number;
  /** Optional max heart rate in bpm (recorded or imported). */
  max_heartrate?: number;
};

export type ActivityAccessor<T> = (arg0: Activity) => T;

export type MainTabParamList = {
  Home: undefined;
  Activities:
    | {
        allActivities?: Activity[];
        selectedActivityId?: string;
        filterLabel?: string;
        useElapsedTime?: boolean;
      }
    | undefined;
  RecordAction: undefined;
  Stats: { segment?: StatsSegment } | undefined;
  Maps: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  ActivityDetail: { activityId: string };
  Record: undefined;
  TimerRecord: undefined;
  Profile: undefined;
  Logs: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = BottomTabScreenProps<
  MainTabParamList,
  T
>;

export type RootStackNavigationProp<T extends keyof RootStackParamList = keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;

export type MainTabNavigationProp<T extends keyof MainTabParamList = keyof MainTabParamList> =
  BottomTabNavigationProp<MainTabParamList, T>;

export type MapsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Maps'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

export type DetailsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Activities'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type HomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type LogScreenProps = NativeStackScreenProps<RootStackParamList, 'Logs'>;

export type StatsTabScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Stats'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type RecentYearsScreenProps = Record<string, never>;

export type MonthlyDataScreenProps = Record<string, never>;

export type RecentWeeksScreenProps = Record<string, never>;

export interface ActivityStream {
  coordinates: LatLng[];
  altitude: number[];
  time: number[];
  /** Aligned with `time`; `null` marks points without a sensor reading. */
  heartrate?: (number | null)[];
}

export interface ActivityWithStream {
  activity: Activity;
  streamSet: ActivityStream;
}
export interface LatLng {
  latitude: number;
  longitude: number;
}
