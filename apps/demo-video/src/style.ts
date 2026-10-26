import { Easing } from 'remotion';
import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

/** Blueprint style tokens (design.md §4). */
export const C = {
  bg: '#f4f6f8',
  ink: '#0f1b2d',
  ink2: '#3a5a80',
  accent: '#1f6feb',
  gridLine: 'rgba(20,40,70,.07)',
} as const;

const inter = loadInterTight('normal', { weights: ['400', '500', '600'], subsets: ['latin'] });
const mono = loadJetBrainsMono('normal', { weights: ['400', '500'], subsets: ['latin'] });

export const FONT = { ui: inter.fontFamily, mono: mono.fontFamily } as const;

export const WIDTH = 1920;
export const HEIGHT = 1080;

/** The house ease, cubic-bezier(.2,.7,.2,1). */
export const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
