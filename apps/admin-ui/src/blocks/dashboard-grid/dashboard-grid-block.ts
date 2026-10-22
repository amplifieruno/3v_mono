import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * A dashboard's widgets on a 12-column grid (`itap:dashboard-grid`): each widget a tile with its
 * title over the analytic block it names (`../../modules/analytics/widget-blocks.ts`), placed by its
 * position (`./dashboard-layout.ts`). A tile never breaks the dashboard: a widget whose query the
 * viewer may not read says so, a widget the contract or its block refuses names the reason, and a
 * facility widget naming no facility shows the sidebar facility (or asks for one). Props `widgets`
 * (the dashboard's `widgets`; by default the form's, for the editor's preview), `facilityId` (the
 * sidebar facility) and `preview` (the editor's preview: says so above the grid).
 */
export const dashboardGridBlock = defineBlock('itap:dashboard-grid', {
  texts: {
    label: 'Dashboard',
    empty: 'This dashboard has no widgets yet.',
    notList: 'The widgets cannot be read: they are not a list.',
    preview: 'Preview: the widgets as they will show, read live. Save to keep them.',
    previewEmpty: 'Add a widget to preview it here.',
    noAccess: 'You may not read {{query}}, so this widget stays empty for you.',
    invalid: 'This widget cannot be shown:',
    chooseFacility: 'Choose a facility in the sidebar: this widget names no facility and shows the one chosen there.',
    chooseDevice: 'This widget names no device: the owner can choose one in the editor.',
    failed: 'This widget failed while drawing.',
    loading: 'Reading…',
    untitled: 'Widget {{position}}',
  },
  props: {
    widgets: prop(z.unknown().optional()).default(ref('values', 'widgets')),
    facilityId: prop(z.string().nullable().optional()).default(null),
    preview: prop(z.boolean()).default(false),
  },
});
