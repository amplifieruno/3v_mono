# ITAP demo video: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 2:00–2:30 silent product video of the ITAP console in the Blueprint style. It is rendered from real Playwright recordings by a Remotion composition kept in `apps/demo-video/`.

**Architecture:**
- **Recording.** Playwright scripts record one clip per scene against the live dev stack, plus a `timeline.json` of marks: clicks, waits and focus boxes.
- **Edit.** The edit is data: `src/scenes.ts` holds the titles, callouts and clip ranges. Pure functions turn timelines into cut and speed segments and camera moves.
- **Render.** Remotion components draw the grid frame, chapter cards, callouts, cursor and outro around the footage.

**Tech Stack:**
- Remotion 4 (`remotion`, `@remotion/cli`, `@remotion/renderer`), React 19, TypeScript 5.8;
- `@playwright/test` 1.64.1, already in the workspace;
- vitest 4;
- ffmpeg at `/home/dev/.local/bin/ffmpeg`.

**Spec:** `tasks/demo-video/design.md` (read it first; §3, §4 and §5 are the content).

## Global Constraints

- Output: 1920x1080, 30 fps, H.264 high profile, yuv420p, `+faststart`, no audio track. A master at CRF 18 plus a light copy under 50 MB.
- Total length 120–150 s.
- **No technology names or code counts in any on-screen text** (design §2, §3). The banned list lives in `src/content-rules.ts` (Task 2).
- A number on screen must be visible in the console itself. "under 2 s" appears only if measured (Task 7), otherwise it is removed.
- Console footage is recorded, never rebuilt. Motion graphics only around it (design §2).
- Style tokens exactly as in design §4:
  - colors `#f4f6f8` / `#0f1b2d` / `#3a5a80` / `#1f6feb`, grid line `rgba(20,40,70,.07)`;
  - fonts Inter Tight 600 and JetBrains Mono;
  - ease `cubic-bezier(.2,.7,.2,1)`.
- Recording scripts find records by visible name, never by id. No UUID literals in `apps/demo-video/record/`.
- One sign-in per recording run (hasura-auth allows 10 sign-ins per 5 min).
- Remotion pinned to one exact version, the same for every `@remotion/*` package. Pick a 4.0.x release at least two weeks old.
- Raw clips (`public/clips/`) and renders (`out/`) are git-ignored. `apps/demo-video` is not part of the root `pnpm build`: its `build` script is absent, and `typecheck`/`lint` cover only its TS.
- English in code and on screen. Commit format `<type>(<scope>): <subject>` with scope `video`.

## Review Focus

1. **A tech word sneaks into a title or callout** (for example "SQL" in a callout added later). The content test rejects it (Task 2).
2. **Edits push the total out of 120–150 s.** The duration test fails (Task 2).
3. **After a re-seed, a script still holds an old id.** The no-UUID test fails, and scripts locate rows by text (Tasks 3 and 6).
4. **The timeline has no waits, starts or ends inside a wait, or has overlapping waits.** `planSegments` still covers the clip without gaps or overlaps (Task 2).
5. **A recording run hits the sign-in limit after a retry.** The runner reuses one signed-in context for all scenes and re-signs in only when redirected to `/login` (Task 3).

---

## File structure (`apps/demo-video/`)

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `remotion.config.ts`, `.gitignore`, `vitest.config.ts` | package; scripts `studio`, `render`, `render:light`, `record`, `sheet`, `typecheck`, `test` |
| `src/index.ts`, `src/Root.tsx` | `registerRoot`; composition `ItapDemo` (1920x1080, 30 fps, duration from scenes) |
| `src/style.ts` | tokens and easing from design §4 |
| `src/timeline.ts` | timeline types and pure edit math (segments, frame→source time, camera) |
| `src/scenes.ts` | the scene list: ids, chapter numbers, titles, callouts, durations, clip refs |
| `src/content-rules.ts` | banned-word list and `onScreenTexts(scenes)` |
| `src/components/` | `Grid`, `TitleCard`, `ChapterCard`, `ConsoleFrame`, `Callout`, `Cursor`, `Outro`, `SceneView`, `Video` (one component per file) |
| `record/session.ts` | browser, sign-in, theme and facility setup, re-sign-in on redirect |
| `record/marks.ts` | `Marks` recorder writing `<scene>.timeline.json` |
| `record/scenes/*.ts` | one script per storyboard scene |
| `record/run.ts` | CLI: record all or listed scenes, convert to 30 fps mp4 |
| `scripts/contact-sheet.sh` | frames every 2 s → tiled PNG |
| `tests/*.test.ts` | vitest for timeline, content rules, scene list, no-UUID |
| `README.md` | prep → record → studio → render, the license caveat |

---

### Task 1: Scaffold the package and spike Remotion with a title card

**Files:**
- Create: `apps/demo-video/{package.json,tsconfig.json,remotion.config.ts,.gitignore,vitest.config.ts}`
- Create: `apps/demo-video/src/{index.ts,Root.tsx,style.ts}`
- Create: `apps/demo-video/src/components/{Grid.tsx,TitleCard.tsx}`

**Interfaces:**
- Produces:
  - `style.ts` exports `C = { bg, ink, ink2, accent, gridLine }`, `FONT = { ui: 'Inter Tight', mono: 'JetBrains Mono' }` and `ease(t: number): number`, a cubic-bezier(.2,.7,.2,1) via Remotion `Easing.bezier`;
  - `<Grid />`: full-frame background with the grid, cell = 4.6% of the width;
  - `<TitleCard />`: `ITAP_` with a blinking accent underscore, `identity · tracking · access`, corner marks `ITAP · OCT 2026` / `NOVA TOWER`.

- [ ] **Step 1:** Create the package `demo-video` (private, `"type": "module"`).
  - Dependencies: exact Remotion version (see Global Constraints), react/react-dom `^19.1.0`, `@remotion/google-fonts` for Inter Tight and JetBrains Mono.
  - Dev dependencies: typescript `^5.8.3`, vitest `^4.0.0`, `@playwright/test` `1.64.1`, `tsx`.
  - `.gitignore`: `public/clips/`, `out/`.
  - Run `pnpm install`.
- [ ] **Step 2:** Implement `style.ts`, `Grid`, `TitleCard`, then `Root.tsx` with a temporary composition `TitleSpike` (180 frames).
- [ ] **Step 3: Verify the render.**
  - Run: `pnpm --filter demo-video exec remotion still TitleSpike out/title.png --frame=120`
  - Expected: a PNG that matches the artifact's C title. Check it with the Read tool.
- [ ] **Step 4: Spike the video handling Task 2 relies on.**
  - Add `<OffthreadVideo>` of any webm from `apps/admin-ui/playwright-output/` (or record 5 s of `/analytics`) with `startFrom`, `playbackRate={4}` and a CSS `transform: scale()` zoom.
  - Render 3 s.
  - Expected: smooth playback, frame-accurate start, readable text when zoomed. If this fails, stop and report: design §6 allows an FFmpeg pre-pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(video): remotion package with blueprint title card"`

### Task 2: Edit math, scene list and content rules (TDD)

**Files:**
- Create: `apps/demo-video/src/timeline.ts`, `src/scenes.ts`, `src/content-rules.ts`
- Test: `apps/demo-video/tests/timeline.test.ts`, `tests/scenes.test.ts`

**Interfaces:**
- Produces (`timeline.ts`):
  ```ts
  type Box = { x: number; y: number; w: number; h: number };            // CSS px of the 1920x1080 page
  type Mark =
    | { t: number; type: 'click' | 'focus'; box: Box; label?: string } // seconds from clip start
    | { t: number; type: 'wait_start' | 'wait_end'; reason?: string }
    | { t: number; type: 'shot'; name: string };                       // named moment for callouts
  type Timeline = { clip: string; duration: number; marks: Mark[] };
  type Segment = { from: number; to: number; rate: number };           // source seconds, playback rate
  planSegments(tl: Timeline, opts?: { waitRate?: number; maxWait?: number }): Segment[];
  outputDuration(segs: Segment[]): number;                             // seconds
  sourceTimeAt(segs: Segment[], outSeconds: number): number;
  cameraAt(tl: Timeline, sourceSeconds: number): { scale: number; cx: number; cy: number };
  ```
  `planSegments` defaults: `waitRate` 6. A wait longer than `maxWait` (8 s) after speeding is cut down to 8 s of output. A missing `wait_end` closes at the clip end.
  `cameraAt`:
  - zoom 1.0 by default;
  - eases to `scale` 1.6, centred on the box, over 0.6 s starting 0.3 s before a `click`/`focus` mark;
  - holds until the next mark or 2.5 s, then eases back. Centre clamped so the frame never shows outside the page.
- Produces (`scenes.ts`):
  ```ts
  type Callout = { at: string /* shot name or 'click:<label>' */; text: string; target: Box };
  type Scene =
    | { id: 'title' | 'outro'; kind: 'title' | 'outro'; seconds: number }
    | { id: string; kind: 'console'; chapter: number; label: string; title: string;
        clip: string; seconds: number; callouts: Callout[] };
  export const SCENES: Scene[];
  export const FPS = 30;
  totalSeconds(scenes: Scene[]): number;
  ```
  The content is from design §5 verbatim:
  - titles "One console for the whole building", "Every camera knows who it sees", "A person's whole day, in one timeline", "Your building, floor by floor", "Who gets in, and why", "Incidents raise themselves", "See how the building lives", "Privacy built in";
  - labels like `RECOGNITION`;
  - outro tags from design §4;
  - seconds per row of the §5 table.
  - Callout `target`s are placeholders until Task 7 tunes them against footage.
- Produces (`content-rules.ts`): `BANNED: RegExp[]` (case-insensitive words: insightface, pgvector, postgres, sql, hasura, graphql, cron, trigger, nhost, minio, docker, onnx, react, remotion, playwright, api, database, table(s), function(s), test(s), commit(s)), and `onScreenTexts(scenes: Scene[]): string[]`, which returns every title, label, callout text and outro tag.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/timeline.test.ts
const tl = (marks: Mark[], duration = 20): Timeline => ({ clip: 'x', duration, marks });
test('no waits: one segment at rate 1', () =>
  expect(planSegments(tl([]))).toEqual([{ from: 0, to: 20, rate: 1 }]));
test('a 3 s wait is sped up 6x', () => {
  const s = planSegments(tl([{ t: 5, type: 'wait_start' }, { t: 8, type: 'wait_end' }]));
  expect(s).toEqual([{ from: 0, to: 5, rate: 1 }, { from: 5, to: 8, rate: 6 }, { from: 8, to: 20, rate: 1 }]);
  expect(outputDuration(s)).toBeCloseTo(17.5);
});
test('unterminated wait closes at clip end', () =>
  expect(planSegments(tl([{ t: 15, type: 'wait_start' }])).at(-1)).toEqual({ from: 15, to: 20, rate: 6 }));
test('overlapping waits merge', () =>
  expect(planSegments(tl([{ t: 2, type: 'wait_start' }, { t: 3, type: 'wait_start' }, { t: 4, type: 'wait_end' }, { t: 6, type: 'wait_end' }]))
    .filter((x) => x.rate > 1)).toEqual([{ from: 2, to: 6, rate: 6 }]));
test('segments tile the clip without gaps', () => {
  const s = planSegments(tl([{ t: 0, type: 'wait_start' }, { t: 1, type: 'wait_end' }]));
  s.slice(1).forEach((seg, i) => expect(seg.from).toBe(s[i].to));
  expect(s[0].from).toBe(0); expect(s.at(-1)!.to).toBe(20);
});
test('sourceTimeAt inverts the speed-up', () => {
  const s = planSegments(tl([{ t: 5, type: 'wait_start' }, { t: 8, type: 'wait_end' }]));
  expect(sourceTimeAt(s, 5.25)).toBeCloseTo(6.5);
});
test('camera zooms on a click and stays inside the page', () => {
  const c = cameraAt(tl([{ t: 2, type: 'click', box: { x: 1800, y: 1000, w: 100, h: 40 } }]), 2.5);
  expect(c.scale).toBeCloseTo(1.6, 1);
  expect(c.cx).toBeLessThanOrEqual(1920 - 1920 / c.scale / 2);
});
```

```ts
// tests/scenes.test.ts
test('total length is 120–150 s', () => { const s = totalSeconds(SCENES); expect(s).toBeGreaterThanOrEqual(120); expect(s).toBeLessThanOrEqual(150); });
test('no technology words on screen', () => {
  for (const text of onScreenTexts(SCENES)) for (const re of BANNED) expect(text).not.toMatch(re);
});
test('two console scenes in a row never share a chapter', () =>
  SCENES.slice(1).forEach((s, i) => s.kind === 'console' && SCENES[i].kind === 'console' && expect(s.chapter).not.toBe(SCENES[i].chapter)));
test('recording scripts hold no record ids', () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  for (const f of globSync('record/**/*.ts')) expect(readFileSync(f, 'utf8')).not.toMatch(uuid);
});
```

- [ ] **Step 2:** Run `pnpm --filter demo-video test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `timeline.ts`, `scenes.ts` and `content-rules.ts` to the interfaces above.
- [ ] **Step 4:** Run `pnpm --filter demo-video test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(video): edit math, scene list and content rules"`

### Task 3: Recording harness

**Files:**
- Create: `apps/demo-video/record/{session.ts,marks.ts,run.ts}`
- Create: `apps/demo-video/record/scenes/01-overview.ts` (the first scene, proving the harness)

**Interfaces:**
- Consumes: `Timeline`, `Mark`, `Box` from `src/timeline.ts`.
- Produces:
  ```ts
  // session.ts
  openSession(): Promise<{ browser: Browser; context: BrowserContext; page: Page }>;
  // 1920x1080, deviceScaleFactor 1, colorScheme 'light', recordVideo {dir, size 1920x1080};
  // addInitScript sets localStorage buro-theme=light and the facility key from prep-handoff.md
  // ("How to get in"), with the facility id looked up by the name "Nova Tower" after sign-in, not hardcoded;
  // signs in as admin@itap.demo with SEED_PASSWORD read from apps/backend/.env.
  ensureSignedIn(page: Page): Promise<void>;   // re-sign in only if the URL is /login
  // marks.ts
  class Marks { constructor(scene: string); start(): void; click(loc: Locator, label?: string): Promise<void>;
    focus(loc: Locator, label?: string): Promise<void>; wait<T>(reason: string, fn: () => Promise<T>): Promise<T>;
    shot(name: string): void; save(dir: string): Promise<void>; }
  // click() records the element's boundingBox at t, then clicks after a 400 ms pause, so the camera arrives first.
  // run.ts: `tsx record/run.ts [sceneId...]`
  ```
  Each scene runs in a fresh page of the **same** signed-in context, so its video is its own file.
  Output: `public/clips/<id>.mp4` (ffmpeg `-r 30 -c:v libx264 -crf 12`, converted from Playwright's webm) and `public/clips/<id>.timeline.json`.
  A scene module exports `{ id: string; record(page: Page, m: Marks): Promise<void> }`.

- [ ] **Step 1:** Implement `session.ts`, `marks.ts` and `run.ts`.
- [ ] **Step 2:** Write `01-overview.ts`:
  - `/workspace`: let it settle, `shot('workspace')`;
  - open the sidebar sections Places, Devices, People and Monitoring one after another with `m.click`;
  - open the "Security overview" dashboard through the UI (sidebar "My workspaces" or `/dashboards` list, found by its name), `shot('dashboard')`.
- [ ] **Step 3: Verify the clip.**
  - Run: `pnpm --filter demo-video record overview`
  - Expected: `public/clips/overview.mp4` (30 fps) and a timeline whose marks are in increasing `t` within `duration`.
  - Grab 4 frames with ffmpeg and look at them: light theme, Nova Tower, no `/login` frames.
- [ ] **Step 4:** Run `pnpm --filter demo-video test`. Expected: PASS (the no-UUID test now scans real scripts).
- [ ] **Step 5: Commit.** `git commit -m "feat(video): playwright recording harness and overview scene"`

### Task 4: Replace the entrance camera video

**Files:**
- Modify: `docker/stream-server/videos/entrance.mp4`
- Modify: `docker/stream-server/download-samples.sh` (the `entrance` URL)
- Modify, only if the seed enrols faces from that video: `apps/backend/src/seed/seed-assets/faces/manifest.json`

- [ ] **Step 1: Pick a clip.**
  - Find a free Pexels clip (25 fps, HD) of people walking through a lobby or office entrance towards the camera, with faces visible.
  - Download it in its own empty folder in the scratchpad.
  - Trim it to 20–40 s, which `prepare-videos.sh` may already do: read it first.
  - Replace `entrance.mp4` and update the URL in `download-samples.sh`.
- [ ] **Step 2:** Rebuild and restart the stream-server: `docker compose -f docker/docker-compose.dev.yml up -d --build stream-server`. Check the compose project name the stack uses first.
- [ ] **Step 3: Verify.** Start recognition on "Main Entrance Camera" in the UI (or through the `recognition_start` action).
  - Expected within 30 s: the live wall tile shows an entrance scene and Faces > 0.
  - Stop recognition afterwards.
- [ ] **Step 4:** Run `grep -rn "entrance" apps/backend/src/seed/*.ts | grep -i face`.
  - If the seed enrols faces cut from this video, its manifest must still resolve: run `pnpm --filter backend exec vitest run src/seed`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "chore(docker): entrance camera shows a real entrance"`

### Task 5: Prep the stack for recording

No code. This is the design §8 checklist, run once all scripts exist.

- [ ] **Step 1:** Run `pnpm seed --reset`. Expected: finishes in about 6–7 min without errors.
- [ ] **Step 2:** Sign in. In the UI, start recognition on all four cameras. Wait about 2 minutes.
  - Expected: Kirby has a live denial at the Server Room Door;
  - a critical "Blacklist match" incident is open on the Loading Dock;
  - named boxes appear on the Loading Dock live view.
- [ ] **Step 3:** Record the scenes (Task 6) straight away. Then stop recognition on all cameras.

### Task 6: Scene scripts 2–8

**Files:**
- Create: `apps/demo-video/record/scenes/{02-recognition,03-people,04-places,05-access,06-incidents,07-analytics,08-privacy}.ts`

**Interfaces:**
- Consumes: the scene module shape, `Marks` (Task 3).
- Produces: one clip and one timeline per scene id: `recognition`, `people`, `places`, `access`, `incidents`, `analytics`, `privacy`. These ids match `SCENES[].clip` in Task 2.

Each script navigates the way a user would: the list, a search box or filter by the visible name, then a click on the row. Mark each moment the edit needs with `m.shot(name)`. Content per design §5 and `prep-report.md` §3:

| Script | Moments (`shot` names) |
|---|---|
| 02 | Loading Dock Camera live: hold up to 40 s and shot `named-box` when a box label matches /Donovan\|Dawson/ (read the overlay text). Then `/live-wall` `wall`, then Thomas Kirby → Photos `photos` |
| 03 | Identities, bookmark → "Seen by cameras" `faces`; open Thomas Kirby → Timeline `timeline`, scroll slowly |
| 04 | Facility Nova Tower → Areas `tree`; Floor plans → "Lobby (ground floor)" `lobby` (record this scene first in the session, see design §8 issue 3); then "Floor 12" `floor12` |
| 05 | Access decisions `list`; the newest "Denied" row for Thomas Kirby at Server Room Door → "How it was decided" `trace`; `/policy-analytics` `policies` |
| 06 | Events `events`; Incidents → newest critical "Blacklist match" `incident` (escalation panel in view); Notification rules → "Blacklist matches" → Test rule `rule-test` |
| 07 | `/analytics`, choose "Last 30 days" `charts`; scroll to busy hours `heatmap`; scroll to movement between areas `flows`. Keep "Peak on site" out of the focus boxes |
| 08 | Data subject requests → the erasure request `steps`; Retention plan `retention`; System status `status`; Help, open one article `help` |

- [ ] **Step 1:** Write the seven scripts.
- [ ] **Step 2: Record and check.**
  - Run the Task 5 prep, then `pnpm --filter demo-video record places recognition people access incidents analytics privacy overview`.
  - Expected: 8 clips plus timelines.
  - Extract one frame per `shot` mark (ffmpeg `-ss <t>`) and look at each: populated, no errors, no spinners, no `/login`.
  - Re-record single scenes as needed: recognition must still be running.
- [ ] **Step 3:** Run `pnpm --filter demo-video test`. Expected: PASS.
- [ ] **Step 4: Commit.** `git commit -m "feat(video): recording scripts for all storyboard scenes"`

### Task 7: Composition: frame, chapter cards, callouts, cursor, outro

**Files:**
- Create: `apps/demo-video/src/components/{ChapterCard,ConsoleFrame,Callout,Cursor,Outro,SceneView,Video}.tsx`
- Modify: `apps/demo-video/src/Root.tsx` (composition `ItapDemo`; remove `TitleSpike`), `src/scenes.ts` (tune `seconds`, callout `at`/`target`/`text` against the real footage)

**Interfaces:**
- Consumes: `SCENES`, `FPS`, `totalSeconds` (Task 2); `planSegments`, `sourceTimeAt` and `cameraAt` (Task 2); clips and timelines in `public/clips/` (Tasks 3 and 6), loaded with `staticFile` plus `delayRender` for the JSON.
- Produces:
  - `<Video />`: a `Series` of `SceneView`s with 12-frame cross-fades between scenes.
  - **Console scenes:** a chapter card for the first ~2 s (`[0N] LABEL` mono plus the title, rising in with blur), then `ConsoleFrame`.
  - **`ConsoleFrame`:**
    - the footage in a panel inset ~5% on the grid, with a 1px accent outline and a soft shadow;
    - `OffthreadVideo` driven frame by frame through `sourceTimeAt`, i.e. a `Sequence` per segment with `startFrom` and `playbackRate`;
    - camera transform from `cameraAt`;
    - the scene's footage window is trimmed or held to fit `seconds`.
  - **`Cursor`:** a drawn arrow tweened between click boxes, with a ripple at each click.
  - **`Callout`:** an accent mono tag and a 1px line drawn left to right to `target`, popping in at its `at` moment and leaving 0.4 s before the scene ends.
  - **`Outro`:** headline and 12 tags as in design §4, staggered 50 ms each.

- [ ] **Step 1:** Implement the components and `ItapDemo`.
- [ ] **Step 2:** Run `pnpm --filter demo-video studio`. Scrub every scene and tune the callout targets, wording and `seconds` in `scenes.ts`.
  - Callout wording follows the footage: a number is used only if it is on screen at that moment.
  - Measure recognition speed from the recognition timeline: the time from the frame a face enters to its box appearing. Keep "under 2 s" only if every measured case is under 2 s; otherwise drop it.
- [ ] **Step 3:** Run `pnpm --filter demo-video test && pnpm --filter demo-video typecheck`. Expected: PASS.
- [ ] **Step 4:** Write `scripts/contact-sheet.sh <video> <out.png>` (fps=1/2, scale 384, tile 6xN). Render a draft with `remotion render ItapDemo out/draft.mp4 --scale=0.5`, then make a sheet. Read the sheet and fix anything off-style, empty or overlapping.
- [ ] **Step 5: Commit.** `git commit -m "feat(video): blueprint composition with chapter cards, callouts and outro"`

### Task 8: Final render, README, hand-off

**Files:**
- Create: `apps/demo-video/README.md`
- Modify: `apps/demo-video/package.json` (scripts `render`, `render:light`, `sheet`)

- [ ] **Step 1: Render.**
  - `render`: `remotion render ItapDemo out/itap-demo-2026-10-26.mp4 --codec=h264 --crf=18 --pixel-format=yuv420p --muted`.
  - `render:light`: ffmpeg re-encode of the master to under 50 MB (`-crf 28 -preset slow -movflags +faststart -an`, raise the CRF if it is still over).
  - Run both.
  - Expected: both files play. Check with `ffmpeg -i`: 1920x1080, 30 fps, h264, no audio, duration 120–150 s; light copy < 50 MB.
- [ ] **Step 2:** Make the final contact sheet `out/itap-demo-2026-10-26-sheet.png`. Read it, and check frames at every scene boundary for black or empty frames.
- [ ] **Step 3: README.**
  - prep (link to design §8);
  - `record`, `studio`, `render`, `render:light`, `sheet`;
  - how to change a title or callout (`src/scenes.ts`) and how to re-record one scene;
  - the Remotion license note from design §6.
- [ ] **Step 4:** Run the quality gates `pnpm lint && pnpm typecheck && pnpm --filter demo-video test`. Expected: PASS.
- [ ] **Step 5: Commit and push.** Commit `docs(video): readme and final render scripts`, then `git pull --rebase && git push`.
- [ ] **Step 6:** Send the owner the master and light paths plus the contact sheet.
