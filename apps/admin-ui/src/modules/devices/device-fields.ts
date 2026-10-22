import { ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  ACCESS_POINT_DEVICE_RESOURCE,
  ACCESS_POINT_RESOURCE,
  AREA_RESOURCE,
  DEVICE_AREA_RESOURCE,
  FACILITY_RESOURCE,
} from '../../data/resource-names';
import {
  DEVICE_HEALTH_ENUM,
  DEVICE_HEALTH_STATUSES,
  DEVICE_STATUSES,
  DEVICE_STATUS_ENUM,
  DEVICE_TYPES,
  DEVICE_TYPE_ENUM,
} from '../../enums/devices';
import { enumField } from '../../enums/field';
import { areaShape } from '../../fields/area-shape';
import { customFields } from '../../fields/custom-fields';
import { planPosition } from '../../fields/plan-position';
import { secret } from '../../fields/secret';
import { checkConfiguration, checkIpAddress } from './device-checks';
import { cameraFields, terminalFields } from './device-type-fields';

const sameFacility = [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }] as const;

/**
 * Columns of `itap.devices` the `org_admin` role reads, plus the write-only `password` and two
 * read links. Every type's columns are declared here and each record type hides the others
 * (`types` in `./device.ts`), so the mapping selects them all and lists can show them. The module's
 * `index.ts` mapping selects these (`password` and the links left out).
 */
export const deviceFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    generated: 'always',
    write: 'never',
    in: ['list', 'show'],
    texts: {
      label: 'Code',
      doc: {
        summary:
          'Reference assigned by the system when the device is created (`DEVICE-00001`), unique within the organization and never reused.',
      },
    },
  }),
  name: f.string({ required: true, texts: 'Name' }),
  device_type: enumField(DEVICE_TYPES, DEVICE_TYPE_ENUM, {
    required: true,
    // Chosen once, on create (the record type): the forms and checks of a type differ.
    write: 'create',
    texts: {
      label: 'Type',
      doc: {
        summary:
          'Camera (static, PTZ or thermal), access terminal or sensor; chosen when the device is added and fixed afterwards. Cameras stream video and can run recognition; terminals receive access policies.',
      },
    },
  }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    // `org_admin` may not update `facility_id`.
    write: 'create',
    open: 'page',
    texts: {
      label: 'Facility',
      doc: { summary: 'The site the device is installed at; fixed once it exists.' },
    },
  }),
  area_id: f.relation({
    to: AREA_RESOURCE,
    nullable: true,
    open: 'page',
    candidates: [...sameFacility],
    texts: {
      label: 'Area',
      description: 'The area it is installed in; detections are placed here.',
      doc: {
        summary:
          'The primary area of the device, in its facility: a camera’s detections place people here (or at the access point it watches). Its floor plan, or the nearest enclosing area’s, is where the position and coverage are drawn.',
      },
    },
  }),
  also_covers: f.relationMany({
    to: AREA_RESOURCE,
    through: { resource: DEVICE_AREA_RESOURCE, sourceKey: 'device_id', targetKey: 'area_id' },
    preview: 'chips',
    open: 'page',
    texts: {
      label: 'Also covers',
      doc: {
        summary:
          'Further areas the device sees besides its primary area, listed and changed on its Areas tab.',
      },
    },
  }),
  access_points: f.relationMany({
    to: ACCESS_POINT_RESOURCE,
    through: {
      resource: ACCESS_POINT_DEVICE_RESOURCE,
      sourceKey: 'device_id',
      targetKey: 'access_point_id',
    },
    preview: 'chips',
    open: 'page',
    texts: {
      label: 'Access points',
      doc: {
        summary:
          'The doors, turnstiles and gates the device is bound to; bindings are changed on its Access points tab or on the access point.',
      },
    },
  }),
  position: planPosition({
    areaField: 'area_id',
    texts: {
      label: 'Position',
      description: 'Click on the floor plan of its area.',
      doc: {
        summary:
          'Where the device is drawn, a point in the pixels of the floor plan of its area (or of the nearest enclosing area with a plan). Empty means not drawn on any plan.',
      },
    },
  }),
  coverage: areaShape({
    areaField: 'area_id',
    texts: {
      label: 'Coverage',
      description: 'Draw what it sees on the floor plan of its area.',
      doc: {
        summary:
          'The part of the floor plan the device sees (a camera’s field of view), a polygon or circle in that plan’s pixels; shown on the plan, not used to place detections.',
      },
    },
  }),
  status: enumField(DEVICE_STATUSES, DEVICE_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Whether the device is in service. The health check sets an unreachable active camera to Connection error and back to Active when it answers; set a device inactive instead of deleting it to keep its history.',
      },
    },
  }),
  health_status: enumField(DEVICE_HEALTH_STATUSES, DEVICE_HEALTH_ENUM, {
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Health',
      doc: {
        summary:
          'The result of the last health check (every minute, active cameras only): healthy, warning (reachable, no frame), offline (unreachable) or unknown (not checked).',
      },
    },
  }),
  last_seen_at: f.dateTime({
    system: true,
    in: ['list', 'show'],
    nullable: true,
    texts: {
      label: 'Last seen',
      doc: { summary: 'When the health check last reached the device; empty when it never did.' },
    },
  }),
  manufacturer: f.string({ nullable: true, texts: 'Manufacturer' }),
  model: f.string({ nullable: true, texts: 'Model' }),
  firmware_version: f.string({ nullable: true, texts: 'Firmware' }),
  ip_address: f.string({
    nullable: true,
    validate: checkIpAddress,
    texts: {
      label: 'IP address',
      doc: { summary: 'The network address of the device (IPv4 or IPv6), for maintenance.' },
    },
  }),
  username: f.string({
    nullable: true,
    texts: {
      label: 'User name',
      doc: { summary: 'The account the platform signs in to the device with (for its stream or its API).' },
    },
  }),
  password: secret({
    texts: {
      label: 'New password',
      description: 'Leave empty to keep the current password.',
      doc: {
        summary:
          'The device account’s password. It is stored but never shown or read back; typing one sets a new password, leaving the box empty keeps the current one.',
      },
    },
  }),
  ...cameraFields,
  ...terminalFields,
  configuration: f.json({
    default: {},
    validate: checkConfiguration,
    texts: {
      label: 'Configuration',
      description: 'A JSON object of device settings.',
      doc: {
        summary:
          'Free-form settings of the device as a JSON object (vendor options, transport); kept for integrations, not read by the platform’s rules.',
      },
    },
  }),
  custom_fields: customFields({
    entity: 'device',
    texts: {
      label: 'Custom attributes',
      doc: {
        summary:
          'Values of the organization’s own device attributes (Organization → Custom attributes). Required attributes must be filled whenever these values are saved; values of inactive or deleted attributes are kept.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
