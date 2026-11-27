import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { GoogleMaps3DNativeViewProps } from './GoogleMaps3D.types';

export const GoogleMaps3DNativeView: ComponentType<GoogleMaps3DNativeViewProps> =
  requireNativeViewManager<GoogleMaps3DNativeViewProps>('GoogleMaps3D');
