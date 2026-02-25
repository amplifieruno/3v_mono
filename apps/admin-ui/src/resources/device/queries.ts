import { gql } from '@/shared/api/hasura/@gql';
import { FragmentData } from '@/shared/lib/gql';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fragment = gql(`
  fragment itap_device on itap_devices {
    id
    created_at
    updated_at
    name
    device_type
    area_id
    stream_url
    resolution
    fps
    status
    health_status
    last_seen
    configuration
    recognition_enabled
    recognition_fps
    area {
      id
      name
      facility {
        id
        name
      }
    }
  }
`);

export type DeviceFragment = FragmentData<typeof fragment>;

export const DeviceListQuery = gql(`
  query DeviceListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_devices_bool_exp = {}, $order_by: [itap_devices_order_by!] = {}) {
    itap_devices(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      ...itap_device
    }
    itap_devices_aggregate(order_by: $order_by, where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const DeviceOneQuery = gql(`
  query DeviceOneQuery($id: uuid!) {
    itap_devices_by_pk(id: $id) {
      ...itap_device
      credentials
      health_metrics(limit: 20, order_by: { timestamp: desc }) {
        id
        timestamp
        cpu_usage
        memory_usage
        disk_usage
        network_latency
        frame_rate
        error_count
      }
    }
  }
`);

export const DeviceInsertOneMutation = gql(`
  mutation DeviceInsertOneMutation($object: itap_devices_insert_input!) {
    insert_itap_devices_one(object: $object) {
      ...itap_device
    }
  }
`);

export const DeviceUpdateOneMutation = gql(`
  mutation DeviceUpdateOneMutation($id: uuid!, $object: itap_devices_set_input!) {
    update_itap_devices_by_pk(pk_columns: {id: $id}, _set: $object) {
      ...itap_device
    }
  }
`);

export const DeviceDeleteOneMutation = gql(`
  mutation DeviceDeleteOneMutation($id: uuid!) {
    delete_itap_devices_by_pk(id: $id) {
      ...itap_device
    }
  }
`);

export const DeviceDetectionsQuery = gql(`
  query DeviceDetectionsQuery($device_id: uuid!, $limit: Int = 50) {
    itap_detections(
      where: { device_id: { _eq: $device_id } }
      order_by: { created_at: desc }
      limit: $limit
    ) {
      id
      created_at
      confidence
      similarity
      is_new_identity
      bbox
      thumbnail
      identity {
        id
        status
        attributes
        images
        profile_id
        profile {
          id
          first_name
          last_name
        }
      }
    }
    itap_detections_aggregate(where: { device_id: { _eq: $device_id } }) {
      aggregate {
        count
      }
    }
  }
`);

export const AreasWithFacilityQuery = gql(`
  query AreasWithFacilityQuery {
    itap_areas(order_by: { name: asc }) {
      id
      name
      facility {
        id
        name
      }
    }
    itap_areas_aggregate {
      aggregate {
        count
      }
    }
  }
`);
