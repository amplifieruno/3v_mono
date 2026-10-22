import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  AREA_OCCUPANCY_RESOURCE,
  DETECTION_RESOURCE,
  EVENT_RESOURCE,
  EVENT_RULE_RESOURCE,
  EVENT_RULE_SCOPE_HISTORY_RESOURCE,
  EVENT_RULE_SCOPE_RESOURCE,
  EVENT_RULE_VERSION_RESOURCE,
  IDENTITY_LOCATION_RESOURCE,
  INCIDENT_ACTIVITY_RESOURCE,
  INCIDENT_EVENT_HISTORY_RESOURCE,
  INCIDENT_EVENT_RESOURCE,
  INCIDENT_IDENTITY_HISTORY_RESOURCE,
  INCIDENT_IDENTITY_RESOURCE,
  INCIDENT_NOTE_FILE_HISTORY_RESOURCE,
  INCIDENT_NOTE_FILE_RESOURCE,
  INCIDENT_NOTE_HISTORY_RESOURCE,
  INCIDENT_NOTE_RESOURCE,
  INCIDENT_RESOURCE,
  OPERATOR_WORKSPACE_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE,
  SHIFT_HANDOVER_INCIDENT_RESOURCE,
  SHIFT_HANDOVER_RESOURCE,
  TRACKING_SESSION_RESOURCE,
  WATCH_LIST_ENTRY_RESOURCE,
  WATCH_LIST_IDENTITY_ENTRY_RESOURCE,
  WATCH_LIST_PROFILE_ENTRY_RESOURCE,
  WATCH_LIST_RESOURCE,
} from '../../data/resource-names';
import { occupancyNowBlock } from '../../blocks/occupancy-now/occupancy-now-block';
import { occupancyUpdatedBlock } from '../../blocks/occupancy-now/occupancy-updated-block';
import { occupancyRows, occupancyRowsOperation } from '../../blocks/occupancy-now/occupancy-query';
import type { ConsoleModule } from '../module';
import { areaOccupancy } from './area-occupancy';
import { areaOccupancyFields } from './area-occupancy-fields';
import { detection } from './detection';
import { detectionFields } from './detection-fields';
import { event } from './event';
import { eventFields } from './event-fields';
import { eventRule } from './event-rule';
import { eventRuleFields } from './event-rule-fields';
import {
  createEventRuleDraft,
  createEventRuleDraftOperation,
  publishEventRuleVersion,
  publishEventRuleVersionOperation,
} from './event-rule-ops';
import { eventRuleScope, eventRuleScopeFields, eventRuleScopeHistory } from './event-rule-scope';
import { eventRuleVersion } from './event-rule-version';
import { eventRuleVersionFields } from './event-rule-version-fields';
import { incident, incidentFields } from './incident';
import { incidentActivity, incidentActivityFields } from './incident-activity';
import {
  incidentEvent,
  incidentEventFields,
  incidentEventHistory,
  incidentIdentity,
  incidentIdentityFields,
  incidentIdentityHistory,
} from './incident-links';
import {
  incidentNote,
  incidentNoteFields,
  incidentNoteFile,
  incidentNoteFileFields,
  incidentNoteFileHistory,
  incidentNoteHistory,
} from './incident-notes';
import {
  INCIDENT_OPERATIONS,
  acknowledgeIncident,
  closeIncident,
  escalateIncident,
  generateIncidentReport,
  resolveIncident,
  startInvestigation,
} from './incident-ops';
import { identityLocation } from './identity-location';
import { identityLocationFields } from './identity-location-fields';
import { occupancyPage } from './occupancy-page';
import { operatorWorkspace, operatorWorkspaceFields } from './operator-workspace';
import { operatorWorkspacePage } from './operator-workspace-page';
import { WORKSPACE_OPERATIONS, operatorWorkspaceLayout, workspaceOccupancyFacts } from './operator-workspace-query';
import { shiftHandover, shiftHandoverFields } from './shift-handover';
import { shiftHandoverIncident, shiftHandoverIncidentFields, shiftHandoverIncidentHistory } from './shift-handover-incidents';
import { SHIFT_HANDOVER_OPERATIONS, acknowledgeShiftHandover, addOpenIncidentsToHandover } from './shift-handover-ops';
import { trackingSession } from './tracking-session';
import { trackingSessionFields } from './tracking-session-fields';
import { watchList, watchListFields } from './watch-list';
import { watchListEntry, watchListIdentityEntry, watchListProfileEntry } from './watch-list-entry';
import {
  watchListEntryFields,
  watchListIdentityEntryFields,
  watchListProfileEntryFields,
} from './watch-list-entry-fields';

/**
 * Monitoring: what happens in the buildings. Events (what the platform noticed, polled),
 * detections (every face a camera recognised), tracking sessions with their paths, the
 * locations they are made of (append-only logs: no count per page, keyset paging), who is where
 * now (polled), the occupancy of each area on the floor plan, event rules with their versions
 * and scopes, incidents with their lifecycle, notes, links and activity timeline, watch lists
 * with their entries (a person or a face), shift handovers with the incidents passed on, and the
 * operator workspace page laid out by the operator's own workspace.
 */
export const monitoringModule = {
  name: 'monitoring-module',
  uses: [
    event,
    incident,
    detection,
    trackingSession,
    identityLocation,
    areaOccupancy,
    occupancyRows,
    occupancyNowBlock,
    occupancyUpdatedBlock,
    occupancyPage,
    eventRule,
    eventRuleVersion,
    eventRuleScope,
    eventRuleScopeHistory,
    createEventRuleDraft,
    publishEventRuleVersion,
    incidentActivity,
    incidentNote,
    incidentNoteHistory,
    incidentNoteFile,
    incidentNoteFileHistory,
    incidentEvent,
    incidentEventHistory,
    incidentIdentity,
    incidentIdentityHistory,
    acknowledgeIncident,
    startInvestigation,
    resolveIncident,
    closeIncident,
    escalateIncident,
    generateIncidentReport,
    watchList,
    watchListEntry,
    watchListProfileEntry,
    watchListIdentityEntry,
    shiftHandover,
    shiftHandoverIncident,
    shiftHandoverIncidentHistory,
    acknowledgeShiftHandover,
    addOpenIncidentsToHandover,
    operatorWorkspace,
    operatorWorkspaceLayout,
    workspaceOccupancyFacts,
    operatorWorkspacePage,
  ],
  tables: {
    [EVENT_RESOURCE]: hasuraTable('events', {
      selectFields: selectFieldsOf(eventFields),
      orderByField: 'occurred_at',
      noAggregate: true,
    }),
    [INCIDENT_RESOURCE]: hasuraTable('incidents', { selectFields: selectFieldsOf(incidentFields) }),
    [INCIDENT_ACTIVITY_RESOURCE]: hasuraTable('incident_activities', {
      selectFields: selectFieldsOf(incidentActivityFields),
      orderByField: 'occurred_at',
      noAggregate: true,
    }),
    [INCIDENT_NOTE_RESOURCE]: hasuraTable('incident_notes', { selectFields: selectFieldsOf(incidentNoteFields) }),
    [INCIDENT_NOTE_HISTORY_RESOURCE]: hasuraTable('incident_notes', { selectFields: selectFieldsOf(incidentNoteFields) }),
    [INCIDENT_NOTE_FILE_RESOURCE]: hasuraTable('incident_note_files', { selectFields: selectFieldsOf(incidentNoteFileFields) }),
    [INCIDENT_NOTE_FILE_HISTORY_RESOURCE]: hasuraTable('incident_note_files', {
      selectFields: selectFieldsOf(incidentNoteFileFields),
    }),
    [INCIDENT_EVENT_RESOURCE]: hasuraTable('incident_events', { selectFields: selectFieldsOf(incidentEventFields) }),
    [INCIDENT_EVENT_HISTORY_RESOURCE]: hasuraTable('incident_events', { selectFields: selectFieldsOf(incidentEventFields) }),
    [INCIDENT_IDENTITY_RESOURCE]: hasuraTable('incident_identities', { selectFields: selectFieldsOf(incidentIdentityFields) }),
    [INCIDENT_IDENTITY_HISTORY_RESOURCE]: hasuraTable('incident_identities', {
      selectFields: selectFieldsOf(incidentIdentityFields),
    }),
    [EVENT_RULE_RESOURCE]: hasuraTable('event_rules', { selectFields: selectFieldsOf(eventRuleFields) }),
    [EVENT_RULE_VERSION_RESOURCE]: hasuraTable('event_rule_versions', {
      selectFields: selectFieldsOf(eventRuleVersionFields),
      orderByField: 'version',
    }),
    [EVENT_RULE_SCOPE_RESOURCE]: hasuraTable('event_rule_version_scopes', {
      selectFields: selectFieldsOf(eventRuleScopeFields),
    }),
    [EVENT_RULE_SCOPE_HISTORY_RESOURCE]: hasuraTable('event_rule_version_scopes', {
      selectFields: selectFieldsOf(eventRuleScopeFields),
    }),
    [DETECTION_RESOURCE]: hasuraTable('detections', {
      selectFields: selectFieldsOf(detectionFields),
      orderByField: 'detected_at',
      noAggregate: true,
    }),
    [TRACKING_SESSION_RESOURCE]: hasuraTable('tracking_sessions', {
      selectFields: selectFieldsOf(trackingSessionFields),
      orderByField: 'started_at',
      noAggregate: true,
    }),
    [IDENTITY_LOCATION_RESOURCE]: hasuraTable('identity_locations', {
      selectFields: selectFieldsOf(identityLocationFields),
      orderByField: 'occurred_at',
      noAggregate: true,
    }),
    [AREA_OCCUPANCY_RESOURCE]: hasuraTable('area_occupancy', {
      selectFields: selectFieldsOf(areaOccupancyFields),
      orderByField: 'last_seen_at',
    }),
    [WATCH_LIST_RESOURCE]: hasuraTable('watch_lists', { selectFields: selectFieldsOf(watchListFields) }),
    [WATCH_LIST_ENTRY_RESOURCE]: hasuraTable('watch_list_entries', { selectFields: selectFieldsOf(watchListEntryFields) }),
    [WATCH_LIST_PROFILE_ENTRY_RESOURCE]: hasuraTable('watch_list_entries', {
      selectFields: selectFieldsOf(watchListProfileEntryFields),
    }),
    [WATCH_LIST_IDENTITY_ENTRY_RESOURCE]: hasuraTable('watch_list_entries', {
      selectFields: selectFieldsOf(watchListIdentityEntryFields),
    }),
    [SHIFT_HANDOVER_RESOURCE]: hasuraTable('shift_handovers', { selectFields: selectFieldsOf(shiftHandoverFields) }),
    [SHIFT_HANDOVER_INCIDENT_RESOURCE]: hasuraTable('shift_handover_incidents', {
      selectFields: selectFieldsOf(shiftHandoverIncidentFields),
    }),
    [SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE]: hasuraTable('shift_handover_incidents', {
      selectFields: selectFieldsOf(shiftHandoverIncidentFields),
    }),
    [OPERATOR_WORKSPACE_RESOURCE]: hasuraTable('operator_workspaces', { selectFields: selectFieldsOf(operatorWorkspaceFields) }),
  },
  operations: [
    occupancyRowsOperation,
    createEventRuleDraftOperation,
    publishEventRuleVersionOperation,
    ...INCIDENT_OPERATIONS,
    ...SHIFT_HANDOVER_OPERATIONS,
    ...WORKSPACE_OPERATIONS,
  ],
} as const satisfies ConsoleModule;
