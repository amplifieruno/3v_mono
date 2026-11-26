/** Where the console footage sits on the 1920x1080 frame: a 16:9 panel between the chapter band and the subtitles. */
export const PANEL = { x: 192, y: 112, w: 1536, h: 864 } as const;
export const PANEL_SCALE = PANEL.w / 1920;
/** The chapter band above the panel and the subtitle line below it. */
export const BAND_Y = 44;
export const SUBTITLE_Y = PANEL.y + PANEL.h + 52;
export const CARD_SECONDS = 2;
export const FADE_FRAMES = 10;

/** A page point on the view (1920x1080, after the camera) to frame coordinates. */
export const viewToFrame = (p: { x: number; y: number }): { x: number; y: number } => ({
  x: PANEL.x + p.x * PANEL_SCALE,
  y: PANEL.y + p.y * PANEL_SCALE,
});
