import { logColors } from '@/constants/colors';
import { LogEntry, LogLevel, simpleLogger } from '@/shared/services/SimpleLogger';
import { Ionicons } from '@expo/vector-icons';
import Clipboard from '@react-native-clipboard/clipboard';
import { FlashList } from '@shopify/flash-list';
import React, { JSX, useState } from 'react';
import {
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function LogScreen(): JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>(simpleLogger.logs);
  const [isReversed, setIsReversed] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const themeColors = logColors[colorScheme];

  // Force update function to refresh logs
  const forceUpdate = () => {
    setLogs([...simpleLogger.logs]);
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case LogLevel.Error:
        return themeColors.logLevel.Error;
      case LogLevel.Warning:
        return themeColors.logLevel.Warning;
      case LogLevel.Info:
        return themeColors.logLevel.Info;
      default:
        return themeColors.logLevel.Default;
    }
  };

  const getLevelName = (level: LogLevel) => {
    switch (level) {
      case LogLevel.Error:
        return 'ERROR';
      case LogLevel.Warning:
        return 'WARNING';
      case LogLevel.Info:
        return 'INFO';
      default:
        return 'UNKNOWN';
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const handleClearLogs = () => {
    Alert.alert('Clear Logs', 'Are you sure you want to clear all logs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          simpleLogger.clearLogs();
          forceUpdate();
        }
      }
    ]);
  };

  const handleCopyAllLogs = () => {
    if (logs.length === 0) {
      Alert.alert('No Logs', 'There are no logs to copy.');
      return;
    }

    const logsText = logs
      .map(log => {
        const timestamp = formatTimestamp(log.date);
        return `[${timestamp}] ${getLevelName(log.level)}: ${log.text}`;
      })
      .join('\n\n');

    Clipboard.setString(logsText);
    Alert.alert('Copied', 'All logs have been copied to clipboard.');
  };

  const handleExportLogs = async () => {
    try {
      const logData = logs
        .map(log => {
          const timestamp = formatTimestamp(log.date);
          return `[${timestamp}] ${getLevelName(log.level)}: ${log.text}`;
        })
        .join('\n');

      await Share.share({
        message: logData,
        title: 'Exported Logs'
      });
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert('Export Failed', error.message);
      }
    }
  };

  const handleCopyLogEntry = (log: LogEntry) => {
    const timestamp = formatTimestamp(log.date);
    const logText = `[${timestamp}] ${getLevelName(log.level)}: ${log.text}`;

    Clipboard.setString(logText);
    Alert.alert('Copied', 'Log entry copied to clipboard.');
  };

  const renderLogItem = ({ item }: { item: LogEntry }) => (
    <View
      style={[
        styles.logItem,
        {
          borderLeftColor: getLevelColor(item.level),
          backgroundColor: themeColors.logItemBackground
        }
      ]}
    >
      <View style={styles.logHeader}>
        <View style={styles.logHeaderLeft}>
          <Text style={[styles.logLevel, { color: getLevelColor(item.level) }]} selectable={true}>
            {getLevelName(item.level)}
          </Text>
          <Text style={[styles.logTime, { color: themeColors.timestamp }]} selectable={true}>
            {formatTimestamp(item.date)}
          </Text>
        </View>
        <TouchableOpacity style={styles.logCopyButton} onPress={() => handleCopyLogEntry(item)}>
          <Ionicons name="copy-outline" size={16} color={themeColors.timestamp} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.logMessage, { color: themeColors.text }]} selectable={true}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: themeColors.background
        }
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerButtons}>
          {logs.length > 0 ? (
            <TouchableOpacity
              style={[styles.copyButton, { backgroundColor: '#4CAF50' }]}
              onPress={handleCopyAllLogs}
            >
              <Text style={styles.buttonText}>Copy All</Text>
            </TouchableOpacity>
          ) : null}
          {logs.length > 0 ? (
            <TouchableOpacity
              style={[styles.exportButton, { backgroundColor: '#2196F3' }]}
              onPress={handleExportLogs}
            >
              <Text style={styles.buttonText}>Export</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.clearButton, { backgroundColor: '#F44336' }]}
            onPress={handleClearLogs}
          >
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: '#FF9800' }]}
            onPress={forceUpdate}
          >
            <Text style={styles.buttonText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.invertButton,
              {
                backgroundColor: isReversed ? '#4CAF50' : '#607D8B',
                borderWidth: 2,
                borderColor: isReversed ? '#2E7D32' : '#455A64'
              }
            ]}
            onPress={() => setIsReversed(!isReversed)}
          >
            <Ionicons name={isReversed ? 'arrow-up' : 'arrow-down'} size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: themeColors.text }]}>No logs yet</Text>
          <Text style={[styles.emptySubtext, { color: themeColors.timestamp }]}>
            Logs will appear here as the app runs
          </Text>
        </View>
      ) : (
        <FlashList
          data={isReversed ? [...logs].reverse() : logs}
          renderItem={renderLogItem}
          keyExtractor={(item, index) => `${item.date.getTime()}-${index}`}
          style={styles.logsList}
          showsVerticalScrollIndicator={true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  },
  header: {
    marginBottom: 20
  },
  headerButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 8
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold'
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600'
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  invertButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  copyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  exportButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  refreshButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center'
  },
  logsList: {
    flex: 1
  },
  logItem: {
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 8,
    borderRadius: 8
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  logLevel: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  logTime: {
    fontSize: 14
  },
  logMessage: {
    fontSize: 14,
    marginBottom: 4
  },
  logCopyButton: {
    padding: 4,
    borderRadius: 4
  }
});
