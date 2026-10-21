// https://stackoverflow.com/questions/78750180/how-do-i-create-a-circular-progress-bar-in-expo-react-native-with-a-text-in-cent

import React, { useState, useEffect } from 'react';
import { View } from 'react-native';

import Svg, { Circle, Text as SvgText } from 'react-native-svg';

interface ProgressCircleProps {
  radius: number;
  strokeWidth: number;
  progress: number; // Should be a value between 0 and 1
  color: string;
}

/**
 * A component for displaying a circular progress bar.
 * @param radius The radius of the circle.
 * @param strokeWidth The width of the progress bar.
 * @param progress The progress of the bar, from 0 to 1.
 * @param color The color of the progress bar.
 * @returns A React component.
 */
const ProgressCircle: React.FC<ProgressCircleProps> = ({
  radius,
  strokeWidth,
  progress,
  color
}) => {
  const [circumference, setCircumference] = useState(0);

  useEffect(() => {
    const circumferenceValue = 2 * Math.PI * radius;
    setCircumference(circumferenceValue);
  }, [radius]);

  const strokeDashoffset = circumference * (1 - progress);
  const progressValue = progress * 100;

  return (
    <View style={{ aspectRatio: 1, width: radius * 2 }}>
      <Svg width={radius * 2} height={radius * 2}>
        <Circle
          stroke={color}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          cx={radius}
          cy={radius}
          r={radius - strokeWidth / 2}
        />
        <SvgText
          x="50%"
          y="50%"
          textAnchor="middle"
          alignmentBaseline="middle"
          fontSize={radius / 2.5}
          fill={color}
          fontWeight="bold"
        >
          {`${progressValue.toFixed(1)}%`}
        </SvgText>
      </Svg>
    </View>
  );
};

export default ProgressCircle;

// Usage example
/* const App = () => {
  const [progress, setProgress] = useState(0.96); // Example progress value (1923/2000)

  return (
    <View style={styles.container}>
      <Text style={styles.header}>2000 contatos</Text>
      <ProgressCircle
        radius={100}
        strokeWidth={10}
        progress={progress}
        color="blue"
      />
      <View style={styles.button}>
        <Text style={styles.buttonText}>⟳</Text>
      </View>
    </View>
  );
}; 

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  button: {
    marginTop: 40,
    padding: 10,
    backgroundColor: "blue",
    borderRadius: 5,
  },
  buttonText: {
    color: "white",
    fontSize: 20,
    textAlign: "center",
  },
});
*/
