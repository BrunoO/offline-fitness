import {
  StreamSet,
  loadRawStreamForActivity,
  useActivitiesDataContext
} from '@/features/activities';
import { Activity, activityToString, isNoGpsActivity } from '@/shared';
import React, { JSX, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryTheme } from 'victory-native';
import MiniMapComponent from '../components/MiniMapComponent';

interface ActivityWithStream {
  //todo replace from types.ts
  activity: Activity;
  stream: StreamSet;
}

/**
 * The maps screen of the app for the web platform.
 * @returns A React component.
 */
export default function MapsScreen(): JSX.Element {
  const { globalActivities: allActivities } = useActivitiesDataContext();

  const dataToGet = 1;
  let indexActivity = allActivities.length - 1;

  const [data, setData] = useState<ActivityWithStream[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const fetchedData: ActivityWithStream[] = [];
      while (indexActivity >= 0 && fetchedData.length < dataToGet) {
        const currentActivity = allActivities[indexActivity];
        if (!isNoGpsActivity(currentActivity.type)) {
          // Streams are read from the local cache written by the archive import.
          const stream = await loadRawStreamForActivity(currentActivity);
          if (stream) {
            fetchedData.push({
              activity: currentActivity,
              stream: stream
            });
          }
        }
        indexActivity--;
      }
      setData(fetchedData);
    };

    fetchData();
  }, [allActivities, indexActivity]);

  if (data.length < dataToGet) {
    return (
      <SafeAreaView>
        <Text>{'Loading....' + data.length.toString()} </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {data.map(item => (
          <View key={item.activity.id} style={{ marginRight: 16 }}>
            <MapItem item={item} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A component for displaying a map of an activity and a chart of its altitude.
 * @param item The enriched activity to display.
 * @returns A React component.
 */
function MapItem({ item }: { item: ActivityWithStream }): JSX.Element {
  const [mapWidth, setMapWidth] = useState<number>(0);

  const altitudeData =
    item.stream.altitude?.data && item.stream.time?.data
      ? item.stream.altitude.data.map((altitude, index) => ({
          x: item.stream.time!.data[index] / 3600,
          y: altitude
        }))
      : undefined;

  const formatTime = (tick: number) => {
    const hours = Math.floor(tick);
    const minutes = Math.floor((tick - hours) * 60);
    return `${hours}:${minutes}`;
  };

  return (
    <View>
      <View
        onLayout={event => {
          const { width } = event.nativeEvent.layout;
          setMapWidth(width); // so that the chart has same size as the map
        }}
      >
        <MiniMapComponent
          stream={{
            coordinates:
              item.stream.latlng?.data?.map(([lat, lon]) => ({ latitude: lat, longitude: lon })) ||
              [],
            altitude: item.stream.altitude?.data || [],
            time: item.stream.time?.data || []
          }}
        />
      </View>
      <Text>{activityToString(item.activity)}</Text>
      {altitudeData ? (
        <VictoryChart theme={VictoryTheme.material} width={mapWidth}>
          <VictoryAxis
            label="Time (h:min)"
            tickFormat={formatTime}
            style={{
              axisLabel: { padding: 30 }
            }}
          />
          <VictoryAxis
            dependentAxis
            label="Altitude (m)"
            style={{
              axisLabel: { padding: 40 }
            }}
          />
          <VictoryLine
            data={altitudeData}
            style={{
              data: { stroke: '#c43a31' }
            }}
          />
        </VictoryChart>
      ) : null}
    </View>
  );
}
