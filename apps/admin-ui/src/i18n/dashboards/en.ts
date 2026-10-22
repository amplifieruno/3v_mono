import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * The dashboard editor in the `common` namespace (English, primary): its chrome
 * (`console.dashboardWidgets`, `src/fields/dashboard-widgets-input.tsx`) and the contract's refusals
 * (`validation.itap.dashboardWidgets`, `src/modules/analytics/dashboard-contract.ts`). Kept apart
 * from `../locales/<locale>.ts` for size; the registry deep-merges both into `common`.
 */
export default {
  console: {
    dashboardWidgets: {
      none: 'No widgets yet.',
      add: 'Add widget',
      newTitle: 'New widget',
      count: '{{count}} of at most {{max}} widgets.',
      untitled: 'Widget {{position}}',
      up: 'Move {{name}} earlier',
      down: 'Move {{name}} later',
      remove: 'Remove {{name}}',
      title: 'Title',
      kind: 'Kind',
      source: 'Shows',
      settings: 'Settings',
      position: 'Place on the grid (12 columns; rows of 5rem)',
      default: 'Default',
      yes: 'Yes',
      no: 'No',
      range: '{{min}}–{{max}}',
      otherParams: 'Also stored (not offered here): {{keys}}.',
      axis: {
        x: 'Column (0–11)',
        y: 'Row (0–1000)',
        w: 'Width (columns)',
        h: 'Height (rows)',
      },
      kinds: {
        kpi: 'Key figures',
        occupancy_series: 'Occupancy',
        flow_matrix: 'Movement between areas',
        heatmap: 'Busy hours',
        incidents_list: 'Incidents',
        segment_trend: 'Segment trends',
        device_health: 'Device health',
        deliveries: 'Notification deliveries',
      },
      sources: {
        kpis: 'Key figures today',
        occupancySeries: 'Occupancy over time',
        occupancyNow: 'Occupancy now, on the floor plan',
        flowMatrix: 'Moves between areas',
        heatmap: 'Busy hours by area or weekday (hourly stats)',
        heatmapSeries: 'Busy hours by weekday (occupancy series)',
        incidentsList: 'Newest incidents',
        segmentTrend: 'Member counts per day',
        deviceHealthSummary: 'Devices by health, those needing attention',
        deliveries: 'Deliveries by channel and outcome',
        deviceHealthChart: 'One device over 24 hours',
        deviceHealthDay: 'Every device over 24 hours',
      },
      params: {
        facility_id: 'Facility',
        segment_id: 'Segment',
        device_id: 'Device',
        days: 'Days',
        limit: 'How many',
        bucket: 'Points per',
        by: 'Rows',
        status: 'Status',
        min_severity: 'Lowest severity',
        period: 'Period',
        figures: 'Figures (none ticked = every one)',
        details: 'Severity bar and segment movers',
      },
      empty: {
        sidebar: 'The sidebar facility',
        every: 'Every facility',
        largest: 'The largest segments',
        none: 'None chosen',
      },
      option: {
        bucket: { hour: 'Hour', day: 'Day' },
        by: { area: 'Area', weekday: 'Day of the week' },
        status: { open: 'Not resolved or closed', all: 'Every status' },
        period: { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' },
      },
    },
  },
  validation: {
    itap: {
      dashboardWidgets: {
        notList: 'Widgets must be a list.',
        tooMany: 'A dashboard holds at most {{max}} widgets; this one has {{count}}.',
        notWidget: 'Widget {{position}}: is not a widget.',
        keys: 'Widget {{position}} “{{name}}”: needs exactly the keys id, kind, title, query, params and position.',
        id: 'Widget {{position}} “{{name}}”: give it an id of 1 to 64 characters.',
        duplicateId: 'Widget {{position}} “{{name}}”: repeats the id “{{id}}” of widget {{first}}.',
        kind: 'Widget {{position}} “{{name}}”: “{{kind}}” is not a widget kind.',
        query: 'Widget {{position}} “{{name}}”: a {{kind}} widget reads {{allowed}}, not “{{query}}”.',
        title: 'Widget {{position}}: give it a title of at most 200 characters, not only spaces.',
        params: 'Widget {{position}} “{{name}}”: its settings must be an object.',
        positionKeys: 'Widget {{position}} “{{name}}”: its position needs exactly x, y, w and h.',
        positionRange: 'Widget {{position}} “{{name}}”: {{axis}} must be a whole number from {{min}} to {{max}}.',
        positionWidth: 'Widget {{position}} “{{name}}”: x + w must be at most 12 (it is {{x}} + {{w}}).',
        settings: 'Widget {{position}} “{{name}}”: its settings are refused ({{reason}}).',
      },
    },
  },
} satisfies TranslationBundle;
