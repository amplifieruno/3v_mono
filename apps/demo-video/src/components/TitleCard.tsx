import { useCurrentFrame, useVideoConfig } from 'remotion';
import { TITLE_TEXT } from '../scenes';
import { C, FONT } from '../style';
import { Corners } from './Corners';
import { Grid } from './Grid';
import { Rise } from './Rise';

const bracket: React.CSSProperties = {
  position: 'absolute',
  width: 56,
  height: 56,
  border: `2px solid ${C.accent}`,
};

/** Opening card: ITAP_ with a blinking accent underscore. */
export const TitleCard = (): React.ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const caretOn = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  return (
    <Grid>
      <Corners />
      <div style={{ ...bracket, left: 72, top: 300, borderRight: 0, borderBottom: 0 }} />
      <div style={{ ...bracket, right: 72, bottom: 300, borderLeft: 0, borderTop: 0 }} />
      <div style={{ position: 'absolute', left: 134, top: '50%', transform: 'translateY(-50%)' }}>
        <Rise
          delay={0.15}
          style={{
            fontFamily: FONT.ui,
            fontWeight: 600,
            fontSize: 250,
            letterSpacing: '-0.045em',
            lineHeight: 1,
          }}
        >
          {TITLE_TEXT.word}
          <span style={{ color: C.accent, opacity: caretOn ? 1 : 0 }}>_</span>
        </Rise>
        <Rise
          delay={0.35}
          style={{ fontFamily: FONT.mono, fontSize: 44, color: C.ink2, marginTop: 36 }}
        >
          {TITLE_TEXT.tagline}
        </Rise>
      </div>
    </Grid>
  );
};
