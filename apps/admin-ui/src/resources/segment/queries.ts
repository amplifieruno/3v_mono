import { gql } from '@/shared/api/hasura/@gql';
import { FragmentData } from '@/shared/lib/gql';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fragment = gql(`
  fragment itap_segment on itap_segments {
    id
    created_at
    updated_at
    name
    description
    color
    icon
    segment_type
    conditions
    profile_conditions
    status
  }
`);

export type SegmentFragment = FragmentData<typeof fragment>;

export const SegmentListQuery = gql(`
  query SegmentListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_segments_bool_exp = {}, $order_by: [itap_segments_order_by!] = {}) {
    itap_segments(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      ...itap_segment
      memberships_aggregate {
        aggregate {
          count
        }
      }
      profile_memberships_aggregate {
        aggregate {
          count
        }
      }
    }
    itap_segments_aggregate(order_by: $order_by, where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const SegmentOneQuery = gql(`
  query SegmentOneQuery($id: uuid!) {
    itap_segments_by_pk(id: $id) {
      ...itap_segment
    }
  }
`);

export const SegmentWithMembersQuery = gql(`
  query SegmentWithMembersQuery($id: uuid!) {
    itap_segments_by_pk(id: $id) {
      ...itap_segment
      memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {
        id
        created_at
        identity {
          id
          status
          images
          profile {
            first_name
            last_name
          }
        }
      }
      memberships_aggregate(where: { is_active: { _eq: true } }) {
        aggregate {
          count
        }
      }
      profile_memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {
        id
        created_at
        profile {
          id
          first_name
          last_name
          email
        }
      }
      profile_memberships_aggregate(where: { is_active: { _eq: true } }) {
        aggregate {
          count
        }
      }
    }
  }
`);

export const SegmentInsertOneMutation = gql(`
  mutation SegmentInsertOneMutation($object: itap_segments_insert_input!) {
    insert_itap_segments_one(object: $object) {
      ...itap_segment
    }
  }
`);

export const SegmentUpdateOneMutation = gql(`
  mutation SegmentUpdateOneMutation($id: uuid!, $object: itap_segments_set_input!) {
    update_itap_segments_by_pk(pk_columns: {id: $id}, _set: $object) {
      ...itap_segment
    }
  }
`);

export const SegmentDeleteOneMutation = gql(`
  mutation SegmentDeleteOneMutation($id: uuid!) {
    delete_itap_segments_by_pk(id: $id) {
      ...itap_segment
    }
  }
`);

export const SegmentAddMembersMutation = gql(`
  mutation SegmentAddMembersMutation($objects: [itap_segment_memberships_insert_input!]!) {
    insert_itap_segment_memberships(objects: $objects, on_conflict: { constraint: segment_memberships_segment_id_identity_id_key, update_columns: [is_active] }) {
      affected_rows
    }
  }
`);

export const SegmentRemoveMemberMutation = gql(`
  mutation SegmentRemoveMemberMutation($id: uuid!) {
    delete_itap_segment_memberships_by_pk(id: $id) {
      id
    }
  }
`);

export const SegmentPreviewCountQuery = gql(`
  query SegmentPreviewCountQuery($where: itap_identities_bool_exp = {}) {
    itap_identities_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const SegmentMatchingIdentitiesQuery = gql(`
  query SegmentMatchingIdentitiesQuery($where: itap_identities_bool_exp = {}) {
    itap_identities(where: $where) {
      id
    }
  }
`);

export const SegmentAddProfileMembersMutation = gql(`
  mutation SegmentAddProfileMembersMutation($objects: [itap_segment_profile_memberships_insert_input!]!) {
    insert_itap_segment_profile_memberships(objects: $objects, on_conflict: { constraint: segment_profile_memberships_segment_id_profile_id_key, update_columns: [is_active] }) {
      affected_rows
    }
  }
`);

export const SegmentRemoveProfileMemberMutation = gql(`
  mutation SegmentRemoveProfileMemberMutation($id: uuid!) {
    delete_itap_segment_profile_memberships_by_pk(id: $id) {
      id
    }
  }
`);

export const SegmentProfilePreviewCountQuery = gql(`
  query SegmentProfilePreviewCountQuery($where: itap_profiles_bool_exp = {}) {
    itap_profiles_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`);

export const SegmentMatchingProfilesQuery = gql(`
  query SegmentMatchingProfilesQuery($where: itap_profiles_bool_exp = {}) {
    itap_profiles(where: $where) {
      id
    }
  }
`);

export const ProfileSearchForSegmentQuery = gql(`
  query ProfileSearchForSegmentQuery($where: itap_profiles_bool_exp = {}, $limit: Int = 10) {
    itap_profiles(where: $where, limit: $limit, order_by: { first_name: asc }) {
      id
      first_name
      last_name
      email
    }
  }
`);
