import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { RootDrawerParamList } from '@/shared/types/types';
import { ManualActivitySheet } from './components/ManualActivitySheet';
import { RecordChooserSheet } from './components/RecordChooserSheet';

type ManualEntryContextType = {
  /**
   * Opens the manual-entry sheet, optionally prefilled with a calendar date
   * ('YYYY-MM-DD').
   */
  openManualEntry: (date?: string) => void;
  /**
   * Opens the RECORD-CHOOSER: a single entry point offering "Record" and
   * "Enter manually", instead of a second button in the drawer. GPS tracking
   * no longer adds a third entry point.
   */
  openRecordChooser: (date?: string) => void;
};

const ManualEntryContext = createContext<ManualEntryContextType | undefined>(undefined);

/**
 * Owns the single `ManualActivitySheet` and `RecordChooserSheet` instances
 * (mounted beside the navigator, like `SettingsModal` — never inside the
 * drawer panel). Entry points (Details "+", drawer item, calendar day sheet)
 * all call `openRecordChooser`, so the form state lives in exactly one place.
 */
export const ManualEntryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigation = useNavigation<DrawerNavigationProp<RootDrawerParamList>>();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);
  const [chooserVisible, setChooserVisible] = useState(false);
  const [chooserDate, setChooserDate] = useState<string | undefined>(undefined);

  const openManualEntry = useCallback((date?: string) => {
    setInitialDate(date);
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => setSheetVisible(false), []);

  const openRecordChooser = useCallback((date?: string) => {
    setChooserDate(date);
    setChooserVisible(true);
  }, []);

  const closeChooser = useCallback(() => setChooserVisible(false), []);

  const handleRecord = useCallback(() => {
    navigation.navigate('Record');
  }, [navigation]);

  const handleEnterManually = useCallback(() => {
    openManualEntry(chooserDate);
  }, [chooserDate, openManualEntry]);

  const value = useMemo(
    () => ({ openManualEntry, openRecordChooser }),
    [openManualEntry, openRecordChooser]
  );

  return (
    <ManualEntryContext.Provider value={value}>
      {children}
      <ManualActivitySheet visible={sheetVisible} initialDate={initialDate} onClose={closeSheet} />
      <RecordChooserSheet
        visible={chooserVisible}
        onClose={closeChooser}
        onRecord={handleRecord}
        onEnterManually={handleEnterManually}
      />
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
