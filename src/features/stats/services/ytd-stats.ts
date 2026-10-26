import { Activity } from '@/shared';
import { activityDayOfYear } from '@/shared/utils/activityDates';

export interface YTDDataPoint {
  dayOfYear: number;
  distance: number;
  time: number;
  elevation: number;
  activities: number;
  label: string;
  month: number;
  monthLabel: string;
  quarter: number;
  quarterLabel: string;
}

export interface YTDYearStats {
  data: YTDDataPoint[];
  totalDistance: number;
  totalTime: number;
  totalElevation: number;
  totalActivities: number;
}

export interface YTDStats {
  currentYear: YTDYearStats;
  previousYear: YTDYearStats;
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function processYearData(
  activities: Activity[],
  year: number,
  maxDayOfYear: number,
  useElapsedTime: boolean
): YTDYearStats {
  const yearActivities = activities.filter(a => a.start_year === year);
  const data: YTDDataPoint[] = [];

  let cumulativeDistance = 0;
  let cumulativeTime = 0;
  let cumulativeElevation = 0;
  let cumulativeActivities = 0;

  const activitiesByDay: { [key: number]: Activity[] } = {};
  for (const activity of yearActivities) {
    const day = activityDayOfYear(activity);
    if (!activitiesByDay[day]) {
      activitiesByDay[day] = [];
    }
    activitiesByDay[day].push(activity);
  }

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];

  const date = new Date(year, 0, 1);
  for (let day = 1; day <= maxDayOfYear; day++) {
    date.setDate(day);
    if (activitiesByDay[day]) {
      for (const activity of activitiesByDay[day]) {
        const distance = Number.isFinite(activity.distance) ? activity.distance : 0;
        const rawTime = useElapsedTime
          ? (activity.elapsed_time ?? activity.moving_time)
          : activity.moving_time;
        const time = Number.isFinite(rawTime) ? rawTime : 0;
        const elevation = Number.isFinite(activity.total_elevation_gain)
          ? activity.total_elevation_gain
          : 0;
        cumulativeDistance += distance;
        cumulativeTime += time;
        cumulativeElevation += elevation;
      }
      cumulativeActivities += activitiesByDay[day].length;
    }

    const month = date.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    const quarterLabel = `Q${quarter}`;

    data.push({
      dayOfYear: day,
      distance: cumulativeDistance / 1000, // in km
      time: cumulativeTime,
      elevation: cumulativeElevation,
      activities: cumulativeActivities,
      label: `${day}`,
      month: month,
      monthLabel: monthNames[date.getMonth()],
      quarter: quarter,
      quarterLabel: quarterLabel
    });
  }

  return {
    data,
    totalDistance: cumulativeDistance,
    totalTime: cumulativeTime,
    totalElevation: cumulativeElevation,
    totalActivities: cumulativeActivities
  };
}

export function calculateYTDStats(
  activities: Activity[],
  comparisonYear?: number,
  showFullPreviousYear?: boolean,
  useElapsedTime: boolean = true
): YTDStats {
  const now = new Date();
  const currentYear = now.getFullYear();
  const previousYear = comparisonYear ?? currentYear - 1;
  const dayOfYear = getDayOfYear(now);

  const currentYearStats = processYearData(activities, currentYear, dayOfYear, useElapsedTime);
  const previousYearStatsFull = processYearData(activities, previousYear, 366, useElapsedTime);

  if (showFullPreviousYear) {
    // Show full previous year data
    const previousYearActivitiesFull = activities.filter(a => a.start_year === previousYear);

    return {
      currentYear: currentYearStats,
      previousYear: {
        data: previousYearStatsFull.data,
        totalDistance: previousYearStatsFull.totalDistance,
        totalTime: previousYearStatsFull.totalTime,
        totalElevation: previousYearStatsFull.totalElevation,
        totalActivities: previousYearActivitiesFull.length
      }
    };
  } else {
    // Show YTD comparison (original behavior)
    const previousYearDataForChart = previousYearStatsFull.data.slice(0, dayOfYear);
    const previousYearYtdPoint = previousYearDataForChart.at(-1);

    const previousYearActivitiesYtd = activities.filter(
      a => a.start_year === previousYear && activityDayOfYear(a) <= dayOfYear
    );

    return {
      currentYear: currentYearStats,
      previousYear: {
        data: previousYearDataForChart,
        totalDistance: previousYearYtdPoint ? previousYearYtdPoint.distance * 1000 : 0, // convert back to meters
        totalTime: previousYearYtdPoint ? previousYearYtdPoint.time : 0,
        totalElevation: previousYearYtdPoint ? previousYearYtdPoint.elevation : 0,
        totalActivities: previousYearActivitiesYtd.length
      }
    };
  }
}
