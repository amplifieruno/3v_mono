import { TITLE_TEXT } from '../scenes';
import { C, FONT } from '../style';
import { Rise } from './Rise';

const corner: React.CSSProperties = {
  position: 'absolute',
  fontFamily: FONT.mono,
  fontSize: 22,
  lineHeight: 1.45,
  color: C.ink2,
  fontWeight: 500,
};

interface CornersProps {
  delay?: number;
}

/** Quiet mono marks in the frame corners. */
export const Corners = ({ delay = 0.5 }: CornersProps): React.ReactElement => (
  <>
    <Rise delay={delay} style={{ ...corner, left: 72, top: 60 }}>
      {TITLE_TEXT.corners[0]}
    </Rise>
    <Rise delay={delay + 0.1} style={{ ...corner, right: 72, bottom: 60, textAlign: 'right' }}>
      {TITLE_TEXT.corners[1]}
    </Rise>
  </>
);
