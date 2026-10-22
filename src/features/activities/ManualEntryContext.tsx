import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ManualActivitySheet } from './components/ManualActivitySheet';

type ManualEntryContextType = {
  /**
   * Opens the manual-entry sheet, optionally prefilled with a calendar date
   * ('YYYY-MM-DD'). When GPS tracking lands, turn this into the Track/Manual
   * chooser (RECORD-CHOOSER) instead of adding a second entry point.
   */
  openManualEntry: (date?: string) => void;
};

const ManualEntryContext = createContext<ManualEntryContextType | undefined>(undefined);

/**
 * Owns the single `ManualActivitySheet` instance (mounted beside the
 * navigator, like `SettingsModal` — never inside the drawer panel). Entry
 * points (Details "+", drawer item, calendar day sheet) all call
 * `openManualEntry`, so the form state lives in exactly one place.
 */
export const ManualEntryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);

  const openManualEntry = useCallback((date?: string) => {
    setInitialDate(date);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => setSheetVisible(false), []);

  const value = useMemo(() => ({ openManualEntry }), [openManualEntry]);

  return (
    <ManualEntryContext.Provider value={value}>
      {children}
      <ManualActivitySheet visible={sheetVisible} initialDate={initialDate} onClose={closeSheet} />
    </ManualEntryContext.Provider>
  );
};

export const useManualEntry = () => {
  const context = useContext(ManualEntryContext);
  if (context === undefined) {
    throw new Error('useManualEntry must be used within a ManualEntryProvider');
  }
  return context;
};
