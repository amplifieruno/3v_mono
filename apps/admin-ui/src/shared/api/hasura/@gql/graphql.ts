/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  jsonb: { input: any; output: any; }
  timestamptz: { input: any; output: any; }
  uuid: { input: any; output: any; }
  vector: { input: any; output: any; }
};

/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
export type Int_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['Int']['input']>;
  _gt?: InputMaybe<Scalars['Int']['input']>;
  _gte?: InputMaybe<Scalars['Int']['input']>;
  _in?: InputMaybe<Array<Scalars['Int']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['Int']['input']>;
  _lte?: InputMaybe<Scalars['Int']['input']>;
  _neq?: InputMaybe<Scalars['Int']['input']>;
  _nin?: InputMaybe<Array<Scalars['Int']['input']>>;
};

/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
export type String_Array_Comparison_Exp = {
  /** is the array contained in the given array value */
  _contained_in?: InputMaybe<Array<Scalars['String']['input']>>;
  /** does the array contain the given value */
  _contains?: InputMaybe<Array<Scalars['String']['input']>>;
  _eq?: InputMaybe<Array<Scalars['String']['input']>>;
  _gt?: InputMaybe<Array<Scalars['String']['input']>>;
  _gte?: InputMaybe<Array<Scalars['String']['input']>>;
  _in?: InputMaybe<Array<Array<Scalars['String']['input']>>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Array<Scalars['String']['input']>>;
  _lte?: InputMaybe<Array<Scalars['String']['input']>>;
  _neq?: InputMaybe<Array<Scalars['String']['input']>>;
  _nin?: InputMaybe<Array<Array<Scalars['String']['input']>>>;
};

/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
export type String_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['String']['input']>;
  _gt?: InputMaybe<Scalars['String']['input']>;
  _gte?: InputMaybe<Scalars['String']['input']>;
  /** does the column match the given case-insensitive pattern */
  _ilike?: InputMaybe<Scalars['String']['input']>;
  _in?: InputMaybe<Array<Scalars['String']['input']>>;
  /** does the column match the given POSIX regular expression, case insensitive */
  _iregex?: InputMaybe<Scalars['String']['input']>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  /** does the column match the given pattern */
  _like?: InputMaybe<Scalars['String']['input']>;
  _lt?: InputMaybe<Scalars['String']['input']>;
  _lte?: InputMaybe<Scalars['String']['input']>;
  _neq?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given case-insensitive pattern */
  _nilike?: InputMaybe<Scalars['String']['input']>;
  _nin?: InputMaybe<Array<Scalars['String']['input']>>;
  /** does the column NOT match the given POSIX regular expression, case insensitive */
  _niregex?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given pattern */
  _nlike?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given POSIX regular expression, case sensitive */
  _nregex?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given SQL regular expression */
  _nsimilar?: InputMaybe<Scalars['String']['input']>;
  /** does the column match the given POSIX regular expression, case sensitive */
  _regex?: InputMaybe<Scalars['String']['input']>;
  /** does the column match the given SQL regular expression */
  _similar?: InputMaybe<Scalars['String']['input']>;
};

/** ordering argument of a cursor */
export enum Cursor_Ordering {
  /** ascending ordering of the cursor */
  Asc = 'ASC',
  /** descending ordering of the cursor */
  Desc = 'DESC'
}

/** columns and relationships of "itap.identities" */
export type Itap_Identities = {
  __typename?: 'itap_identities';
  attributes: Scalars['jsonb']['output'];
  created_at: Scalars['timestamptz']['output'];
  embedding?: Maybe<Scalars['vector']['output']>;
  id: Scalars['uuid']['output'];
  images: Array<Scalars['String']['output']>;
  /** An object relationship */
  profile?: Maybe<Itap_Profiles>;
  profile_id?: Maybe<Scalars['uuid']['output']>;
  status: Scalars['String']['output'];
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "itap.identities" */
export type Itap_IdentitiesAttributesArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "itap.identities" */
export type Itap_Identities_Aggregate = {
  __typename?: 'itap_identities_aggregate';
  aggregate?: Maybe<Itap_Identities_Aggregate_Fields>;
  nodes: Array<Itap_Identities>;
};

export type Itap_Identities_Aggregate_Bool_Exp = {
  count?: InputMaybe<Itap_Identities_Aggregate_Bool_Exp_Count>;
};

export type Itap_Identities_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Identities_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "itap.identities" */
export type Itap_Identities_Aggregate_Fields = {
  __typename?: 'itap_identities_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Identities_Max_Fields>;
  min?: Maybe<Itap_Identities_Min_Fields>;
};


/** aggregate fields of "itap.identities" */
export type Itap_Identities_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "itap.identities" */
export type Itap_Identities_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Itap_Identities_Max_Order_By>;
  min?: InputMaybe<Itap_Identities_Min_Order_By>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Itap_Identities_Append_Input = {
  attributes?: InputMaybe<Scalars['jsonb']['input']>;
};

/** input type for inserting array relation for remote table "itap.identities" */
export type Itap_Identities_Arr_Rel_Insert_Input = {
  data: Array<Itap_Identities_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Identities_On_Conflict>;
};

/** Boolean expression to filter rows from the table "itap.identities". All fields are combined with a logical 'AND'. */
export type Itap_Identities_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Identities_Bool_Exp>>;
  _not?: InputMaybe<Itap_Identities_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Identities_Bool_Exp>>;
  attributes?: InputMaybe<Jsonb_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  embedding?: InputMaybe<Vector_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  images?: InputMaybe<String_Array_Comparison_Exp>;
  profile?: InputMaybe<Itap_Profiles_Bool_Exp>;
  profile_id?: InputMaybe<Uuid_Comparison_Exp>;
  status?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.identities" */
export enum Itap_Identities_Constraint {
  /** unique or primary key constraint on columns "id" */
  IdentitiesPkey = 'identities_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Itap_Identities_Delete_At_Path_Input = {
  attributes?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Itap_Identities_Delete_Elem_Input = {
  attributes?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Itap_Identities_Delete_Key_Input = {
  attributes?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "itap.identities" */
export type Itap_Identities_Insert_Input = {
  attributes?: InputMaybe<Scalars['jsonb']['input']>;
  embedding?: InputMaybe<Scalars['vector']['input']>;
  images?: InputMaybe<Array<Scalars['String']['input']>>;
  profile?: InputMaybe<Itap_Profiles_Obj_Rel_Insert_Input>;
  profile_id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Itap_Identities_Max_Fields = {
  __typename?: 'itap_identities_max_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  images?: Maybe<Array<Scalars['String']['output']>>;
  profile_id?: Maybe<Scalars['uuid']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by max() on columns of table "itap.identities" */
export type Itap_Identities_Max_Order_By = {
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  images?: InputMaybe<Order_By>;
  profile_id?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Itap_Identities_Min_Fields = {
  __typename?: 'itap_identities_min_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  images?: Maybe<Array<Scalars['String']['output']>>;
  profile_id?: Maybe<Scalars['uuid']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by min() on columns of table "itap.identities" */
export type Itap_Identities_Min_Order_By = {
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  images?: InputMaybe<Order_By>;
  profile_id?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "itap.identities" */
export type Itap_Identities_Mutation_Response = {
  __typename?: 'itap_identities_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Identities>;
};

/** on_conflict condition type for table "itap.identities" */
export type Itap_Identities_On_Conflict = {
  constraint: Itap_Identities_Constraint;
  update_columns?: Array<Itap_Identities_Update_Column>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.identities". */
export type Itap_Identities_Order_By = {
  attributes?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  embedding?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  images?: InputMaybe<Order_By>;
  profile?: InputMaybe<Itap_Profiles_Order_By>;
  profile_id?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: itap.identities */
export type Itap_Identities_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Itap_Identities_Prepend_Input = {
  attributes?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "itap.identities" */
export enum Itap_Identities_Select_Column {
  /** column name */
  Attributes = 'attributes',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Embedding = 'embedding',
  /** column name */
  Id = 'id',
  /** column name */
  Images = 'images',
  /** column name */
  ProfileId = 'profile_id',
  /** column name */
  Status = 'status',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "itap.identities" */
export type Itap_Identities_Set_Input = {
  attributes?: InputMaybe<Scalars['jsonb']['input']>;
  embedding?: InputMaybe<Scalars['vector']['input']>;
  images?: InputMaybe<Array<Scalars['String']['input']>>;
  profile_id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "itap_identities" */
export type Itap_Identities_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Identities_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Identities_Stream_Cursor_Value_Input = {
  attributes?: InputMaybe<Scalars['jsonb']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  embedding?: InputMaybe<Scalars['vector']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  images?: InputMaybe<Array<Scalars['String']['input']>>;
  profile_id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** update columns of table "itap.identities" */
export enum Itap_Identities_Update_Column {
  /** column name */
  Attributes = 'attributes',
  /** column name */
  Embedding = 'embedding',
  /** column name */
  Images = 'images',
  /** column name */
  ProfileId = 'profile_id',
  /** column name */
  Status = 'status'
}

export type Itap_Identities_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Itap_Identities_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Itap_Identities_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Itap_Identities_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Itap_Identities_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Itap_Identities_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Itap_Identities_Set_Input>;
  /** filter the rows which have to be updated */
  where: Itap_Identities_Bool_Exp;
};

/** columns and relationships of "itap.profiles" */
export type Itap_Profiles = {
  __typename?: 'itap_profiles';
  created_at: Scalars['timestamptz']['output'];
  email?: Maybe<Scalars['String']['output']>;
  first_name?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  /** An array relationship */
  identities: Array<Itap_Identities>;
  /** An aggregate relationship */
  identities_aggregate: Itap_Identities_Aggregate;
  last_name?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "itap.profiles" */
export type Itap_ProfilesIdentitiesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By>>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};


/** columns and relationships of "itap.profiles" */
export type Itap_ProfilesIdentities_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By>>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};

/** aggregated selection of "itap.profiles" */
export type Itap_Profiles_Aggregate = {
  __typename?: 'itap_profiles_aggregate';
  aggregate?: Maybe<Itap_Profiles_Aggregate_Fields>;
  nodes: Array<Itap_Profiles>;
};

/** aggregate fields of "itap.profiles" */
export type Itap_Profiles_Aggregate_Fields = {
  __typename?: 'itap_profiles_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Profiles_Max_Fields>;
  min?: Maybe<Itap_Profiles_Min_Fields>;
};


/** aggregate fields of "itap.profiles" */
export type Itap_Profiles_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Profiles_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "itap.profiles". All fields are combined with a logical 'AND'. */
export type Itap_Profiles_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Profiles_Bool_Exp>>;
  _not?: InputMaybe<Itap_Profiles_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Profiles_Bool_Exp>>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  email?: InputMaybe<String_Comparison_Exp>;
  first_name?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  identities?: InputMaybe<Itap_Identities_Bool_Exp>;
  identities_aggregate?: InputMaybe<Itap_Identities_Aggregate_Bool_Exp>;
  last_name?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.profiles" */
export enum Itap_Profiles_Constraint {
  /** unique or primary key constraint on columns "id" */
  ProfilesPkey = 'profiles_pkey'
}

/** input type for inserting data into table "itap.profiles" */
export type Itap_Profiles_Insert_Input = {
  email?: InputMaybe<Scalars['String']['input']>;
  first_name?: InputMaybe<Scalars['String']['input']>;
  identities?: InputMaybe<Itap_Identities_Arr_Rel_Insert_Input>;
  last_name?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Itap_Profiles_Max_Fields = {
  __typename?: 'itap_profiles_max_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  first_name?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  last_name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** aggregate min on columns */
export type Itap_Profiles_Min_Fields = {
  __typename?: 'itap_profiles_min_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  first_name?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  last_name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** response of any mutation on the table "itap.profiles" */
export type Itap_Profiles_Mutation_Response = {
  __typename?: 'itap_profiles_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Profiles>;
};

/** input type for inserting object relation for remote table "itap.profiles" */
export type Itap_Profiles_Obj_Rel_Insert_Input = {
  data: Itap_Profiles_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Profiles_On_Conflict>;
};

/** on_conflict condition type for table "itap.profiles" */
export type Itap_Profiles_On_Conflict = {
  constraint: Itap_Profiles_Constraint;
  update_columns?: Array<Itap_Profiles_Update_Column>;
  where?: InputMaybe<Itap_Profiles_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.profiles". */
export type Itap_Profiles_Order_By = {
  created_at?: InputMaybe<Order_By>;
  email?: InputMaybe<Order_By>;
  first_name?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  identities_aggregate?: InputMaybe<Itap_Identities_Aggregate_Order_By>;
  last_name?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: itap.profiles */
export type Itap_Profiles_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "itap.profiles" */
export enum Itap_Profiles_Select_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Email = 'email',
  /** column name */
  FirstName = 'first_name',
  /** column name */
  Id = 'id',
  /** column name */
  LastName = 'last_name',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "itap.profiles" */
export type Itap_Profiles_Set_Input = {
  email?: InputMaybe<Scalars['String']['input']>;
  first_name?: InputMaybe<Scalars['String']['input']>;
  last_name?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "itap_profiles" */
export type Itap_Profiles_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Profiles_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Profiles_Stream_Cursor_Value_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  first_name?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  last_name?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** update columns of table "itap.profiles" */
export enum Itap_Profiles_Update_Column {
  /** column name */
  Email = 'email',
  /** column name */
  FirstName = 'first_name',
  /** column name */
  LastName = 'last_name'
}

export type Itap_Profiles_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Itap_Profiles_Set_Input>;
  /** filter the rows which have to be updated */
  where: Itap_Profiles_Bool_Exp;
};

export type Jsonb_Cast_Exp = {
  String?: InputMaybe<String_Comparison_Exp>;
};

/** Boolean expression to compare columns of type "jsonb". All fields are combined with logical 'AND'. */
export type Jsonb_Comparison_Exp = {
  _cast?: InputMaybe<Jsonb_Cast_Exp>;
  /** is the column contained in the given json value */
  _contained_in?: InputMaybe<Scalars['jsonb']['input']>;
  /** does the column contain the given json value at the top level */
  _contains?: InputMaybe<Scalars['jsonb']['input']>;
  _eq?: InputMaybe<Scalars['jsonb']['input']>;
  _gt?: InputMaybe<Scalars['jsonb']['input']>;
  _gte?: InputMaybe<Scalars['jsonb']['input']>;
  /** does the string exist as a top-level key in the column */
  _has_key?: InputMaybe<Scalars['String']['input']>;
  /** do all of these strings exist as top-level keys in the column */
  _has_keys_all?: InputMaybe<Array<Scalars['String']['input']>>;
  /** do any of these strings exist as top-level keys in the column */
  _has_keys_any?: InputMaybe<Array<Scalars['String']['input']>>;
  _in?: InputMaybe<Array<Scalars['jsonb']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['jsonb']['input']>;
  _lte?: InputMaybe<Scalars['jsonb']['input']>;
  _neq?: InputMaybe<Scalars['jsonb']['input']>;
  _nin?: InputMaybe<Array<Scalars['jsonb']['input']>>;
};

/** mutation root */
export type Mutation_Root = {
  __typename?: 'mutation_root';
  /** delete data from the table: "itap.identities" */
  delete_itap_identities?: Maybe<Itap_Identities_Mutation_Response>;
  /** delete single row from the table: "itap.identities" */
  delete_itap_identities_by_pk?: Maybe<Itap_Identities>;
  /** delete data from the table: "itap.profiles" */
  delete_itap_profiles?: Maybe<Itap_Profiles_Mutation_Response>;
  /** delete single row from the table: "itap.profiles" */
  delete_itap_profiles_by_pk?: Maybe<Itap_Profiles>;
  /** insert data into the table: "itap.identities" */
  insert_itap_identities?: Maybe<Itap_Identities_Mutation_Response>;
  /** insert a single row into the table: "itap.identities" */
  insert_itap_identities_one?: Maybe<Itap_Identities>;
  /** insert data into the table: "itap.profiles" */
  insert_itap_profiles?: Maybe<Itap_Profiles_Mutation_Response>;
  /** insert a single row into the table: "itap.profiles" */
  insert_itap_profiles_one?: Maybe<Itap_Profiles>;
  /** update data of the table: "itap.identities" */
  update_itap_identities?: Maybe<Itap_Identities_Mutation_Response>;
  /** update single row of the table: "itap.identities" */
  update_itap_identities_by_pk?: Maybe<Itap_Identities>;
  /** update multiples rows of table: "itap.identities" */
  update_itap_identities_many?: Maybe<Array<Maybe<Itap_Identities_Mutation_Response>>>;
  /** update data of the table: "itap.profiles" */
  update_itap_profiles?: Maybe<Itap_Profiles_Mutation_Response>;
  /** update single row of the table: "itap.profiles" */
  update_itap_profiles_by_pk?: Maybe<Itap_Profiles>;
  /** update multiples rows of table: "itap.profiles" */
  update_itap_profiles_many?: Maybe<Array<Maybe<Itap_Profiles_Mutation_Response>>>;
};


/** mutation root */
export type Mutation_RootDelete_Itap_IdentitiesArgs = {
  where: Itap_Identities_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Identities_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Itap_ProfilesArgs = {
  where: Itap_Profiles_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Profiles_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootInsert_Itap_IdentitiesArgs = {
  objects: Array<Itap_Identities_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Identities_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Identities_OneArgs = {
  object: Itap_Identities_Insert_Input;
  on_conflict?: InputMaybe<Itap_Identities_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_ProfilesArgs = {
  objects: Array<Itap_Profiles_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Profiles_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Profiles_OneArgs = {
  object: Itap_Profiles_Insert_Input;
  on_conflict?: InputMaybe<Itap_Profiles_On_Conflict>;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_IdentitiesArgs = {
  _append?: InputMaybe<Itap_Identities_Append_Input>;
  _delete_at_path?: InputMaybe<Itap_Identities_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Itap_Identities_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Itap_Identities_Delete_Key_Input>;
  _prepend?: InputMaybe<Itap_Identities_Prepend_Input>;
  _set?: InputMaybe<Itap_Identities_Set_Input>;
  where: Itap_Identities_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Identities_By_PkArgs = {
  _append?: InputMaybe<Itap_Identities_Append_Input>;
  _delete_at_path?: InputMaybe<Itap_Identities_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Itap_Identities_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Itap_Identities_Delete_Key_Input>;
  _prepend?: InputMaybe<Itap_Identities_Prepend_Input>;
  _set?: InputMaybe<Itap_Identities_Set_Input>;
  pk_columns: Itap_Identities_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Identities_ManyArgs = {
  updates: Array<Itap_Identities_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_ProfilesArgs = {
  _set?: InputMaybe<Itap_Profiles_Set_Input>;
  where: Itap_Profiles_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Profiles_By_PkArgs = {
  _set?: InputMaybe<Itap_Profiles_Set_Input>;
  pk_columns: Itap_Profiles_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Profiles_ManyArgs = {
  updates: Array<Itap_Profiles_Updates>;
};

/** column ordering options */
export enum Order_By {
  /** in ascending order, nulls last */
  Asc = 'asc',
  /** in ascending order, nulls first */
  AscNullsFirst = 'asc_nulls_first',
  /** in ascending order, nulls last */
  AscNullsLast = 'asc_nulls_last',
  /** in descending order, nulls first */
  Desc = 'desc',
  /** in descending order, nulls first */
  DescNullsFirst = 'desc_nulls_first',
  /** in descending order, nulls last */
  DescNullsLast = 'desc_nulls_last'
}

export type Query_Root = {
  __typename?: 'query_root';
  /** fetch data from the table: "itap.identities" */
  itap_identities: Array<Itap_Identities>;
  /** fetch aggregated fields from the table: "itap.identities" */
  itap_identities_aggregate: Itap_Identities_Aggregate;
  /** fetch data from the table: "itap.identities" using primary key columns */
  itap_identities_by_pk?: Maybe<Itap_Identities>;
  /** fetch data from the table: "itap.profiles" */
  itap_profiles: Array<Itap_Profiles>;
  /** fetch aggregated fields from the table: "itap.profiles" */
  itap_profiles_aggregate: Itap_Profiles_Aggregate;
  /** fetch data from the table: "itap.profiles" using primary key columns */
  itap_profiles_by_pk?: Maybe<Itap_Profiles>;
};


export type Query_RootItap_IdentitiesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By>>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};


export type Query_RootItap_Identities_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By>>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};


export type Query_RootItap_Identities_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItap_ProfilesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Profiles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Profiles_Order_By>>;
  where?: InputMaybe<Itap_Profiles_Bool_Exp>;
};


export type Query_RootItap_Profiles_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Profiles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Profiles_Order_By>>;
  where?: InputMaybe<Itap_Profiles_Bool_Exp>;
};


export type Query_RootItap_Profiles_By_PkArgs = {
  id: Scalars['uuid']['input'];
};

export type Subscription_Root = {
  __typename?: 'subscription_root';
  /** fetch data from the table: "itap.identities" */
  itap_identities: Array<Itap_Identities>;
  /** fetch aggregated fields from the table: "itap.identities" */
  itap_identities_aggregate: Itap_Identities_Aggregate;
  /** fetch data from the table: "itap.identities" using primary key columns */
  itap_identities_by_pk?: Maybe<Itap_Identities>;
  /** fetch data from the table in a streaming manner: "itap.identities" */
  itap_identities_stream: Array<Itap_Identities>;
  /** fetch data from the table: "itap.profiles" */
  itap_profiles: Array<Itap_Profiles>;
  /** fetch aggregated fields from the table: "itap.profiles" */
  itap_profiles_aggregate: Itap_Profiles_Aggregate;
  /** fetch data from the table: "itap.profiles" using primary key columns */
  itap_profiles_by_pk?: Maybe<Itap_Profiles>;
  /** fetch data from the table in a streaming manner: "itap.profiles" */
  itap_profiles_stream: Array<Itap_Profiles>;
};


export type Subscription_RootItap_IdentitiesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By>>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};


export type Subscription_RootItap_Identities_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Identities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By>>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};


export type Subscription_RootItap_Identities_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Identities_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Identities_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
};


export type Subscription_RootItap_ProfilesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Profiles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Profiles_Order_By>>;
  where?: InputMaybe<Itap_Profiles_Bool_Exp>;
};


export type Subscription_RootItap_Profiles_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Profiles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Profiles_Order_By>>;
  where?: InputMaybe<Itap_Profiles_Bool_Exp>;
};


export type Subscription_RootItap_Profiles_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Profiles_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Profiles_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Profiles_Bool_Exp>;
};

/** Boolean expression to compare columns of type "timestamptz". All fields are combined with logical 'AND'. */
export type Timestamptz_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['timestamptz']['input']>;
  _gt?: InputMaybe<Scalars['timestamptz']['input']>;
  _gte?: InputMaybe<Scalars['timestamptz']['input']>;
  _in?: InputMaybe<Array<Scalars['timestamptz']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['timestamptz']['input']>;
  _lte?: InputMaybe<Scalars['timestamptz']['input']>;
  _neq?: InputMaybe<Scalars['timestamptz']['input']>;
  _nin?: InputMaybe<Array<Scalars['timestamptz']['input']>>;
};

/** Boolean expression to compare columns of type "uuid". All fields are combined with logical 'AND'. */
export type Uuid_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['uuid']['input']>;
  _gt?: InputMaybe<Scalars['uuid']['input']>;
  _gte?: InputMaybe<Scalars['uuid']['input']>;
  _in?: InputMaybe<Array<Scalars['uuid']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['uuid']['input']>;
  _lte?: InputMaybe<Scalars['uuid']['input']>;
  _neq?: InputMaybe<Scalars['uuid']['input']>;
  _nin?: InputMaybe<Array<Scalars['uuid']['input']>>;
};

/** Boolean expression to compare columns of type "vector". All fields are combined with logical 'AND'. */
export type Vector_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['vector']['input']>;
  _gt?: InputMaybe<Scalars['vector']['input']>;
  _gte?: InputMaybe<Scalars['vector']['input']>;
  _in?: InputMaybe<Array<Scalars['vector']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['vector']['input']>;
  _lte?: InputMaybe<Scalars['vector']['input']>;
  _neq?: InputMaybe<Scalars['vector']['input']>;
  _nin?: InputMaybe<Array<Scalars['vector']['input']>>;
};

export type Itap_IdentityFragment = { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any };

export type IdentityListQueryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By> | Itap_Identities_Order_By>;
}>;


export type IdentityListQueryQuery = { __typename?: 'query_root', itap_identities: Array<{ __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any }>, itap_identities_aggregate: { __typename?: 'itap_identities_aggregate', aggregate?: { __typename?: 'itap_identities_aggregate_fields', count: number } | null } };

export type IdentityOneQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type IdentityOneQueryQuery = { __typename?: 'query_root', itap_identities_by_pk?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any } | null };

export type IdentityInsertOneMutationMutationVariables = Exact<{
  object: Itap_Identities_Insert_Input;
}>;


export type IdentityInsertOneMutationMutation = { __typename?: 'mutation_root', insert_itap_identities_one?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any } | null };

export type IdentityUpdateOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  object: Itap_Identities_Set_Input;
}>;


export type IdentityUpdateOneMutationMutation = { __typename?: 'mutation_root', update_itap_identities_by_pk?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any } | null };

export type IdentityDeleteOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type IdentityDeleteOneMutationMutation = { __typename?: 'mutation_root', delete_itap_identities_by_pk?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any } | null };

export const Itap_IdentityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}}]}}]} as unknown as DocumentNode<Itap_IdentityFragment, unknown>;
export const IdentityListQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IdentityListQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_identities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_identities_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}}]}}]} as unknown as DocumentNode<IdentityListQueryQuery, IdentityListQueryQueryVariables>;
export const IdentityOneQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IdentityOneQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_identities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}}]}}]} as unknown as DocumentNode<IdentityOneQueryQuery, IdentityOneQueryQueryVariables>;
export const IdentityInsertOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"IdentityInsertOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_identities_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}}]}}]} as unknown as DocumentNode<IdentityInsertOneMutationMutation, IdentityInsertOneMutationMutationVariables>;
export const IdentityUpdateOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"IdentityUpdateOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_itap_identities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}}]}}]} as unknown as DocumentNode<IdentityUpdateOneMutationMutation, IdentityUpdateOneMutationMutationVariables>;
export const IdentityDeleteOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"IdentityDeleteOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_identities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}}]}}]} as unknown as DocumentNode<IdentityDeleteOneMutationMutation, IdentityDeleteOneMutationMutationVariables>;