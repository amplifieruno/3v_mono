import { useCurrentFrame, useVideoConfig } from 'remotion';
import { OUTRO_TEXT } from '../scenes';
import { C, FONT } from '../style';
import { Corners } from './Corners';
import { Grid } from './Grid';
import { Rise } from './Rise';

/** Closing card: the one-line promise and the product's capabilities as tags. */
export const Outro = (): React.ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const caretOn = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  return (
    <Grid>
      <Corners delay={1.2} />
      <div style={{ position: 'absolute', left: 160, right: 160, top: 250 }}>
        <Rise
          style={{
            fontFamily: FONT.ui,
            fontWeight: 600,
            fontSize: 92,
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            maxWidth: 1300,
          }}
        >
          {OUTRO_TEXT.headline}
          <span style={{ color: C.accent, opacity: caretOn ? 1 : 0 }}>_</span>
        </Rise>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 70, maxWidth: 1500 }}>
          {OUTRO_TEXT.tags.map((tag, i) => (
            <Rise
              key={tag}
              delay={0.5 + i * 0.07}
              style={{
                fontFamily: FONT.mono,
                fontSize: 28,
                fontWeight: 500,
                color: C.ink,
                background: 'rgba(255,255,255,.8)',
                border: '1.5px solid rgba(31,111,235,.45)',
                borderRadius: 5,
                padding: '14px 20px',
              }}
            >
              {tag}
            </Rise>
          ))}
        </div>
      </div>
    </Grid>
  );
};
