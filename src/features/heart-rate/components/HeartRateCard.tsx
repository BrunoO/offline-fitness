import React, { JSX, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  onDisconnect: () => void;
  onForget: () => void;
  styles: ReturnType<typeof createStyles>;
}

function ConnectedMetrics({
  liveHr,
  onDisconnect,
  onForget,
  styles
}: Readonly<ConnectedMetricsProps>): JSX.Element {
  return (
    <View>
      <View style={styles.liveHrRow}>
        <Text style={styles.liveHrValue}>{liveHr ?? '—'}</Text>
        <Text style={styles.liveHrUnit}>bpm</Text>
      </View>
      <Pressable onPress={onDisconnect} style={styles.actionButton}>
        <Text style={styles.buttonDanger}>Disconnect</Text>
      </Pressable>
      <Pressable onPress={onForget} style={styles.actionButton}>
        <Text style={styles.buttonMuted}>Forget device</Text>
      </Pressable>
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
        <Pressable key={device.id} onPress={() => onSelect(device)} style={styles.deviceItem}>
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
  onStartScan: () => void;
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
  onStartScan,
  onSelectDevice,
  onSubmitManualId,
  placeholderColor,
  styles
}: Readonly<DisconnectedSectionProps>): JSX.Element {
  const scanButtonLabel = scanning ? 'Scanning…' : 'Connect sensor';
  return (
    <View>
      <Pressable onPress={onStartScan} style={styles.actionButton}>
        <Text style={styles.buttonPrimary}>{scanButtonLabel}</Text>
      </Pressable>

      {scanning && devices.length === 0 ? (
        <Text style={styles.emptyNotice}>No heart-rate sensors found.</Text>
      ) : null}

      {!scanning && devices.length === 0 ? (
        <Text style={styles.emptyNotice}>
          No heart-rate sensors found. Make sure the strap is on and nearby.
        </Text>
      ) : null}

      {scanning && devices.length > 0 ? (
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

export function HeartRateCard(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hr = useHeartRate();
  const perms = useHeartRatePermissions();
  const [manualId, setManualId] = useState('');

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

  const handleManualConnect = () => {
    const trimmed = manualId.trim();
    if (trimmed) {
      hr.connect(trimmed, trimmed);
      setManualId('');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Heart rate</Text>
      <Text style={styles.statusText}>{statusText}</Text>

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

      {isConnected ? (
        <ConnectedMetrics
          liveHr={hr.liveHr}
          onDisconnect={() => {
            hr.disconnect();
          }}
          onForget={() => {
            hr.forget();
          }}
          styles={styles}
        />
      ) : null}

      {!isConnected && hr.connectionState !== 'error' ? (
        <DisconnectedSection
          scanning={hr.scanning}
          devices={hr.devices}
          manualId={manualId}
          onChangeManualId={setManualId}
          onStartScan={() => {
            hr.startScan();
          }}
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
    title: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8
    },
    message: {
      color: theme.textMuted,
      marginBottom: 8
    },
    statusText: {
      color: theme.textMuted,
      marginBottom: 8
    },
    errorText: {
      color: theme.danger,
      marginBottom: 8
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
      paddingVertical: 8,
      minHeight: 44,
      justifyContent: 'center'
    },
    deviceText: {
      color: theme.text
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
      marginLeft: 8,
      paddingHorizontal: 12,
      minHeight: 44,
      justifyContent: 'center'
    }
  });
