import { randomUUID } from 'node:crypto';
import { createStorageClient } from '../../../src/storage/storageClient.js';
import { createPolicyWithDraft } from './access.js';
import { decide, decideWorld, faceIdentity, sqlProfile, type DecideWorld } from './authDecide.js';
import { testEnv } from './clients.js';
import { axis } from './faces.js';
import { createDevice } from './facilities.js';
import { createIncident, updateByPk } from './operations.js';
import { insertRow, q } from './retention.js';
import { mergeInto } from './segments.js';
import { runSql, runSqlRows } from './sql.js';

/**
 * A data subject with data in every class (slice 10 task 3, Review Focus 2): profile with contacts, notes, avatar,
 * documents, consents, visits; a linked identity with templates, photos and a merged source identity; detections
 * (Stage A sessions / locations, Stage B events), events with person payloads, an incident naming them, deliveries,
 * inbox, webhooks, grants, a draft policy subject, an access decision, face-auth attempts / sessions / evidence,
 * searches (incl. a saved-search baseline), a bulk job, segment / watch-list memberships, activity stats,
 * relationships, duplicates, verification, subscriptions, an ended legal hold, a shift handover naming them.
 */

export type Subject = {
  profile: string;
  identities: string[];
  first: string;
  last: string;
  email: string;
  phone: string;
  employee: string;
  /** Every storage file holding the person's data. */
  files: string[];
};

export type ErasureWorld = DecideWorld & {
  subject: Subject;
  camera: string;
  otherProfile: string;
  otherIdentity: string;
  digest: string;
  incident: string;
};

const json = (v: unknown): string => `${q(JSON.stringify(v))}::jsonb`;

/** Uploads a real object to the organization bucket (admin storage client). */
export async function upload(org: string, kind: string, name: string, mime = 'image/png', data = Buffer.from('subject-data')): Promise<string> {
  const storage = createStorageClient(testEnv());
  return (await storage.upload({ bucketId: org, name, mimeType: mime, data, metadata: { kind } })).id;
}

export async function erasureWorld(): Promise<ErasureWorld> {
  const w = await decideWorld();
  const tag = randomUUID().replace(/-/g, '').slice(0, 10);
  const first = `Zed${tag}`;
  const last = `Quill${tag}`;
  const full = `${first} ${last}`;
  const email = `zed.${tag}@example.test`;
  const phone = `+49${parseInt(tag.slice(0, 8), 16).toString().padStart(10, '0').slice(0, 10)}`;
  const employee = `EMP${tag}`;
  const org = w.org;
  const profile = w.profile;
  const person = w.person;
  await updateByPk(w.a, 'profiles', profile, { first_name: first, last_name: last, email, phone, employee_id: employee, notes: `${full} prefers the side entrance` });

  const files: string[] = [];
  const file = async (kind: string, mime = 'image/png'): Promise<string> => {
    const id = await upload(org, kind, `${last}-${kind}.${mime === 'image/png' ? 'png' : 'txt'}`, mime);
    files.push(id);
    return id;
  };
  const avatar = await file('avatar');
  const photo = await file('identity_photo');
  const document = await file('profile_document', 'text/plain');
  const consentDoc = await file('consent', 'text/plain');
  const thumbnail = await file('detection_thumbnail');
  const evidence = await file('auth_capture');
  const searchImage = await file('search');
  const bulkInput = await file('bulk_input', 'text/plain');
  const reportFile = await file('report', 'text/plain');
  const faceQuery = await file('search');
  await runSql(`update storage.files set uploaded_by_user_id = '${w.user.id}' where id in ('${searchImage}', '${bulkInput}', '${faceQuery}')`);
  await runSql(`update itap.profiles set avatar_file_id = '${avatar}' where id = '${profile}'`);
  await insertRow('identity_photos', { organization_id: q(org), identity_id: q(person), file_id: q(photo), kind: q('enrollment') });
  await runSql(`update itap.identities set primary_photo_file_id = '${photo}' where id = '${person}'`);
  await insertRow('profile_documents', { organization_id: q(org), profile_id: q(profile), file_id: q(document), kind: q('id_card'), title: q(`ID card ${full}`) });
  await insertRow('consent_records', {
    organization_id: q(org), profile_id: q(profile), purpose: q('tracking'), status: q('granted'), method: q('paper'),
    document_file_id: q(consentDoc), notes: q(`Signed by ${full}`),
  });

  // Face authentication: a matched attempt with evidence, a verification session claiming the person.
  const attempt = await decide(org, w.app.id, { embedding: axis(0), session: await w.session() });
  await runSql(`select set_config('itap.retention_context', 'on', true);
    update itap.authentication_attempts set evidence_file_id = '${evidence}' where id = '${attempt.attempt_id ?? ''}'`);
  await w.session({ mode: 'verification', claimed_identity_id: person });

  // A second identity of the person, merged into the linked one; other people for pair tables.
  const merged = await faceIdentity(org, [axis(1)]);
  await mergeInto(w.a, person, [merged]);
  const otherIdentity = await faceIdentity(org, [axis(2)]);
  const otherProfile = await sqlProfile(org);

  // Detections (Stage A: session + location; Stage B: events) and direct events naming the person.
  const camera = (await createDevice(w.a, w.facility.id)).id;
  await insertRow('detections', {
    organization_id: q(org), device_id: q(camera), facility_id: q(w.facility.id), area_id: q(w.area.id), identity_id: q(person),
    confidence: '0.95', similarity: '0.9', thumbnail_file_id: q(thumbnail), detected_at: `now() - interval '5 minutes'`,
  });
  const event = await insertRow('events', {
    organization_id: q(org), event_type: q('watchlist_match'), severity: q('high'), facility_id: q(w.facility.id),
    identity_id: q(person), profile_id: q(profile), title: q('Watch list match'), occurred_at: `now() - interval '4 minutes'`,
    payload: json({ matched_identity_id: person, label: full, companion_identity_id: otherIdentity }),
  });
  await insertRow('events', {
    organization_id: q(org), event_type: q('tailgating'), severity: q('high'), facility_id: q(w.facility.id), title: q('Tailgating'),
    occurred_at: `now() - interval '3 minutes'`, payload: json({ people: [person, otherIdentity], decisions: [randomUUID()] }),
  });
  const incidentEvent = await insertRow('events', {
    organization_id: q(org), event_type: q('blacklist_match'), severity: q('high'), facility_id: q(w.facility.id),
    identity_id: q(person), title: q('Blacklist match'), occurred_at: `now() - interval '2 minutes'`, payload: json({ watch_list: 'Blacklist' }),
  });

  // Incident naming the person (link, note, activity, free text).
  const incident = await createIncident(w.a, { title: 'Blacklist match: Blacklist', description: `Reported by ${email}`, facility_id: w.facility.id });
  await insertRow('incident_identities', { organization_id: q(org), incident_id: q(incident.id), identity_id: q(person), role: q('subject') });
  await insertRow('incident_events', { organization_id: q(org), incident_id: q(incident.id), event_id: q(incidentEvent) });
  await insertRow('incident_notes', { organization_id: q(org), incident_id: q(incident.id), author_id: q(w.user.id), body: q(`Spoke with ${full} at the door`) });
  await insertRow('incident_activities', {
    organization_id: q(org), incident_id: q(incident.id), actor_id: q(w.user.id), kind: q('note'), details: json({ identity_id: person }),
  });

  // Notifications: in-app delivery + inbox, a webhook delivery, a subscription about the person.
  const subscription = await insertRow('notification_subscriptions', {
    organization_id: q(org), user_id: q(w.user.id), profile_id: q(profile), channel: q('in_app'),
  });
  const delivery = await insertRow('notification_deliveries', {
    organization_id: q(org), subscription_id: q(subscription), event_id: q(event), recipient_user_id: q(w.user.id), channel: q('in_app'), status: q('delivered'),
    content: json({ title: 'Watch list match', body: `${full} seen at the entrance` }), sent_at: 'now()', delivered_at: 'now()',
  });
  // A digest of another subscription summarising a delivery about the person (redacted, not deleted).
  const digestSubscription = await insertRow('notification_subscriptions', {
    organization_id: q(org), user_id: q(w.user.id), event_type: q('watchlist_match'), channel: q('in_app'),
  });
  const digest = await insertRow('notification_deliveries', {
    organization_id: q(org), subscription_id: q(digestSubscription), recipient_user_id: q(w.user.id), channel: q('in_app'), status: q('delivered'),
    content: json({ title: 'Daily digest', items: [{ title: 'Watch list match', body: `${full} seen` }], count: 1 }),
    sent_at: 'now()', delivered_at: 'now()',
  });
  await insertRow('notification_deliveries', {
    organization_id: q(org), subscription_id: q(digestSubscription), recipient_user_id: q(w.user.id), channel: q('in_app'),
    status: q('digested'), digested_into: q(digest), content: json({ title: 'Watch list match' }),
  });
  await insertRow('user_notifications', {
    organization_id: q(org), user_id: q(w.user.id), delivery_id: q(delivery), event_id: q(event), title: q('Watch list match'), body: q(`${full} seen`),
  });
  const hook = await insertRow('webhook_subscriptions', { organization_id: q(org), url: q('https://example.test/hook'), secret: q('s3cret-value-long-enough-for-the-check-0123456789') });
  await insertRow('webhook_deliveries', {
    organization_id: q(org), subscription_id: q(hook), event_id: q(event), event_type: q('watchlist_match'), status: q('sent'),
    body: json({ event: { identity_id: person, label: full } }),
  });

  // Physical access: grant, draft policy subject, a recorded decision (+ its event).
  await insertRow('access_grants', {
    organization_id: q(org), profile_id: q(profile), access_point_id: q(w.door.id), valid_from: `now() - interval '1 hour'`,
    valid_until: `now() + interval '1 day'`, reason: q(`Visitor pass for ${full}`),
  });
  await createPolicyWithDraft(w.a, { profile_id: profile }, { access_point_id: w.door.id });
  await w.a.request(`mutation($ap: uuid!, $p: uuid!) { check_access(args: {access_point_id: $ap, profile_id: $p}) { id } }`, { ap: w.door.id, p: profile });

  // Searches: a finished one naming the person, a saved-search baseline naming them.
  const search = await insertRow('search_requests', {
    organization_id: q(org), user_id: q(w.user.id), search_type: q('facial'), image_file_id: q(searchImage), status: q('running'),
  });
  await insertRow('search_results', { organization_id: q(org), search_request_id: q(search), identity_id: q(person), profile_id: q(profile), rank: '1', match_type: q('exact') });
  const baseline = await insertRow('search_requests', {
    organization_id: q(org), user_id: q(w.user.id), search_type: q('facial'), image_file_id: q(faceQuery), status: q('running'),
  });
  await insertRow('search_results', { organization_id: q(org), search_request_id: q(baseline), identity_id: q(person), rank: '1', match_type: q('partial') });
  await runSql(`update itap.search_requests set status = 'completed', results_count = 1, completed_at = now() where id in ('${search}', '${baseline}')`);
  await insertRow('saved_searches', {
    organization_id: q(org), owner_id: q(w.user.id), name: q('Face watch'), search_type: q('facial'), image_file_id: q(faceQuery),
    last_search_request_id: q(baseline),
  });

  // Bulk import naming the person.
  const job = await insertRow('bulk_jobs', {
    organization_id: q(org), kind: q('profile_import'), owner_id: q(w.user.id), input_file_id: q(bulkInput), status: q('completed'),
    total: '1', processed: '1', succeeded: '1', completed_at: 'now()',
  });
  await insertRow('bulk_job_rows', {
    organization_id: q(org), bulk_job_id: q(job), row_no: '1', outcome: q('created'), profile_id: q(profile), label: q(full),
    private_owner_id: q(w.user.id),
  });

  // Memberships, stats, pairs, verification, visits.
  const list = await insertRow('watch_lists', { organization_id: q(org), name: q(`Watch ${tag}`), kind: q('watch') });
  await insertRow('watch_list_entries', { organization_id: q(org), watch_list_id: q(list), identity_id: q(person), reason: q(`${full} trespassing`) });
  await insertRow('identity_activity_stats', { organization_id: q(org), identity_id: q(person), visits_last_30d: '3', as_of: 'now()' });
  await insertRow('profile_activity_stats', { organization_id: q(org), profile_id: q(profile), visits_last_30d: '3', as_of: 'now()' });
  const [ia, ib] = [person, otherIdentity].sort();
  const [pa, pb] = [profile, otherProfile].sort();
  await insertRow('identity_relationships', { organization_id: q(org), identity_a_id: q(ia), identity_b_id: q(ib), relation: q('companion') });
  await insertRow('identity_duplicate_candidates', { organization_id: q(org), identity_a_id: q(ia), identity_b_id: q(ib), similarity: '0.7' });
  await insertRow('profile_duplicate_candidates', { organization_id: q(org), profile_a_id: q(pa), profile_b_id: q(pb), similarity: '0.8', reasons: json([{ email }]) });
  await insertRow('verification_requests', { organization_id: q(org), identity_id: q(person), reason: q(`Confirm ${full}`) });
  const visitor = await sqlProfile(org, { profile_type: 'visitor' });
  await insertRow('visits', {
    organization_id: q(org), visitor_profile_id: q(visitor), host_profile_id: q(profile), purpose: q(`Meeting with ${full}`),
    expected_start: 'now()', expected_end: `now() + interval '1 hour'`,
  });
  await insertRow('shift_handovers', {
    organization_id: q(org), from_user_id: q(w.user.id), to_user_id: q(w.approverUser.id), shift_started_at: `now() - interval '8 hours'`,
    summary: q(`Watch ${full} at the lobby`),
  });

  // An incident report (its timeline names the person).
  await insertRow('reports', {
    organization_id: q(org), report_type: q('incident'), incident_id: q(incident.id), title: q('Incident report'), format: q('csv'),
    status: q('completed'), file_id: q(reportFile), generated_at: 'now()',
  });

  // An ended legal hold on the person (its target goes with the erasure).
  const [hold] = await runSqlRows(
    `insert into itap.legal_holds (organization_id, name, reason, starts_at) values ('${org}', 'Old case ${tag}', 'Closed', now() - interval '2 days') returning id`,
  );
  await insertRow('legal_hold_targets', { organization_id: q(org), hold_id: q(String(hold.id)), identity_id: q(person) });
  await runSql(`update itap.legal_holds set ends_at = now() where id = '${String(hold.id)}'`);

  return {
    ...w,
    camera,
    otherProfile,
    otherIdentity,
    digest,
    incident: incident.id,
    subject: { profile, identities: [person, merged], first, last, email, phone, employee, files },
  };
}
