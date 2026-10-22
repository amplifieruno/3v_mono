import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * Two profiles of a duplicate pair side by side (`itap:profile-compare`): the identifying fields
 * with the differing ones marked, what each holds (identities, documents, consents) and whether
 * either is restricted or erased. In the "Merge profiles" form and review it marks the kept
 * profile and says what moves; on the pair's page it only compares.
 */
export const profileCompareBlock = defineBlock('itap:profile-compare', {
  texts: {
    label: 'Comparison',
    first: 'First profile',
    second: 'Second profile',
    loading: 'Reading both profiles…',
    missing: 'One of the profiles can no longer be read.',
    differs: 'Differs',
    kept: 'Kept',
    mergedAway: 'Merged into the kept profile',
    moves:
      '{{source}} moves {{identities}} identities, {{documents}} documents and {{consents}} consents to {{target}}, its watch-list entries fold into {{target}}’s, its open duplicate pairs close and it becomes inactive. This cannot be undone.',
    restricted: 'Processing of {{code}} is restricted: lift the restriction before merging.',
    erased: '{{code}} was erased: an erased profile cannot be merged.',
    field: 'Field',
    field_name: 'Name',
    field_profile_type: 'Type',
    field_status: 'Status',
    field_email: 'Email',
    field_phone: 'Phone',
    field_company: 'Company',
    field_employee_id: 'Employee ID',
    field_department: 'Department',
    field_job_title: 'Job title',
    field_start_date: 'Start date',
    field_end_date: 'End date',
    field_identities: 'Identities',
    field_documents: 'Documents',
    field_consents: 'Consents',
    field_created_at: 'Created',
  },
  props: {
    // Set by the placement (the pair's two profiles): a flow form has no record to default to.
    first: prop(z.string().nullable().optional()).default(null),
    second: prop(z.string().nullable().optional()).default(null),
    // Set by the merge form (the chosen side); `null` on the pair's page.
    keep: prop(z.string().nullable().optional()).default(ref('values', 'keep')),
  },
});
