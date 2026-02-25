import { gql } from '@/shared/api/hasura/@gql';
import { FragmentData } from '@/shared/lib/gql';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fragment = gql(`
  fragment itap_profile on itap_profiles {
    id
    created_at
    updated_at
    first_name
    last_name
    email
  }
`);

export type ProfileFragment = FragmentData<typeof fragment>;

export const ProfileListQuery = gql(`
  query ProfileListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_profiles_bool_exp = {}, $order_by: [itap_profiles_order_by!] = {}) {
    itap_profiles(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      ...itap_profile
    }
    itap_profiles_aggregate(order_by: $order_by, where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const ProfileOneQuery = gql(`
  query ProfileOneQuery($id: uuid!) {
    itap_profiles_by_pk(id: $id) {
      ...itap_profile
    }
  }
`);

export const ProfileShowQuery = gql(`
  query ProfileShowQuery($id: uuid!) {
    itap_profiles_by_pk(id: $id) {
      ...itap_profile
      identities {
        id
        images
        status
        created_at
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
  }
`);

export const ProfileInsertOneMutation = gql(`
  mutation ProfileInsertOneMutation($object: itap_profiles_insert_input!) {
    insert_itap_profiles_one(object: $object) {
      ...itap_profile
    }
  }
`);

export const ProfileUpdateOneMutation = gql(`
  mutation ProfileUpdateOneMutation($id: uuid!, $object: itap_profiles_set_input!) {
    update_itap_profiles_by_pk(pk_columns: {id: $id}, _set: $object) {
      ...itap_profile
    }
  }
`);

export const ProfileDeleteOneMutation = gql(`
  mutation ProfileDeleteOneMutation($id: uuid!) {
    delete_itap_profiles_by_pk(id: $id) {
      ...itap_profile
    }
  }
`);
