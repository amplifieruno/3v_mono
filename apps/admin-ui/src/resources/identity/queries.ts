import { gql } from '@/shared/api/hasura/@gql';
import { FragmentData } from '@/shared/lib/gql';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fragment = gql(`
  fragment itap_identity on itap_identities {
    attributes
    created_at
    embedding
    id
    images
    status
    profile_id
    updated_at
    profile {
      id
      first_name
      last_name
      email
    }
  }
`);

export type IdentityFragment = FragmentData<typeof fragment>;

export const IdentityListQuery = gql(`
  query IdentityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_identities_bool_exp = {}, $order_by: [itap_identities_order_by!] = {}) {
    itap_identities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      ...itap_identity
    }
    itap_identities_aggregate(order_by: $order_by, where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const IdentityOneQuery = gql(`
  query IdentityOneQuery($id: uuid!) {
    itap_identities_by_pk(id: $id) {
      ...itap_identity
    }
  }
`);

export const IdentityShowQuery = gql(`
  query IdentityShowQuery($id: uuid!) {
    itap_identities_by_pk(id: $id) {
      ...itap_identity
      detections(limit: 50, order_by: { created_at: desc }) {
        id
        created_at
        confidence
        similarity
        thumbnail
        device {
          id
          name
        }
      }
    }
  }
`);

export const IdentityInsertOneMutation = gql(`
  mutation IdentityInsertOneMutation($object: itap_identities_insert_input!) {
    insert_itap_identities_one(object: $object) {
      ...itap_identity
    }
  }
`);

export const IdentityUpdateOneMutation = gql(`
  mutation IdentityUpdateOneMutation($id: uuid!, $object: itap_identities_set_input!) {
    update_itap_identities_by_pk(pk_columns: {id: $id}, _set: $object) {
      ...itap_identity
    }
  }
`);

export const IdentityDeleteOneMutation = gql(`
  mutation IdentityDeleteOneMutation($id: uuid!) {
    delete_itap_identities_by_pk(id: $id) {
      ...itap_identity
    }
  }
`);

export const ProfileSearchQuery = gql(`
  query ProfileSearchQuery($where: itap_profiles_bool_exp = {}, $limit: Int = 10) {
    itap_profiles(where: $where, limit: $limit, order_by: { first_name: asc }) {
      id
      first_name
      last_name
      email
    }
  }
`);
