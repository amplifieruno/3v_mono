import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Kind, type OperationDefinitionNode, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { hasuraTable } from '../../src/data/mapping';
import {
  ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
  ACCESS_POLICY_TARGET_RESOURCE,
  CLIENT_APPLICATION_FACILITY_RESOURCE,
  FACILITY_RESOURCE,
  NOTIFICATION_SUBSCRIPTION_RESOURCE,
  REPORT_FACILITY_RESOURCE,
} from '../../src/data/resource-names';
import { hasuraOperation } from '../../src/data/operations';
import { CONSOLE_MODULES, HASURA_OPERATIONS, ITAP_TABLES } from '../../src/modules';
import { type ConsoleModule, collectOperations, collectTables } from '../../src/modules/module';

/**
 * The central registries are folds over the module objects
 * (`src/modules/index.ts`): every module contributes its tables and operation
 * documents once, a duplicate fails at load, and no module reaches back into
 * a registry (which would be an import cycle).
 */

const SRC = join(import.meta.dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

const query = (resource: string, operation: string) =>
  hasuraOperation(resource, operation, { kind: 'query', document: 'query Q { x }', variables: () => undefined });

describe('module registries', () => {
  it('should hold exactly the tables and operations the modules declare', () => {
    const tables = CONSOLE_MODULES.flatMap((m) => Object.keys(m.tables ?? {})).sort();
    expect(Object.keys(ITAP_TABLES).sort()).toEqual(tables);
    const operations = CONSOLE_MODULES.flatMap((m) =>
      (m.operations ?? []).map((o) => `${o.binding.resource}.${o.binding.operation}`),
    ).sort();
    const registered = Object.entries(HASURA_OPERATIONS)
      .flatMap(([resource, byName]) => Object.keys(byName).map((name) => `${resource}.${name}`))
      .sort();
    expect(registered).toEqual(operations);
    expect(operations).toEqual([
      'access.accessNames',
      'access.approveAccessPolicyVersion',
      'access.archiveAccessPolicy',
      'access.checkAccess',
      'access.createAccessPolicyDraft',
      'access.decisionTrace',
      'access.endEmergencyOverride',
      'access.latestDoorDecision',
      'access.policyAnalytics',
      'access.publishPolicyToTerminals',
      'access.rejectAccessPolicyVersion',
      'access.revokeAccessGrant',
      'access.simulateAccessPolicy',
      'access.startEmergencyOverride',
      'access.submitAccessPolicyVersion',
      'access.terminalSyncStatus',
      'access.traceNames',
      'access.versionContent',
      'analytics.deviceHealthDay',
      'analytics.deviceHealthSummary',
      'analytics.facilityZone',
      'analytics.flowMatrix',
      'analytics.heatmapHours',
      'analytics.incidentsList',
      'analytics.occupancySeries',
      'analytics.readableRootFields',
      'analytics.segmentTrend',
      'bulk-jobs.bulkJobProgress',
      'bulk-jobs.cancelBulkJob',
      'bulk-jobs.createBulkJob',
      'bulk-jobs.retryBulkJob',
      'devices.recognitionStart',
      'devices.recognitionStatus',
      'devices.recognitionStop',
      'face-auth.bindAccessPoint',
      'face-auth.bindAttribute',
      'face-auth.bindFacility',
      'face-auth.bindMode',
      'face-auth.bindSegment',
      'face-auth.deleteClientApplication',
      'face-auth.setClientApplicationStatus',
      'health-chart.deviceHealthSeries',
      'identity-timeline.identityTimeline',
      'identity-timeline.placeNames',
      'inbox.acknowledgeNotification',
      'inbox.inboxSummary',
      'inbox.markAllNotificationsRead',
      'inbox.markNotificationRead',
      'monitoring.acknowledgeIncident',
      'monitoring.acknowledgeShiftHandover',
      'monitoring.addOpenIncidentsToHandover',
      'monitoring.closeIncident',
      'monitoring.createEventRuleDraft',
      'monitoring.escalateIncident',
      'monitoring.generateIncidentReport',
      'monitoring.occupancyRows',
      'monitoring.operatorWorkspaceLayout',
      'monitoring.publishEventRuleVersion',
      'monitoring.resolveIncident',
      'monitoring.startInvestigation',
      'monitoring.workspaceOccupancyFacts',
      'notification-conditions.conditionReferences',
      'notification-delivery-report.deliveryReport',
      'notifications.testNotificationRule',
      'notifications.userNames',
      'organization_invitation.inviteMember',
      'overview.dashboardKpis',
      'overview.landingDashboard',
      'people.addIdentityPhotos',
      'people.addIdentityRelationship',
      'people.approveVerification',
      'people.cancelVisit',
      'people.checkInVisit',
      'people.checkOutVisit',
      'people.createIdentityFromPhotos',
      'people.enrollFace',
      'people.identityMergePreview',
      'people.identityRelationships',
      'people.mergeIdentities',
      'people.mergeProfiles',
      'people.mergeRollbackPreview',
      'people.profileActivity',
      'people.profilePair',
      'people.rejectVerification',
      'people.rollbackMerge',
      'people.setProcessingRestriction',
      'people.splitIdentity',
      'people.uploadProfileDocument',
      'photo-gallery.identityPhotos',
      'places.applyFacilityTemplate',
      'places.facilityOccupancyNow',
      'reports.createReport',
      'reports.reportProgress',
      'reports.retryReport',
      'saved-search.createSavedSearch',
      'saved-search.savedSearchForm',
      'saved-search.updateSavedSearch',
      'search-filters.searchFilterNames',
      'search-results.searchRun',
      'search.searchDefaults',
      'search.searchFaces',
      'segment-conditions.catalog',
      'segment-stats.segmentDailyStats',
      'segments.addSegmentMembers',
      'segments.createSegmentFromTemplate',
      'segments.deleteSegment',
      'segments.evaluateSegment',
      'segments.previewSegment',
      'segments.removeSegmentMembers',
      'split-photos.splitParts',
      'storage_files.openFile',
    ]);
  });

  it('should parse every operation document as one operation of its declared kind', () => {
    const problems: string[] = [];
    for (const [binding, byName] of Object.entries(HASURA_OPERATIONS)) {
      for (const [name, operation] of Object.entries(byName)) {
        const definitions = parse(operation.document).definitions.filter(
          (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
        );
        if (definitions.length !== 1 || definitions[0]?.operation !== operation.kind) {
          problems.push(`${binding}.${name}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('should give every module a distinct contribution id', () => {
    const names = CONSOLE_MODULES.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should refuse a table or an operation declared by two modules', () => {
    const a: ConsoleModule = { name: 'a', uses: [], tables: { area: hasuraTable('areas') }, operations: [query('x', 'q')] };
    const b: ConsoleModule = { name: 'b', uses: [], tables: { area: hasuraTable('areas') } };
    const c: ConsoleModule = { name: 'c', uses: [], operations: [query('x', 'q')] };
    expect(() => collectTables([a, b])).toThrow("Duplicate Hasura mapping 'area'.");
    expect(() => collectOperations([a, c])).toThrow("Duplicate operation x 'q'.");
    expect(collectOperations([a, { ...c, operations: [query('x', 'r')] }]).x).toHaveProperty('r');
  });

  it('should keep modules and fields from importing the registries or the definition', () => {
    const offenders = [...sourceFiles(join(SRC, 'modules')), ...sourceFiles(join(SRC, 'fields'))]
      .filter((file) => !file.endsWith(join('modules', 'index.ts')))
      .filter((file) =>
        /from '(?:(?:\.\.\/)+(?:modules|modules\/index|app\/app-definition|data\/provider)|\.\.|\.\.\/index)'/u.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('should narrow every facility-bound resource by the sidebar facility', async () => {
    // A resource with a facility_id the sidebar picker does not narrow lists every facility's rows.
    await app.ready;
    const bound = app.registry
      .list()
      .filter((resource) => resource.name !== FACILITY_RESOURCE)
      .filter((resource) => Object.hasOwn(resource.fields ?? {}, 'facility_id'));
    expect(bound.map((resource) => resource.name)).toEqual(
      expect.arrayContaining(['area', 'floor_plan', 'access_point', 'access_point_device', 'device', 'device_area']),
    );
    // Personal lists show all of the member's own rows: a facility there is a filter, not a place. A
    // report's facilities describe what it covers (its chips), so they are never narrowed either; nor
    // are an access policy version's targets: whoever approves a version must see every place it names.
    // A client application's facilities describe the application, like a report's.
    const personal = new Set([
      NOTIFICATION_SUBSCRIPTION_RESOURCE,
      REPORT_FACILITY_RESOURCE,
      ACCESS_POLICY_TARGET_RESOURCE,
      ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
      CLIENT_APPLICATION_FACILITY_RESOURCE,
    ]);
    const unscoped = bound
      .filter((resource) => !personal.has(resource.name))
      .filter((resource) => resource.data?.scope?.facility?.field !== 'facility_id')
      .map((resource) => resource.name);
    expect(unscoped).toEqual([]);
  });
});
