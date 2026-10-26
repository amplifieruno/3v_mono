import { OUTRO_TEXT, type Scene, TITLE_TEXT } from './scenes';

/** Words that expose the technology; none may appear on screen (design.md §3). */
export const BANNED: RegExp[] = [
  'insightface',
  'pgvector',
  'postgres(ql)?',
  'sql',
  'hasura',
  'graphql',
  'cron',
  'triggers?',
  'nhost',
  'minio',
  'docker',
  'onnx',
  'react',
  'remotion',
  'playwright',
  'api',
  'database',
  'tables?',
  'functions?',
  'tests?',
  'commits?',
].map((w) => new RegExp(`\\b${w}\\b`, 'i'));

/** Every text the video draws: titles, labels, callouts, title and outro cards. */
export function onScreenTexts(scenes: Scene[]): string[] {
  const fromScenes = scenes.flatMap((s) =>
    s.kind === 'console' ? [s.label, s.title, ...s.callouts.map((c) => c.text)] : [],
  );
  return [
    ...fromScenes,
    TITLE_TEXT.word,
    TITLE_TEXT.tagline,
    ...TITLE_TEXT.corners,
    OUTRO_TEXT.headline,
    ...OUTRO_TEXT.tags,
  ];
}
