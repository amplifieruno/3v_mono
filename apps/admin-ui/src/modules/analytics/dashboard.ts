import { type Layout, defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { dashboardGridBlock } from '../../blocks/dashboard-grid/dashboard-grid-block';
import { DASHBOARD_RESOURCE } from '../../data/resource-names';
import { DASHBOARD_RULES, DASHBOARD_SAVED_VIEWS, dashboardFields } from './dashboard-fields';

/**
 * Dashboards (`itap.dashboards`): a member's own arrangements of analytic widgets on a 12-column
 * grid, private or shared read-only with the organization. The record page draws the widgets for
 * the sidebar facility; the form edits each widget with a live preview below; one of your
 * dashboards can be the console's landing page.
 */
export const dashboard = defineResource(DASHBOARD_RESOURCE, {
  texts: {
    label: 'Dashboard',
    labelPlural: 'Dashboards',
    doc: {
      summary:
        'Your own page of analytic widgets (occupancy, flows, busy hours, incidents, key figures, device health…) laid out on a grid, kept private or shared read-only with the organization.',
    },
  },
  basePath: '/dashboards',
  section: NAV_SECTIONS.analytics,
  order: 2,
  icon: NAV_ICONS.dashboards,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: dashboardFields,
  rules: DASHBOARD_RULES,
  views: {
    list: {
      columns: ['name', 'description', 'is_shared', 'is_default', 'owner_id', 'updated_at'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
      filters: { fields: ['owned_by_me', 'is_shared', 'is_default', 'owner_id'] },
      savedViews: DASHBOARD_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['name', 'owner_id', 'is_shared', 'is_default'])],
      body: (l) => [
        'description',
        l.place(dashboardGridBlock, {
          key: 'dashboard',
          props: { widgets: l.ref('record', 'widgets'), facilityId: l.ref('scope', 'facility') },
        }),
        l.grid(['created_at', 'updated_at']),
      ],
    },
    // The form: name and sharing, the widgets, then the live preview of the widgets on screen.
    create: { body: (l) => [l.grid(['name', 'is_shared', 'is_default']), 'description', 'widgets', previewPanel(l)] },
    edit: { body: (l) => [l.grid(['name', 'is_shared', 'is_default']), 'description', 'widgets', previewPanel(l)] },
  },
});

/** The form's live preview: the widgets on screen, drawn as the dashboard will show them. */
function previewPanel(l: Layout<typeof dashboardFields>) {
  return l.panel([l.place(dashboardGridBlock, { key: 'preview', props: { preview: true, facilityId: l.ref('scope', 'facility') } })], {
    key: 'preview-panel',
    texts: { title: 'Preview', description: 'The widgets on screen, drawn as the dashboard will show them, for the sidebar facility.' },
  });
}
