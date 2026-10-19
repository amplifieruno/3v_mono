import { describe, expect, it } from 'vitest';
import {
  ESCALATION_POLICY,
  ESCALATION_STEPS,
  NOTIFICATION_RULES,
  NOTIFICATION_TEMPLATES,
  escalationTimes,
  groupSpecs,
  historyEscalations,
} from './notificationPlan.js';

const MIN = 60_000;
// Mirrors the CHECK notification_templates_placeholders_valid: every "{{" opens a well-formed placeholder.
const MALFORMED = /\{\{(?!\s*[a-z_][a-z0-9_.]*\s*\}\})/;

describe('notification seed plan', () => {
  it('should define every template family in English and Russian for in_app and email', () => {
    const families = [...new Set(NOTIFICATION_TEMPLATES.map((t) => t.name))].sort();
    expect(families).toEqual(['blacklist_alert', 'device_status', 'generic', 'incident_escalation', 'restricted_area']);
    for (const name of families) {
      for (const channel of ['in_app', 'email']) {
        const locales = NOTIFICATION_TEMPLATES.filter((t) => t.name === name && t.channel === channel).map((t) => t.locale).sort();
        expect(locales, `${name}/${channel}`).toEqual(['en', 'ru']);
      }
    }
    // The on-call step sends SMS: its family has an sms variant too.
    expect(NOTIFICATION_TEMPLATES.filter((t) => t.name === 'incident_escalation' && t.channel === 'sms')).toHaveLength(2);
  });

  it('should only use well-formed placeholders and give every email a subject', () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      expect(MALFORMED.test(`${t.subject ?? ''}\n${t.body}`), `${t.name}/${t.channel}/${t.locale}`).toBe(false);
      if (t.channel === 'email') expect(t.subject?.trim(), `${t.name}/${t.locale}`).toBeTruthy();
    }
  });

  it('should reference template families and groups that exist', () => {
    const families = new Set(NOTIFICATION_TEMPLATES.map((t) => t.name));
    const groups = new Set(groupSpecs({ admin: 'a', novaAdmin: 'n', operator: 'o' }).map((g) => g.name));
    for (const rule of NOTIFICATION_RULES) {
      expect(families.has(rule.template), rule.name).toBe(true);
      expect(groups.has(rule.group), rule.name).toBe(true);
    }
    for (const step of ESCALATION_STEPS) if ('group' in step) expect(groups.has(step.group)).toBe(true);
  });

  it('should put both admins and an external address in the security team, each user on in_app and email', () => {
    const [security] = groupSpecs({ admin: 'a', novaAdmin: 'n', operator: 'o' });
    expect(security.name).toBe('Security team');
    const users = security.members.filter((m) => 'user_id' in m).map((m) => `${m.user_id}:${m.channel}`).sort();
    expect(users).toEqual(['a:email', 'a:in_app', 'n:email', 'n:in_app']);
    expect(security.members.some((m) => 'external_address' in m && m.channel === 'email')).toBe(true);
  });

  it('should plan history escalations at whole cron minutes, stopping at the acknowledgement', () => {
    const created = Date.parse('2026-10-10T10:00:30Z');
    // Step 1 at the first cron run after the incident, step 2 a minute later, the on-call step 10 minutes after that.
    expect(escalationTimes(created, null).map((t) => new Date(t).toISOString())).toEqual([
      '2026-10-10T10:01:00.000Z',
      '2026-10-10T10:02:00.000Z',
      '2026-10-10T10:12:00.000Z',
    ]);
    expect(escalationTimes(created, created + 8 * MIN)).toHaveLength(2);
    expect(escalationTimes(created, created + 20 * MIN)).toHaveLength(3);
    // An incident exactly on a minute escalates at the next one.
    expect(escalationTimes(Date.parse('2026-10-10T10:00:00Z'), null)[0]).toBe(Date.parse('2026-10-10T10:01:00Z'));
  });

  it('should escalate history incidents before their acknowledgement, the demo up to now, and never an open non-demo one', () => {
    const created = Date.parse('2026-10-10T10:00:30Z');
    const now = Date.parse('2026-10-19T12:00:00Z');
    const latest = now - 5 * MIN;
    expect(historyEscalations({ createdAt: created, acknowledgedAt: created + 8 * MIN, demo: false, latest, now })).toHaveLength(2);
    // The demo: the first pass, then cycle 1 steps 1-2 at 7 and 6 minutes before now (the on-call step is due 4 min later).
    const demo = historyEscalations({ createdAt: created, acknowledgedAt: null, demo: true, latest, now });
    expect(demo.slice(3)).toEqual([now - 7 * MIN, now - 6 * MIN]);
    expect(demo).toHaveLength(5);
    // Open without a following acknowledgement and not the demo: no escalation, so no policy is attached.
    expect(historyEscalations({ createdAt: created, acknowledgedAt: null, demo: false, latest, now })).toEqual([]);
    // Nothing after `latest` (the replay end) for history.
    expect(historyEscalations({ createdAt: latest, acknowledgedAt: latest + 30 * MIN, demo: false, latest, now })).toEqual([]);
  });

  it('should bound the repeating policy to three cycles', () => {
    expect(ESCALATION_POLICY).toMatchObject({ repeat: true, max_cycles: 3 });
  });
});

