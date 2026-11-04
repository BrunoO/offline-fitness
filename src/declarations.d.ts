// necessary to remove tsc errors
// https://dev.to/vinipachecov/how-to-use-svg-files-in-react-native-with-typescript-1bn7

declare module '*.svg' {
  const content: string; // React.FC<SvgProps>;
  export default content;
}

// Build-time environment (EXPO_PUBLIC_* vars are inlined by Expo at build
// time; they are available on process.env). Declared here so src can read
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY without tsc complaining about an untyped
// process.env.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
  }
}

// Minimal typings shim for pako (jszip dependency, used directly by the ZIP
// reader for deflate/inflate). Only the surface this app uses is declared.
declare module 'pako' {
  export function inflateRaw(data: Uint8Array): Uint8Array;
  export function inflate(data: Uint8Array): Uint8Array;
  export function gzip(data: Uint8Array): Uint8Array;
  export function ungzip(data: Uint8Array): Uint8Array;
  const pako: {
    inflateRaw: typeof inflateRaw;
    inflate: typeof inflate;
    gzip: typeof gzip;
    ungzip: typeof ungzip;
  };
  export default pako;
}

// Minimal typings shim for FlashList to satisfy TS when package types are unavailable
declare module '@shopify/flash-list' {
  import { ComponentType } from 'react';
  import { FlatListProps } from 'react-native';

  export const FlashList: ComponentType<
    FlatListProps<any> & {
      estimatedItemSize?: number;
    }
  >;
}
