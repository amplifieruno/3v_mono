-- webhook_body reads a row value only, but jsonb conversion of timestamptz depends on the session TimeZone:
-- STABLE, not IMMUTABLE.
ALTER FUNCTION itap.webhook_body(itap.events) STABLE;
