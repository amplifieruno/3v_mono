# Demo video: prepare the console for recording

You are preparing the ITAP console (dev stack, organization **Nova Tower**) so that a demo video can be recorded from it. You do **not** record the video. Your job is to make every screen listed below look alive, populated and bug-free, and then to report what you changed.

## Why

We are sending the client a short (about 2.5 min) silent progress video, built from real recordings of the console. The client has never seen the new console. The video has to show the scale of the platform and the quality of the work. It is also the groundwork for a public video with voice-over later, so whatever you fix has to keep working: it will be recorded again.

Recording is done with Playwright against the live dev stack: light theme, 1920x1080, a real login, a real recognition pipeline. Nothing in the video is mocked. The project rule still applies: **do not fake functionality or hardcode data for the video**. Data comes from the seed and the real pipeline (`.claude/rules/demo-project.md`).

## Storyboard (what will be on screen)

The story follows one person through the system: a camera sees them, the system knows where they were, decides whether to let them into the server room, raises an incident, and can erase their data on request. Screen types alternate (table, map, chart, timeline, dialog) so that two similar screens never follow each other.

| # | Scene | Screens (URL paths at `http://127.0.0.1:5173`) |
|---|---|---|
| 0 | Title (motion graphics, not the console) | — |
| 1 | Overview and navigation fly-through | `/workspace`, `/dashboards/<Security overview>`, sidebar sections expanded |
| 2 | **Live recognition** | camera record `?sections=live`, `/live-wall` with face boxes, identity `?sections=photos` |
| 3 | People | `/identities` (list with face thumbnails), identity `?sections=timeline` |
| 4 | Places | facility `?sections=areas` (area tree), `/floor-plans/<lobby>`, other floors, `/occupancy` |
| 5 | Access | `/access-decisions`, one denial `/access-decisions/<id>` ("How it was decided"), `/policy-analytics` |
| 6 | Monitoring | `/events`, a critical `/incidents/<id>` with escalation, a notification rule with the "Test rule" sheet |
| 7 | Analytics | `/analytics?period=last-30d` (charts, busy-hours heatmap, flow matrix) |
| 8 | Compliance and operations | `/data-subject-requests/<erasure>` (steps), `/retention-plan`, `/system-status`, `/help` |
| 9 | Outro with scale numbers (motion graphics) | — |

The reference screenshots of the current state are in `tasks/demo-video/screens/`.

## What is wrong now (fix these)

Priority order. Each item names the screenshot that shows it.

### 1. Live numbers are all zero: "Visitors today", "On site now", zone occupancy
`screens/03-analytics.png`, `screens/06-occupancy.png`, `screens/01-dashboard.png`.
The seeded history ends on Oct 22, so today's figures and current occupancy are 0 everywhere: the analytics key figures, the occupancy page, the floor plans ("0 / 80"), the area tree and the dashboards. The charts also show "today" as empty.
- **Find out** how the seed anchors the 30-day replay in time (`apps/backend/src/seed/`). Can it end at "now"?
- **Make sure** a re-seed (`pnpm seed --reset`, takes several minutes) gives non-zero occupancy and visitors for today.
- **Robustness:** the video will be re-recorded on later days, so it must not go stale after one day. Document the simplest way to refresh it, for example "run `pnpm seed --reset` the day before recording" or a lighter top-up. Do not build anything heavy for this.
- Combined with item 2, people currently on site should also come from live recognition.

### 2. The live wall is empty; no camera runs recognition
`screens/08-live-wall.png`.
The seeded cameras have recognition off. The stream-server (`docker/stream-server`) loops four stock videos with people (`entrance`, `lobby`, `serverroom`, `warehouse`), so the real pipeline can run: the `recognition_start` action, then InsightFace, `match_face`, detections and Socket.io.
- **Verify** that starting recognition on one or two cameras gives face boxes on the live wall and on the camera's live section, and that detections and identities appear.
- **Does the recording session need anything** beyond pressing "Start recognition" in the UI? Document the exact steps and how long it takes until boxes appear.
- **Ideally**, at least one face from the videos matches an enrolled, named identity, so that a named person can be followed in scenes 2→3. If none does, say so. Do not fake a match. Report the options (for example enrolling a face crop from the stream through the real enrollment flow, as the seed does) and take the simplest real one.
- **Check** that the face crops in the identity photo gallery (`?sections=photos`) look decent.

### 3. System status says "Overall: Down" while every probe is OK
`screens/31-system-status.png`.
- Find the cause (probably cron lag or a stale job) and fix the real cause, not the label.
- The page also logs a React error: a `<div>` nested inside a `<p>`. Commit `e94c320` touched the header markup; check whether something is still invalid.

### 4. Overlapping labels on the lobby floor plan
`screens/10-floor-plan.png`, top-right corner.
The labels of "Loading Dock", "Loading Dock Geofence" (the circle) and the loading-dock door and camera are drawn on top of each other and are unreadable. Smaller collisions: "Reception" and "Reception Desk" collide with the desk icon, and the turnstile labels overlap their icons.
- Fix it in the floor-plan block (`itap:floor-plan`), in the label placement or the seed coordinates, whichever is the real cause.
- Check the other floor plans (floor 12, parking P-1) as well.

### 5. The `/dashboard` page is almost empty
`screens/01-dashboard.png`: six KPI tiles and white space. The video will use `/workspace` (`screens/07-workspace.png`) and the "Security overview" dashboard (`screens/51-dashboard-security.png`) instead.
- **Check** that the seeded "Security overview" dashboard is accessible to `admin@itap.demo`.
- The seeded "Facility manager" dashboard (`520359c5-…`) answers "record does not exist or no access" for that user. Either it belongs to another user on purpose (then fine) or the seed is wrong. Decide which.
- If the dashboard widgets are empty because of item 1, item 1 covers it.

### 6. The identities list opens on dull rows
`screens/40-list-identities.png`: the first rows are archived identities or duplicates with 0 detections, so the list looks empty of life. It should open on active identities with face thumbnails, for example sorted by the latest detection. Fix this through the list's default sort or filter in the declaration, if that is a sensible default for real users too. Otherwise tell us which URL with sort or filter params to record instead.

### 7. Smaller, nice to have
- **Identity relationships** are empty in the seed. This is not in the storyboard; skip it unless it is trivial.
- **Policy simulation** returns "No decision would change" for both draft versions. This is not in the storyboard either; just note whether the seed could produce a draft whose simulation changes decisions.

## While you are in there

Walk through every screen in the storyboard in light theme at 1920x1080 and look for anything a client would notice:
- empty states, zeros and "No data" messages
- errors and toasts
- broken layout and text that is cut off
- spinners that never end
- raw ids where a name should be
- English typos

Fix what is cheap. List the rest in your report.

## How to get in

- **Login:** open `http://127.0.0.1:5173/` and sign in as `admin@itap.demo` with the password `SEED_PASSWORD` from `apps/backend/.env`. This is the same as `apps/admin-ui/e2e/global-setup.ts`. The admin lands in Nova Tower.
- **Light theme and facility:** before the page loads (`addInitScript`), set localStorage `buro-theme=light` and `itap:facility:374924c1-8b25-42ea-8cf8-8fa5ad6d8a1f=c2446287-6512-4cfe-b4d7-e82e7ca8125a`, and use `colorScheme: 'light'`.
- **Sessions:** hasura-auth allows only 10 sign-ins per 5 minutes, and refresh tokens rotate, so a saved session goes stale after the next run. Re-login when you are redirected to `/login`.
- **Record ids** in the URLs come from the seed and change on `--reset`. Look them up again after a re-seed.

## Rules

- Follow `CLAUDE.md` and `.claude/rules/*`: buro declarations first, framework gaps go in `tasks/ui/buro-gaps.md`, Hasura metadata is generated (never hand-edit it), files stay under ~300 lines, no `any`.
- Fix root causes. Do not add video-only switches, hidden demo modes or hardcoded numbers.
- Seed changes must keep `pnpm seed --reset` working end to end.
- Run the quality gates before committing (`pnpm lint`, `pnpm typecheck`, `pnpm build`) plus the affected test suites (the admin-ui vitest suite for UI changes, backend unit tests for seed or backend changes). Commit in the repo's format.

## Report back

1. **What you changed,** per item above, with commits.
2. **The recording checklist:** the exact steps to put the stack into "ready to record" state on a given day (re-seed? start recognition on which cameras? wait how long?).
3. **The final URLs and record ids** for every storyboard scene after your changes: which identity, which access denial, which incident, which DSR, which floor plans.
4. **What you could not fix,** and why.
5. **Fresh screenshots** of every storyboard screen (light theme, 1920x1080) in `tasks/demo-video/screens-after/`.
