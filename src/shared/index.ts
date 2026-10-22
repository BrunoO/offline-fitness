// Shared - Public API
// This file exports all shared utilities and components

// Components
export { ChipMultiSelect } from './components/chip-multi-select/ChipMultiSelect';
export type { ChipMultiSelectProps } from './components/chip-multi-select/ChipMultiSelect';
export { LogScreen } from './components/LogScreen';
export { SheetFooter } from './components/SheetFooter';
export type { SheetFooterButton } from './components/SheetFooter';
export { createSheetFrameStyles } from './components/sheetFrame';
export type { SheetFrameOptions } from './components/sheetFrame';
// CustomDrawer is excluded from barrel export to avoid circular dependencies

// Services
export { exportData } from './services/exportData';
export { simpleLogger } from './services/SimpleLogger';
export * from './services/storage';
export {
  decodeStreamBytes,
  encodeStreamSet,
  isBinaryStream,
  parseStreamBytes,
  readStreamFile
} from './services/streamCodec';
export type {
  EncodableStreamSeries,
  EncodableStreamSet,
  ReadableStreamFile
} from './services/streamCodec';
// trackComparison is excluded from barrel export to avoid circular dependencies

// Utils
export { IconButton } from './utils/IconsUtils';
export * from './utils/activityCategories';
export * from './utils/utils';
export * from './utils/isoWeek';
export * from './utils/activityDates';
export { runWithCleanup } from './utils/runWithCleanup';

// Types
export * from './types/types';
