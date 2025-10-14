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
};
const documents: Documents = {
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

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;