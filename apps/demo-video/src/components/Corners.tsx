import { C, FONT } from "../style";
import { Rise } from "./Rise";

const corner: React.CSSProperties = {
  position: "absolute",
  fontFamily: FONT.mono,
  fontSize: 22,
  lineHeight: 1.45,
  color: C.ink2,
  fontWeight: 500,
};

/** Quiet mono marks in the frame corners. */
export function Corners({
  delay = 0.5,
}: {
  delay?: number;
}): React.ReactElement {
  return (
    <>
      <Rise delay={delay} style={{ ...corner, left: 72, top: 60 }}>
        ITAP · OCT 2026
      </Rise>
      <Rise
        delay={delay + 0.1}
        style={{ ...corner, right: 72, bottom: 60, textAlign: "right" }}
      >
        NOVA TOWER
      </Rise>
    </>
  );
}
