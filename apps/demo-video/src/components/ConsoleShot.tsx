import {
  Freeze,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { BeatSpec } from '../scenes';
import { PANEL, PANEL_SCALE, viewToFrame } from '../layout';
import {
  calloutWindow,
  cameraAt,
  planSegments,
  shotOf,
  sourceTimeAt,
  type Timeline,
  onView,
} from '../timeline';
import { CalloutTag } from './CalloutTag';
import { Cursor } from './Cursor';

interface ConsoleShotProps {
  beat: BeatSpec;
  timeline: Timeline;
  /** Frames this shot lasts. */
  frames: number;
}

/** One recorded beat inside its panel: waits sped up, camera, cursor and callouts on top. */
export const ConsoleShot = ({ beat, timeline, frames }: ConsoleShotProps): React.ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const segs = planSegments(timeline);
  const fitted = segs;
  const t = frame / fps;
  const src = sourceTimeAt(fitted, t);
  const cam = cameraAt(timeline, src);
  const src0 = staticFile(`clips/${beat.clip}.mp4`);

  // Pieces sit on exact cumulative times, and each starts where sourceTimeAt says, so footage, camera,
  // cursor and callouts share one clock instead of drifting a frame per segment.
  let exact = 0;
  let from = 0;
  const pieces = fitted.flatMap((s, i) => {
    exact += (s.to - s.from) / s.rate;
    const end = Math.min(frames, Math.round(exact * fps));
    const start = from;
    if (end <= start) return [];
    from = end;
    return [
      <Sequence key={i} from={start} durationInFrames={end - start} layout="none">
        <OffthreadVideo
          src={src0}
          startFrom={Math.round(sourceTimeAt(fitted, start / fps) * fps)}
          playbackRate={s.rate}
          muted
          style={{ width: 1920, height: 1080 }}
        />
      </Sequence>,
    ];
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
      {beat.callouts.map((c) => {
        const window = calloutWindow(timeline, fitted, c.at, frames / fps);
        const box = c.target ?? shotOf(timeline, c.at)?.box;
        if (!window || !box) return null;
        const [start, end] = window;
        if (t < start || t > end) return null;
        // With an explicit side the line leaves from that edge of the element, so the tag never covers it.
        const anchorX =
          c.side === 'right' ? box.x + box.w : c.side === 'left' ? box.x : box.x + box.w / 2;
        // A spot the camera does not show gets no callout: never point into the void.
        const onScreen = onView(cam, { x: anchorX, y: box.y + box.h / 2 });
        if (!onScreen) return null;
        const target = viewToFrame(onScreen);
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
