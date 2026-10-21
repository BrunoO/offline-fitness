import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useState, PropsWithChildren, useEffect } from 'react';
import { simpleLogger } from '@/shared';

type SettingsContextType = {
  numberRecentWeeks: number;
  numberRecentMonths: number;
  useElapsedTime: boolean;
  mergeSimilarActivities: boolean;
  weeklyGoal: string;
  setMergeSimilarActivities: (value: boolean) => void;
  setNumberRecentWeeks: (value: number) => void;
  setNumberRecentMonths: (value: number) => void;
  setUseElapsedTime: (value: boolean) => void;
  setWeeklyGoal: (value: string) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

/**
 * A provider for the settings context.
 * @param children The children to render.
 * @returns A React component.
 */
export const SettingsProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [numberRecentWeeks, setNumberRecentWeeks] = useState<number>(12);
  const [numberRecentMonths, setNumberRecentMonths] = useState<number>(15);
  const [useElapsedTime, setUseElapsedTime] = useState<boolean>(true);
  const [mergeSimilarActivities, setMergeSimilarActivities] = useState<boolean>(true);
  const [weeklyGoal, setWeeklyGoal] = useState<string>(
    'sum("elapsed_time") >= 6 * 3600 and sum("elapsed_time", "type == \'Yoga\'") >= 1 * 3600'
  );

  useEffect(() => {
    const loadSettings = async () => {
      const storedNumberRecentWeeks = await AsyncStorage.getItem('numberRecentWeeks');
      if (storedNumberRecentWeeks) {
        setNumberRecentWeeks(JSON.parse(storedNumberRecentWeeks));
      }
      const storedNumberRecentMonths = await AsyncStorage.getItem('numberRecentMonths');
      if (storedNumberRecentMonths) {
        setNumberRecentMonths(JSON.parse(storedNumberRecentMonths));
      }
      const storedUseElapsedTime = await AsyncStorage.getItem('useElapsedTime');
      if (storedUseElapsedTime) {
        setUseElapsedTime(JSON.parse(storedUseElapsedTime));
      }
      const storedMergeSimilarActivities = await AsyncStorage.getItem('mergeSimilarActivities');
      if (storedMergeSimilarActivities) {
        setMergeSimilarActivities(JSON.parse(storedMergeSimilarActivities));
      }
      const storedWeeklyGoal = await AsyncStorage.getItem('userWeeklyGoal');
      if (storedWeeklyGoal !== null) {
        setWeeklyGoal(storedWeeklyGoal);
      }
      setIsLoading(false);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('numberRecentWeeks', JSON.stringify(numberRecentWeeks)).catch(e =>
        simpleLogger.error('Failed to persist numberRecentWeeks:', e)
      );
    }
  }, [numberRecentWeeks, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('numberRecentMonths', JSON.stringify(numberRecentMonths)).catch(e =>
        simpleLogger.error('Failed to persist numberRecentMonths:', e)
      );
    }
  }, [numberRecentMonths, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('useElapsedTime', JSON.stringify(useElapsedTime)).catch(e =>
        simpleLogger.error('Failed to persist useElapsedTime:', e)
      );
    }
  }, [useElapsedTime, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('mergeSimilarActivities', JSON.stringify(mergeSimilarActivities)).catch(
        e => simpleLogger.error('Failed to persist mergeSimilarActivities:', e)
      );
    }
  }, [mergeSimilarActivities, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('userWeeklyGoal', weeklyGoal).catch(e =>
        simpleLogger.error('Failed to persist userWeeklyGoal:', e)
      );
    }
  }, [weeklyGoal, isLoading]);

  return (
    <SettingsContext.Provider
      value={{
        numberRecentWeeks,
        numberRecentMonths,
        useElapsedTime,
        mergeSimilarActivities,
        weeklyGoal,
        setNumberRecentWeeks,
        setNumberRecentMonths,
        setUseElapsedTime,
        setMergeSimilarActivities,
        setWeeklyGoal
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

/**
 * A hook for accessing the settings context.
 * @returns The settings context.
 */
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
