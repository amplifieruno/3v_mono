import type { Box } from "./timeline";

/** A tag drawn onto the footage; `at` is a `shot` mark name from the scene's timeline. */
export type Callout = { at: string; text: string; target: Box };

export type ConsoleScene = {
  id: string;
  kind: "console";
  chapter: number;
  label: string;
  title: string;
  clip: string;
  seconds: number;
  callouts: Callout[];
};

export type Scene =
  | { id: "title" | "outro"; kind: "title" | "outro"; seconds: number }
  | ConsoleScene;

export const FPS = 30;

/** On-screen copy of the title and outro cards (design.md §4). */
export const TITLE_TEXT = {
  word: "ITAP",
  tagline: "identity · tracking · access",
  corners: ["ITAP · OCT 2026", "NOVA TOWER"],
};
export const OUTRO_TEXT = {
  headline: "One platform for identity, access and safety",
  tags: [
    "Live recognition",
    "People",
    "Places & floor plans",
    "Devices",
    "Access control",
    "Face sign-in",
    "Incidents",
    "Notifications",
    "Segments",
    "Face search",
    "Analytics",
    "Privacy & compliance",
  ],
};

const box = (x: number, y: number, w = 200, h = 40): Box => ({ x, y, w, h });

/** The storyboard (design.md §5). Callout targets are tuned against the recorded footage. */
export const SCENES: Scene[] = [
  { id: "title", kind: "title", seconds: 6 },
  {
    id: "overview",
    kind: "console",
    chapter: 1,
    label: "OVERVIEW",
    title: "One console for the whole building",
    clip: "overview",
    seconds: 14,
    callouts: [{ at: "workspace", text: "Live events", target: box(600, 300) }],
  },
  {
    id: "recognition",
    kind: "console",
    chapter: 2,
    label: "RECOGNITION",
    title: "Every camera knows who it sees",
    clip: "recognition",
    seconds: 22,
    callouts: [
      { at: "named-box", text: "Face matched", target: box(700, 400) },
      { at: "named-box", text: "Known person · VIP", target: box(800, 450) },
    ],
  },
  {
    id: "people",
    kind: "console",
    chapter: 3,
    label: "PEOPLE",
    title: "A person's whole day, in one timeline",
    clip: "people",
    seconds: 16,
    callouts: [
      {
        at: "timeline",
        text: "Every sighting, in order",
        target: box(500, 400),
      },
    ],
  },
  {
    id: "places",
    kind: "console",
    chapter: 4,
    label: "PLACES",
    title: "Your building, floor by floor",
    clip: "places",
    seconds: 16,
    callouts: [{ at: "lobby", text: "Live occupancy", target: box(1000, 600) }],
  },
  {
    id: "access",
    kind: "console",
    chapter: 5,
    label: "ACCESS",
    title: "Who gets in, and why",
    clip: "access",
    seconds: 20,
    callouts: [
      { at: "trace", text: "5 policies checked", target: box(500, 500) },
    ],
  },
  {
    id: "incidents",
    kind: "console",
    chapter: 6,
    label: "INCIDENTS",
    title: "Incidents raise themselves",
    clip: "incidents",
    seconds: 16,
    callouts: [
      {
        at: "incident",
        text: "Escalated automatically",
        target: box(900, 500),
      },
    ],
  },
  {
    id: "analytics",
    kind: "console",
    chapter: 7,
    label: "ANALYTICS",
    title: "See how the building lives",
    clip: "analytics",
    seconds: 14,
    callouts: [{ at: "heatmap", text: "Busiest hours", target: box(600, 800) }],
  },
  {
    id: "privacy",
    kind: "console",
    chapter: 8,
    label: "PRIVACY",
    title: "Privacy built in",
    clip: "privacy",
    seconds: 14,
    callouts: [
      { at: "steps", text: "Erased on request", target: box(500, 500) },
    ],
  },
  { id: "outro", kind: "outro", seconds: 10 },
];

export function totalSeconds(scenes: Scene[]): number {
  return scenes.reduce((sum, s) => sum + s.seconds, 0);
}
