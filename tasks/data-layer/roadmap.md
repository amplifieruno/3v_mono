# Data Layer — Roadmap

Spec: `tasks/data-layer/design.md`. One implementation plan per slice, written when the previous slice is done (each slice builds on the conventions and helpers of the ones before it).

| # | Slice | Spec sections | Plan |
|---|---|---|---|
| 1 | Foundation: dev infra, metadata generator, test harness, tenancy, org tokens, storage, audit, seed skeleton | §4, §5, §6.0, §6.1, §6.14 (audit_log) | `plan-01-foundation.md` |
| 2 | Companies, schedules, profiles, identities, embeddings, recognition pipeline, enrollment; TypeORM removal; first users of `organization_counters`/`assign_number`/`code`, `check_file_bucket`, `upload_profile_document` | §6.2–6.4, §7 | — |
| 3 | Facilities, areas, floor plans, access points, devices, health cron | §6.6, §6.7, §8.3 | — |
| 4 | Detection pipeline (stages A/B), tracking, events, incidents, watch lists, visits | §6.8, §6.9, §8.2 | — |
| 5 | Notifications, escalation, on-call, subscriptions, webhooks (stage C) | §6.12, §8.2–8.4 | — |
| 6 | Segments (translator, evaluation, history) | §6.5 | — |
| 7 | Analytics stats, reports, search, bulk jobs, dashboards | §6.10, §6.11 | — |
| 8 | Physical access: policies (versioned), grants, decisions, overrides | §6.13 | — |
| 9 | Face authentication service (SA_6) | §6.16 | — |
| 10 | Compliance, retention, DSR, integrations, exports, prod cutover | §6.14, §6.15, §10 | — |

The seed grows with every slice (each slice adds its part of the office-center scenario).
