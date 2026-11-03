import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ResolvedTheme } from '@/theme';
import { MetricCardStyles } from './metricCardStyles';

export interface MetricChange {
  readonly text: string;
  readonly isPositive: boolean;
  readonly isNeutral: boolean;
}

export interface MetricBadgeItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly subValue?: string;
  readonly change: MetricChange | null;
}

export interface MetricBadgeButtonProps {
  readonly metric: MetricBadgeItem;
  readonly isSelected: boolean;
  readonly onSelect: (key: string) => void;
  readonly theme: ResolvedTheme;
  readonly styles: MetricCardStyles;
}

function getChangeColor(change: MetricChange | null | undefined, theme: ResolvedTheme): string {
  if (!change || change.isNeutral) {
    return theme.textMuted;
  }
  return change.isPositive ? theme.success : theme.danger;
}

export function MetricBadgeButton({
  metric,
  isSelected,
  onSelect,
  theme,
  styles
}: MetricBadgeButtonProps): React.JSX.Element {
  const changeColor = getChangeColor(metric.change, theme);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Show ${metric.label} trend`}
      onPress={() => onSelect(metric.key)}
      style={[styles.badgeCard, isSelected ? styles.badgeCardSelected : null]}
    >
      <Text style={styles.badgeLabel} numberOfLines={1}>
        {metric.label}
      </Text>
      <Text style={[styles.badgeValue, isSelected ? styles.badgeValueSelected : null]}>
        {metric.value}
      </Text>
      {metric.subValue ? <Text style={styles.badgeSubValue}>{metric.subValue}</Text> : null}
      {metric.change ? (
        <View style={styles.changeRow}>
          {!metric.change.isNeutral ? (
            <Ionicons
              name={metric.change.isPositive ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={changeColor}
            />
          ) : null}
          <Text style={[styles.changeText, { color: changeColor }]}>{metric.change.text} YoY</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
