import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { OPERATOR_WORKSPACE_RESOURCE } from '../../data/resource-names';
import { checkNotBlank } from '../../fields/not-blank';
import { workspacePanelsField } from '../../fields/workspace-panels';

/** Columns of `itap.operator_workspaces` the `org_admin` role reads: the signed-in member's rows only. */
export const operatorWorkspaceFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'Your name for the arrangement (Day shift, Lobby desk); unique among your workspaces.' } },
  }),
  is_default: f.boolean({
    default: true,
    texts: {
      label: 'Default',
      doc: {
        summary:
          'The workspace the Operator workspace page shows. Making one the default takes it from your previous default.',
      },
    },
  }),
  layout: workspacePanelsField({
    texts: {
      label: 'Panels',
      doc: {
        summary:
          'Which panels the page shows, top to bottom: live cameras, open incidents, latest critical events and occupancy. Untick a panel to hide it.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['list', 'show'] }),
};

/**
 * Operator workspaces (`itap.operator_workspaces`): how one member lays out the Operator workspace
 * page. Personal: the database shows and changes only the signed-in member's own rows, so every
 * operator arranges the page for themselves. Reached from the page's "My workspaces" list.
 */
export const operatorWorkspace = defineResource(OPERATOR_WORKSPACE_RESOURCE, {
  texts: {
    label: 'Workspace',
    labelPlural: 'My workspaces',
    doc: {
      summary:
        'Your own arrangement of the Operator workspace page: which panels it shows and in which order. Nobody else sees or changes it.',
    },
  },
  basePath: '/operator-workspaces',
  displayField: 'name',
  data: { provider: 'hasura' },
  prefill: { fromQuery: ['name'] },
  fields: operatorWorkspaceFields,
  views: {
    list: { columns: ['name', 'is_default', 'layout', 'updated_at'], defaultSort: [{ field: 'name', direction: 'asc' }] },
    show: { body: (l) => [l.grid(['name', 'is_default']), 'layout', l.grid(['created_at', 'updated_at'])] },
    create: { body: (l) => [l.grid(['name', 'is_default']), 'layout'] },
    edit: { body: (l) => [l.grid(['name', 'is_default']), 'layout'] },
  },
});
