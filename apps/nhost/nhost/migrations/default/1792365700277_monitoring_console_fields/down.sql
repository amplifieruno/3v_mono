-- Order: the Hasura metadata references the functions (computed fields watch_list_entries.active,
-- shift_handovers.addressed_to_me / sent_by_me, the tracked function add_open_incidents_to_handover). Before
-- migrating down, remove them from apps/nhost/metadata-src (events.ts, incidents.ts), run
-- `pnpm --filter nhost metadata:generate` and apply the metadata; otherwise the metadata turns inconsistent.
DROP TRIGGER operator_workspaces_single_default ON itap.operator_workspaces;
DROP FUNCTION itap.operator_workspaces_single_default();
DROP FUNCTION itap.add_open_incidents_to_handover(json, uuid);
DROP FUNCTION itap.shift_handover_sent_by_me(itap.shift_handovers, json);
DROP FUNCTION itap.shift_handover_addressed_to_me(itap.shift_handovers, json);
DROP FUNCTION itap.watch_list_entry_active(itap.watch_list_entries);
