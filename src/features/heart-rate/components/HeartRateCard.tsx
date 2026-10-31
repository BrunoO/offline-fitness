import React, { JSX, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type ResolvedTheme, useTheme } from '@/theme';
import { simpleLogger } from '@/shared';
import { useHeartRate } from '../hooks/useHeartRate';
import { useHeartRatePermissions } from '../hooks/useHeartRatePermissions';
import type { HeartRateDevice, HeartRateState } from '../services/heartRate';

function getStatusMessage(
  connected: boolean,
  deviceName: string | undefined,
  battery: number | null,
  connectionState: HeartRateState['connectionState']
): string {
  if (connected && deviceName) {
    const batterySuffix = battery != null ? ` · ${battery}%` : '';
    return `Connected: ${deviceName}${batterySuffix}`;
  }
  if (connectionState === 'error') {
    return 'Connection failed';
  }
  if (connectionState === 'connecting') {
    return 'Connecting…';
  }
  return 'Not connected';
}

interface PermissionPromptProps {
  onGrant: () => void;
  onOpenSettings: () => void;
  styles: ReturnType<typeof createStyles>;
}

function PermissionPrompt({
  onGrant,
  onOpenSettings,
  styles
}: Readonly<PermissionPromptProps>): JSX.Element {
  return (
    <View>
      <Text style={styles.message}>
        Bluetooth permission is required to scan for heart-rate sensors.
      </Text>
      <Pressable onPress={onGrant} style={styles.actionButton}>
        <Text style={styles.buttonPrimary}>Grant Bluetooth permission</Text>
      </Pressable>
      <Pressable onPress={onOpenSettings} style={styles.actionButton}>
        <Text style={styles.buttonMuted}>Open settings</Text>
      </Pressable>
    </View>
  );
}

interface ConnectionErrorNoticeProps {
  onRetry: () => void;
  onOpenSettings: () => void;
  styles: ReturnType<typeof createStyles>;
}

function ConnectionErrorNotice({
  onRetry,
  onOpenSettings,
  styles
}: Readonly<ConnectionErrorNoticeProps>): JSX.Element {
  return (
    <View>
      <Text style={styles.errorText}>
        Could not connect to the heart-rate sensor. Make sure Bluetooth is on and the strap is
        nearby.
      </Text>
      <Pressable onPress={onRetry} style={styles.actionButton}>
        <Text style={styles.buttonPrimary}>Retry scan</Text>
      </Pressable>
      <Pressable onPress={onOpenSettings} style={styles.actionButton}>
        <Text style={styles.buttonMuted}>Open settings</Text>
      </Pressable>
    </View>
  );
}

interface ConnectedMetricsProps {
  liveHr: number | null;
  styles: ReturnType<typeof createStyles>;
}

function ConnectedMetrics({ liveHr, styles }: Readonly<ConnectedMetricsProps>): JSX.Element {
  return (
    <View style={styles.liveHrRow}>
      <Text style={styles.liveHrValue}>{liveHr ?? '—'}</Text>
      <Text style={styles.liveHrUnit}>bpm</Text>
    </View>
  );
}

interface DeviceListProps {
  devices: HeartRateDevice[];
  onSelect: (device: HeartRateDevice) => void;
  styles: ReturnType<typeof createStyles>;
}

function DeviceList({ devices, onSelect, styles }: Readonly<DeviceListProps>): JSX.Element {
  return (
    <ScrollView style={styles.deviceList}>
      {devices.map(device => (
        <Pressable
          key={device.id}
          accessibilityRole="button"
          accessibilityLabel={`Connect to ${device.name}`}
          onPress={() => onSelect(device)}
          style={({ pressed }) => [styles.deviceItem, pressed ? styles.deviceItemPressed : null]}
        >
          <Ionicons name="bluetooth" size={14} color={styles.deviceText.color as string} />
          <Text style={styles.deviceText}>
            {device.name} ({device.rssi ?? '—'} dBm)
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

interface ManualInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholderColor: string;
  styles: ReturnType<typeof createStyles>;
}

function ManualInput({
  value,
  onChangeText,
  onSubmit,
  placeholderColor,
  styles
}: Readonly<ManualInputProps>): JSX.Element {
  return (
    <View style={styles.manualContainer}>
      <Text style={styles.manualLabel}>Or enter device id:</Text>
      <View style={styles.manualRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="e.g. 12345XYZ"
          placeholderTextColor={placeholderColor}
          style={styles.input}
        />
        <Pressable onPress={onSubmit} style={styles.connectButton}>
          <Text style={styles.buttonPrimary}>Connect</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface DisconnectedSectionProps {
  scanning: boolean;
  devices: HeartRateDevice[];
  manualId: string;
  onChangeManualId: (text: string) => void;
  onSelectDevice: (device: HeartRateDevice) => void;
  onSubmitManualId: () => void;
  placeholderColor: string;
  styles: ReturnType<typeof createStyles>;
}

function DisconnectedSection({
  scanning,
  devices,
  manualId,
  onChangeManualId,
  onSelectDevice,
  onSubmitManualId,
  placeholderColor,
  styles
}: Readonly<DisconnectedSectionProps>): JSX.Element {
  return (
    <View style={styles.disconnectedSection}>
      {scanning && devices.length === 0 ? (
        <Text style={styles.emptyNotice}>Searching for nearby heart-rate sensors…</Text>
      ) : null}

      {!scanning && devices.length === 0 ? (
        <Text style={styles.emptyNotice}>
          No heart-rate sensors found. Make sure the strap is on and nearby.
        </Text>
      ) : null}

      {devices.length > 0 ? (
        <DeviceList devices={devices} onSelect={onSelectDevice} styles={styles} />
      ) : null}

      <ManualInput
        value={manualId}
        onChangeText={onChangeManualId}
        onSubmit={onSubmitManualId}
        placeholderColor={placeholderColor}
        styles={styles}
      />
    </View>
  );
}

function getConnectedDeviceName(device: { id: string; name: string } | null): string | undefined {
  if (!device) return undefined;
  return device.name || device.id;
}

interface HeaderStatusProps {
  isConnected: boolean;
  connectionState: string;
  statusText: string;
  deviceName?: string;
  scanning: boolean;
  shouldShowDisconnected: boolean;
  onToggleExpand: () => void;
  onStartScan: () => void;
  onManageDevice: () => void;
  primaryColor: string;
  styles: ReturnType<typeof createStyles>;
}

function HeaderStatus({
  isConnected,
  connectionState,
  statusText,
  deviceName,
  scanning,
  shouldShowDisconnected,
  onToggleExpand,
  onStartScan,
  onManageDevice,
  primaryColor,
  styles
}: Readonly<HeaderStatusProps>): JSX.Element {
  if (isConnected) {
    return (
      <View style={styles.headerActions}>
        <Text style={styles.statusText}>{statusText}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Manage ${deviceName ?? 'sensor'}`}
          hitSlop={8}
          onPress={onManageDevice}
          style={({ pressed }) => [
            styles.manageButton,
            pressed ? styles.manageButtonPressed : null
          ]}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={primaryColor} />
        </Pressable>
      </View>
    );
  }

  if (connectionState === 'error') {
    return <Text style={styles.errorStatusText}>{statusText}</Text>;
  }

  if (connectionState === 'connecting') {
    return <Text style={styles.statusText}>Connecting…</Text>;
  }

  return (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={scanning ? 'Scanning for heart-rate sensors' : 'Connect sensor'}
        disabled={scanning}
        onPress={onStartScan}
        style={({ pressed }) => [
          styles.connectPill,
          pressed && !scanning ? styles.connectPillPressed : null
        ]}
      >
        <Ionicons
          name={scanning ? 'sync-outline' : 'bluetooth-outline'}
          size={14}
          color={primaryColor}
        />
        <Text style={styles.connectPillText}>{scanning ? 'Scanning…' : 'Connect sensor'}</Text>
      </Pressable>
      {shouldShowDisconnected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Collapse sensor connection"
          hitSlop={8}
          onPress={onToggleExpand}
          style={styles.collapseButton}
        >
          <Ionicons name="chevron-up" size={16} color={primaryColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function HeartRateCard(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hr = useHeartRate();
  const perms = useHeartRatePermissions();
  const [manualId, setManualId] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const isConnected = hr.connectionState === 'connected' && hr.connectedDevice !== null;

  if (!perms.granted) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Heart rate</Text>
        <PermissionPrompt
          onGrant={() => void perms.requestPermissions()}
          onOpenSettings={() => void Linking.openSettings()}
          styles={styles}
        />
      </View>
    );
  }

  if (hr.capabilities?.canScan === false) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Heart rate</Text>
        <Text style={styles.message}>Heart-rate scanning is not available on this platform.</Text>
      </View>
    );
  }

  const deviceName = getConnectedDeviceName(hr.connectedDevice);
  const statusText = getStatusMessage(isConnected, deviceName, hr.battery, hr.connectionState);
  const shouldShowDisconnected = isExpanded || hr.scanning || hr.devices.length > 0;

  const handleManualConnect = () => {
    const trimmed = manualId.trim();
    if (trimmed) {
      hr.connect(trimmed, trimmed);
      setManualId('');
    }
  };

  const handleManageDevice = () => {
    Alert.alert(deviceName ?? 'Heart-rate sensor', 'Manage sensor connection', [
      {
        text: 'Disconnect',
        onPress: () => hr.disconnect()
      },
      {
        text: 'Forget device',
        style: 'destructive',
        onPress: () => hr.forget()
      },
      {
        text: 'Cancel',
        style: 'cancel'
      }
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={[styles.headerRow, shouldShowDisconnected ? styles.headerRowExpanded : null]}>
        <Text style={styles.title}>Heart rate</Text>
        <HeaderStatus
          isConnected={isConnected}
          connectionState={hr.connectionState}
          statusText={statusText}
          deviceName={deviceName}
          scanning={hr.scanning}
          shouldShowDisconnected={shouldShowDisconnected}
          onToggleExpand={() => setIsExpanded(prev => !prev)}
          onStartScan={() => {
            setIsExpanded(true);
            hr.startScan();
          }}
          onManageDevice={handleManageDevice}
          primaryColor={theme.primary}
          styles={styles}
        />
      </View>

      {hr.connectionState === 'error' && !isConnected ? (
        <ConnectionErrorNotice
          onRetry={() => {
            hr.startScan();
          }}
          onOpenSettings={() => {
            Linking.openSettings().catch(cause => {
              simpleLogger.error('Failed to open settings', cause);
            });
          }}
          styles={styles}
        />
      ) : null}

      {isConnected ? <ConnectedMetrics liveHr={hr.liveHr} styles={styles} /> : null}

      {!isConnected && hr.connectionState !== 'error' && shouldShowDisconnected ? (
        <DisconnectedSection
          scanning={hr.scanning}
          devices={hr.devices}
          manualId={manualId}
          onChangeManualId={setManualId}
          onSelectDevice={d => {
            hr.connect(d.id, d.name);
          }}
          onSubmitManualId={handleManualConnect}
          placeholderColor={theme.textMuted}
          styles={styles}
        />
      ) : null}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.surface
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    headerRowExpanded: {
      marginBottom: 8
    },
    headerActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6
    },
    connectPill: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      minHeight: 32,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    connectPillPressed: {
      opacity: 0.7
    },
    connectPillText: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '600'
    },
    collapseButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 32,
      minWidth: 32,
      padding: 4
    },
    manageButton: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 16,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 32,
      minWidth: 32,
      padding: 4
    },
    manageButtonPressed: {
      opacity: 0.7
    },
    title: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600'
    },
    message: {
      color: theme.textMuted,
      marginBottom: 8
    },
    statusText: {
      color: theme.textMuted,
      fontSize: 14
    },
    errorStatusText: {
      color: theme.danger,
      fontSize: 14
    },
    errorText: {
      color: theme.danger,
      marginBottom: 8
    },
    disconnectedSection: {
      marginTop: 4
    },
    emptyNotice: {
      color: theme.textMuted,
      marginTop: 8
    },
    liveHrRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: 8
    },
    liveHrValue: {
      color: theme.text,
      fontSize: 32,
      fontWeight: '700'
    },
    liveHrUnit: {
      color: theme.textMuted,
      marginLeft: 6
    },
    actionButton: {
      paddingVertical: 8,
      minHeight: 44,
      justifyContent: 'center'
    },
    buttonPrimary: {
      color: theme.primary,
      fontWeight: '500'
    },
    buttonDanger: {
      color: theme.danger,
      fontWeight: '500'
    },
    buttonMuted: {
      color: theme.textMuted
    },
    deviceList: {
      maxHeight: 120,
      marginTop: 8
    },
    deviceItem: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      marginBottom: 6,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    deviceItemPressed: {
      opacity: 0.7
    },
    deviceText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500'
    },
    manualContainer: {
      marginTop: 8
    },
    manualLabel: {
      color: theme.textMuted,
      marginBottom: 4
    },
    manualRow: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: theme.text,
      minHeight: 44
    },
    connectButton: {
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      marginLeft: 8,
      minHeight: 44,
      paddingHorizontal: 12
    }
  });
