import { f } from '@burojs/field-types';
import {
  ACCESS_POINT_RESOURCE,
  CLIENT_APPLICATION_KEY_RESOURCE,
  CLIENT_APPLICATION_RESOURCE,
  IDENTITY_RESOURCE,
} from '../../data/resource-names';
import { AUTH_MODES, AUTH_MODE_ENUM } from '../../enums/face-auth';
import { AUTH_SESSION_STATUSES, AUTH_SESSION_STATUS_ENUM, AUTH_STEPS, AUTH_STEP_ENUM } from '../../enums/face-auth-records';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';

/** A read-only link to another record, opening its page (`open: 'none'` for one without pages). */
export const authLink = (to: string, label: string, summary: string, open: 'page' | 'none' = 'page') =>
  f.relation({ to, system: true, nullable: true, open, texts: { label, doc: { summary } } });

/**
 * Columns of `itap.authentication_sessions` the `org_admin` role reads: written by the face
 * authentication service only (and the console tester), never edited here. The claimed reference
 * and the nonce are stored as fingerprints no role may read.
 */
export const authenticationSessionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  created_at: dateTime({ system: true, texts: { label: 'Opened', doc: { summary: 'When the client application opened the session.' } } }),
  application_id: authLink(CLIENT_APPLICATION_RESOURCE, 'Application', 'The client application that opened the session.'),
  mode: enumField(AUTH_MODES, AUTH_MODE_ENUM, { system: true, texts: { label: 'Mode', doc: { summary: 'Identification (who is this?) or verification of a claimed person.' } } }),
  status: enumField(AUTH_SESSION_STATUSES, AUTH_SESSION_STATUS_ENUM, {
    system: true,
    texts: { label: 'Status', doc: { summary: 'Open while captures are accepted; then succeeded, failed, waiting for review or expired.' } },
  }),
  step: enumField(AUTH_STEPS, AUTH_STEP_ENUM, {
    system: true,
    texts: { label: 'Next step', doc: { summary: 'The step the session expects next: the first capture, a recapture or a second factor.' } },
  }),
  step_count: f.number({ system: true, texts: { label: 'Attempts', doc: { summary: 'How many captures and second factors the session has recorded.' } } }),
  recapture_count: f.number({ system: true, texts: { label: 'Recaptures', doc: { summary: 'Repeated captures so far (at most two per session).' } } }),
  claimed_identity_id: authLink(
    IDENTITY_RESOURCE,
    'Claimed identity',
    'In verification, the identity the person claims to be (as the application named it); empty in identification.',
  ),
  access_point_id: authLink(ACCESS_POINT_RESOURCE, 'Access point', 'The door the session is for, when the application is bound to doors.'),
  key_id: authLink(
    CLIENT_APPLICATION_KEY_RESOURCE,
    'API key',
    'The key whose signature opened the session; empty for a console test (“Authenticate a face”).',
    'none',
  ),
  device_ref: f.text({
    system: true,
    nullable: true,
    texts: { label: 'Device', doc: { summary: 'The device reference the application sent (a console test reads console:<member>).' } },
  }),
  expires_at: dateTime({ system: true, texts: { label: 'Expires', doc: { summary: 'A session not completed by then expires (five minutes after it opened).' } } }),
  closed_at: dateTime({ system: true, texts: { label: 'Closed', doc: { summary: 'When the session ended: decided, reviewed or expired. Empty while open.' } } }),
  created_ip: f.text({ system: true, nullable: true, in: ['show'], texts: { label: 'IP address', doc: { summary: 'The address the application called from.' } } }),
  user_agent: f.text({ system: true, nullable: true, in: ['show'], texts: { label: 'User agent', doc: { summary: 'The client software the application reported.' } } }),
};

/** The columns of a session list (the log and the application's Sessions tab). */
export const AUTHENTICATION_SESSION_COLUMNS = ['created_at', 'application_id', 'mode', 'status', 'step_count', 'closed_at'] as const;
