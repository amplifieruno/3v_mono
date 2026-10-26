import { AbsoluteFill } from "remotion";
import { C, WIDTH } from "../style";

const CELL = Math.round(WIDTH * 0.046);

/** The engineering-grid ground every frame sits on. */
export function Grid({
  children,
}: {
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        backgroundImage: `linear-gradient(${C.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)`,
        backgroundSize: `${CELL}px ${CELL}px`,
        color: C.ink,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
