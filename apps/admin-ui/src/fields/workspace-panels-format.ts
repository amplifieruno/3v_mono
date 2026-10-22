/**
 * The operator workspace's layout (`operator_workspaces.layout`, a JSON object): which panels the
 * workspace page shows and in which order, as `{ "panels": ["cameras", "incidents", …] }`. A panel
 * left out is hidden; unknown keys of the object are kept as stored.
 */

/** Every panel of the workspace page, in the default order. */
export const WORKSPACE_PANELS = ['cameras', 'incidents', 'events', 'occupancy'] as const;

export type WorkspacePanel = (typeof WORKSPACE_PANELS)[number];

/** The panels' names, for the editor and the display. */
export const WORKSPACE_PANEL_LABELS: Readonly<Record<WorkspacePanel, string>> = {
  cameras: 'Live cameras',
  incidents: 'Open incidents',
  events: 'Latest critical events',
  occupancy: 'Occupancy',
};

const isPanel = (value: unknown): value is WorkspacePanel =>
  typeof value === 'string' && (WORKSPACE_PANELS as readonly string[]).includes(value);

/**
 * The panels shown, in order: the stored list without unknown or repeated names. A layout with no
 * `panels` list (`{}`, the column's default) shows every panel in the default order; an empty list
 * shows none.
 */
export function workspacePanels(layout: unknown): WorkspacePanel[] {
  const panels = layout !== null && typeof layout === 'object' ? (layout as { readonly panels?: unknown }).panels : undefined;
  if (!Array.isArray(panels)) return [...WORKSPACE_PANELS];
  const shown: WorkspacePanel[] = [];
  for (const panel of panels) if (isPanel(panel) && !shown.includes(panel)) shown.push(panel);
  return shown;
}

/** The layout with `panels` as the shown list; other keys kept. */
export function withPanels(layout: unknown, panels: readonly WorkspacePanel[]): Record<string, unknown> {
  const base = layout !== null && typeof layout === 'object' && !Array.isArray(layout) ? (layout as Record<string, unknown>) : {};
  return { ...base, panels: [...panels] };
}

/** Shows or hides one panel: a shown panel joins at the end. */
export function togglePanel(layout: unknown, panel: WorkspacePanel, shown: boolean): Record<string, unknown> {
  const current = workspacePanels(layout).filter((p) => p !== panel);
  return withPanels(layout, shown ? [...current, panel] : current);
}

/** Moves a shown panel one place up (`-1`) or down (`1`); anything else leaves the layout as it is. */
export function movePanel(layout: unknown, panel: WorkspacePanel, step: -1 | 1): Record<string, unknown> {
  const panels = workspacePanels(layout);
  const from = panels.indexOf(panel);
  const to = from + step;
  if (from < 0 || to < 0 || to >= panels.length) return withPanels(layout, panels);
  const next = [...panels];
  next[from] = panels[to] as WorkspacePanel;
  next[to] = panel;
  return withPanels(layout, next);
}

/** The panels hidden from the layout, in the default order. */
export function hiddenPanels(layout: unknown): WorkspacePanel[] {
  const shown = workspacePanels(layout);
  return WORKSPACE_PANELS.filter((panel) => !shown.includes(panel));
}
