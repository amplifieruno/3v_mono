import type { HasuraClient } from '../hasura/client.js';

export type BiometricConsentRow = {
  id: string;
  status: string;
  granted_at: string;
  withdrawn_at: string | null;
  created_at: string;
};

/**
 * Mirrors SQL `itap.biometric_consent_allows`: the latest biometric_processing record decides, latest by
 * (coalesce(withdrawn_at, granted_at), created_at, id); no record → allowed.
 */
export function biometricConsentAllows(records: BiometricConsentRow[]): boolean {
  const effective = (r: BiometricConsentRow) => Date.parse(r.withdrawn_at ?? r.granted_at);
  const [latest] = [...records].sort(
    (a, b) =>
      effective(b) - effective(a) || Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id),
  );
  return latest === undefined || latest.status !== 'withdrawn';
}

const CONSENTS = `
  query EnrollmentConsents($profile: uuid!, $org: uuid!) {
    consent_records(
      where: { organization_id: { _eq: $org }, profile_id: { _eq: $profile }, purpose: { _eq: biometric_processing } }
    ) { id status granted_at withdrawn_at created_at }
  }
`;

/** Whether the profile's current biometric consent allows storing face data (spec §8.2). */
export async function profileAllowsBiometrics(admin: HasuraClient, organizationId: string, profileId: string): Promise<boolean> {
  const { consent_records: records } = await admin.request<{ consent_records: BiometricConsentRow[] }>(CONSENTS, {
    profile: profileId,
    org: organizationId,
  });
  return biometricConsentAllows(records);
}
