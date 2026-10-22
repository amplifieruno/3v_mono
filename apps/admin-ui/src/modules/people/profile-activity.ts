import { defineQuery } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { PROFILE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';

/** The registry key the people module's custom operations are bound under. */
export const PEOPLE_BINDING = 'people';

/** `numeric` columns arrive as numbers, or as strings when Hasura stringifies numerics. */
const numeric = z.union([z.number(), z.string()]).transform(Number);

/** One `profile_activity_stats` row as the query reads it (the top area by its name). */
const statsRow = z.object({
  visits_last_30d: z.number(),
  avg_dwell_minutes: numeric.nullable(),
  after_hours_visits_30d: z.number(),
  last_seen_at: z.string().nullable(),
  as_of: z.string(),
  top_area: z.object({ name: z.string() }).nullable(),
});

export const profileActivityOutput = z.object({
  visits_last_30d: z.number(),
  avg_dwell_minutes: z.number().nullable(),
  after_hours_visits_30d: z.number(),
  last_seen_at: z.string().nullable(),
  top_area: z.string().nullable(),
  as_of: z.string(),
});

export type ProfileActivity = z.infer<typeof profileActivityOutput>;

const profileActivityInput = z.object({ profileId: z.string().uuid() });

/** The stats row of one profile, flattened for the facts block; `null` when none was computed yet. */
export function profileActivityOf(data: unknown): ProfileActivity | null {
  const rows = rootOf(data, 'profile_activity_stats');
  const row = Array.isArray(rows) ? statsRow.safeParse(rows[0]) : null;
  if (row === null || !row.success) return null;
  const { top_area, ...rest } = row.data;
  return { ...rest, top_area: top_area?.name ?? null };
}

/** `profile_activity_stats` is unique per profile: one row, read by `profile_id`. */
export const profileActivityOperation = hasuraOperation(PEOPLE_BINDING, 'profileActivity', {
  kind: 'query',
  document: `query ProfileActivity($profile: uuid!) {
  profile_activity_stats(where: { profile_id: { _eq: $profile } }, limit: 1) {
    visits_last_30d
    avg_dwell_minutes
    after_hours_visits_30d
    last_seen_at
    as_of
    top_area { name }
  }
}`,
  variables: (input) => ({ profile: (input as z.infer<typeof profileActivityInput>).profileId }),
  mapResult: profileActivityOf,
});

/**
 * The person's behaviour over the last 30 days, rolled up over the identities linked to the
 * profile by the hourly `evaluate_segments` job (`run_activity_stats`). Restricted profiles
 * are skipped by the job, so their figures stop at the restriction.
 */
export const profileActivity = defineQuery('itap:profile-activity', {
  binding: profileActivityOperation.binding,
  input: schema(profileActivityInput),
  output: schema(profileActivityOutput.nullable()),
  reads: [resourceByName(PROFILE_RESOURCE)],
  fields: {
    visits_last_30d: f.number({
      texts: {
        label: 'Visits in 30 days',
        doc: {
          summary:
            'Days the person came to a facility in the last 30 days: each facility and local day with a tracking session counts once.',
        },
      },
    }),
    avg_dwell_minutes: f.number({
      nullable: true,
      texts: {
        label: 'Average stay, minutes',
        doc: { summary: 'How long the person’s tracking sessions of the last 30 days lasted on average; empty without any.' },
      },
    }),
    after_hours_visits_30d: f.number({
      texts: {
        label: 'After-hours visits',
        doc: { summary: 'After-hours events raised for the person in the last 30 days (outside the facility’s hours).' },
      },
    }),
    last_seen_at: f.dateTime({
      nullable: true,
      texts: { label: 'Last seen', doc: { summary: 'The person’s latest detection in a tracking session, however long ago.' } },
    }),
    top_area: f.string({
      nullable: true,
      texts: {
        label: 'Most visited area',
        doc: { summary: 'The area the person entered most often in the last 30 days.' },
      },
    }),
    as_of: f.dateTime({
      texts: {
        label: 'Computed at',
        doc: { summary: 'When the figures were last computed (hourly).' },
      },
    }),
  },
});

/** The facts the Activity tab shows, in order. */
export const PROFILE_ACTIVITY_ROWS = [
  'visits_last_30d',
  'avg_dwell_minutes',
  'after_hours_visits_30d',
  'last_seen_at',
  'top_area',
  'as_of',
] as const;
