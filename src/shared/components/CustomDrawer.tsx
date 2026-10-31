import { ProgressOverlay } from '@/features/stats';
import { exportData, simpleLogger } from '@/shared';
import { Ionicons } from '@expo/vector-icons';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList
} from '@react-navigation/drawer';
import React, { JSX, useState } from 'react';

import { useManualEntry } from '@/features/activities';

/**
 * Creates an icon component for drawer navigation.
 * @param iconName The name of the Ionicons icon to use.
 * @returns A function component that renders the icon.
 */
export type IoniconName = keyof typeof Ionicons.glyphMap;

function getIconOptions(iconName: IoniconName) {
  // The tint comes from the navigation theme, which follows the active palette.
  const makeIcon = ({ size, color }: { focused: boolean; size: number; color: string }) => (
    <Ionicons name={iconName} size={size} color={color} />
  );
  return makeIcon;
}

/**
 * Creates drawer options with an icon.
 * @param iconName The name of the Ionicons icon to use.
 * @returns Drawer options object with the icon.
 */
export function getDrawerIconOptions(iconName: IoniconName) {
  return {
    drawerIcon: getIconOptions(iconName)
  };
}

/**
 * A custom drawer content component for the app's drawer navigation.
 * @param props The component props.
 * @returns A React component.
 */
type CustomDrawerContentProps = DrawerContentComponentProps & {
  /** Opens the app's global settings (palette, WebDAV backup). */
  onOpenSettings: () => void;
};

export function CustomDrawerContent(props: CustomDrawerContentProps): JSX.Element {
  const { openRecordChooser } = useManualEntry();

  // Progress overlay states
  const [exportProgress, setExportProgress] = useState(0);
  const [exportVisible, setExportVisible] = useState(false);

  const handleExportData = async () => {
    simpleLogger.log('User initiated data export', {
      timestamp: new Date().toISOString()
    });
    setExportVisible(true);
    setExportProgress(0);
    props.navigation.closeDrawer();

    try {
      await exportData(progress => {
        setExportProgress(progress);
      });
    } catch (error) {
      simpleLogger.error('Data export failed', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
    setExportVisible(false);
    setExportProgress(0);
  };

  return (
    <DrawerContentScrollView {...props}>
      <DrawerItemList {...props} />
      {/* RECORD-CHOOSER: single entry point for "add an activity". */}
      <DrawerItem
        label="Add activity"
        onPress={() => {
          props.navigation.closeDrawer();
          openRecordChooser();
        }}
        icon={getIconOptions('add-circle-outline')}
      />
      <DrawerItem
        label="Settings"
        onPress={() => {
          props.navigation.closeDrawer();
          props.onOpenSettings();
        }}
        icon={getIconOptions('settings-outline')}
      />
      <DrawerItem
        label="Profile"
        onPress={() => {
          props.navigation.closeDrawer();
          props.navigation.navigate('Profile');
        }}
        icon={getIconOptions('person-outline')}
      />
      <DrawerItem
        label="Export Data"
        onPress={handleExportData}
        icon={getIconOptions('download-outline')}
      />

      {/* Progress Overlay */}
      <ProgressOverlay
        visible={exportVisible}
        title="Exporting Data"
        progress={exportProgress}
        onCancel={() => setExportVisible(false)}
      />
    </DrawerContentScrollView>
  );
}
