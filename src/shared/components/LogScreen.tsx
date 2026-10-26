import { LogEntry, LogLevel, simpleLogger } from '@/shared/services/SimpleLogger';
import { ResolvedTheme, useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import Clipboard from '@react-native-clipboard/clipboard';
import { FlashList } from '@shopify/flash-list';
import React, { JSX, useCallback, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function LogScreen(): JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [logs, setLogs] = useState<LogEntry[]>(simpleLogger.logs);
  const [isReversed, setIsReversed] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
  const themeColors = theme.log;

  // Force update function to refresh logs
  const forceUpdate = () => {
    setLogs([...simpleLogger.logs]);
  };

  const getLevelColor = useCallback(
    (level: LogLevel) => {
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
    },
    [themeColors]
  );

  const getLevelName = useCallback((level: LogLevel) => {
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
  }, []);

  const formatTimestamp = useCallback((date: Date) => {
    return date.toLocaleTimeString();
  }, []);

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

  const handleCopyLogEntry = useCallback(
    (log: LogEntry) => {
      const timestamp = formatTimestamp(log.date);
      const logText = `[${timestamp}] ${getLevelName(log.level)}: ${log.text}`;

      Clipboard.setString(logText);
      Alert.alert('Copied', 'Log entry copied to clipboard.');
    },
    [formatTimestamp, getLevelName]
  );

  // Stable renderItem identity so FlashList doesn't re-render every row on each
  // render (theme/logs changes would otherwise allocate a new function).
  const renderLogItem = useCallback(
    ({ item }: { item: LogEntry }) => (
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
    ),
    [styles, themeColors, getLevelColor, getLevelName, formatTimestamp, handleCopyLogEntry]
  );

  // Avoid allocating a reversed copy on every render when the order is unchanged.
  const listData = useMemo(() => (isReversed ? [...logs].reverse() : logs), [logs, isReversed]);

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
              style={[styles.actionButton, styles.copyButton]}
              onPress={handleCopyAllLogs}
            >
              <Text style={styles.copyButtonText}>Copy All</Text>
            </TouchableOpacity>
          ) : null}
          {logs.length > 0 ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.exportButton]}
              onPress={handleExportLogs}
            >
              <Text style={styles.exportButtonText}>Export</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.actionButton, styles.clearButton]}
            onPress={handleClearLogs}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.refreshButton]}
            onPress={forceUpdate}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.invertButton, isReversed ? styles.invertButtonActive : null]}
            onPress={() => setIsReversed(!isReversed)}
          >
            <Ionicons
              name={isReversed ? 'arrow-up' : 'arrow-down'}
              size={18}
              color={isReversed ? theme.primary : theme.text}
            />
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
          data={listData}
          renderItem={renderLogItem}
          keyExtractor={(item, index) => `${item.date.getTime()}-${index}`}
          style={styles.logsList}
          showsVerticalScrollIndicator={true}
        />
      )}
    </View>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
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
    actionButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1
    },
    copyButton: {
      backgroundColor: theme.successSoft,
      borderColor: theme.success
    },
    copyButtonText: {
      color: theme.textStrong,
      fontSize: 14,
      fontWeight: '600'
    },
    exportButton: {
      backgroundColor: theme.surfaceSunken,
      borderColor: theme.border
    },
    exportButtonText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600'
    },
    clearButton: {
      backgroundColor: theme.dangerSoft,
      borderColor: theme.dangerBorder
    },
    clearButtonText: {
      color: theme.danger,
      fontSize: 14,
      fontWeight: '600'
    },
    refreshButton: {
      backgroundColor: theme.primary,
      borderColor: theme.primary
    },
    refreshButtonText: {
      color: theme.onPrimary,
      fontSize: 14,
      fontWeight: '600'
    },
    invertButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      minWidth: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceSunken,
      borderColor: theme.border
    },
    invertButtonActive: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary
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
