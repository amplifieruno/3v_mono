import { gql } from '@/shared/api/hasura/@gql';
import { FragmentData } from '@/shared/lib/gql';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fragment = gql(`
  fragment itap_area on itap_areas {
    id
    created_at
    updated_at
    facility_id
    parent_id
    name
    description
    area_type
    access_level
    capacity
    status
    facility {
      id
      name
    }
    parent {
      id
      name
    }
  }
`);

export type AreaFragment = FragmentData<typeof fragment>;

export const AreaListQuery = gql(`
  query AreaListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {
    itap_areas(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      ...itap_area
    }
    itap_areas_aggregate(order_by: $order_by, where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const AreaOneQuery = gql(`
  query AreaOneQuery($id: uuid!) {
    itap_areas_by_pk(id: $id) {
      ...itap_area
    }
  }
`);

export const AreaInsertOneMutation = gql(`
  mutation AreaInsertOneMutation($object: itap_areas_insert_input!) {
    insert_itap_areas_one(object: $object) {
      ...itap_area
    }
  }
`);

export const AreaUpdateOneMutation = gql(`
  mutation AreaUpdateOneMutation($id: uuid!, $object: itap_areas_set_input!) {
    update_itap_areas_by_pk(pk_columns: {id: $id}, _set: $object) {
      ...itap_area
    }
  }
`);

export const AreaDeleteOneMutation = gql(`
  mutation AreaDeleteOneMutation($id: uuid!) {
    delete_itap_areas_by_pk(id: $id) {
      ...itap_area
    }
  }
`);

export const AreasByFacilityQuery = gql(`
  query AreasByFacilityQuery($where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {
    itap_areas(where: $where, order_by: $order_by) {
      id
      name
      parent_id
      area_type
    }
    itap_areas_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`);
