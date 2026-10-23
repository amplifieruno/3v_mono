import { type Layout, type ScreenCondition, defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { CLIENT_APPLICATION_RESOURCE } from '../../data/resource-names';
import { CLIENT_APPLICATION_COLUMNS, clientApplicationFields } from './application-fields';
import { deleteFlow, reactivateFlow, revokeFlow, suspendFlow } from './application-flows';
import { APPLICATION_RULES, THRESHOLD_CHECKS } from './application-rules';
import { BINDING_FLOWS } from './binding-flows';
import { type BindingKind, bindingOf } from './binding-targets';

type Fields = typeof clientApplicationFields;

const isSandbox = (l: Layout<Fields>) => l.equals(l.ref('record', 'is_sandbox'), true);
const notSandbox = (l: Layout<Fields>) => l.not(isSandbox(l));

interface PanelOptions {
  readonly title?: string;
  readonly when?: ScreenCondition;
  readonly tone?: 'info';
  /** Distinguishes a second placement of the same kind (the sandbox panel). */
  readonly variant?: string;
}

/** One titled list of an application's bindings of a kind; rows are removed there, added by the kind's flow. */
function bindingPanel(l: Layout<Fields>, kind: BindingKind, description: string, options: PanelOptions = {}) {
  const spec = bindingOf(kind);
  const key = `${spec.basePath.slice(1)}${options.variant === undefined ? '' : `-${options.variant}`}`;
  return l.panel(
    [
      l.place(relatedList(resourceByName(spec.resource)), {
        key: `${key}-list`,
        props: {
          where: [{ field: 'application_id', op: 'eq', value: l.ref('record', 'id') }],
          columns: [spec.column, 'created_at'],
          open: 'none',
        },
      }),
    ],
    {
      key: `bound-${key}`,
      texts: { title: options.title ?? spec.labelPlural, description },
      ...(options.when === undefined ? {} : { when: options.when }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
    },
  );
}

/**
 * Client applications of the face authentication service (`itap.client_applications`): what may
 * call the API, whom it may authenticate (bound segments and facilities, narrowed by its doors and
 * work schedules), how (modes, thresholds, liveness) and what it learns (attributes). Suspend,
 * Reactivate and Revoke change its status; revoked is terminal. Keys, sessions and attempts are
 * added as tabs by the later tasks of phase 11. The integrator's view: the "Integration" article.
 */
export const clientApplication = defineResource(CLIENT_APPLICATION_RESOURCE, {
  texts: {
    label: 'Client application',
    labelPlural: 'Client applications',
    doc: {
      summary:
        'A system allowed to call the face authentication API with its own keys: whom it may authenticate, in which modes, at which threshold, and what it receives about the person.',
    },
  },
  basePath: '/client-applications',
  section: NAV_SECTIONS.faceAuth,
  order: 10,
  icon: NAV_ICONS.clientApplications,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: clientApplicationFields,
  rules: APPLICATION_RULES,
  checks: THRESHOLD_CHECKS,
  actions: (r) => ({
    item: [
      ...BINDING_FLOWS.map(([name, flow]) => r.action.flow(name, flow)),
      r.action.flow('suspend', suspendFlow),
      r.action.flow('reactivate', reactivateFlow),
      r.action.flow('revoke', revokeFlow),
      // Replaces the built-in Delete: the refusal of an application with history reads as a sentence.
      r.action.flow('delete', deleteFlow),
    ],
  }),
  views: {
    list: {
      columns: [...CLIENT_APPLICATION_COLUMNS],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['code', { field: 'name', op: 'contains' }] },
      filters: { pinned: ['status', 'platform', 'is_sandbox'], fields: ['status', 'platform', 'is_sandbox', 'liveness_required'] },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'status', op: 'eq', value: 'active' }] } },
        { id: 'suspended', texts: 'Suspended', state: { filters: [{ field: 'status', op: 'eq', value: 'suspended' }] } },
        { id: 'sandbox', texts: 'Sandbox', state: { filters: [{ field: 'is_sandbox', op: 'eq', value: true }] } },
        { id: 'revoked', texts: 'Revoked', state: { filters: [{ field: 'status', op: 'eq', value: 'revoked' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['code', 'platform', 'status', 'is_sandbox'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                'name',
                'description',
                l.panel([l.grid(['threshold_min', 'threshold', 'threshold_max'])], {
                  key: 'thresholds',
                  texts: {
                    title: 'Thresholds',
                    description:
                      'Face similarity from 0 to 1. The service raises the threshold for large populations and a request may raise it up to the maximum; nothing lowers it.',
                  },
                }),
                l.grid(['liveness_required', 'use_work_schedules']),
                l.grid(['created_by', 'created_at', 'updated_at']),
              ],
              { key: 'settings', texts: 'Settings' },
            ),
            l.panel(
              [
                // A sandbox's population is its segment of synthetic test identities, said so above the list.
                bindingPanel(
                  l,
                  'segment',
                  'A sandbox application authenticates only the synthetic test identities of its bound segment: bind the segment of test identities (with none, no one can be authenticated). It binds no facilities or access points and raises no events. Add one with “Add segment” (More menu).',
                  { title: 'Sandbox population: segments', when: isSandbox(l), tone: 'info', variant: 'sandbox' },
                ),
                bindingPanel(l, 'segment', 'Their members may be authenticated. Add one with “Add segment” (More menu).', { when: notSandbox(l) }),
                bindingPanel(l, 'facility', 'Their people may be authenticated: let in by a policy or grant, or tracked there in the last 30 days. Add one with “Add facility”.', {
                  when: notSandbox(l),
                }),
                bindingPanel(
                  l,
                  'access_point',
                  'With any, every session names one of these doors and only people allowed through it are authenticated. Add one with “Add access point”.',
                  { when: notSandbox(l) },
                ),
              ],
              { key: 'population', texts: 'Population' },
            ),
            l.panel(
              [
                bindingPanel(l, 'mode', 'The modes sessions may use; with none, every session is refused. Add one with “Allow mode”.'),
                bindingPanel(l, 'attribute', 'What the application receives about the person with a success, and nothing else. Add one with “Share attribute”.'),
              ],
              { key: 'modes-attributes', texts: 'Modes and attributes' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: {
      body: (l) => [
        l.grid(['name', 'platform']),
        'description',
        l.grid(['threshold_min', 'threshold', 'threshold_max']),
        l.grid(['liveness_required', 'use_work_schedules', 'is_sandbox']),
      ],
    },
    edit: {
      header: (l) => [l.grid(['code', 'is_sandbox'])],
      body: (l) => [
        l.grid(['name', 'platform']),
        'description',
        l.grid(['threshold_min', 'threshold', 'threshold_max']),
        l.grid(['liveness_required', 'use_work_schedules']),
      ],
    },
  },
});
