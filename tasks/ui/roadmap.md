# ITAP Console — Roadmap

Spec: `tasks/ui/design.md`. Framework gaps: `tasks/ui/buro-gaps.md`. One plan per phase
(`plan-NN-<name>.md`), one summary per phase (`summary-NN-<name>.md`), written when the phase starts
and ends. Branch `feat/ui-console`.

| # | Phase | Scope (data-layer tables / functions) | Depends on |
|---|---|---|---|
| 0 ✅ | Foundation | app skeleton, auth + org token, shell, org/facility switch, Hasura mapping + schema test, custom operations, enums, file field, i18n + docs + Help, organization profile, members + invitations | — (done, `summary-00-foundation.md`) |
| 1 | Organization | organization settings, companies, work schedules, custom attribute definitions, user settings | 0 |
| 2 | Places | facilities, areas (tree), floor plans (block), access points (+ devices binding), facility templates (`apply_facility_template`) | 1 |
| 3 | Devices | devices, device areas, health metrics, device events, live camera block (stream-server + Socket.io detections), `recognition_start/stop/status` | 2 |
| 4 | People | profiles (documents via `upload_profile_document`/`open_file`, consent, restriction, duplicates), identities (photos, enrollment, merge/rollback/split, duplicates, verification, relationships), visits (check-in/out) | 2, 3 |
| 5 | Monitoring | detections, tracking sessions, identity locations, occupancy, events, event rules (versions, test), incidents (lifecycle, notes, activities), watch lists, shift handovers, operator workspace | 4 |
| 6 | Notifications | rules, templates, recipient groups, escalation policies, on-call, subscriptions, user inbox, deliveries, webhooks (+ deliveries) | 5 |
| 7 | Segments | segments manual/dynamic, conditions editor over `segment_fields`, `preview_segment`/`evaluate_segment`, members history, daily stats, templates | 4 |
| 8 | Analytics | dashboards (renderer + editor), occupancy/flow/heatmap/timeline blocks, reports (templates, schedules, files, retry), stats views | 5, 7 |
| 9 | Search & bulk | `search_faces` (upload + webcam capture), results, saved searches, bulk jobs (+ rows, retry/cancel) | 4 |
| 10 | Access control | access policies (versions, four-eyes flows, simulate), grants, emergency overrides, decisions, terminal sync, `publish_policy_to_terminals` | 4, 7 |
| 11 | Face authentication | client applications (+ bindings), keys (`rotate_client_key`), sessions, attempts, review, `authenticate_face` | 4, 7, 10 |
| 12 | Compliance | retention policies + plan + runs, legal holds, DSR, processing activities, integrations (+ secret, sync runs), exports, system status, audit log | all |

Rules for every phase: maximum buro use; English `texts`; docs for every resource and every field
whose label does not carry its meaning; gaps logged; `checkApp` and docs-integrity green; one
Playwright smoke per module against the seeded dev stack; demo recording at the end of the phase.

Screens that need many-to-many writes (watch-list entries, recipient group members, segment manual
members, rule event types/channels, client application bindings, policy subjects/targets) are built
with links for reading and junction-resource lists for editing; revisited when buro ships link
writes.
