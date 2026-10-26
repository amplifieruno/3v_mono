# ITAP demo video

A short product video of the ITAP console. The console is recorded live with Playwright, and the recording is edited by a Remotion composition. The edit is code, so one scene or one line of text can change without redoing the rest.

- **Design:** `tasks/demo-video/design.md` (intent, storyboard, style, content rules).
- **Plan:** `tasks/demo-video/plan.md`.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Recording | `record/` | One Playwright script per scene (`record/scenes/*.ts`). Each signs in once, opens the scene's start page, and records a screencast to `public/clips/<scene>.mp4`. Alongside it, it writes `<scene>.timeline.json`: clicks, waits and named shots with the boxes of what they show. |
| Scene list | `src/scenes.ts` | Chapter titles, callout texts and seconds per scene. All on-screen copy lives here and on the title and outro cards. |
| Edit math | `src/timeline.ts` | Speeds waits up (6x, never more than 8 s of output) and fits each clip into its scene. It also moves the camera: a gentle push-in on clicks and a closer hold on focus marks. |
| Composition | `src/components/` | Draws the blueprint grid, title card, chapter cards, the footage panel with cursor and callouts, and the outro. |
| Content rules | `src/content-rules.ts` | Words that must never appear on screen (technology names). `pnpm test` enforces them. |

## Make a new cut

The stack is the dev stack (`make dev-compose`). Recording wipes and rebuilds the demo data.

1. **Re-seed the demo data** on the day of the recording, after about 09:00 Moscow time so "today" has visitors (about 7 minutes):
   `pnpm seed --reset` (from the repo root)
2. **Start recognition** on the four stream cameras, then wait about 2 minutes, until known faces are named and the live incident is open:
   `pnpm --filter demo-video cameras`
3. **Record every scene** (about 5 minutes). Record soon after step 2: the longer the cameras run, the more unknown visitors pile up on the floor plans.
   `pnpm --filter demo-video record`
   To record only some scenes: `pnpm --filter demo-video record places access`.
4. **Stop recognition:**
   `pnpm --filter demo-video cameras stop`
5. **Preview** in Remotion Studio, where you can scrub every scene:
   `pnpm --filter demo-video studio`
6. **Render** the master (CRF 18), then the light copy for messengers and a contact sheet to review:
   `pnpm --filter demo-video render && pnpm --filter demo-video render:light && pnpm --filter demo-video sheet`
   The output goes to `out/`. The `out/` folder and `public/clips/` are git-ignored.

## Common changes

- **Reword a title or callout:** edit `src/scenes.ts`, then run `pnpm --filter demo-video test`. The test rejects technology words and checks that the total stays between 120 and 150 s.
- **Make a scene longer or shorter:** change its `seconds`. The footage is sped up to fit, or holds its last frame.
- **Change what a scene shows:** edit `record/scenes/<nn>-<scene>.ts` and re-record that scene. Scripts find records by their visible names, never by id, so they survive a re-seed.
- **Point a callout somewhere else:** pass a locator to `m.shot(name, locator)` in the script. The callout follows that element's box.

## Licence note

Remotion is free for individuals and for companies of up to 3 people. This video is made under that free licence. If a larger company renders or develops this video itself, it needs a Remotion company licence ($25 per month per seat, see remotion.pro/license).
