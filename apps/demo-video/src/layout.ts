/** Where the console footage sits on the 1920x1080 frame: a 16:9 panel under a title band. */
export const PANEL = { x: 160, y: 140, w: 1600, h: 900 } as const;
export const PANEL_SCALE = PANEL.w / 1920;
export const CARD_SECONDS = 2;
export const FADE_FRAMES = 10;

/** A page point on the view (1920x1080, after the camera) to frame coordinates. */
export const viewToFrame = (p: { x: number; y: number }): { x: number; y: number } => ({
  x: PANEL.x + p.x * PANEL_SCALE,
  y: PANEL.y + p.y * PANEL_SCALE,
});
