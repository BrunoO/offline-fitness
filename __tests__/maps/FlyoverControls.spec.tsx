import FlyoverControls from '@/features/maps/components/FlyoverControls';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockSlider(props: any) {
    return <View testID="mock-slider" {...props} />;
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

describe('FlyoverControls', () => {
  it('triggers onTogglePlay when play/pause button is pressed', () => {
    const onTogglePlay = jest.fn();
    const { getByLabelText } = render(
      wrap(
        <FlyoverControls
          isPlaying={false}
          progress={0.2}
          speedMultiplier={1}
          onTogglePlay={onTogglePlay}
          onRestart={jest.fn()}
          onSeek={jest.fn()}
          onSetSpeed={jest.fn()}
        />
      )
    );

    const playBtn = getByLabelText('Play flyover');
    fireEvent.press(playBtn);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('triggers onRestart when restart button is pressed', () => {
    const onRestart = jest.fn();
    const { getByLabelText } = render(
      wrap(
        <FlyoverControls
          isPlaying={true}
          progress={0.5}
          speedMultiplier={1}
          onTogglePlay={jest.fn()}
          onRestart={onRestart}
          onSeek={jest.fn()}
          onSetSpeed={jest.fn()}
        />
      )
    );

    const restartBtn = getByLabelText('Restart flyover from beginning');
    fireEvent.press(restartBtn);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('triggers onSetSpeed when speed pills are pressed', () => {
    const onSetSpeed = jest.fn();
    const { getByLabelText } = render(
      wrap(
        <FlyoverControls
          isPlaying={false}
          progress={0}
          speedMultiplier={1}
          onTogglePlay={jest.fn()}
          onRestart={jest.fn()}
          onSeek={jest.fn()}
          onSetSpeed={onSetSpeed}
        />
      )
    );

    const speed2x = getByLabelText('2 times speed');
    fireEvent.press(speed2x);
    expect(onSetSpeed).toHaveBeenCalledWith(2);

    const speedHalfX = getByLabelText('0.5 times speed');
    fireEvent.press(speedHalfX);
    expect(onSetSpeed).toHaveBeenCalledWith(0.5);
  });
});
