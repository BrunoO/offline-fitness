import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as MyColors from '@/constants/colors';

interface ProgressOverlayProps {
  visible: boolean;
  title: string;
  progress: number;
  onCancel?: () => void;
  showCancel?: boolean;
}

/**
 * A reusable progress overlay component that shows progress for background operations.
 * @param props The component props.
 * @returns A React component.
 */
export function ProgressOverlay({
  visible,
  title,
  progress,
  onCancel,
  showCancel = true
}: ProgressOverlayProps): React.JSX.Element {
  // Don't render if not visible to save memory
  if (!visible) {
    return <></>;
  }

  return (
    <Modal transparent={true} visible={visible} animationType="fade" statusBarTranslucent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
          {showCancel && onCancel ? (
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 2
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84
      },
      android: {
        elevation: 5
      },
      web: {
        boxShadow: '0 2px 4px rgba(0,0,0,0.25)'
      }
    })
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MyColors.deepOrange600,
    marginBottom: 8,
    textAlign: 'center'
  },
  progressText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16
  },
  progressBar: {
    height: '100%',
    backgroundColor: MyColors.lightGreen500,
    borderRadius: 4
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500'
  }
});
