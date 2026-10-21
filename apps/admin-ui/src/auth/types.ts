/** Nhost session for the base token (Hasura role `user`). */
export interface BaseSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  user: { id: string; email: string; displayName: string };
}

/** Short-lived organization token minted by `switch_organization`. */
export interface OrgSession {
  accessToken: string;
  /** Epoch ms when the token expires. */
  expiresAt: number;
  organizationId: string;
  role: string;
}

export interface Membership {
  organizationId: string;
  name: string;
  logoFileId: string | null;
  role: string;
  status: string;
}

export interface ItapIdentity {
  id: string;
  email: string;
  name: string;
  roles: readonly string[];
  organizationId: string | null;
  memberships: readonly Membership[];
}

export type LoginParams = { email: string; password: string; organizationId?: string };

export type StoredAuth = { base: BaseSession | null; org: OrgSession | null };
