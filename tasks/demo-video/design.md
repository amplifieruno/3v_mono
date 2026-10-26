# ITAP demo video: design

Status: draft for the owner's approval (Oct 26, 2026). The storyboard, chapter titles and style C were agreed in chat. Prep of the console: `prep-handoff.md` → `prep-report.md` (done).

## 1. Intent

A short, polished, silent video of the new ITAP console, sent to the client **as a file** so they can see how the work is going. The client has **never seen the new console**, so this is their first impression of the product.

The video has to convey three things:
- **Breadth.** The product is big and complete: many capabilities that work together.
- **Craft.** The work is careful: real data, details on every screen, no rough edges.
- **Life.** It actually works: live cameras, live decisions, live incidents.

It is also the **groundwork for a public video with voice-over**, planned soon. The recordings, scenes and edit must therefore be easy to redo and change part by part. Re-recording after a UI change, rewording a title or dropping a scene must not mean starting over.

## 2. Goals, non-goals, anti-goals

**Goals**
- 2:00–2:30, MP4, 1920x1080, which opens anywhere (a laptop or a messenger).
- A product story, told in what the user gets.
- Real recordings of the live dev stack (light theme) inside a designed frame (style C, section 4).
- Screen types alternate: never two similar screens in a row (table → map → chart → timeline → dialog). Tables and forms appear, just not back to back.
- Everything is source in the repo: recording scripts, scene list, edit, render command.

**Non-goals (for this version)**
- Voice-over and subtitles. The structure must leave room for them (section 7), but none is produced now.
- Showing every screen or teaching how to use the console.
- A mobile or vertical cut.

**Anti-goals (failure even if the video technically works)**
- **Exposing the technology.** No names of engines, libraries, databases or infrastructure anywhere in frame: titles, callouts, outro. No counts of tables, SQL functions, cron jobs, tests or lines of code. (The owner's explicit rule.)
- **A dead product on screen:** zeros, empty states, spinners, errors, "No data".
- **Faked functionality.** No mocked screens, no hardcoded numbers, no HTML rebuilds of console screens pretending to be the product. The console is recorded as it runs (`.claude/rules/demo-project.md`). Motion graphics exist only around the recordings: title, chapter cards, callouts, outro.
- **Boredom:** long navigation, waiting, repeated look-alike screens, anything over about 2:30.

## 3. Content rule: product language only

Every title and callout states what the user gets or sees, in words a building operator or a security manager would use. Examples: "Face matched", "Known person · VIP", "5 policies checked", "Escalated automatically". Never: "InsightFace", "pgvector", "Hasura", "SQL", "cron", "event trigger".

A number may appear on screen only if it is visible in the console itself (for example "164 visitors today") or is a product fact that can be checked. Speed claims such as "under 2 s" go in only if measured on the recording setup. Otherwise they are dropped.

## 4. Visual style: "Blueprint" (option C)

Reference: the artifact https://claude.ai/artifact/YZpEBtHih7TTJU4b5RwDRM (version 3; source `/tmp/.../scratchpad/art/itap-video-style.html` is temporary, so the values are restated here).

- **Background:** `#f4f6f8` with an engineering grid of 1px lines in `rgba(20,40,70,.07)`, cell about 4.6% of the frame width.
- **Ink:** `#0f1b2d`. **Secondary ink:** `#3a5a80`. **Accent:** `#1f6feb`, the only accent; semantic colors inside the console are left as they are.
- **Type:**
  - Inter Tight for titles: weight 600, tight tracking (-0.035 to -0.045em);
  - JetBrains Mono for labels, chapter numbers like `[02] RECOGNITION`, corner marks and callouts.
- **Console footage:** sits on the grid as a framed panel with a 1px accent-tinted outline and a soft shadow, never full-bleed edge to edge, except during deliberate zooms.
- **Callouts:** small accent-filled mono tags joined by a 1px accent line to the point on screen they describe. They pop in after the shot settles.
- **Corner marks:** small mono text in the frame corners, such as `ITAP · OCT 2026` and `NOVA TOWER`, plus thin accent brackets. They are decorative and quiet.
- **Motion vocabulary** (from the artifact's Play):
  - text rises in with a slight blur;
  - the console panel slides in;
  - lines draw from left to right;
  - callouts pop;
  - ease `cubic-bezier(.2,.7,.2,1)`, about 0.5–1.2 s;
  - no bounces, spins or flashy transitions; cuts between scenes are quick cross-fades or slides over the grid.
- **Inside the footage:** a smooth camera, with eased zoom and pan to the area of interest such as the click target, the decision table or the face box. Add a drawn cursor with a subtle click ripple. Waiting is cut out or sped up.
- **Title:** `ITAP_` (blinking accent underscore), `identity · tracking · access`, corner marks.
- **Outro:** "One platform for identity, access and safety_" plus 12 capability tags appearing one by one: Live recognition, People, Places & floor plans, Devices, Access control, Face sign-in, Incidents, Notifications, Segments, Face search, Analytics, Privacy & compliance. No numbers.

## 5. Storyboard

The story follows people through one building, Nova Tower. A camera sees them, the system knows where they have been, decides whether a door opens, raises an incident on its own, and can erase a person's data on request.

Durations are targets; the total is 2:00–2:30.

| # | ~Time | Chapter title (on card) | Footage (see `prep-report.md` §3 for URLs) | Callout ideas |
|---|---|---|---|---|
| 0 | 0:00–0:06 | Title: `ITAP_` | — | — |
| 1 | 0:06–0:20 | **One console for the whole building** | `/workspace` (live events, open incidents); a quick pass over the sidebar sections; Security overview dashboard | "Live events", "Open incidents" |
| 2 | 0:20–0:42 | **Every camera knows who it sees** | Loading Dock and Server Room cameras live; `/live-wall` with face boxes; Thomas Kirby's photos | "Face matched", "Known person · VIP", "Watch list" |
| 3 | 0:42–0:58 | **A person's whole day, in one timeline** | Identities "Seen by cameras" list (faces), then Kirby's timeline | "Arrived 08:52", "Access granted", "Left building" (as on screen) |
| 4 | 0:58–1:14 | **Your building, floor by floor** | Facility area tree, then Lobby plan (cameras, turnstiles, zones with live occupancy), switch to Floor 12 | "Live occupancy", "Camera coverage" |
| 5 | 1:14–1:34 | **Who gets in, and why** | Access decisions list (live denials), Kirby's denial "How it was decided", Policy analytics | "5 policies checked", "Denied: server room" |
| 6 | 1:34–1:50 | **Incidents raise themselves** | Events list, live critical incident (watch-list match, escalating), notification rule "Test rule" sheet | "Escalated automatically", "7 of 20 events match" (as on screen) |
| 7 | 1:50–2:04 | **See how the building lives** | Analytics, last 30 days: occupancy chart, busy-hours heatmap, movement between areas | "Busiest hour", "Top route" |
| 8 | 2:04–2:18 | **Privacy built in** | Erasure request with its steps, retention plan, system status (all OK), Help | "Erased on request", "Retention by data type" |
| 9 | 2:18–2:28 | Outro | — | — |

Callout text is a starting point: the final wording must match what the footage actually shows at that moment.

## 6. Production approach (decided)

- **Recording:** Playwright scripts against the dev stack, one clip per scene, at 1920x1080 in light theme with real login.
  - Login, theme and facility setup are in `prep-handoff.md` "How to get in".
  - The installed `@playwright/test` is 1.64.1.
  - Each script also writes a **timeline** of what happened when: action timestamps, waits, the target element's box, chapter marks. The edit uses it to cut waits and to aim zooms. Waits are not found later by analysing the video.
- **Edit and render: Remotion** (React video, `<OffthreadVideo>` for frame-accurate clips, `interpolate`/`spring` for zooms, Remotion Studio for previews).
  - **License:** free under the Remotion Free License; the owner works alone, as an individual subcontractor.
  - **Caveat:** if the client's company (more than 3 people) later renders or develops the video itself, it needs its own Remotion company license ($25/month per seat). This must be said in the hand-off.
  - HyperFrames (Apache-2.0, v0.8) was considered and set aside for maturity risk on a same-day deadline.
  - The composition reads a scene list plus the timelines. Scenes, titles, callouts and durations are data, so one scene or one title can change without touching the rest.
  - Use the official Remotion agent skills (`npx remotion skills add` or the Claude Code plugin) if they help.
- **Before every render** a contact sheet of preview frames is produced and reviewed, and the final MP4 is checked frame by frame at the scene boundaries.
- **Location:** a new folder `apps/demo-video/` (own `package.json`, scripts `record`, `render`, `preview`). Rendering is **not** part of `pnpm build`, `lint` or `typecheck` gates beyond type-checking its own TypeScript, and the raw clips and renders are git-ignored.

## 7. Built for the voice-over version

- Each scene is a unit with its own duration, title, callouts and clip range. A later voice-over adds one audio file per scene; the scene's length then follows the audio, with the footage sped up, slowed or held on a frame.
- Titles and callouts live in one text file per locale-free scene list, so rewording is a one-line change.
- Re-recording is one command per scene after the day's prep (section 8).

**Scope for today's version:** the scene structure above leaves room for voice-over, but nothing more is built for it: no audio retiming, no audio slots.

## 8. Prerequisites and known issues

**Owner's answers (Oct 26):**
- The video builder may change the console and the seed when that is needed for the video.
- The dev stack is used only by this project, so re-seeding and running recognition are fine at any time.
- **Deadline: today.**

**Fixes in scope before recording:**
- Replace `entrance.mp4` with a real entrance clip with visible faces.
- Optionally, give the erasure request a subject with history, if that stays cheap.

**Recording-day checklist:** `prep-report.md` §2. Re-seed the same day, sign in, start recognition on all four cameras, wait about 2 minutes, record, stop recognition. Record ids change on every re-seed, so scripts must find records by name (for example "Thomas Kirby", "Blacklist match", "Lobby (ground floor)") and never by id.

**Open issues seen in the after-screens. They must be fixed or kept out of frame:**
1. **Some face boxes on the live wall show codes ("IDENTITY-00162") instead of names. This is intended, not a label bug.** The box shows the profile name when the face matched a person with a profile (`boxLabel` in `apps/admin-ui/src/blocks/live-camera/detection-label.ts`). Otherwise it shows the code of an unknown identity. The codes in the after-screens are fresh unknown identities: an angled face or a face under a hard hat failed to match the enrolled person (the same cause as issue 3). For scene 2, record long enough and cut to the moments when named boxes ("Isabella Donovan", "Emma Dawson", "Thomas Kirby") are on screen.
2. **"Main Entrance Camera" shows a server room.** The binding is correct. The stock clip `docker/stream-server/videos/entrance.mp4` is itself server-room footage, and it has no visible faces (0 faces on the live wall). Either replace it with a real entrance clip with faces (Pexels, as `download-samples.sh` does), or keep that camera out of frame.
3. **The loading dock goes over capacity** (about 25 / 15, red) a few minutes into recognition: it is real pipeline output (`prep-report.md` §4). Record the lobby plan early in the session or favour Floor 12.
4. **The erasure request shows "0 rows erased" on most steps.** Frame the steps list so the completed checkmarks carry the scene, not the counts, or use a subject with history if the seed is changed.
5. **On analytics, "Peak on site: 12 people" sits next to a chart that peaks at 116.** Both are correct, but they read as a contradiction; keep that line out of frame or out of the zoom.
6. **Unknown identities pile up** while cameras run (about 30 a minute at first). Record soon after starting recognition, and stop it afterwards.

## 9. Deliverables

1. **The MP4:** `apps/demo-video/out/itap-demo-<date>.mp4`, 1920x1080, 30 fps, H.264 (high profile, yuv420p, faststart), about 2:00–2:30, no audio track.
   - **Delivery:** the owner sends it to the client as a file.
   - **Quality** (my call): a master encoded for crisp UI text (CRF about 18, which is roughly 100–200 MB) plus a light copy under about 50 MB for messengers that cap or re-compress video.
2. **A contact sheet** of the final cut, one frame every ~2 s, for quick review.
3. **The source in `apps/demo-video/`:**
   - recording scripts;
   - the scene list (titles, callouts, durations);
   - the Remotion composition;
   - a README: how to prep the stack, record, preview and render.

## 10. Left to the builder

- Exact durations within the 2:00–2:30 budget, and the order of shots inside a scene.
- Cursor design, zoom amounts and easing details, within section 4.
- How timelines are captured (Playwright `screencast` API or `recordVideo` plus own timestamps) and clip conversion (for example 25 → 30 fps).
- Final callout wording, within section 3.
