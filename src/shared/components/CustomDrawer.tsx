import { ProgressOverlay } from '@/features/stats';
import { exportData, getAllActivitiesKeys, removeAllActivities, simpleLogger } from '@/shared';
import { Ionicons } from '@expo/vector-icons';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList
} from '@react-navigation/drawer';
import React, { JSX, useState } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';

import { useActivitiesContext, useManualEntry } from '@/features/activities';

/**
 * Creates an icon component for drawer navigation.
 * @param iconName The name of the Ionicons icon to use.
 * @returns A function component that renders the icon.
 */
export type IoniconName = keyof typeof Ionicons.glyphMap;

export function getIconOptions(iconName: IoniconName) {
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
  const { setTotalActivitiesStored, setGlobalActivities } = useActivitiesContext();
  const { openRecordChooser } = useManualEntry();

  // Progress overlay states
  const [exportProgress, setExportProgress] = useState(0);
  const [exportVisible, setExportVisible] = useState(false);
  // Guards the Clear-Activities handler against double-tap while the native
  // batch delete is in flight (see the handler for why ordering matters).
  const [isClearing, setIsClearing] = useState(false);

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
      <DrawerItem
        label="Clear Local Activities"
        onPress={() => {
          Alert.alert(
            'Clear Local Activities',
            'This deletes all activity records on this phone so a fresh Restore can refill them (for example after the backup was corrected elsewhere). Cached tracks are kept and reused. This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  if (isClearing) return;
                  setIsClearing(true);
                  try {
                    await removeAllActivities();
                    // The deletion is one native batch over thousands of keys.
                    // Restoring before it lands leaves survivors that Restore
                    // then skips as "local wins" — and the next push
                    // re-uploads those stale records over the server's copies.
                    // So the UI only blanks after verifying the store is empty.
                    const remaining = await getAllActivitiesKeys();
                    if (remaining.length > 0) {
                      throw new Error(
                        `${remaining.length} record${remaining.length === 1 ? '' : 's'} could not be deleted`
                      );
                    }
                    setTotalActivitiesStored(0);
                    setGlobalActivities([]);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    simpleLogger.error('Clear Local Activities failed', {
                      error: message
                    });
                    Alert.alert(
                      'Could not clear activities',
                      `${message}. Nothing was discarded from the display — try again, and restore only once this succeeds.`
                    );
                  } finally {
                    setIsClearing(false);
                  }
                }
              }
            ]
          );
        }}
        icon={getIconOptions('trash-outline')}
      />
      <DrawerItem
        label="Close drawer"
        onPress={() => props.navigation.closeDrawer()}
        icon={getIconOptions('exit-outline')}
      />
      {Platform.OS === 'android' ? (
        <DrawerItem
          label="Close App"
          onPress={() => BackHandler.exitApp()}
          icon={getIconOptions('power-outline')}
        />
      ) : null}

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
