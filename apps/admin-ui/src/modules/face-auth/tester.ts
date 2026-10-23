import { defineBlock, defineCustomPage, defineResource, inlineFlow } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { AUTH_TESTER_RESOURCE } from '../../data/resource-names';
import { authenticateFlow } from './tester-flow';

/** Columns of `itap.organization_settings` the tester reads: the row's key only. */
export const authTesterFields = {
  organization_id: f.uuid({ system: true, texts: 'Organization', in: [] }),
};

/**
 * The "Authenticate a face" page's record (`tasks/ui/buro-gaps.md` G63): the current
 * organization's settings row, read by its organization id, whose show screen places the
 * "Authenticate" flow inline (a resource-level flow on a custom page is drawn without its label,
 * and an app flow takes no typed form fields, G77). No list, no edit; nothing is written to it.
 */
export const authTester = defineResource(AUTH_TESTER_RESOURCE, {
  texts: {
    label: 'Face authentication tester',
    labelPlural: 'Face authentication testers',
    doc: {
      summary:
        'Where an administrator tries the face authentication of a client application from the console. It stores nothing itself; each test is recorded as a session and an attempt of the application.',
    },
  },
  data: { provider: 'hasura', idField: 'organization_id' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: authTesterFields,
  actions: (r) => ({ item: [r.action.flow('authenticate', authenticateFlow)] }),
  views: {
    list: { page: false },
    show: { body: (l) => [l.place(inlineFlow, { key: 'authenticate', props: { flow: 'authenticate' } })] },
  },
});

/** The body of the "Authenticate a face" page: the tester's record screen (`./tester-view.tsx`). */
export const authTesterBlock = defineBlock('itap:auth-tester', { texts: 'Authenticate a face' });

/**
 * "Authenticate a face": the tester form in place; once it ran, the decision replaces the form
 * (`itap:auth-decision`), and Done starts a new test. Every test is in the sessions and attempts.
 */
export const authTesterPage = defineCustomPage({
  name: 'face-auth-tester',
  icon: NAV_ICONS.authTester,
  path: '/authenticate-a-face',
  texts: 'Authenticate a face',
  section: NAV_SECTIONS.faceAuth,
  order: 40,
  body: (l) => [l.place(authTesterBlock, { key: 'tester' })],
});
