# ITAP demo video

A narrated product video of the ITAP console. Playwright records the live console in short beats. A local voice model reads the narration, and a Remotion composition cuts the beats together under the voice. The edit is code: one line of narration, one beat or one title can change without redoing the rest.

- **Design:** `tasks/demo-video/design.md` (intent, storyboard, style, content rules).

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Narration | `src/narration.json` | One line per beat, plus `title` and `outro`, with the voice, its speed and a pronunciation map (`ITAP` is read letter by letter). |
| Voice | `voice/tts.py` | Reads every line with Kokoro-82M (Apache-2.0, runs locally on the CPU) into `public/voice/<id>.wav`. It also writes `manifest.json` with each line's length and the timing of every sentence. The subtitles come from that timing. |
| Recording | `record/` | One script per chapter (`record/scenes/*.ts`). Each beat is prepared off camera (navigation, tabs, scrolling), then only its visible part is recorded to `public/clips/<scene>-<beat>.mp4`, with `<scene>-<beat>.timeline.json` (focus marks, waits, named shots with element boxes). The page is 1440x810 at 4/3 density, so the 1920x1080 footage carries large, sharp UI text. A beat keeps filming until it covers its narration line. |
| Storyboard | `src/scenes.ts` | Chapters, their beats and the callout tags. |
| Edit math | `src/timeline.ts`, `src/voice.ts`, `src/durations.ts` | Speeds waits up (6x, at most 8 s of output) and moves the camera only on focus marks (a slow pull-in). A beat lasts its footage, or its line plus a lead-in and a tail if that is longer. |
| Composition | `src/components/` | The blueprint grid, title and chapter cards, chapter band with the progress rail, the footage panel with callouts, the narration, the subtitles and the outro. |
| Content rules | `src/content-rules.ts` | Words that must never appear on screen (technology names). `pnpm test` enforces them. |

## Make a new cut

The stack is the dev stack (`make dev-compose`), and the console runs from source (`pnpm --filter admin-ui dev`, http://127.0.0.1:5173).

1. **Voice** (about a minute; downloads the model into `.cache/` the first time):
   `pnpm --filter demo-video voice`. To redo only some lines, run `uv run voice/tts.py overview-dashboard outro` in `apps/demo-video`.
   The model files go into `apps/demo-video/.cache/kokoro/`, from the kokoro-onnx `model-files-v1.0` release: `kokoro-v1.0.onnx` and `voices-v1.0.bin`.
2. **Re-seed the demo data** during the building's working day, after about 10:00 Moscow time, so that "today" has visitors (about 7 minutes):
   `pnpm seed --reset` (from the repo root).
3. **Start recognition** on the four stream cameras. Wait about 2 minutes, until known faces are named and the live incident is open:
   `pnpm --filter demo-video cameras`
4. **Record every beat** (about 6 minutes), soon after step 3, before unknown visitors pile up on the floor plans:
   `pnpm --filter demo-video record`. Only some: `pnpm --filter demo-video record places access-trace`.
5. **Stop recognition:** `pnpm --filter demo-video cameras stop`
6. **Preview:** `pnpm --filter demo-video studio`
7. **Render** the master, then a light copy for messengers and a contact sheet to review:
   `pnpm --filter demo-video render && pnpm --filter demo-video render:light && pnpm --filter demo-video sheet`

Output goes to `out/`. The folders `out/`, `public/clips/`, `public/voice/` and `.cache/` are git-ignored.

## Common changes

- **Reword narration:** edit `src/narration.json`, re-voice that line, and re-record its beat if the new line is longer than the footage. If it is shorter, the beat simply ends sooner.
- **Reword a title or callout:** edit `src/scenes.ts`, then run `pnpm --filter demo-video test`. The test rejects technology words.
- **Change what a beat shows:** edit `record/scenes/<nn>-<scene>.ts` and re-record that beat. Scripts find records by their visible names, never by id, so they survive a re-seed.
- **Add music:** put a licensed track at `public/audio/music.mp3`. It plays quietly under the narration and fades in and out. No music ships with the repo.

## Licence notes

- **Remotion** is free for individuals and for companies of up to 3 people, and this video is made under that free licence. If a larger company renders or develops this video itself, it needs a Remotion company licence ($25 per month per seat, see remotion.pro/license).
- **Kokoro-82M** model and voices are Apache-2.0, so the narration can be used commercially.
