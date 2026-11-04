import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ProfileHubContextType = {
  /** Whether the Profile / Settings Hub sheet is currently open. */
  isHubOpen: boolean;
  /** Opens the Profile / Settings Hub sheet from anywhere in the app (e.g. header avatar). */
  openHub: () => void;
  /** Closes the Profile / Settings Hub sheet. */
  closeHub: () => void;
};

const ProfileHubContext = createContext<ProfileHubContextType | undefined>(undefined);

/**
 * Provider managing visibility of the root Profile & Settings Hub sheet.
 * Mounted at the app root beside `ManualEntryProvider` (ONT-ARCH-05).
 */
export const ProfileHubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHubOpen, setIsHubOpen] = useState(false);

  const openHub = useCallback(() => setIsHubOpen(true), []);
  const closeHub = useCallback(() => setIsHubOpen(false), []);

  const value = useMemo(() => ({ isHubOpen, openHub, closeHub }), [isHubOpen, openHub, closeHub]);

  return <ProfileHubContext.Provider value={value}>{children}</ProfileHubContext.Provider>;
};

/**
 * Hook to access the Profile Hub state and controls.
 */
export const useProfileHub = (): ProfileHubContextType => {
  const context = useContext(ProfileHubContext);
  if (context === undefined) {
    throw new Error('useProfileHub must be used within a ProfileHubProvider');
  }
  return context;
};
