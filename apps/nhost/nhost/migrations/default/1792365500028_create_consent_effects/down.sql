DROP TRIGGER identities_consent_matching ON itap.identities;
DROP FUNCTION itap.identities_consent_matching();
DROP TRIGGER consent_records_apply ON itap.consent_records;
DROP FUNCTION itap.consent_records_apply();
DROP FUNCTION itap.apply_biometric_consent(uuid, uuid);
DROP FUNCTION itap.biometric_consent_allows(uuid, uuid);
