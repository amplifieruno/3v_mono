DROP FUNCTION itap.run_retention(uuid, timestamptz, integer, integer);
DROP FUNCTION itap.retention_plan(json, timestamptz);
DROP FUNCTION itap.purge_class(text, uuid, timestamptz, uuid, uuid, uuid, integer, text);
DROP FUNCTION itap.retention_targets(uuid, timestamptz);
DROP FUNCTION itap.retention_class_order(text);
