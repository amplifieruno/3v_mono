import {
  Freeze,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { ConsoleScene } from '../scenes';
import { PANEL, PANEL_SCALE, viewToFrame } from '../layout';
import {
  calloutWindow,
  cameraAt,
  outputDuration,
  planSegments,
  scaleSegments,
  shotOf,
  sourceTimeAt,
  type Timeline,
  toScreen,
} from '../timeline';
import { CalloutTag } from './CalloutTag';
import { Cursor } from './Cursor';

interface ConsoleShotProps {
  scene: ConsoleScene;
  timeline: Timeline;
  /** Frames this shot lasts. */
  frames: number;
}

/** The recorded console inside its panel: waits sped up, fitted to the scene, camera, cursor and callouts on top. */
export const ConsoleShot = ({ scene, timeline, frames }: ConsoleShotProps): React.ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const segs = planSegments(timeline);
  const k = Math.max(1, outputDuration(segs) / (frames / fps));
  const fitted = scaleSegments(segs, k);
  const t = frame / fps;
  const src = sourceTimeAt(fitted, t);
  const cam = cameraAt(timeline, src);
  const src0 = staticFile(`clips/${scene.clip}.mp4`);

  let from = 0;
  const pieces = fitted.map((s, i) => {
    const len = Math.max(1, Math.round(((s.to - s.from) / s.rate) * fps));
    const el = (
      <Sequence key={i} from={from} durationInFrames={len} layout="none">
        <OffthreadVideo
          src={src0}
          startFrom={Math.round(s.from * fps)}
          playbackRate={s.rate}
          muted
          style={{ width: 1920, height: 1080 }}
        />
      </Sequence>
    );
    from += len;
    return el;
  });
  const tail =
    from < frames ? (
      <Sequence from={from} layout="none">
        <Freeze frame={Math.max(0, Math.round(timeline.duration * fps) - 2)}>
          <OffthreadVideo src={src0} muted style={{ width: 1920, height: 1080 }} />
        </Freeze>
      </Sequence>
    ) : null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: PANEL.x,
          top: PANEL.y,
          width: PANEL.w,
          height: PANEL.h,
          overflow: 'hidden',
          borderRadius: 10,
          background: '#fff',
          boxShadow: '0 0 0 1px rgba(31,111,235,.35), 0 30px 60px -30px rgba(15,27,45,.45)',
        }}
      >
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${PANEL_SCALE})`,
            transformOrigin: '0 0',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 1920,
              height: 1080,
              transform: `scale(${cam.scale}) translate(${960 - cam.cx}px, ${540 - cam.cy}px)`,
              transformOrigin: '960px 540px',
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>
              {pieces}
              {tail}
            </div>
            <Cursor marks={timeline.marks} t={src} />
          </div>
        </div>
      </div>
      {scene.callouts.map((c) => {
        const window = calloutWindow(timeline, fitted, c.at, frames / fps);
        const box = c.target ?? shotOf(timeline, c.at)?.box;
        if (!window || !box) return null;
        const [start, end] = window;
        if (t < start || t > end) return null;
        // With an explicit side the line leaves from that edge of the element, so the tag never covers it.
        const anchorX =
          c.side === 'right' ? box.x + box.w : c.side === 'left' ? box.x : box.x + box.w / 2;
        const raw = viewToFrame(toScreen(cam, { x: anchorX, y: box.y + box.h / 2 }));
        // Keep the pointed-at spot inside the panel so the tag is never clipped.
        const target = {
          x: Math.min(PANEL.x + PANEL.w - 40, Math.max(PANEL.x + 40, raw.x)),
          y: Math.min(PANEL.y + PANEL.h - 40, Math.max(PANEL.y + 40, raw.y)),
        };
        return (
          <CalloutTag
            key={c.text}
            text={c.text}
            at={target}
            age={t - start}
            left={end - t}
            side={c.side}
          />
        );
      })}
    </>
  );
};
