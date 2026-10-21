// Stats Feature - Public API
// This file exports all public interfaces for the statistics feature

// Context
export { SettingsProvider, useSettings } from './StatsTabSettingsContext';

// Components
export { default as ProgressCircleComponent } from './components/ProgressCircleComponent';
export { ProgressOverlay } from './components/ProgressOverlay';
export { default as RecentActivityStats } from './components/RecentActivityStats';
export { default as YTDStatsComponent } from './components/YTDStatsComponent';

// Screens
export { RecentMonthsScreen } from './screens/RecentMonthsScreen';
export { RecentWeeksScreen } from './screens/RecentWeeksScreen';
export { RecentYearsScreen } from './screens/RecentYearsScreen';
export { StatsTab } from './screens/StatsTab';

// Services
export { ActivityStats, calculateRecentActivityStats } from './services/activity-stats';
export { evaluateGoal, validateGoal } from './services/GoalService';
export {
  monthlyData2,
  weeklyData,
  yearlyData,
  type MonthSummary,
  type WeekSummary
} from './services/stats';
export {
  calculateYTDStats,
  type YTDDataPoint,
  type YTDStats,
  type YTDYearStats
} from './services/ytd-stats';
