import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { PANEL } from '../layout';
import { C, FONT } from '../style';
import { sentenceAt, VOICE, type VoiceLine } from '../voice';

interface SubtitleProps {
  line: VoiceLine;
}

/** The sentence being spoken, centred under the panel; it fades in with its first word. */
export const Subtitle = ({ line }: SubtitleProps): React.ReactElement | null => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - VOICE.lead;
  const s = sentenceAt(line, t);
  if (!s) return null;
  const opacity = interpolate(t, [s.start - 0.08, s.start + 0.18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: PANEL.x,
        width: PANEL.w,
        top: PANEL.y + PANEL.h + 10,
        height: 1080 - (PANEL.y + PANEL.h + 10),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontFamily: FONT.ui,
        fontSize: 29,
        fontWeight: 500,
        lineHeight: 1.3,
        letterSpacing: '-0.01em',
        color: C.ink,
        textWrap: 'balance',
        opacity,
      }}
    >
      {s.text}
    </div>
  );
};
