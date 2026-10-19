# Data Layer — Roadmap

Spec: `tasks/data-layer/design.md`. One implementation plan per slice, written when the previous slice is done (each slice builds on the conventions and helpers of the ones before it).

| # | Slice | Spec sections | Plan |
|---|---|---|---|
| 1 | Foundation: dev infra, metadata generator, test harness, tenancy, org tokens, storage, audit, seed skeleton | §4, §5, §6.0, §6.1, §6.14 (audit_log) | `plan-01-foundation.md` |
| 2 | Companies, work schedules, profiles, identities, embeddings, photos, relationships, duplicates, merges, verification, documents, consents, custom attributes; `match_face`; enrollment actions; TypeORM + legacy REST removal; first users of `organization_counters`/`assign_number`/`code`, `check_file_bucket`, `upload_profile_document` | §6.2 (companies, work_schedules), §6.3, §6.4, §7 (matching, enrollment) | `plan-02-identity-profile.md` (done; `summary-02-identity-profile.md`) |
| 3 | Facilities, areas, floor plans, access points, devices, health cron, facility templates | §6.6, §6.7, §8.3 | — |
| 4 | Recognition pipeline port (cameras → detections), detection pipeline (stages A/B), tracking, events, incidents, watch lists, visits | §6.2 (visits), §6.8, §6.9, §7, §8.2 | — |

Ruling (2026-10-19): live camera recognition moves from slice 2 to slice 4 — it writes `detections` (slice 4) for `devices` (slice 3); between slices 2 and 4 the legacy recognition manager is disabled (it targets dropped tables anyway).
| 5 | Notifications, escalation, on-call, subscriptions, webhooks (stage C) | §6.12, §8.2–8.4 | — |
| 6 | Segments (translator, evaluation, history) | §6.5 | — |
| 7 | Analytics stats, reports, search, bulk jobs, dashboards | §6.10, §6.11 | — |
| 8 | Physical access: policies (versioned), grants, decisions, overrides | §6.13 | — |
| 9 | Face authentication service (SA_6) | §6.16 | — |
| 10 | Compliance, retention, DSR, integrations, exports, prod cutover | §6.14, §6.15, §10 | — |

The seed grows with every slice (each slice adds its part of the office-center scenario).
