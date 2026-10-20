-- Slice 8 carry: commit-time (deferred) triggers of one row event fire in name order. The access epoch bumps
-- (access_credentials_*) lock organization_settings, which must be the LAST lock of a transaction (lock order,
-- conventions "Physical Access"); segment_inputs_changed* (segment_evaluation_requests) must run first. Renamed with
-- a zz_ prefix (trigger and its constraint), definitions unchanged.
ALTER TRIGGER access_credentials_granted ON itap.profiles RENAME TO zz_access_credentials_granted;
ALTER TABLE itap.profiles RENAME CONSTRAINT access_credentials_granted TO zz_access_credentials_granted;
ALTER TRIGGER access_credentials_withdrawn ON itap.profiles RENAME TO zz_access_credentials_withdrawn;
ALTER TABLE itap.profiles RENAME CONSTRAINT access_credentials_withdrawn TO zz_access_credentials_withdrawn;
ALTER TRIGGER access_credentials_withdrawn_delete ON itap.profiles RENAME TO zz_access_credentials_withdrawn_delete;
ALTER TABLE itap.profiles RENAME CONSTRAINT access_credentials_withdrawn_delete TO zz_access_credentials_withdrawn_delete;
ALTER TRIGGER access_credentials_granted ON itap.identities RENAME TO zz_access_credentials_granted;
ALTER TABLE itap.identities RENAME CONSTRAINT access_credentials_granted TO zz_access_credentials_granted;
ALTER TRIGGER access_credentials_granted_update ON itap.identities RENAME TO zz_access_credentials_granted_update;
ALTER TABLE itap.identities RENAME CONSTRAINT access_credentials_granted_update TO zz_access_credentials_granted_update;
ALTER TRIGGER access_credentials_withdrawn ON itap.identities RENAME TO zz_access_credentials_withdrawn;
ALTER TABLE itap.identities RENAME CONSTRAINT access_credentials_withdrawn TO zz_access_credentials_withdrawn;
ALTER TRIGGER access_credentials_withdrawn_delete ON itap.identities RENAME TO zz_access_credentials_withdrawn_delete;
ALTER TABLE itap.identities RENAME CONSTRAINT access_credentials_withdrawn_delete TO zz_access_credentials_withdrawn_delete;
ALTER TRIGGER access_credentials_withdrawn ON itap.areas RENAME TO zz_access_credentials_withdrawn;
ALTER TABLE itap.areas RENAME CONSTRAINT access_credentials_withdrawn TO zz_access_credentials_withdrawn;
ALTER TRIGGER access_credentials_withdrawn ON itap.watch_list_entries RENAME TO zz_access_credentials_withdrawn;
ALTER TABLE itap.watch_list_entries RENAME CONSTRAINT access_credentials_withdrawn TO zz_access_credentials_withdrawn;
ALTER TRIGGER access_credentials_granted ON itap.segment_members RENAME TO zz_access_credentials_granted;
ALTER TABLE itap.segment_members RENAME CONSTRAINT access_credentials_granted TO zz_access_credentials_granted;
ALTER TRIGGER access_credentials_granted_reopen ON itap.segment_members RENAME TO zz_access_credentials_granted_reopen;
ALTER TABLE itap.segment_members RENAME CONSTRAINT access_credentials_granted_reopen TO zz_access_credentials_granted_reopen;
ALTER TRIGGER access_credentials_withdrawn ON itap.segment_members RENAME TO zz_access_credentials_withdrawn;
ALTER TABLE itap.segment_members RENAME CONSTRAINT access_credentials_withdrawn TO zz_access_credentials_withdrawn;
ALTER TRIGGER access_credentials_withdrawn_delete ON itap.segment_members RENAME TO zz_access_credentials_withdrawn_delete;
ALTER TABLE itap.segment_members RENAME CONSTRAINT access_credentials_withdrawn_delete TO zz_access_credentials_withdrawn_delete;
