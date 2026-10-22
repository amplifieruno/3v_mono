import type { Check } from '@burojs/core';
import { f } from '@burojs/field-types';
import { PERSON_CHANNELS, PERSON_CHANNEL_ENUM } from '../../enums/notifications';
import { enumField } from '../../enums/field';
import type { FieldProblem } from '../../fields/field-issue';
import { problemValidator } from '../../fields/field-issue';
import { checkNotBlank, validateNotBlank } from '../../fields/not-blank';

/** The placeholders the renderer fills (`itap.notification_vars`, the fan-out and the escalation). */
export const TEMPLATE_PLACEHOLDERS = [
  'event_title',
  'event_type',
  'severity',
  'facility',
  'area',
  'device',
  'identity_code',
  'profile_name',
  'incident_code',
  'occurred_at',
  'rule_name',
  'priority',
] as const;

/** The placeholders an escalation page adds (`itap.escalate_one`). */
export const ESCALATION_PLACEHOLDERS = ['incident_title', 'step', 'cycle', 'policy'] as const;

const placeholderList = (names: readonly string[]): string => names.map((name) => `{{${name}}}`).join(', ');

/** An opening `{{` that does not start a well-formed placeholder (CHECK `notification_templates_placeholders_valid`). */
const MALFORMED = /\{\{(?!\s*[a-z_][a-z0-9_.]*\s*\}\})/;

/** `null` when every `{{` opens a placeholder the database accepts (`{{name}}`, `{{ name }}`), else the problem. */
export function placeholderProblem(value: unknown): FieldProblem | null {
  if (typeof value !== 'string' || !MALFORMED.test(value)) return null;
  return {
    code: 'templatePlaceholders.malformed',
    text: 'Write each placeholder as its name in double curly braces: lowercase letters, digits, _ and . only.',
  };
}

/** A locale code the database accepts (`en`, `ru`, `pt-BR`; CHECK `notification_templates_locale_format`). */
export function localeProblem(value: unknown): FieldProblem | null {
  if (typeof value !== 'string' || value === '' || /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value)) return null;
  return { code: 'templateLocale.format', text: 'Enter a language code such as en, ru or pt-BR.' };
}

/**
 * Columns of `itap.notification_templates` the `org_admin` role reads. A person writes every
 * column of their own templates; system templates (`is_system`) are seeded and read only.
 */
export const notificationTemplateFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: {
      label: 'Name',
      doc: {
        summary:
          'The template family: a rule chooses one template, and each channel then uses the template of the same name for its channel, in the recipient’s language when there is one. One template per name, channel and language.',
      },
    },
  }),
  channel: enumField(PERSON_CHANNELS, PERSON_CHANNEL_ENUM, {
    required: true,
    default: 'in_app',
    texts: {
      label: 'Channel',
      doc: { summary: 'The channel this wording is for: in-app, email (needs a subject), SMS or push.' },
    },
  }),
  locale: f.string({
    required: true,
    default: 'en',
    validate: problemValidator(localeProblem),
    texts: {
      label: 'Language',
      doc: {
        summary:
          'The language code (en, ru, pt-BR). A recipient gets the template in their own language, else in this template’s, else in any.',
      },
    },
  }),
  subject: f.string({
    nullable: true,
    validate: problemValidator(placeholderProblem),
    texts: {
      label: 'Subject',
      doc: { summary: 'The subject of an email, the title of an in-app or push notification; required for email.' },
    },
  }),
  body: f.textarea({
    required: true,
    validate: problemValidator((value) => validateNotBlank(value) ?? placeholderProblem(value)),
    texts: {
      label: 'Body',
      description: `Placeholders: ${placeholderList(TEMPLATE_PLACEHOLDERS)}; on escalation pages also ${placeholderList(ESCALATION_PLACEHOLDERS)}.`,
      doc: {
        summary:
          'The text of the notification. {{name}} placeholders are replaced when it is sent: the event’s title, type, severity, facility, area, device, person, identity, incident, time and rule, and for escalation pages the incident title, step, cycle and policy. An unknown name is left empty.',
      },
    },
  }),
  is_system: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'System template',
      doc: { summary: 'Provided by the platform (escalation pages, the generic wording); read only. Copy its text into a template of your own to change it.' },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** An email needs a subject (CHECK `notification_templates_email_subject`). */
export const NOTIFICATION_TEMPLATE_CHECKS: Check[] = [
  {
    id: 'emailSubject',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'subject',
    texts: 'An email template needs a subject.',
    when: ({ values }) =>
      values.channel === 'email' && (typeof values.subject !== 'string' || values.subject.trim() === ''),
  },
];
