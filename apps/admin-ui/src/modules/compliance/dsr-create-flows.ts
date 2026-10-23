import { type FlowConfig, type FlowUnknownCheck, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { DSR_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import type { DsrType } from '../../enums/compliance-records';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { DSR_DATE_CHECKS, requestDates } from './dsr-dates';
import { type NewDsr, createDataSubjectRequest } from './dsr-ops';

/** The fields every "new request" flow asks for. */
export const requestFields = {
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    required: true,
    open: 'none',
    // An erased person has nothing left to ask about.
    candidates: [{ field: 'erased_at', op: 'null', value: true }],
    texts: {
      label: 'Person',
      doc: { summary: 'The person the request is about, after their identity was verified.' },
    },
  }),
  received_at: dateTime({
    texts: {
      label: 'Received',
      doc: {
        summary:
          'When the request reached the organization; empty for now. The deadline counts from here.',
      },
    },
  }),
  due_at: dateTime({
    texts: {
      label: 'Due',
      doc: {
        summary:
          'Empty: 30 days after receipt. A later deadline (a complex request) may be set, at most 90 days after receipt.',
      },
    },
  }),
  notes: f.text({
    nullable: true,
    texts: {
      label: 'Notes',
      doc: { summary: 'How the request arrived and how the person’s identity was verified.' },
    },
  }),
};

export type RequestValues = Readonly<Record<string, unknown>>;

/** The request a "new request" flow files from its form. */
export function newRequestOf(
  type: DsrType,
  values: RequestValues,
  details: Record<string, unknown> = {},
): NewDsr {
  const notes =
    typeof values.notes === 'string' && values.notes.trim() !== '' ? values.notes.trim() : null;
  return {
    profile_id: String(values.profile_id),
    request_type: type,
    ...requestDates(values),
    notes,
    details,
  };
}

/**
 * What each "new request" flow last sent, by request type, for "Check again" after a lost answer
 * (a check sees no form values, G12): one flow's check never matches another flow's request.
 */
const lastSent = new Map<DsrType, { readonly request: NewDsr; readonly at: number }>();

/** Records what is sent (the submit input of every "new request" flow). */
export function sending(request: NewDsr): NewDsr {
  lastSent.set(request.request_type, { request, at: Date.now() });
  return request;
}

/** "Check again" of the flow filing `type`: applied when such a request for that person was filed since it was sent. */
export const dsrFiled =
  (type: DsrType): FlowUnknownCheck =>
  async ({ data }) => {
    const sent = lastSent.get(type);
    if (sent === undefined) return 'unknown';
    try {
      const { data: rows } = await data.list(
        resourceByName(DSR_RESOURCE) as never,
        {
          filter: {
            and: [
              { field: 'profile_id', op: 'eq', value: sent.request.profile_id },
              { field: 'request_type', op: 'eq', value: sent.request.request_type },
              { field: 'created_at', op: 'gte', value: new Date(sent.at - 60_000).toISOString() },
            ],
          },
          pagination: { kind: 'offset', page: 1, pageSize: 1 },
        } as never,
      );
      return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };

/** After filing: the request's page, which follows the background job step by step. */
export const openFiled = {
  notify: { params: { code: ref('result', 'code') } },
  open: { id: ref('result', 'id') },
};

const FILED = 'Request {{code}} is filed; its page follows it step by step.';

/** A "new request" flow of a type with no field of its own (access, portability, restriction). */
function plainRequestFlow(type: DsrType, label: string, summary: string, icon: string) {
  return {
    texts: { label, notify: FILED, doc: { summary } },
    icon,
    surfaces: { list: 'regular' },
    form: { fields: requestFields },
    checks: DSR_DATE_CHECKS,
    submit: {
      mutation: createDataSubjectRequest,
      retry: 'never',
      input: ({ values }: { readonly values: RequestValues }) =>
        sending(newRequestOf(type, values)),
      onUnknown: { check: dsrFiled(type) },
    },
    then: openFiled,
  } satisfies FlowConfig<unknown, Record<never, never>, typeof requestFields>;
}

export const newAccessRequestFlow = plainRequestFlow(
  'access',
  'Access request',
  'Files a request for a copy of the person’s data (GDPR Art. 15). The background job prepares a zip bundle within a minute; open it from the request.',
  NAV_ICONS.newAccessRequest,
);

export const newPortabilityRequestFlow = plainRequestFlow(
  'portability',
  'Portability request',
  'Files a request for the person’s data in a machine-readable bundle (GDPR Art. 20), prepared like an access bundle.',
  NAV_ICONS.newPortabilityRequest,
);

export const newRestrictionRequestFlow = plainRequestFlow(
  'restriction',
  'Restriction request',
  'Files a request to restrict processing (GDPR Art. 18): the background job restricts the person at once; lift it later on the profile.',
  NAV_ICONS.newRestrictionRequest,
);

const rectificationFields = {
  ...requestFields,
  requested_changes: f.text({
    required: true,
    validate: checkNotBlank<string>(),
    texts: {
      label: 'Requested changes',
      doc: {
        summary:
          'What the person says is wrong and what it should be, such as "Job title: Senior Facilities Coordinator". Kept with the request, never changed.',
      },
    },
  }),
};

/** "Rectification request": the requested changes are kept in `details.request`; a member corrects the data, then completes it. */
export const newRectificationRequestFlow = {
  texts: {
    label: 'Rectification request',
    notify: FILED,
    doc: {
      summary:
        'Files a request to correct wrong data (GDPR Art. 16). Edit the person’s profile as asked, then Complete the request with what was corrected.',
    },
  },
  icon: NAV_ICONS.newRectificationRequest,
  surfaces: { list: 'regular' },
  form: { fields: rectificationFields },
  checks: DSR_DATE_CHECKS,
  submit: {
    mutation: createDataSubjectRequest,
    retry: 'never',
    input: ({ values }) =>
      sending(
        newRequestOf('rectification', values, {
          request: String(values.requested_changes ?? '').trim(),
        }),
      ),
    onUnknown: { check: dsrFiled('rectification') },
  },
  then: openFiled,
} satisfies FlowConfig<unknown, Record<never, never>, typeof rectificationFields>;
