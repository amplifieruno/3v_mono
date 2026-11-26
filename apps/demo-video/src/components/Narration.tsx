import { Html5Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { VOICE } from '../voice';

interface NarrationProps {
  /** The line id: a beat's clip name, or `title` / `outro`. */
  id: string;
}

/** Plays a narrated line `VOICE.lead` seconds into its beat. */
export const Narration = ({ id }: NarrationProps): React.ReactElement => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(VOICE.lead * fps)} layout="none">
      <Html5Audio src={staticFile(`voice/${id}.wav`)} />
    </Sequence>
  );
};
