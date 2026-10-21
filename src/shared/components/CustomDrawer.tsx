import { StravaImportModal } from '@/features/strava-import';
import { ProgressOverlay } from '@/features/stats';
import { exportData, removeAllActivities, simpleLogger } from '@/shared';
import { Ionicons } from '@expo/vector-icons';
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList
} from '@react-navigation/drawer';
import React, { JSX, useState } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';

import { useActivitiesContext } from '@/features/activities';

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

  // Progress overlay states
  const [exportProgress, setExportProgress] = useState(0);
  const [exportVisible, setExportVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);

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
      <DrawerItem
        label="Export Data"
        onPress={handleExportData}
        icon={getIconOptions('download-outline')}
      />
      <DrawerItem
        label="Import Strava Export"
        onPress={() => {
          props.navigation.closeDrawer();
          setImportVisible(true);
        }}
        icon={getIconOptions('cloud-upload-outline')}
      />
      <DrawerItem
        label="Clear Local Activities"
        onPress={() => {
          Alert.alert(
            'Clear Local Activities',
            'This will permanently delete all locally stored activities. This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  removeAllActivities();
                  setTotalActivitiesStored(0);
                  setGlobalActivities([]);
                }
              }
            ]
          );
        }}
        icon={getIconOptions('trash-outline')}
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

      <StravaImportModal visible={importVisible} onClose={() => setImportVisible(false)} />
    </DrawerContentScrollView>
  );
}
