import { analyticsFunctions, analyticsTables } from './analytics.js';
import { auditTables } from './audit.js';
import { companyTables } from './companies.js';
import { deviceFunctions, deviceTables } from './devices.js';
import { eventFunctions, eventTables } from './events.js';
import { facilityFunctions, facilityTables } from './facilities.js';
import { identityFunctions, identityTables } from './identities.js';
import { incidentFunctions, incidentTables } from './incidents.js';
import { maintenanceFunctions, maintenanceTables } from './maintenance.js';
import { notificationFunctions, notificationTables } from './notifications.js';
import { profileFunctions, profileTables } from './profiles.js';
import { reportFunctions, reportTables } from './reports.js';
import { segmentFunctions, segmentTables } from './segments.js';
import { tenancyFunctions, tenancyTables } from './tenancy.js';
import { lifecycleFunctions, trackingFunctions, trackingTables } from './tracking.js';
import { visitFunctions, visitTables } from './visits.js';
import { sendingFunctions, webhookTables } from './webhooks.js';
import type { FunctionSpec, TableSpec } from './types.js';

/**
 * Every table in schemas `itap` / `itap_results` must have exactly one spec here.
 * Run `pnpm --filter nhost metadata:generate` after changing this list or the DB schema.
 */
export const tables: TableSpec[] = [
  ...tenancyTables,
  ...auditTables,
  ...companyTables,
  ...profileTables,
  ...identityTables,
  ...facilityTables,
  ...deviceTables,
  ...trackingTables,
  ...eventTables,
  ...incidentTables,
  ...visitTables,
  ...maintenanceTables,
  ...notificationTables,
  ...webhookTables,
  ...segmentTables,
  ...analyticsTables,
  ...reportTables,
];

/** Every tracked SQL function (functions.yaml is generated from this list; untracked functions are internal). */
export const functions: FunctionSpec[] = [
  ...tenancyFunctions,
  ...identityFunctions,
  ...profileFunctions,
  ...facilityFunctions,
  ...deviceFunctions,
  ...trackingFunctions,
  ...eventFunctions,
  ...incidentFunctions,
  ...visitFunctions,
  ...lifecycleFunctions,
  ...maintenanceFunctions,
  ...notificationFunctions,
  ...sendingFunctions,
  ...segmentFunctions,
  ...analyticsFunctions,
  ...reportFunctions,
];
