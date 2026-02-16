/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query DashboardMetricsQuery {\n    identities_total: itap_identities_aggregate {\n      aggregate { count }\n    }\n    identities_verified: itap_identities_aggregate(where: { status: { _eq: \"verified\" } }) {\n      aggregate { count }\n    }\n    identities_linked: itap_identities_aggregate(where: { profile_id: { _is_null: false } }) {\n      aggregate { count }\n    }\n    profiles_total: itap_profiles_aggregate {\n      aggregate { count }\n    }\n    facilities_total: itap_facilities_aggregate {\n      aggregate { count }\n    }\n    segments_total: itap_segments_aggregate {\n      aggregate { count }\n    }\n    recent_identities: itap_identities(order_by: { created_at: desc }, limit: 10) {\n      id\n      status\n      created_at\n      images\n      profile {\n        first_name\n        last_name\n      }\n    }\n    identity_timeline: itap_identities(order_by: { created_at: asc }) {\n      created_at\n    }\n  }\n": typeof types.DashboardMetricsQueryDocument,
    "\n  fragment itap_area on itap_areas {\n    id\n    created_at\n    updated_at\n    facility_id\n    parent_id\n    name\n    description\n    area_type\n    access_level\n    capacity\n    status\n    facility {\n      id\n      name\n    }\n    parent {\n      id\n      name\n    }\n  }\n": typeof types.Itap_AreaFragmentDoc,
    "\n  query AreaListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_area\n    }\n    itap_areas_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.AreaListQueryDocument,
    "\n  query AreaOneQuery($id: uuid!) {\n    itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n": typeof types.AreaOneQueryDocument,
    "\n  mutation AreaInsertOneMutation($object: itap_areas_insert_input!) {\n    insert_itap_areas_one(object: $object) {\n      ...itap_area\n    }\n  }\n": typeof types.AreaInsertOneMutationDocument,
    "\n  mutation AreaUpdateOneMutation($id: uuid!, $object: itap_areas_set_input!) {\n    update_itap_areas_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_area\n    }\n  }\n": typeof types.AreaUpdateOneMutationDocument,
    "\n  mutation AreaDeleteOneMutation($id: uuid!) {\n    delete_itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n": typeof types.AreaDeleteOneMutationDocument,
    "\n  query AreasByFacilityQuery($where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(where: $where, order_by: $order_by) {\n      id\n      name\n      parent_id\n      area_type\n    }\n    itap_areas_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.AreasByFacilityQueryDocument,
    "\n  fragment itap_facility on itap_facilities {\n    id\n    created_at\n    updated_at\n    name\n    description\n    address\n    timezone\n    status\n  }\n": typeof types.Itap_FacilityFragmentDoc,
    "\n  query FacilityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_facilities_bool_exp = {}, $order_by: [itap_facilities_order_by!] = {}) {\n    itap_facilities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_facility\n    }\n    itap_facilities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.FacilityListQueryDocument,
    "\n  query FacilityOneQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n": typeof types.FacilityOneQueryDocument,
    "\n  query FacilityWithAreasQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n      areas(order_by: { name: asc }) {\n        id\n        name\n        area_type\n        access_level\n        parent_id\n        status\n        capacity\n      }\n    }\n  }\n": typeof types.FacilityWithAreasQueryDocument,
    "\n  mutation FacilityInsertOneMutation($object: itap_facilities_insert_input!) {\n    insert_itap_facilities_one(object: $object) {\n      ...itap_facility\n    }\n  }\n": typeof types.FacilityInsertOneMutationDocument,
    "\n  mutation FacilityUpdateOneMutation($id: uuid!, $object: itap_facilities_set_input!) {\n    update_itap_facilities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_facility\n    }\n  }\n": typeof types.FacilityUpdateOneMutationDocument,
    "\n  mutation FacilityDeleteOneMutation($id: uuid!) {\n    delete_itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n": typeof types.FacilityDeleteOneMutationDocument,
    "\n  query AllFacilitiesQuery {\n    itap_facilities(order_by: { name: asc }) {\n      id\n      name\n    }\n    itap_facilities_aggregate {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.AllFacilitiesQueryDocument,
    "\n  fragment itap_identity on itap_identities {\n    attributes\n    created_at\n    embedding\n    id\n    images\n    status\n    profile_id\n    updated_at\n    profile {\n      id\n      first_name\n      last_name\n      email\n    }\n  }\n": typeof types.Itap_IdentityFragmentDoc,
    "\n  query IdentityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_identities_bool_exp = {}, $order_by: [itap_identities_order_by!] = {}) {\n    itap_identities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_identity\n    }\n    itap_identities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.IdentityListQueryDocument,
    "\n  query IdentityOneQuery($id: uuid!) {\n    itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n": typeof types.IdentityOneQueryDocument,
    "\n  mutation IdentityInsertOneMutation($object: itap_identities_insert_input!) {\n    insert_itap_identities_one(object: $object) {\n      ...itap_identity\n    }\n  }\n": typeof types.IdentityInsertOneMutationDocument,
    "\n  mutation IdentityUpdateOneMutation($id: uuid!, $object: itap_identities_set_input!) {\n    update_itap_identities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_identity\n    }\n  }\n": typeof types.IdentityUpdateOneMutationDocument,
    "\n  mutation IdentityDeleteOneMutation($id: uuid!) {\n    delete_itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n": typeof types.IdentityDeleteOneMutationDocument,
    "\n  fragment itap_profile on itap_profiles {\n    id\n    created_at\n    updated_at\n    first_name\n    last_name\n    email\n  }\n": typeof types.Itap_ProfileFragmentDoc,
    "\n  query ProfileListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_profiles_bool_exp = {}, $order_by: [itap_profiles_order_by!] = {}) {\n    itap_profiles(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_profile\n    }\n    itap_profiles_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.ProfileListQueryDocument,
    "\n  query ProfileOneQuery($id: uuid!) {\n    itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n": typeof types.ProfileOneQueryDocument,
    "\n  mutation ProfileInsertOneMutation($object: itap_profiles_insert_input!) {\n    insert_itap_profiles_one(object: $object) {\n      ...itap_profile\n    }\n  }\n": typeof types.ProfileInsertOneMutationDocument,
    "\n  mutation ProfileUpdateOneMutation($id: uuid!, $object: itap_profiles_set_input!) {\n    update_itap_profiles_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_profile\n    }\n  }\n": typeof types.ProfileUpdateOneMutationDocument,
    "\n  mutation ProfileDeleteOneMutation($id: uuid!) {\n    delete_itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n": typeof types.ProfileDeleteOneMutationDocument,
    "\n  fragment itap_segment on itap_segments {\n    id\n    created_at\n    updated_at\n    name\n    description\n    color\n    icon\n    segment_type\n    conditions\n    status\n  }\n": typeof types.Itap_SegmentFragmentDoc,
    "\n  query SegmentListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_segments_bool_exp = {}, $order_by: [itap_segments_order_by!] = {}) {\n    itap_segments(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_segment\n      memberships_aggregate {\n        aggregate {\n          count\n        }\n      }\n    }\n    itap_segments_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.SegmentListQueryDocument,
    "\n  query SegmentOneQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n": typeof types.SegmentOneQueryDocument,
    "\n  query SegmentWithMembersQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n      memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {\n        id\n        created_at\n        identity {\n          id\n          status\n          images\n          profile {\n            first_name\n            last_name\n          }\n        }\n      }\n      memberships_aggregate(where: { is_active: { _eq: true } }) {\n        aggregate {\n          count\n        }\n      }\n    }\n  }\n": typeof types.SegmentWithMembersQueryDocument,
    "\n  mutation SegmentInsertOneMutation($object: itap_segments_insert_input!) {\n    insert_itap_segments_one(object: $object) {\n      ...itap_segment\n    }\n  }\n": typeof types.SegmentInsertOneMutationDocument,
    "\n  mutation SegmentUpdateOneMutation($id: uuid!, $object: itap_segments_set_input!) {\n    update_itap_segments_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_segment\n    }\n  }\n": typeof types.SegmentUpdateOneMutationDocument,
    "\n  mutation SegmentDeleteOneMutation($id: uuid!) {\n    delete_itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n": typeof types.SegmentDeleteOneMutationDocument,
    "\n  mutation SegmentAddMembersMutation($objects: [itap_segment_memberships_insert_input!]!) {\n    insert_itap_segment_memberships(objects: $objects, on_conflict: { constraint: segment_memberships_segment_id_identity_id_key, update_columns: [is_active] }) {\n      affected_rows\n    }\n  }\n": typeof types.SegmentAddMembersMutationDocument,
    "\n  mutation SegmentRemoveMemberMutation($id: uuid!) {\n    delete_itap_segment_memberships_by_pk(id: $id) {\n      id\n    }\n  }\n": typeof types.SegmentRemoveMemberMutationDocument,
    "\n  query SegmentPreviewCountQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": typeof types.SegmentPreviewCountQueryDocument,
    "\n  query SegmentMatchingIdentitiesQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities(where: $where) {\n      id\n    }\n  }\n": typeof types.SegmentMatchingIdentitiesQueryDocument,
};
const documents: Documents = {
    "\n  query DashboardMetricsQuery {\n    identities_total: itap_identities_aggregate {\n      aggregate { count }\n    }\n    identities_verified: itap_identities_aggregate(where: { status: { _eq: \"verified\" } }) {\n      aggregate { count }\n    }\n    identities_linked: itap_identities_aggregate(where: { profile_id: { _is_null: false } }) {\n      aggregate { count }\n    }\n    profiles_total: itap_profiles_aggregate {\n      aggregate { count }\n    }\n    facilities_total: itap_facilities_aggregate {\n      aggregate { count }\n    }\n    segments_total: itap_segments_aggregate {\n      aggregate { count }\n    }\n    recent_identities: itap_identities(order_by: { created_at: desc }, limit: 10) {\n      id\n      status\n      created_at\n      images\n      profile {\n        first_name\n        last_name\n      }\n    }\n    identity_timeline: itap_identities(order_by: { created_at: asc }) {\n      created_at\n    }\n  }\n": types.DashboardMetricsQueryDocument,
    "\n  fragment itap_area on itap_areas {\n    id\n    created_at\n    updated_at\n    facility_id\n    parent_id\n    name\n    description\n    area_type\n    access_level\n    capacity\n    status\n    facility {\n      id\n      name\n    }\n    parent {\n      id\n      name\n    }\n  }\n": types.Itap_AreaFragmentDoc,
    "\n  query AreaListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_area\n    }\n    itap_areas_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.AreaListQueryDocument,
    "\n  query AreaOneQuery($id: uuid!) {\n    itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n": types.AreaOneQueryDocument,
    "\n  mutation AreaInsertOneMutation($object: itap_areas_insert_input!) {\n    insert_itap_areas_one(object: $object) {\n      ...itap_area\n    }\n  }\n": types.AreaInsertOneMutationDocument,
    "\n  mutation AreaUpdateOneMutation($id: uuid!, $object: itap_areas_set_input!) {\n    update_itap_areas_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_area\n    }\n  }\n": types.AreaUpdateOneMutationDocument,
    "\n  mutation AreaDeleteOneMutation($id: uuid!) {\n    delete_itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n": types.AreaDeleteOneMutationDocument,
    "\n  query AreasByFacilityQuery($where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(where: $where, order_by: $order_by) {\n      id\n      name\n      parent_id\n      area_type\n    }\n    itap_areas_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.AreasByFacilityQueryDocument,
    "\n  fragment itap_facility on itap_facilities {\n    id\n    created_at\n    updated_at\n    name\n    description\n    address\n    timezone\n    status\n  }\n": types.Itap_FacilityFragmentDoc,
    "\n  query FacilityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_facilities_bool_exp = {}, $order_by: [itap_facilities_order_by!] = {}) {\n    itap_facilities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_facility\n    }\n    itap_facilities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.FacilityListQueryDocument,
    "\n  query FacilityOneQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n": types.FacilityOneQueryDocument,
    "\n  query FacilityWithAreasQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n      areas(order_by: { name: asc }) {\n        id\n        name\n        area_type\n        access_level\n        parent_id\n        status\n        capacity\n      }\n    }\n  }\n": types.FacilityWithAreasQueryDocument,
    "\n  mutation FacilityInsertOneMutation($object: itap_facilities_insert_input!) {\n    insert_itap_facilities_one(object: $object) {\n      ...itap_facility\n    }\n  }\n": types.FacilityInsertOneMutationDocument,
    "\n  mutation FacilityUpdateOneMutation($id: uuid!, $object: itap_facilities_set_input!) {\n    update_itap_facilities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_facility\n    }\n  }\n": types.FacilityUpdateOneMutationDocument,
    "\n  mutation FacilityDeleteOneMutation($id: uuid!) {\n    delete_itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n": types.FacilityDeleteOneMutationDocument,
    "\n  query AllFacilitiesQuery {\n    itap_facilities(order_by: { name: asc }) {\n      id\n      name\n    }\n    itap_facilities_aggregate {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.AllFacilitiesQueryDocument,
    "\n  fragment itap_identity on itap_identities {\n    attributes\n    created_at\n    embedding\n    id\n    images\n    status\n    profile_id\n    updated_at\n    profile {\n      id\n      first_name\n      last_name\n      email\n    }\n  }\n": types.Itap_IdentityFragmentDoc,
    "\n  query IdentityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_identities_bool_exp = {}, $order_by: [itap_identities_order_by!] = {}) {\n    itap_identities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_identity\n    }\n    itap_identities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.IdentityListQueryDocument,
    "\n  query IdentityOneQuery($id: uuid!) {\n    itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n": types.IdentityOneQueryDocument,
    "\n  mutation IdentityInsertOneMutation($object: itap_identities_insert_input!) {\n    insert_itap_identities_one(object: $object) {\n      ...itap_identity\n    }\n  }\n": types.IdentityInsertOneMutationDocument,
    "\n  mutation IdentityUpdateOneMutation($id: uuid!, $object: itap_identities_set_input!) {\n    update_itap_identities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_identity\n    }\n  }\n": types.IdentityUpdateOneMutationDocument,
    "\n  mutation IdentityDeleteOneMutation($id: uuid!) {\n    delete_itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n": types.IdentityDeleteOneMutationDocument,
    "\n  fragment itap_profile on itap_profiles {\n    id\n    created_at\n    updated_at\n    first_name\n    last_name\n    email\n  }\n": types.Itap_ProfileFragmentDoc,
    "\n  query ProfileListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_profiles_bool_exp = {}, $order_by: [itap_profiles_order_by!] = {}) {\n    itap_profiles(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_profile\n    }\n    itap_profiles_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.ProfileListQueryDocument,
    "\n  query ProfileOneQuery($id: uuid!) {\n    itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n": types.ProfileOneQueryDocument,
    "\n  mutation ProfileInsertOneMutation($object: itap_profiles_insert_input!) {\n    insert_itap_profiles_one(object: $object) {\n      ...itap_profile\n    }\n  }\n": types.ProfileInsertOneMutationDocument,
    "\n  mutation ProfileUpdateOneMutation($id: uuid!, $object: itap_profiles_set_input!) {\n    update_itap_profiles_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_profile\n    }\n  }\n": types.ProfileUpdateOneMutationDocument,
    "\n  mutation ProfileDeleteOneMutation($id: uuid!) {\n    delete_itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n": types.ProfileDeleteOneMutationDocument,
    "\n  fragment itap_segment on itap_segments {\n    id\n    created_at\n    updated_at\n    name\n    description\n    color\n    icon\n    segment_type\n    conditions\n    status\n  }\n": types.Itap_SegmentFragmentDoc,
    "\n  query SegmentListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_segments_bool_exp = {}, $order_by: [itap_segments_order_by!] = {}) {\n    itap_segments(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_segment\n      memberships_aggregate {\n        aggregate {\n          count\n        }\n      }\n    }\n    itap_segments_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.SegmentListQueryDocument,
    "\n  query SegmentOneQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n": types.SegmentOneQueryDocument,
    "\n  query SegmentWithMembersQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n      memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {\n        id\n        created_at\n        identity {\n          id\n          status\n          images\n          profile {\n            first_name\n            last_name\n          }\n        }\n      }\n      memberships_aggregate(where: { is_active: { _eq: true } }) {\n        aggregate {\n          count\n        }\n      }\n    }\n  }\n": types.SegmentWithMembersQueryDocument,
    "\n  mutation SegmentInsertOneMutation($object: itap_segments_insert_input!) {\n    insert_itap_segments_one(object: $object) {\n      ...itap_segment\n    }\n  }\n": types.SegmentInsertOneMutationDocument,
    "\n  mutation SegmentUpdateOneMutation($id: uuid!, $object: itap_segments_set_input!) {\n    update_itap_segments_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_segment\n    }\n  }\n": types.SegmentUpdateOneMutationDocument,
    "\n  mutation SegmentDeleteOneMutation($id: uuid!) {\n    delete_itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n": types.SegmentDeleteOneMutationDocument,
    "\n  mutation SegmentAddMembersMutation($objects: [itap_segment_memberships_insert_input!]!) {\n    insert_itap_segment_memberships(objects: $objects, on_conflict: { constraint: segment_memberships_segment_id_identity_id_key, update_columns: [is_active] }) {\n      affected_rows\n    }\n  }\n": types.SegmentAddMembersMutationDocument,
    "\n  mutation SegmentRemoveMemberMutation($id: uuid!) {\n    delete_itap_segment_memberships_by_pk(id: $id) {\n      id\n    }\n  }\n": types.SegmentRemoveMemberMutationDocument,
    "\n  query SegmentPreviewCountQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n": types.SegmentPreviewCountQueryDocument,
    "\n  query SegmentMatchingIdentitiesQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities(where: $where) {\n      id\n    }\n  }\n": types.SegmentMatchingIdentitiesQueryDocument,
};

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = gql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function gql(source: string): unknown;

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query DashboardMetricsQuery {\n    identities_total: itap_identities_aggregate {\n      aggregate { count }\n    }\n    identities_verified: itap_identities_aggregate(where: { status: { _eq: \"verified\" } }) {\n      aggregate { count }\n    }\n    identities_linked: itap_identities_aggregate(where: { profile_id: { _is_null: false } }) {\n      aggregate { count }\n    }\n    profiles_total: itap_profiles_aggregate {\n      aggregate { count }\n    }\n    facilities_total: itap_facilities_aggregate {\n      aggregate { count }\n    }\n    segments_total: itap_segments_aggregate {\n      aggregate { count }\n    }\n    recent_identities: itap_identities(order_by: { created_at: desc }, limit: 10) {\n      id\n      status\n      created_at\n      images\n      profile {\n        first_name\n        last_name\n      }\n    }\n    identity_timeline: itap_identities(order_by: { created_at: asc }) {\n      created_at\n    }\n  }\n"): (typeof documents)["\n  query DashboardMetricsQuery {\n    identities_total: itap_identities_aggregate {\n      aggregate { count }\n    }\n    identities_verified: itap_identities_aggregate(where: { status: { _eq: \"verified\" } }) {\n      aggregate { count }\n    }\n    identities_linked: itap_identities_aggregate(where: { profile_id: { _is_null: false } }) {\n      aggregate { count }\n    }\n    profiles_total: itap_profiles_aggregate {\n      aggregate { count }\n    }\n    facilities_total: itap_facilities_aggregate {\n      aggregate { count }\n    }\n    segments_total: itap_segments_aggregate {\n      aggregate { count }\n    }\n    recent_identities: itap_identities(order_by: { created_at: desc }, limit: 10) {\n      id\n      status\n      created_at\n      images\n      profile {\n        first_name\n        last_name\n      }\n    }\n    identity_timeline: itap_identities(order_by: { created_at: asc }) {\n      created_at\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment itap_area on itap_areas {\n    id\n    created_at\n    updated_at\n    facility_id\n    parent_id\n    name\n    description\n    area_type\n    access_level\n    capacity\n    status\n    facility {\n      id\n      name\n    }\n    parent {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  fragment itap_area on itap_areas {\n    id\n    created_at\n    updated_at\n    facility_id\n    parent_id\n    name\n    description\n    area_type\n    access_level\n    capacity\n    status\n    facility {\n      id\n      name\n    }\n    parent {\n      id\n      name\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query AreaListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_area\n    }\n    itap_areas_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query AreaListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_area\n    }\n    itap_areas_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query AreaOneQuery($id: uuid!) {\n    itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n"): (typeof documents)["\n  query AreaOneQuery($id: uuid!) {\n    itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation AreaInsertOneMutation($object: itap_areas_insert_input!) {\n    insert_itap_areas_one(object: $object) {\n      ...itap_area\n    }\n  }\n"): (typeof documents)["\n  mutation AreaInsertOneMutation($object: itap_areas_insert_input!) {\n    insert_itap_areas_one(object: $object) {\n      ...itap_area\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation AreaUpdateOneMutation($id: uuid!, $object: itap_areas_set_input!) {\n    update_itap_areas_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_area\n    }\n  }\n"): (typeof documents)["\n  mutation AreaUpdateOneMutation($id: uuid!, $object: itap_areas_set_input!) {\n    update_itap_areas_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_area\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation AreaDeleteOneMutation($id: uuid!) {\n    delete_itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n"): (typeof documents)["\n  mutation AreaDeleteOneMutation($id: uuid!) {\n    delete_itap_areas_by_pk(id: $id) {\n      ...itap_area\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query AreasByFacilityQuery($where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(where: $where, order_by: $order_by) {\n      id\n      name\n      parent_id\n      area_type\n    }\n    itap_areas_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query AreasByFacilityQuery($where: itap_areas_bool_exp = {}, $order_by: [itap_areas_order_by!] = {}) {\n    itap_areas(where: $where, order_by: $order_by) {\n      id\n      name\n      parent_id\n      area_type\n    }\n    itap_areas_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment itap_facility on itap_facilities {\n    id\n    created_at\n    updated_at\n    name\n    description\n    address\n    timezone\n    status\n  }\n"): (typeof documents)["\n  fragment itap_facility on itap_facilities {\n    id\n    created_at\n    updated_at\n    name\n    description\n    address\n    timezone\n    status\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query FacilityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_facilities_bool_exp = {}, $order_by: [itap_facilities_order_by!] = {}) {\n    itap_facilities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_facility\n    }\n    itap_facilities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query FacilityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_facilities_bool_exp = {}, $order_by: [itap_facilities_order_by!] = {}) {\n    itap_facilities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_facility\n    }\n    itap_facilities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query FacilityOneQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n"): (typeof documents)["\n  query FacilityOneQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query FacilityWithAreasQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n      areas(order_by: { name: asc }) {\n        id\n        name\n        area_type\n        access_level\n        parent_id\n        status\n        capacity\n      }\n    }\n  }\n"): (typeof documents)["\n  query FacilityWithAreasQuery($id: uuid!) {\n    itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n      areas(order_by: { name: asc }) {\n        id\n        name\n        area_type\n        access_level\n        parent_id\n        status\n        capacity\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation FacilityInsertOneMutation($object: itap_facilities_insert_input!) {\n    insert_itap_facilities_one(object: $object) {\n      ...itap_facility\n    }\n  }\n"): (typeof documents)["\n  mutation FacilityInsertOneMutation($object: itap_facilities_insert_input!) {\n    insert_itap_facilities_one(object: $object) {\n      ...itap_facility\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation FacilityUpdateOneMutation($id: uuid!, $object: itap_facilities_set_input!) {\n    update_itap_facilities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_facility\n    }\n  }\n"): (typeof documents)["\n  mutation FacilityUpdateOneMutation($id: uuid!, $object: itap_facilities_set_input!) {\n    update_itap_facilities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_facility\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation FacilityDeleteOneMutation($id: uuid!) {\n    delete_itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n"): (typeof documents)["\n  mutation FacilityDeleteOneMutation($id: uuid!) {\n    delete_itap_facilities_by_pk(id: $id) {\n      ...itap_facility\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query AllFacilitiesQuery {\n    itap_facilities(order_by: { name: asc }) {\n      id\n      name\n    }\n    itap_facilities_aggregate {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query AllFacilitiesQuery {\n    itap_facilities(order_by: { name: asc }) {\n      id\n      name\n    }\n    itap_facilities_aggregate {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment itap_identity on itap_identities {\n    attributes\n    created_at\n    embedding\n    id\n    images\n    status\n    profile_id\n    updated_at\n    profile {\n      id\n      first_name\n      last_name\n      email\n    }\n  }\n"): (typeof documents)["\n  fragment itap_identity on itap_identities {\n    attributes\n    created_at\n    embedding\n    id\n    images\n    status\n    profile_id\n    updated_at\n    profile {\n      id\n      first_name\n      last_name\n      email\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query IdentityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_identities_bool_exp = {}, $order_by: [itap_identities_order_by!] = {}) {\n    itap_identities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_identity\n    }\n    itap_identities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query IdentityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_identities_bool_exp = {}, $order_by: [itap_identities_order_by!] = {}) {\n    itap_identities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_identity\n    }\n    itap_identities_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query IdentityOneQuery($id: uuid!) {\n    itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n"): (typeof documents)["\n  query IdentityOneQuery($id: uuid!) {\n    itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation IdentityInsertOneMutation($object: itap_identities_insert_input!) {\n    insert_itap_identities_one(object: $object) {\n      ...itap_identity\n    }\n  }\n"): (typeof documents)["\n  mutation IdentityInsertOneMutation($object: itap_identities_insert_input!) {\n    insert_itap_identities_one(object: $object) {\n      ...itap_identity\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation IdentityUpdateOneMutation($id: uuid!, $object: itap_identities_set_input!) {\n    update_itap_identities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_identity\n    }\n  }\n"): (typeof documents)["\n  mutation IdentityUpdateOneMutation($id: uuid!, $object: itap_identities_set_input!) {\n    update_itap_identities_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_identity\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation IdentityDeleteOneMutation($id: uuid!) {\n    delete_itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n"): (typeof documents)["\n  mutation IdentityDeleteOneMutation($id: uuid!) {\n    delete_itap_identities_by_pk(id: $id) {\n      ...itap_identity\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment itap_profile on itap_profiles {\n    id\n    created_at\n    updated_at\n    first_name\n    last_name\n    email\n  }\n"): (typeof documents)["\n  fragment itap_profile on itap_profiles {\n    id\n    created_at\n    updated_at\n    first_name\n    last_name\n    email\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query ProfileListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_profiles_bool_exp = {}, $order_by: [itap_profiles_order_by!] = {}) {\n    itap_profiles(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_profile\n    }\n    itap_profiles_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query ProfileListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_profiles_bool_exp = {}, $order_by: [itap_profiles_order_by!] = {}) {\n    itap_profiles(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_profile\n    }\n    itap_profiles_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query ProfileOneQuery($id: uuid!) {\n    itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n"): (typeof documents)["\n  query ProfileOneQuery($id: uuid!) {\n    itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation ProfileInsertOneMutation($object: itap_profiles_insert_input!) {\n    insert_itap_profiles_one(object: $object) {\n      ...itap_profile\n    }\n  }\n"): (typeof documents)["\n  mutation ProfileInsertOneMutation($object: itap_profiles_insert_input!) {\n    insert_itap_profiles_one(object: $object) {\n      ...itap_profile\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation ProfileUpdateOneMutation($id: uuid!, $object: itap_profiles_set_input!) {\n    update_itap_profiles_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_profile\n    }\n  }\n"): (typeof documents)["\n  mutation ProfileUpdateOneMutation($id: uuid!, $object: itap_profiles_set_input!) {\n    update_itap_profiles_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_profile\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation ProfileDeleteOneMutation($id: uuid!) {\n    delete_itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n"): (typeof documents)["\n  mutation ProfileDeleteOneMutation($id: uuid!) {\n    delete_itap_profiles_by_pk(id: $id) {\n      ...itap_profile\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment itap_segment on itap_segments {\n    id\n    created_at\n    updated_at\n    name\n    description\n    color\n    icon\n    segment_type\n    conditions\n    status\n  }\n"): (typeof documents)["\n  fragment itap_segment on itap_segments {\n    id\n    created_at\n    updated_at\n    name\n    description\n    color\n    icon\n    segment_type\n    conditions\n    status\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query SegmentListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_segments_bool_exp = {}, $order_by: [itap_segments_order_by!] = {}) {\n    itap_segments(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_segment\n      memberships_aggregate {\n        aggregate {\n          count\n        }\n      }\n    }\n    itap_segments_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query SegmentListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_segments_bool_exp = {}, $order_by: [itap_segments_order_by!] = {}) {\n    itap_segments(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n      ...itap_segment\n      memberships_aggregate {\n        aggregate {\n          count\n        }\n      }\n    }\n    itap_segments_aggregate(order_by: $order_by, where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query SegmentOneQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n"): (typeof documents)["\n  query SegmentOneQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query SegmentWithMembersQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n      memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {\n        id\n        created_at\n        identity {\n          id\n          status\n          images\n          profile {\n            first_name\n            last_name\n          }\n        }\n      }\n      memberships_aggregate(where: { is_active: { _eq: true } }) {\n        aggregate {\n          count\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query SegmentWithMembersQuery($id: uuid!) {\n    itap_segments_by_pk(id: $id) {\n      ...itap_segment\n      memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {\n        id\n        created_at\n        identity {\n          id\n          status\n          images\n          profile {\n            first_name\n            last_name\n          }\n        }\n      }\n      memberships_aggregate(where: { is_active: { _eq: true } }) {\n        aggregate {\n          count\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation SegmentInsertOneMutation($object: itap_segments_insert_input!) {\n    insert_itap_segments_one(object: $object) {\n      ...itap_segment\n    }\n  }\n"): (typeof documents)["\n  mutation SegmentInsertOneMutation($object: itap_segments_insert_input!) {\n    insert_itap_segments_one(object: $object) {\n      ...itap_segment\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation SegmentUpdateOneMutation($id: uuid!, $object: itap_segments_set_input!) {\n    update_itap_segments_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_segment\n    }\n  }\n"): (typeof documents)["\n  mutation SegmentUpdateOneMutation($id: uuid!, $object: itap_segments_set_input!) {\n    update_itap_segments_by_pk(pk_columns: {id: $id}, _set: $object) {\n      ...itap_segment\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation SegmentDeleteOneMutation($id: uuid!) {\n    delete_itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n"): (typeof documents)["\n  mutation SegmentDeleteOneMutation($id: uuid!) {\n    delete_itap_segments_by_pk(id: $id) {\n      ...itap_segment\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation SegmentAddMembersMutation($objects: [itap_segment_memberships_insert_input!]!) {\n    insert_itap_segment_memberships(objects: $objects, on_conflict: { constraint: segment_memberships_segment_id_identity_id_key, update_columns: [is_active] }) {\n      affected_rows\n    }\n  }\n"): (typeof documents)["\n  mutation SegmentAddMembersMutation($objects: [itap_segment_memberships_insert_input!]!) {\n    insert_itap_segment_memberships(objects: $objects, on_conflict: { constraint: segment_memberships_segment_id_identity_id_key, update_columns: [is_active] }) {\n      affected_rows\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation SegmentRemoveMemberMutation($id: uuid!) {\n    delete_itap_segment_memberships_by_pk(id: $id) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation SegmentRemoveMemberMutation($id: uuid!) {\n    delete_itap_segment_memberships_by_pk(id: $id) {\n      id\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query SegmentPreviewCountQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query SegmentPreviewCountQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities_aggregate(where: $where) {\n      aggregate {\n        count\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query SegmentMatchingIdentitiesQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities(where: $where) {\n      id\n    }\n  }\n"): (typeof documents)["\n  query SegmentMatchingIdentitiesQuery($where: itap_identities_bool_exp = {}) {\n    itap_identities(where: $where) {\n      id\n    }\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;