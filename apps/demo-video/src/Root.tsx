import { Composition } from 'remotion';
import { TitleCard } from './components/TitleCard';
import { HEIGHT, WIDTH } from './style';

export function RemotionRoot(): React.ReactElement {
  return <Composition id="TitleSpike" component={TitleCard} durationInFrames={180} fps={30} width={WIDTH} height={HEIGHT} />;
}
