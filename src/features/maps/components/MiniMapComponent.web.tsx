import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { LatLng, ActivityStream } from '@/shared';

export type MiniMapComponentProps = {
  stream: ActivityStream | undefined;
};

/**
 * A component for displaying a mini map of an activity on the web.
 * @param props The component props.
 * @returns A React component.
 */
export default function MiniMapComponent(props: Readonly<MiniMapComponentProps>) {
  const mapRef = React.useRef<MapView>(null);

  const coordinates: LatLng[] | undefined = props.stream?.coordinates;

  useEffect(() => {
    if (coordinates?.length && mapRef.current) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 10, right: 10, bottom: 10, left: 10 },
        animated: true
      });
    }
  }, [coordinates]);

  useEffect(() => {
    if (coordinates === null || coordinates === undefined) {
      return;
    }
    // No-op: initialCamera + region cover the ready state; keep effect to react to coord changes
  }, [coordinates]);

  if (coordinates === null || coordinates === undefined) {
    return;
  }
  return (
    <View style={styles.map}>
      <MapView
        initialCamera={{
          zoom: 14,
          center: {
            latitude: coordinates ? coordinates[0].latitude : 48.864716,
            longitude: coordinates ? coordinates[0].longitude : 2.349014
          },
          heading: 0,
          pitch: 0
        }}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        ref={mapRef}
        region={{
          latitude: coordinates ? coordinates[0].latitude : 48.864716,
          longitude: coordinates ? coordinates[0].longitude : 2.349014,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421
        }}
        showsMyLocationButton={true}
        zoomControlEnabled={true}
        showsCompass={true}
        showsUserLocation
        showsScale={true}
        loadingEnabled={true}
        loadingIndicatorColor={'green'}
      >
        {coordinates ? (
          <Marker
            coordinate={coordinates[0]}
            title={'Start'}
            description={'Start of the activity'}
            pinColor="green"
          />
        ) : null}
        {coordinates ? (
          <Polyline
            coordinates={coordinates}
            strokeWidth={5}
            strokeColor="red"
            fillColor="rgba(255,0,0,0.5)"
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    //      flex: 1,
  },
  map: {
    width: 400,
    height: 300
  }
});
