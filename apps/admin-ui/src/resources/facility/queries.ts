import { gql } from '@/shared/api/hasura/@gql';
import { FragmentData } from '@/shared/lib/gql';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fragment = gql(`
  fragment itap_facility on itap_facilities {
    id
    created_at
    updated_at
    name
    description
    address
    timezone
    status
  }
`);

export type FacilityFragment = FragmentData<typeof fragment>;

export const FacilityListQuery = gql(`
  query FacilityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_facilities_bool_exp = {}, $order_by: [itap_facilities_order_by!] = {}) {
    itap_facilities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      ...itap_facility
    }
    itap_facilities_aggregate(order_by: $order_by, where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const FacilityOneQuery = gql(`
  query FacilityOneQuery($id: uuid!) {
    itap_facilities_by_pk(id: $id) {
      ...itap_facility
    }
  }
`);

export const FacilityWithAreasQuery = gql(`
  query FacilityWithAreasQuery($id: uuid!) {
    itap_facilities_by_pk(id: $id) {
      ...itap_facility
      areas(order_by: { name: asc }) {
        id
        name
        area_type
        access_level
        parent_id
        status
        capacity
      }
    }
  }
`);

export const FacilityInsertOneMutation = gql(`
  mutation FacilityInsertOneMutation($object: itap_facilities_insert_input!) {
    insert_itap_facilities_one(object: $object) {
      ...itap_facility
    }
  }
`);

export const FacilityUpdateOneMutation = gql(`
  mutation FacilityUpdateOneMutation($id: uuid!, $object: itap_facilities_set_input!) {
    update_itap_facilities_by_pk(pk_columns: {id: $id}, _set: $object) {
      ...itap_facility
    }
  }
`);

export const FacilityDeleteOneMutation = gql(`
  mutation FacilityDeleteOneMutation($id: uuid!) {
    delete_itap_facilities_by_pk(id: $id) {
      ...itap_facility
    }
  }
`);

export const AllFacilitiesQuery = gql(`
  query AllFacilitiesQuery {
    itap_facilities(order_by: { name: asc }) {
      id
      name
    }
    itap_facilities_aggregate {
      aggregate {
        count
      }
    }
  }
`);
