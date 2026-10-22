import { ResolvedTheme, useTheme } from '@/theme';
import { Activity, seconds_to_label } from '@/shared';
import React, { useMemo } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface DayActivitiesSheetProps {
  visible: boolean;
  /** Athlete-local date 'YYYY-MM-DD' the sheet was opened for. */
  date: string;
  /** That day's activities, most recent first. Empty when the day is free. */
  activities: Activity[];
  onSelect: (activity: Activity) => void;
  onAdd: (date: string) => void;
  onClose: () => void;
}

/**
 * What a calendar day tap opens, for empty and non-empty days alike. Days
 * often hold several activities (a ride plus an evening Yoga), and the old
 * tap behavior silently picked the most recent one — so the sheet lists every
 * activity of the day and carries the "+ Add activity on this day" button that
 * opens the manual entry prefilled with this date.
 */
export function DayActivitiesSheet({
  visible,
  date,
  activities,
  onSelect,
  onAdd,
  onClose
}: Readonly<DayActivitiesSheetProps>): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!visible) {
    return <></>;
  }

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{date}</Text>
            <Text style={styles.subtitle}>
              {activities.length === 0
                ? 'No activity yet'
                : `${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {activities.length === 0 ? (
              <Text style={styles.emptyText}>Nothing recorded on this day.</Text>
            ) : (
              activities.map(activity => (
                <Pressable
                  key={activity.id}
                  style={styles.row}
                  onPress={() => onSelect(activity)}
                  accessibilityRole="button"
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1} ellipsizeMode="tail">
                      {activity.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {activity.type}
                      {activity.local_time ? ` at ${activity.local_time.slice(0, 5)}` : ''} ·{' '}
                      {seconds_to_label(activity.elapsed_time)}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={() => onAdd(date)}
              accessibilityLabel={`Add activity on ${date}`}
            >
              <Text style={styles.primaryButtonText}>+ Add activity</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: ResolvedTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.scrim,
      justifyContent: 'flex-end',
      alignItems: 'center'
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '70%',
      backgroundColor: theme.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.25,
          shadowRadius: 4
        },
        android: { elevation: 5 },
        web: { boxShadow: '0 -2px 4px rgba(0,0,0,0.25)' }
      })
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
      alignItems: 'center'
    },
    title: {
      fontSize: 17,
      fontWeight: 'bold',
      color: theme.text
    },
    subtitle: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 2
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 8
    },
    emptyText: {
      fontSize: 14,
      color: theme.textSubtle,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 12
    },
    row: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border
    },
    rowText: {
      gap: 2
    },
    rowName: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text
    },
    rowMeta: {
      fontSize: 13,
      color: theme.textMuted
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border
    },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      minHeight: 42,
      justifyContent: 'center'
    },
    primaryButton: {
      backgroundColor: theme.primary
    },
    primaryButtonText: {
      color: theme.onPrimary,
      fontWeight: '600',
      textAlign: 'center'
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.border
    },
    secondaryButtonText: {
      color: theme.text,
      fontWeight: '600',
      textAlign: 'center'
    }
  });
