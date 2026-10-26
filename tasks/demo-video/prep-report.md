# Demo video prep: report

Answer to `prep-handoff.md`. Branch `feat/ui-console`. State of the dev stack: re-seeded on Oct 26, 2026 at 12:29 UTC (15:29 Moscow), recognition running on all four cameras since 12:39 UTC. Screenshots: `screens-after/` (light theme, 1920x1080, taken 12:40–12:42 UTC).

## 1. What changed, per item

| # | Item | Cause | Fix | Commit |
|---|---|---|---|---|
| 1 | Live numbers all zero | The replay already ends at "now - 1 h" (`historyTime.ts`), so nothing needed building. The stack had simply not been seeded since Oct 22. "On site now" and zone occupancy count open tracking sessions, which close 5 min after a person's last detection. After the replay ends, only live recognition keeps them open. | None in code. Re-seed on the recording day, then start recognition (checklist below). After that: Visitors today 164, On site now 54, zone occupancy non-zero. | — |
| 2 | Empty live wall | The seeded cameras have recognition off by design. | None in code. "Start recognition" in the UI is all it takes; boxes appear within about 10 s. Named matches are real: the seed enrols faces cut from the stream videos (`seed-assets/faces/manifest.json`). | — |
| 3 | System status "Overall: Down" | Hasura left 4 cron runs `locked` on Oct 24, 05:01 UTC (it stopped mid-delivery). Every later run delivered, but `itap.system_status` measured lag from the oldest undelivered run: 55 h. | Migration 288: lag counts only runs after the last delivered one; an overtaken run in the last 24 h counts as an error (degraded). Integration test added. | `d31323f` |
| 3 | `<div>` inside `<p>` on the status page | A second spot: the "Last retention run" badge line (the header was fixed in `e94c320`). | It is a `div` now; the page logs no error. | `73259c9` |
| 4 | Overlapping floor plan labels | (a) The block put every area label at the middle of the shape's box, so Loading Dock and its geofence (same middle) stacked, and so did the Reception label and its desk. (b) The seed baked marker names into the plan image, under the console's larger icons. | Label placement in `itap:floor-plan` (`floor-plan-labels.ts`): free spot nearest the middle, one-line fallback, marker names beside their icon. The seed image is walls and title only. The geofence circle is centred on the dock door. Floor 12 (Suite 1201) fixed too; P-1 had no collision. | `800a1ca` |
| 5 | `/dashboard` almost empty | The page shows the user's own dashboard marked "On my Dashboard page"; the seed marked none. "Facility manager" is personal to `nova.admin@itap.demo` on purpose, so `admin@itap.demo` correctly gets "no access". | The seed marks each owner's dashboard as their landing dashboard. `/dashboard` now shows Security overview's widgets under the KPIs. | `d4c7576` |
| 6 | Identities list opens on dull rows | The default sort is already "Last seen, newest first". Postgres puts NULLs first in a descending order, and `@burojs/hasura` drops the `nulls` placement on offset pages (buro gap **G88**). | The declaration now asks for `nulls: 'last'` (takes effect when buro honours it). A saved view, **"Seen by cameras"**, filters to identities that were seen and sorts latest first: live faces with thumbnails open the list. Record that view (URL below). | `73259c9` |
| 7 | Identity relationships | Not in the storyboard; skipped. | — | — |
| 7 | Policy simulation "No decision would change" | The draft and pending versions target the Parking Gate and the Loading Dock Door, where the history has no decisions to re-run. | Not changed. The seed could make a draft that changes decisions: for example a new version of "Employees: main turnstiles" with a wider schedule, which would flip some of the ~39 "Outside schedule" turnstile denials to granted. | — |

Found on the walk-through and fixed:
- After `pnpm seed --reset` the admin landed on the organization picker ("Select..."), because the reset removes their last organization. The seed now records Nova Tower while none is recorded (`d4c7576`).
- Pinned list filters read "Value for Severity", "Value for Result", ... (events, incidents, access decisions, operator workspace). They now read "Severity", "Result": the framework text is overridden in the console's bundle. Logged as buro gap **G89** (`73259c9`).

Quality gates: admin-ui lint, typecheck and build pass. Admin-ui vitest: 1188 passed, 164 skipped (dev-stack suites). Backend seed tests: 128 passed. The system status integration test passed. Note: under live recognition (load average about 20) seven admin-ui error-path tests time out. The same happens without these changes; on a quiet machine they pass.

## 2. Recording checklist (on the recording day)

1. **Re-seed** (wipes and rebuilds the demo data, about 6.5 min):
   `pnpm seed --reset`
   Do it on the day of the recording, after about 09:00 Moscow time, so "today" has visitors. Seeding at 15:30 gave 643 detections for today. The record ids change; look them up again (section 3).
2. **Sign in** as `admin@itap.demo` (password `SEED_PASSWORD` from `apps/backend/.env`). It lands in Nova Tower; the facility switch shows "Nova Tower".
3. **Start recognition** on the four cameras. Use Devices → the camera → "Start recognition" in the header, or the button in its Live section:
   - Server Room Camera: Thomas Kirby (employee, IDENTITY-00003);
   - Loading Dock Camera: Isabella Donovan (VIP, IDENTITY-00001) and Emma Dawson (watch list, IDENTITY-00002);
   - Lobby Camera and Main Entrance Camera: unknown people (crowd boxes on the live wall).

   The manager picks a camera up within 10 s and the first boxes follow in a few seconds.
4. **Wait about 2 minutes.** By then:
   - Kirby has a live "Denied by a policy" decision at the Server Room Door;
   - a live **critical** "Blacklist match" incident is open on the Loading Dock and escalating;
   - "Seen by cameras" lists today's faces.
5. **Record.** The cameras are best kept running only during the recording, with "Stop recognition" afterwards. Every unknown face that the videos loop through creates identities. At the start that is about 30 a minute, falling to about 3 a minute after 5 minutes.
6. **Next day:** repeat from step 1. Without a re-seed, "today" holds only what live recognition saw.

There is no lighter top-up. The replay refuses to add days next to live data (`needs_reset`), and building one was out of scope.

## 3. URLs and records per scene (this seed)

Base `http://127.0.0.1:5173`. Ids are from the 12:29 UTC seed and change on every `--reset`. Each id below has a name to search by.

| # | Scene | Screen | URL |
|---|---|---|---|
| 1 | Overview | Operator workspace | `/workspace` |
| 1 | | Security overview (shared, the admin's) | `/dashboards/620ce622-7caf-44b0-b9b5-c5c27bef3062` |
| 1 | | Dashboard (now with widgets) | `/dashboard` |
| 2 | Live recognition | Server Room Camera, live | `/devices/378e936a-8004-42e6-8020-4e1dfa90852e?sections=live` |
| 2 | | Loading Dock Camera, live (named people) | `/devices/9221b3b4-76e0-4e43-8c9b-33bc653b632b?sections=live` |
| 2 | | Live wall | `/live-wall` |
| 2 | | Thomas Kirby (IDENTITY-00003), photos | `/identities/f6d055a0-fca8-4171-ba34-44e9e1d1b8b9?sections=photos` |
| 3 | People | Identities, "Seen by cameras" view (no ids in the URL, stays valid) | `/identities?identity.filters=eyJ2IjoyLCJwIjpbeyJmaWVsZCI6Imxhc3Rfc2Vlbl9hdCIsIm9wIjoiaXNOb3ROdWxsIn1dLCJnIjp7ImpvaW4iOiJhbmQiLCJyb3dzIjpbXX19&identity.sort=eyJ2IjoxLCJzb3J0IjpbeyJkaXJlY3Rpb24iOiJkZXNjIiwiZmllbGQiOiJsYXN0X3NlZW5fYXQifV19` (or the bookmark button → "Seen by cameras") |
| 3 | | Thomas Kirby, timeline | `/identities/f6d055a0-fca8-4171-ba34-44e9e1d1b8b9?sections=timeline` |
| 3 | | Isabella Donovan (IDENTITY-00001), VIP | `/identities/00b32227-2ab8-4b51-aec5-39ffec5659be` |
| 4 | Places | Nova Tower, area tree | `/facilities/4f7476d9-02c1-4806-b025-c3e6d7557544?sections=areas` |
| 4 | | Lobby (ground floor) | `/floor-plans/49aa4d72-91c1-426a-a229-27a666578e52` |
| 4 | | Floor 12 | `/floor-plans/1e76cdc8-f3bf-49f6-b88d-a13bc8915b82` |
| 4 | | Parking level P-1 | `/floor-plans/8ec1b818-10bb-49cb-84a6-a7aeedfa6e25` |
| 4 | | Occupancy now | `/occupancy` |
| 5 | Access | Access decisions | `/access-decisions` |
| 5 | | Kirby denied at the Server Room Door ("How it was decided": "Server room: everyone else" denies, "IT staff" does not name him) | `/access-decisions/e0b48606-bd94-4bea-90dc-0ab7c729796e` |
| 5 | | Policy analytics | `/policy-analytics` |
| 6 | Monitoring | Events | `/events` |
| 6 | | INCIDENT-00009, critical, live blacklist match of Emma Dawson on the Loading Dock, escalating (policy "Critical incidents") | `/incidents/ff11d449-4145-47f8-adbe-007ad8017870` |
| 6 | | Alternative: INCIDENT-00006, the seed's demo incident (open, escalating since the seed) | `/incidents/7cb8dd4d-1329-4a95-8daa-40e956cc06ba` |
| 6 | | Notification rule "Blacklist matches", with the "Test rule" button | `/notification-rules/0f186452-cd61-40ec-95b2-ac85694f5ffc` |
| 7 | Analytics | Analytics, last 30 days | `/analytics?period=last-30d` |
| 8 | Compliance | Erasure DSR (DSR-00003, steps) | `/data-subject-requests/d9b5062a-db11-4082-aec2-29f19dc11f25` |
| 8 | | Retention plan | `/retention-plan` |
| 8 | | System status (Overall OK) | `/system-status` |
| 8 | | Help | `/help` |

## 4. Not fixed, and why

- **Over-capacity on the loading dock (about 25 / 15, red).** It is real pipeline output. A 3-person warehouse video produces about 14 "unknown" identities, because faces at an angle or under a hard hat do not match the first capture, and each identity holds a session for 5 minutes. A fix is a recognition tuning question (new-identity quality bar, re-matching of fresh unknowns), not a demo fix. To keep it out of the frame, record the lobby plan before the cameras have run for long, or show Floor 12.
- **Kirby is denied every ~10 s while the video loops.** The face-credential cooldown (`organization_settings.face_credential_cooldown_seconds`, 10 s) works as designed. The access decisions list fills with server-room denials, which reads as a live feed.
- **The erasure DSR shows "0 rows erased" on most steps.** The erasure subject is a dedicated person with no tracking history, so the erasure does not eat into the demo's history. It still shows the restriction, the face templates and identity deleted, the tombstone and 3 files queued. An erasure with real row counts needs a subject with history, i.e. the replay plan would have to give that person sightings.
- **`/occupancy` logs "`<a>` cannot be a descendant of `<a>`".** This is buro gap G86 (a list title cell nests the relation's link); it is not visible on screen.
- **The date filter on lists shows the native placeholder "mm/dd/yyyy, --:--".** This is the framework's datetime input.
- **"Peak on site: 12 people"** next to a "People present" chart whose maximum is 116 (analytics). Both are correct: the peak is people at the same moment, the chart is people present per hour. A viewer may still read it as a contradiction.
- **Incident title "Blacklist match: Blacklist"** comes from the rule name plus the watch list's name. It is seed naming, left as is.

## 5. Screenshots

`screens-after/`: `1a`–`8d`, one per storyboard screen, named by scene. They are not committed (binary). The floor-plan before/after shots of the fix are in the session scratchpad.
