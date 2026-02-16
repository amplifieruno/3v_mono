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

/** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
export type Boolean_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['Boolean']['input']>;
  _gt?: InputMaybe<Scalars['Boolean']['input']>;
  _gte?: InputMaybe<Scalars['Boolean']['input']>;
  _in?: InputMaybe<Array<Scalars['Boolean']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['Boolean']['input']>;
  _lte?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Scalars['Boolean']['input']>;
  _nin?: InputMaybe<Array<Scalars['Boolean']['input']>>;
};

/** Boolean expression to compare columns of type "Float". All fields are combined with logical 'AND'. */
export type Float_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['Float']['input']>;
  _gt?: InputMaybe<Scalars['Float']['input']>;
  _gte?: InputMaybe<Scalars['Float']['input']>;
  _in?: InputMaybe<Array<Scalars['Float']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['Float']['input']>;
  _lte?: InputMaybe<Scalars['Float']['input']>;
  _neq?: InputMaybe<Scalars['Float']['input']>;
  _nin?: InputMaybe<Array<Scalars['Float']['input']>>;
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

/** columns and relationships of "itap.areas" */
export type Itap_Areas = {
  __typename?: 'itap_areas';
  access_level: Scalars['String']['output'];
  area_type: Scalars['String']['output'];
  capacity?: Maybe<Scalars['Int']['output']>;
  /** An array relationship */
  children: Array<Itap_Areas>;
  /** An aggregate relationship */
  children_aggregate: Itap_Areas_Aggregate;
  created_at: Scalars['timestamptz']['output'];
  description?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  devices: Array<Itap_Devices>;
  /** An aggregate relationship */
  devices_aggregate: Itap_Devices_Aggregate;
  /** An object relationship */
  facility: Itap_Facilities;
  facility_id: Scalars['uuid']['output'];
  id: Scalars['uuid']['output'];
  name: Scalars['String']['output'];
  /** An object relationship */
  parent?: Maybe<Itap_Areas>;
  parent_id?: Maybe<Scalars['uuid']['output']>;
  status: Scalars['String']['output'];
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "itap.areas" */
export type Itap_AreasChildrenArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


/** columns and relationships of "itap.areas" */
export type Itap_AreasChildren_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


/** columns and relationships of "itap.areas" */
export type Itap_AreasDevicesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Devices_Order_By>>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};


/** columns and relationships of "itap.areas" */
export type Itap_AreasDevices_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Devices_Order_By>>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};

/** aggregated selection of "itap.areas" */
export type Itap_Areas_Aggregate = {
  __typename?: 'itap_areas_aggregate';
  aggregate?: Maybe<Itap_Areas_Aggregate_Fields>;
  nodes: Array<Itap_Areas>;
};

export type Itap_Areas_Aggregate_Bool_Exp = {
  count?: InputMaybe<Itap_Areas_Aggregate_Bool_Exp_Count>;
};

export type Itap_Areas_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Areas_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "itap.areas" */
export type Itap_Areas_Aggregate_Fields = {
  __typename?: 'itap_areas_aggregate_fields';
  avg?: Maybe<Itap_Areas_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Areas_Max_Fields>;
  min?: Maybe<Itap_Areas_Min_Fields>;
  stddev?: Maybe<Itap_Areas_Stddev_Fields>;
  stddev_pop?: Maybe<Itap_Areas_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Itap_Areas_Stddev_Samp_Fields>;
  sum?: Maybe<Itap_Areas_Sum_Fields>;
  var_pop?: Maybe<Itap_Areas_Var_Pop_Fields>;
  var_samp?: Maybe<Itap_Areas_Var_Samp_Fields>;
  variance?: Maybe<Itap_Areas_Variance_Fields>;
};


/** aggregate fields of "itap.areas" */
export type Itap_Areas_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "itap.areas" */
export type Itap_Areas_Aggregate_Order_By = {
  avg?: InputMaybe<Itap_Areas_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Itap_Areas_Max_Order_By>;
  min?: InputMaybe<Itap_Areas_Min_Order_By>;
  stddev?: InputMaybe<Itap_Areas_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Itap_Areas_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Itap_Areas_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Itap_Areas_Sum_Order_By>;
  var_pop?: InputMaybe<Itap_Areas_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Itap_Areas_Var_Samp_Order_By>;
  variance?: InputMaybe<Itap_Areas_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "itap.areas" */
export type Itap_Areas_Arr_Rel_Insert_Input = {
  data: Array<Itap_Areas_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Areas_On_Conflict>;
};

/** aggregate avg on columns */
export type Itap_Areas_Avg_Fields = {
  __typename?: 'itap_areas_avg_fields';
  capacity?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "itap.areas" */
export type Itap_Areas_Avg_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "itap.areas". All fields are combined with a logical 'AND'. */
export type Itap_Areas_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Areas_Bool_Exp>>;
  _not?: InputMaybe<Itap_Areas_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Areas_Bool_Exp>>;
  access_level?: InputMaybe<String_Comparison_Exp>;
  area_type?: InputMaybe<String_Comparison_Exp>;
  capacity?: InputMaybe<Int_Comparison_Exp>;
  children?: InputMaybe<Itap_Areas_Bool_Exp>;
  children_aggregate?: InputMaybe<Itap_Areas_Aggregate_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  devices?: InputMaybe<Itap_Devices_Bool_Exp>;
  devices_aggregate?: InputMaybe<Itap_Devices_Aggregate_Bool_Exp>;
  facility?: InputMaybe<Itap_Facilities_Bool_Exp>;
  facility_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  parent?: InputMaybe<Itap_Areas_Bool_Exp>;
  parent_id?: InputMaybe<Uuid_Comparison_Exp>;
  status?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.areas" */
export enum Itap_Areas_Constraint {
  /** unique or primary key constraint on columns "id" */
  AreasPkey = 'areas_pkey'
}

/** input type for incrementing numeric columns in table "itap.areas" */
export type Itap_Areas_Inc_Input = {
  capacity?: InputMaybe<Scalars['Int']['input']>;
};

/** input type for inserting data into table "itap.areas" */
export type Itap_Areas_Insert_Input = {
  access_level?: InputMaybe<Scalars['String']['input']>;
  area_type?: InputMaybe<Scalars['String']['input']>;
  capacity?: InputMaybe<Scalars['Int']['input']>;
  children?: InputMaybe<Itap_Areas_Arr_Rel_Insert_Input>;
  description?: InputMaybe<Scalars['String']['input']>;
  devices?: InputMaybe<Itap_Devices_Arr_Rel_Insert_Input>;
  facility?: InputMaybe<Itap_Facilities_Obj_Rel_Insert_Input>;
  facility_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parent?: InputMaybe<Itap_Areas_Obj_Rel_Insert_Input>;
  parent_id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Itap_Areas_Max_Fields = {
  __typename?: 'itap_areas_max_fields';
  access_level?: Maybe<Scalars['String']['output']>;
  area_type?: Maybe<Scalars['String']['output']>;
  capacity?: Maybe<Scalars['Int']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  facility_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  parent_id?: Maybe<Scalars['uuid']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by max() on columns of table "itap.areas" */
export type Itap_Areas_Max_Order_By = {
  access_level?: InputMaybe<Order_By>;
  area_type?: InputMaybe<Order_By>;
  capacity?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  facility_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  parent_id?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Itap_Areas_Min_Fields = {
  __typename?: 'itap_areas_min_fields';
  access_level?: Maybe<Scalars['String']['output']>;
  area_type?: Maybe<Scalars['String']['output']>;
  capacity?: Maybe<Scalars['Int']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  facility_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  parent_id?: Maybe<Scalars['uuid']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by min() on columns of table "itap.areas" */
export type Itap_Areas_Min_Order_By = {
  access_level?: InputMaybe<Order_By>;
  area_type?: InputMaybe<Order_By>;
  capacity?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  facility_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  parent_id?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "itap.areas" */
export type Itap_Areas_Mutation_Response = {
  __typename?: 'itap_areas_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Areas>;
};

/** input type for inserting object relation for remote table "itap.areas" */
export type Itap_Areas_Obj_Rel_Insert_Input = {
  data: Itap_Areas_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Areas_On_Conflict>;
};

/** on_conflict condition type for table "itap.areas" */
export type Itap_Areas_On_Conflict = {
  constraint: Itap_Areas_Constraint;
  update_columns?: Array<Itap_Areas_Update_Column>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.areas". */
export type Itap_Areas_Order_By = {
  access_level?: InputMaybe<Order_By>;
  area_type?: InputMaybe<Order_By>;
  capacity?: InputMaybe<Order_By>;
  children_aggregate?: InputMaybe<Itap_Areas_Aggregate_Order_By>;
  created_at?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  devices_aggregate?: InputMaybe<Itap_Devices_Aggregate_Order_By>;
  facility?: InputMaybe<Itap_Facilities_Order_By>;
  facility_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  parent?: InputMaybe<Itap_Areas_Order_By>;
  parent_id?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: itap.areas */
export type Itap_Areas_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "itap.areas" */
export enum Itap_Areas_Select_Column {
  /** column name */
  AccessLevel = 'access_level',
  /** column name */
  AreaType = 'area_type',
  /** column name */
  Capacity = 'capacity',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Description = 'description',
  /** column name */
  FacilityId = 'facility_id',
  /** column name */
  Id = 'id',
  /** column name */
  Name = 'name',
  /** column name */
  ParentId = 'parent_id',
  /** column name */
  Status = 'status',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "itap.areas" */
export type Itap_Areas_Set_Input = {
  access_level?: InputMaybe<Scalars['String']['input']>;
  area_type?: InputMaybe<Scalars['String']['input']>;
  capacity?: InputMaybe<Scalars['Int']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  facility_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parent_id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate stddev on columns */
export type Itap_Areas_Stddev_Fields = {
  __typename?: 'itap_areas_stddev_fields';
  capacity?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "itap.areas" */
export type Itap_Areas_Stddev_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Itap_Areas_Stddev_Pop_Fields = {
  __typename?: 'itap_areas_stddev_pop_fields';
  capacity?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "itap.areas" */
export type Itap_Areas_Stddev_Pop_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Itap_Areas_Stddev_Samp_Fields = {
  __typename?: 'itap_areas_stddev_samp_fields';
  capacity?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "itap.areas" */
export type Itap_Areas_Stddev_Samp_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "itap_areas" */
export type Itap_Areas_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Areas_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Areas_Stream_Cursor_Value_Input = {
  access_level?: InputMaybe<Scalars['String']['input']>;
  area_type?: InputMaybe<Scalars['String']['input']>;
  capacity?: InputMaybe<Scalars['Int']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  facility_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parent_id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate sum on columns */
export type Itap_Areas_Sum_Fields = {
  __typename?: 'itap_areas_sum_fields';
  capacity?: Maybe<Scalars['Int']['output']>;
};

/** order by sum() on columns of table "itap.areas" */
export type Itap_Areas_Sum_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** update columns of table "itap.areas" */
export enum Itap_Areas_Update_Column {
  /** column name */
  AccessLevel = 'access_level',
  /** column name */
  AreaType = 'area_type',
  /** column name */
  Capacity = 'capacity',
  /** column name */
  Description = 'description',
  /** column name */
  FacilityId = 'facility_id',
  /** column name */
  Name = 'name',
  /** column name */
  ParentId = 'parent_id',
  /** column name */
  Status = 'status'
}

export type Itap_Areas_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Itap_Areas_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Itap_Areas_Set_Input>;
  /** filter the rows which have to be updated */
  where: Itap_Areas_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Itap_Areas_Var_Pop_Fields = {
  __typename?: 'itap_areas_var_pop_fields';
  capacity?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "itap.areas" */
export type Itap_Areas_Var_Pop_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Itap_Areas_Var_Samp_Fields = {
  __typename?: 'itap_areas_var_samp_fields';
  capacity?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "itap.areas" */
export type Itap_Areas_Var_Samp_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Itap_Areas_Variance_Fields = {
  __typename?: 'itap_areas_variance_fields';
  capacity?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "itap.areas" */
export type Itap_Areas_Variance_Order_By = {
  capacity?: InputMaybe<Order_By>;
};

/** columns and relationships of "itap.detections" */
export type Itap_Detections = {
  __typename?: 'itap_detections';
  bbox?: Maybe<Scalars['jsonb']['output']>;
  confidence: Scalars['Float']['output'];
  created_at: Scalars['timestamptz']['output'];
  /** An object relationship */
  device: Itap_Devices;
  device_id: Scalars['uuid']['output'];
  id: Scalars['uuid']['output'];
  /** An object relationship */
  identity?: Maybe<Itap_Identities>;
  identity_id?: Maybe<Scalars['uuid']['output']>;
  is_new_identity: Scalars['Boolean']['output'];
  similarity?: Maybe<Scalars['Float']['output']>;
  thumbnail?: Maybe<Scalars['String']['output']>;
};


/** columns and relationships of "itap.detections" */
export type Itap_DetectionsBboxArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "itap.detections" */
export type Itap_Detections_Aggregate = {
  __typename?: 'itap_detections_aggregate';
  aggregate?: Maybe<Itap_Detections_Aggregate_Fields>;
  nodes: Array<Itap_Detections>;
};

export type Itap_Detections_Aggregate_Bool_Exp = {
  bool_and?: InputMaybe<Itap_Detections_Aggregate_Bool_Exp_Bool_And>;
  bool_or?: InputMaybe<Itap_Detections_Aggregate_Bool_Exp_Bool_Or>;
  count?: InputMaybe<Itap_Detections_Aggregate_Bool_Exp_Count>;
};

export type Itap_Detections_Aggregate_Bool_Exp_Bool_And = {
  arguments: Itap_Detections_Select_Column_Itap_Detections_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Detections_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Itap_Detections_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Itap_Detections_Select_Column_Itap_Detections_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Detections_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Itap_Detections_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Detections_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "itap.detections" */
export type Itap_Detections_Aggregate_Fields = {
  __typename?: 'itap_detections_aggregate_fields';
  avg?: Maybe<Itap_Detections_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Detections_Max_Fields>;
  min?: Maybe<Itap_Detections_Min_Fields>;
  stddev?: Maybe<Itap_Detections_Stddev_Fields>;
  stddev_pop?: Maybe<Itap_Detections_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Itap_Detections_Stddev_Samp_Fields>;
  sum?: Maybe<Itap_Detections_Sum_Fields>;
  var_pop?: Maybe<Itap_Detections_Var_Pop_Fields>;
  var_samp?: Maybe<Itap_Detections_Var_Samp_Fields>;
  variance?: Maybe<Itap_Detections_Variance_Fields>;
};


/** aggregate fields of "itap.detections" */
export type Itap_Detections_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "itap.detections" */
export type Itap_Detections_Aggregate_Order_By = {
  avg?: InputMaybe<Itap_Detections_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Itap_Detections_Max_Order_By>;
  min?: InputMaybe<Itap_Detections_Min_Order_By>;
  stddev?: InputMaybe<Itap_Detections_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Itap_Detections_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Itap_Detections_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Itap_Detections_Sum_Order_By>;
  var_pop?: InputMaybe<Itap_Detections_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Itap_Detections_Var_Samp_Order_By>;
  variance?: InputMaybe<Itap_Detections_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "itap.detections" */
export type Itap_Detections_Arr_Rel_Insert_Input = {
  data: Array<Itap_Detections_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Detections_On_Conflict>;
};

/** aggregate avg on columns */
export type Itap_Detections_Avg_Fields = {
  __typename?: 'itap_detections_avg_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "itap.detections" */
export type Itap_Detections_Avg_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "itap.detections". All fields are combined with a logical 'AND'. */
export type Itap_Detections_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Detections_Bool_Exp>>;
  _not?: InputMaybe<Itap_Detections_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Detections_Bool_Exp>>;
  bbox?: InputMaybe<Jsonb_Comparison_Exp>;
  confidence?: InputMaybe<Float_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  device?: InputMaybe<Itap_Devices_Bool_Exp>;
  device_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  identity?: InputMaybe<Itap_Identities_Bool_Exp>;
  identity_id?: InputMaybe<Uuid_Comparison_Exp>;
  is_new_identity?: InputMaybe<Boolean_Comparison_Exp>;
  similarity?: InputMaybe<Float_Comparison_Exp>;
  thumbnail?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.detections" */
export enum Itap_Detections_Constraint {
  /** unique or primary key constraint on columns "id" */
  DetectionsPkey = 'detections_pkey'
}

/** input type for inserting data into table "itap.detections" */
export type Itap_Detections_Insert_Input = {
  bbox?: InputMaybe<Scalars['jsonb']['input']>;
  confidence?: InputMaybe<Scalars['Float']['input']>;
  device?: InputMaybe<Itap_Devices_Obj_Rel_Insert_Input>;
  device_id?: InputMaybe<Scalars['uuid']['input']>;
  identity?: InputMaybe<Itap_Identities_Obj_Rel_Insert_Input>;
  identity_id?: InputMaybe<Scalars['uuid']['input']>;
  is_new_identity?: InputMaybe<Scalars['Boolean']['input']>;
  similarity?: InputMaybe<Scalars['Float']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Itap_Detections_Max_Fields = {
  __typename?: 'itap_detections_max_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  device_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  identity_id?: Maybe<Scalars['uuid']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
  thumbnail?: Maybe<Scalars['String']['output']>;
};

/** order by max() on columns of table "itap.detections" */
export type Itap_Detections_Max_Order_By = {
  confidence?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  device_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  identity_id?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
  thumbnail?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Itap_Detections_Min_Fields = {
  __typename?: 'itap_detections_min_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  device_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  identity_id?: Maybe<Scalars['uuid']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
  thumbnail?: Maybe<Scalars['String']['output']>;
};

/** order by min() on columns of table "itap.detections" */
export type Itap_Detections_Min_Order_By = {
  confidence?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  device_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  identity_id?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
  thumbnail?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "itap.detections" */
export type Itap_Detections_Mutation_Response = {
  __typename?: 'itap_detections_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Detections>;
};

/** on_conflict condition type for table "itap.detections" */
export type Itap_Detections_On_Conflict = {
  constraint: Itap_Detections_Constraint;
  update_columns?: Array<Itap_Detections_Update_Column>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.detections". */
export type Itap_Detections_Order_By = {
  bbox?: InputMaybe<Order_By>;
  confidence?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  device?: InputMaybe<Itap_Devices_Order_By>;
  device_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  identity?: InputMaybe<Itap_Identities_Order_By>;
  identity_id?: InputMaybe<Order_By>;
  is_new_identity?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
  thumbnail?: InputMaybe<Order_By>;
};

/** select columns of table "itap.detections" */
export enum Itap_Detections_Select_Column {
  /** column name */
  Bbox = 'bbox',
  /** column name */
  Confidence = 'confidence',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  DeviceId = 'device_id',
  /** column name */
  Id = 'id',
  /** column name */
  IdentityId = 'identity_id',
  /** column name */
  IsNewIdentity = 'is_new_identity',
  /** column name */
  Similarity = 'similarity',
  /** column name */
  Thumbnail = 'thumbnail'
}

/** select "itap_detections_aggregate_bool_exp_bool_and_arguments_columns" columns of table "itap.detections" */
export enum Itap_Detections_Select_Column_Itap_Detections_Aggregate_Bool_Exp_Bool_And_Arguments_Columns {
  /** column name */
  IsNewIdentity = 'is_new_identity'
}

/** select "itap_detections_aggregate_bool_exp_bool_or_arguments_columns" columns of table "itap.detections" */
export enum Itap_Detections_Select_Column_Itap_Detections_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns {
  /** column name */
  IsNewIdentity = 'is_new_identity'
}

/** aggregate stddev on columns */
export type Itap_Detections_Stddev_Fields = {
  __typename?: 'itap_detections_stddev_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "itap.detections" */
export type Itap_Detections_Stddev_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Itap_Detections_Stddev_Pop_Fields = {
  __typename?: 'itap_detections_stddev_pop_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "itap.detections" */
export type Itap_Detections_Stddev_Pop_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Itap_Detections_Stddev_Samp_Fields = {
  __typename?: 'itap_detections_stddev_samp_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "itap.detections" */
export type Itap_Detections_Stddev_Samp_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "itap_detections" */
export type Itap_Detections_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Detections_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Detections_Stream_Cursor_Value_Input = {
  bbox?: InputMaybe<Scalars['jsonb']['input']>;
  confidence?: InputMaybe<Scalars['Float']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  device_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  identity_id?: InputMaybe<Scalars['uuid']['input']>;
  is_new_identity?: InputMaybe<Scalars['Boolean']['input']>;
  similarity?: InputMaybe<Scalars['Float']['input']>;
  thumbnail?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate sum on columns */
export type Itap_Detections_Sum_Fields = {
  __typename?: 'itap_detections_sum_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by sum() on columns of table "itap.detections" */
export type Itap_Detections_Sum_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** placeholder for update columns of table "itap.detections" (current role has no relevant permissions) */
export enum Itap_Detections_Update_Column {
  /** placeholder (do not use) */
  Placeholder = '_PLACEHOLDER'
}

/** aggregate var_pop on columns */
export type Itap_Detections_Var_Pop_Fields = {
  __typename?: 'itap_detections_var_pop_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "itap.detections" */
export type Itap_Detections_Var_Pop_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Itap_Detections_Var_Samp_Fields = {
  __typename?: 'itap_detections_var_samp_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "itap.detections" */
export type Itap_Detections_Var_Samp_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Itap_Detections_Variance_Fields = {
  __typename?: 'itap_detections_variance_fields';
  confidence?: Maybe<Scalars['Float']['output']>;
  similarity?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "itap.detections" */
export type Itap_Detections_Variance_Order_By = {
  confidence?: InputMaybe<Order_By>;
  similarity?: InputMaybe<Order_By>;
};

/** columns and relationships of "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics = {
  __typename?: 'itap_device_health_metrics';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  /** An object relationship */
  device: Itap_Devices;
  device_id: Scalars['uuid']['output'];
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Int']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  id: Scalars['uuid']['output'];
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
  timestamp: Scalars['timestamptz']['output'];
};

/** aggregated selection of "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Aggregate = {
  __typename?: 'itap_device_health_metrics_aggregate';
  aggregate?: Maybe<Itap_Device_Health_Metrics_Aggregate_Fields>;
  nodes: Array<Itap_Device_Health_Metrics>;
};

export type Itap_Device_Health_Metrics_Aggregate_Bool_Exp = {
  count?: InputMaybe<Itap_Device_Health_Metrics_Aggregate_Bool_Exp_Count>;
};

export type Itap_Device_Health_Metrics_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Aggregate_Fields = {
  __typename?: 'itap_device_health_metrics_aggregate_fields';
  avg?: Maybe<Itap_Device_Health_Metrics_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Device_Health_Metrics_Max_Fields>;
  min?: Maybe<Itap_Device_Health_Metrics_Min_Fields>;
  stddev?: Maybe<Itap_Device_Health_Metrics_Stddev_Fields>;
  stddev_pop?: Maybe<Itap_Device_Health_Metrics_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Itap_Device_Health_Metrics_Stddev_Samp_Fields>;
  sum?: Maybe<Itap_Device_Health_Metrics_Sum_Fields>;
  var_pop?: Maybe<Itap_Device_Health_Metrics_Var_Pop_Fields>;
  var_samp?: Maybe<Itap_Device_Health_Metrics_Var_Samp_Fields>;
  variance?: Maybe<Itap_Device_Health_Metrics_Variance_Fields>;
};


/** aggregate fields of "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Aggregate_Order_By = {
  avg?: InputMaybe<Itap_Device_Health_Metrics_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Itap_Device_Health_Metrics_Max_Order_By>;
  min?: InputMaybe<Itap_Device_Health_Metrics_Min_Order_By>;
  stddev?: InputMaybe<Itap_Device_Health_Metrics_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Itap_Device_Health_Metrics_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Itap_Device_Health_Metrics_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Itap_Device_Health_Metrics_Sum_Order_By>;
  var_pop?: InputMaybe<Itap_Device_Health_Metrics_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Itap_Device_Health_Metrics_Var_Samp_Order_By>;
  variance?: InputMaybe<Itap_Device_Health_Metrics_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Arr_Rel_Insert_Input = {
  data: Array<Itap_Device_Health_Metrics_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Device_Health_Metrics_On_Conflict>;
};

/** aggregate avg on columns */
export type Itap_Device_Health_Metrics_Avg_Fields = {
  __typename?: 'itap_device_health_metrics_avg_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Float']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Avg_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "itap.device_health_metrics". All fields are combined with a logical 'AND'. */
export type Itap_Device_Health_Metrics_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Device_Health_Metrics_Bool_Exp>>;
  _not?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Device_Health_Metrics_Bool_Exp>>;
  cpu_usage?: InputMaybe<Float_Comparison_Exp>;
  device?: InputMaybe<Itap_Devices_Bool_Exp>;
  device_id?: InputMaybe<Uuid_Comparison_Exp>;
  disk_usage?: InputMaybe<Float_Comparison_Exp>;
  error_count?: InputMaybe<Int_Comparison_Exp>;
  frame_rate?: InputMaybe<Float_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  memory_usage?: InputMaybe<Float_Comparison_Exp>;
  network_latency?: InputMaybe<Float_Comparison_Exp>;
  timestamp?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.device_health_metrics" */
export enum Itap_Device_Health_Metrics_Constraint {
  /** unique or primary key constraint on columns "id" */
  DeviceHealthMetricsPkey = 'device_health_metrics_pkey'
}

/** input type for inserting data into table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Insert_Input = {
  cpu_usage?: InputMaybe<Scalars['Float']['input']>;
  device?: InputMaybe<Itap_Devices_Obj_Rel_Insert_Input>;
  device_id?: InputMaybe<Scalars['uuid']['input']>;
  disk_usage?: InputMaybe<Scalars['Float']['input']>;
  error_count?: InputMaybe<Scalars['Int']['input']>;
  frame_rate?: InputMaybe<Scalars['Float']['input']>;
  memory_usage?: InputMaybe<Scalars['Float']['input']>;
  network_latency?: InputMaybe<Scalars['Float']['input']>;
  timestamp?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate max on columns */
export type Itap_Device_Health_Metrics_Max_Fields = {
  __typename?: 'itap_device_health_metrics_max_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  device_id?: Maybe<Scalars['uuid']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Int']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
  timestamp?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by max() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Max_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  device_id?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
  timestamp?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Itap_Device_Health_Metrics_Min_Fields = {
  __typename?: 'itap_device_health_metrics_min_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  device_id?: Maybe<Scalars['uuid']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Int']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
  timestamp?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by min() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Min_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  device_id?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
  timestamp?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Mutation_Response = {
  __typename?: 'itap_device_health_metrics_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Device_Health_Metrics>;
};

/** on_conflict condition type for table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_On_Conflict = {
  constraint: Itap_Device_Health_Metrics_Constraint;
  update_columns?: Array<Itap_Device_Health_Metrics_Update_Column>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.device_health_metrics". */
export type Itap_Device_Health_Metrics_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  device?: InputMaybe<Itap_Devices_Order_By>;
  device_id?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
  timestamp?: InputMaybe<Order_By>;
};

/** select columns of table "itap.device_health_metrics" */
export enum Itap_Device_Health_Metrics_Select_Column {
  /** column name */
  CpuUsage = 'cpu_usage',
  /** column name */
  DeviceId = 'device_id',
  /** column name */
  DiskUsage = 'disk_usage',
  /** column name */
  ErrorCount = 'error_count',
  /** column name */
  FrameRate = 'frame_rate',
  /** column name */
  Id = 'id',
  /** column name */
  MemoryUsage = 'memory_usage',
  /** column name */
  NetworkLatency = 'network_latency',
  /** column name */
  Timestamp = 'timestamp'
}

/** aggregate stddev on columns */
export type Itap_Device_Health_Metrics_Stddev_Fields = {
  __typename?: 'itap_device_health_metrics_stddev_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Float']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Stddev_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Itap_Device_Health_Metrics_Stddev_Pop_Fields = {
  __typename?: 'itap_device_health_metrics_stddev_pop_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Float']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Stddev_Pop_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Itap_Device_Health_Metrics_Stddev_Samp_Fields = {
  __typename?: 'itap_device_health_metrics_stddev_samp_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Float']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Stddev_Samp_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "itap_device_health_metrics" */
export type Itap_Device_Health_Metrics_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Device_Health_Metrics_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Device_Health_Metrics_Stream_Cursor_Value_Input = {
  cpu_usage?: InputMaybe<Scalars['Float']['input']>;
  device_id?: InputMaybe<Scalars['uuid']['input']>;
  disk_usage?: InputMaybe<Scalars['Float']['input']>;
  error_count?: InputMaybe<Scalars['Int']['input']>;
  frame_rate?: InputMaybe<Scalars['Float']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  memory_usage?: InputMaybe<Scalars['Float']['input']>;
  network_latency?: InputMaybe<Scalars['Float']['input']>;
  timestamp?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate sum on columns */
export type Itap_Device_Health_Metrics_Sum_Fields = {
  __typename?: 'itap_device_health_metrics_sum_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Int']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by sum() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Sum_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** placeholder for update columns of table "itap.device_health_metrics" (current role has no relevant permissions) */
export enum Itap_Device_Health_Metrics_Update_Column {
  /** placeholder (do not use) */
  Placeholder = '_PLACEHOLDER'
}

/** aggregate var_pop on columns */
export type Itap_Device_Health_Metrics_Var_Pop_Fields = {
  __typename?: 'itap_device_health_metrics_var_pop_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Float']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Var_Pop_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Itap_Device_Health_Metrics_Var_Samp_Fields = {
  __typename?: 'itap_device_health_metrics_var_samp_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Float']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Var_Samp_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Itap_Device_Health_Metrics_Variance_Fields = {
  __typename?: 'itap_device_health_metrics_variance_fields';
  cpu_usage?: Maybe<Scalars['Float']['output']>;
  disk_usage?: Maybe<Scalars['Float']['output']>;
  error_count?: Maybe<Scalars['Float']['output']>;
  frame_rate?: Maybe<Scalars['Float']['output']>;
  memory_usage?: Maybe<Scalars['Float']['output']>;
  network_latency?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "itap.device_health_metrics" */
export type Itap_Device_Health_Metrics_Variance_Order_By = {
  cpu_usage?: InputMaybe<Order_By>;
  disk_usage?: InputMaybe<Order_By>;
  error_count?: InputMaybe<Order_By>;
  frame_rate?: InputMaybe<Order_By>;
  memory_usage?: InputMaybe<Order_By>;
  network_latency?: InputMaybe<Order_By>;
};

/** columns and relationships of "itap.devices" */
export type Itap_Devices = {
  __typename?: 'itap_devices';
  /** An object relationship */
  area?: Maybe<Itap_Areas>;
  area_id?: Maybe<Scalars['uuid']['output']>;
  configuration?: Maybe<Scalars['jsonb']['output']>;
  created_at: Scalars['timestamptz']['output'];
  credentials?: Maybe<Scalars['jsonb']['output']>;
  /** An array relationship */
  detections: Array<Itap_Detections>;
  /** An aggregate relationship */
  detections_aggregate: Itap_Detections_Aggregate;
  device_type: Scalars['String']['output'];
  fps?: Maybe<Scalars['Int']['output']>;
  /** An array relationship */
  health_metrics: Array<Itap_Device_Health_Metrics>;
  /** An aggregate relationship */
  health_metrics_aggregate: Itap_Device_Health_Metrics_Aggregate;
  health_status: Scalars['String']['output'];
  id: Scalars['uuid']['output'];
  last_seen?: Maybe<Scalars['timestamptz']['output']>;
  name: Scalars['String']['output'];
  recognition_enabled: Scalars['Boolean']['output'];
  recognition_fps: Scalars['Int']['output'];
  resolution?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  stream_url?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "itap.devices" */
export type Itap_DevicesConfigurationArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};


/** columns and relationships of "itap.devices" */
export type Itap_DevicesCredentialsArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};


/** columns and relationships of "itap.devices" */
export type Itap_DevicesDetectionsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Detections_Order_By>>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};


/** columns and relationships of "itap.devices" */
export type Itap_DevicesDetections_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Detections_Order_By>>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};


/** columns and relationships of "itap.devices" */
export type Itap_DevicesHealth_MetricsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Device_Health_Metrics_Order_By>>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};


/** columns and relationships of "itap.devices" */
export type Itap_DevicesHealth_Metrics_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Device_Health_Metrics_Order_By>>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};

/** aggregated selection of "itap.devices" */
export type Itap_Devices_Aggregate = {
  __typename?: 'itap_devices_aggregate';
  aggregate?: Maybe<Itap_Devices_Aggregate_Fields>;
  nodes: Array<Itap_Devices>;
};

export type Itap_Devices_Aggregate_Bool_Exp = {
  bool_and?: InputMaybe<Itap_Devices_Aggregate_Bool_Exp_Bool_And>;
  bool_or?: InputMaybe<Itap_Devices_Aggregate_Bool_Exp_Bool_Or>;
  count?: InputMaybe<Itap_Devices_Aggregate_Bool_Exp_Count>;
};

export type Itap_Devices_Aggregate_Bool_Exp_Bool_And = {
  arguments: Itap_Devices_Select_Column_Itap_Devices_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Devices_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Itap_Devices_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Itap_Devices_Select_Column_Itap_Devices_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Devices_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Itap_Devices_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Devices_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "itap.devices" */
export type Itap_Devices_Aggregate_Fields = {
  __typename?: 'itap_devices_aggregate_fields';
  avg?: Maybe<Itap_Devices_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Devices_Max_Fields>;
  min?: Maybe<Itap_Devices_Min_Fields>;
  stddev?: Maybe<Itap_Devices_Stddev_Fields>;
  stddev_pop?: Maybe<Itap_Devices_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Itap_Devices_Stddev_Samp_Fields>;
  sum?: Maybe<Itap_Devices_Sum_Fields>;
  var_pop?: Maybe<Itap_Devices_Var_Pop_Fields>;
  var_samp?: Maybe<Itap_Devices_Var_Samp_Fields>;
  variance?: Maybe<Itap_Devices_Variance_Fields>;
};


/** aggregate fields of "itap.devices" */
export type Itap_Devices_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "itap.devices" */
export type Itap_Devices_Aggregate_Order_By = {
  avg?: InputMaybe<Itap_Devices_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Itap_Devices_Max_Order_By>;
  min?: InputMaybe<Itap_Devices_Min_Order_By>;
  stddev?: InputMaybe<Itap_Devices_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Itap_Devices_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Itap_Devices_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Itap_Devices_Sum_Order_By>;
  var_pop?: InputMaybe<Itap_Devices_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Itap_Devices_Var_Samp_Order_By>;
  variance?: InputMaybe<Itap_Devices_Variance_Order_By>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Itap_Devices_Append_Input = {
  configuration?: InputMaybe<Scalars['jsonb']['input']>;
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
};

/** input type for inserting array relation for remote table "itap.devices" */
export type Itap_Devices_Arr_Rel_Insert_Input = {
  data: Array<Itap_Devices_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Devices_On_Conflict>;
};

/** aggregate avg on columns */
export type Itap_Devices_Avg_Fields = {
  __typename?: 'itap_devices_avg_fields';
  fps?: Maybe<Scalars['Float']['output']>;
  recognition_fps?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "itap.devices" */
export type Itap_Devices_Avg_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "itap.devices". All fields are combined with a logical 'AND'. */
export type Itap_Devices_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Devices_Bool_Exp>>;
  _not?: InputMaybe<Itap_Devices_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Devices_Bool_Exp>>;
  area?: InputMaybe<Itap_Areas_Bool_Exp>;
  area_id?: InputMaybe<Uuid_Comparison_Exp>;
  configuration?: InputMaybe<Jsonb_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  credentials?: InputMaybe<Jsonb_Comparison_Exp>;
  detections?: InputMaybe<Itap_Detections_Bool_Exp>;
  detections_aggregate?: InputMaybe<Itap_Detections_Aggregate_Bool_Exp>;
  device_type?: InputMaybe<String_Comparison_Exp>;
  fps?: InputMaybe<Int_Comparison_Exp>;
  health_metrics?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
  health_metrics_aggregate?: InputMaybe<Itap_Device_Health_Metrics_Aggregate_Bool_Exp>;
  health_status?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  last_seen?: InputMaybe<Timestamptz_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  recognition_enabled?: InputMaybe<Boolean_Comparison_Exp>;
  recognition_fps?: InputMaybe<Int_Comparison_Exp>;
  resolution?: InputMaybe<String_Comparison_Exp>;
  status?: InputMaybe<String_Comparison_Exp>;
  stream_url?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.devices" */
export enum Itap_Devices_Constraint {
  /** unique or primary key constraint on columns "id" */
  DevicesPkey = 'devices_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Itap_Devices_Delete_At_Path_Input = {
  configuration?: InputMaybe<Array<Scalars['String']['input']>>;
  credentials?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Itap_Devices_Delete_Elem_Input = {
  configuration?: InputMaybe<Scalars['Int']['input']>;
  credentials?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Itap_Devices_Delete_Key_Input = {
  configuration?: InputMaybe<Scalars['String']['input']>;
  credentials?: InputMaybe<Scalars['String']['input']>;
};

/** input type for incrementing numeric columns in table "itap.devices" */
export type Itap_Devices_Inc_Input = {
  fps?: InputMaybe<Scalars['Int']['input']>;
  recognition_fps?: InputMaybe<Scalars['Int']['input']>;
};

/** input type for inserting data into table "itap.devices" */
export type Itap_Devices_Insert_Input = {
  area?: InputMaybe<Itap_Areas_Obj_Rel_Insert_Input>;
  area_id?: InputMaybe<Scalars['uuid']['input']>;
  configuration?: InputMaybe<Scalars['jsonb']['input']>;
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
  detections?: InputMaybe<Itap_Detections_Arr_Rel_Insert_Input>;
  device_type?: InputMaybe<Scalars['String']['input']>;
  fps?: InputMaybe<Scalars['Int']['input']>;
  health_metrics?: InputMaybe<Itap_Device_Health_Metrics_Arr_Rel_Insert_Input>;
  health_status?: InputMaybe<Scalars['String']['input']>;
  last_seen?: InputMaybe<Scalars['timestamptz']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  recognition_enabled?: InputMaybe<Scalars['Boolean']['input']>;
  recognition_fps?: InputMaybe<Scalars['Int']['input']>;
  resolution?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  stream_url?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Itap_Devices_Max_Fields = {
  __typename?: 'itap_devices_max_fields';
  area_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  device_type?: Maybe<Scalars['String']['output']>;
  fps?: Maybe<Scalars['Int']['output']>;
  health_status?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  last_seen?: Maybe<Scalars['timestamptz']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  recognition_fps?: Maybe<Scalars['Int']['output']>;
  resolution?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  stream_url?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by max() on columns of table "itap.devices" */
export type Itap_Devices_Max_Order_By = {
  area_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  device_type?: InputMaybe<Order_By>;
  fps?: InputMaybe<Order_By>;
  health_status?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  last_seen?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
  resolution?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  stream_url?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Itap_Devices_Min_Fields = {
  __typename?: 'itap_devices_min_fields';
  area_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  device_type?: Maybe<Scalars['String']['output']>;
  fps?: Maybe<Scalars['Int']['output']>;
  health_status?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  last_seen?: Maybe<Scalars['timestamptz']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  recognition_fps?: Maybe<Scalars['Int']['output']>;
  resolution?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  stream_url?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by min() on columns of table "itap.devices" */
export type Itap_Devices_Min_Order_By = {
  area_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  device_type?: InputMaybe<Order_By>;
  fps?: InputMaybe<Order_By>;
  health_status?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  last_seen?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
  resolution?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  stream_url?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "itap.devices" */
export type Itap_Devices_Mutation_Response = {
  __typename?: 'itap_devices_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Devices>;
};

/** input type for inserting object relation for remote table "itap.devices" */
export type Itap_Devices_Obj_Rel_Insert_Input = {
  data: Itap_Devices_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Devices_On_Conflict>;
};

/** on_conflict condition type for table "itap.devices" */
export type Itap_Devices_On_Conflict = {
  constraint: Itap_Devices_Constraint;
  update_columns?: Array<Itap_Devices_Update_Column>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.devices". */
export type Itap_Devices_Order_By = {
  area?: InputMaybe<Itap_Areas_Order_By>;
  area_id?: InputMaybe<Order_By>;
  configuration?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  credentials?: InputMaybe<Order_By>;
  detections_aggregate?: InputMaybe<Itap_Detections_Aggregate_Order_By>;
  device_type?: InputMaybe<Order_By>;
  fps?: InputMaybe<Order_By>;
  health_metrics_aggregate?: InputMaybe<Itap_Device_Health_Metrics_Aggregate_Order_By>;
  health_status?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  last_seen?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  recognition_enabled?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
  resolution?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  stream_url?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: itap.devices */
export type Itap_Devices_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Itap_Devices_Prepend_Input = {
  configuration?: InputMaybe<Scalars['jsonb']['input']>;
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "itap.devices" */
export enum Itap_Devices_Select_Column {
  /** column name */
  AreaId = 'area_id',
  /** column name */
  Configuration = 'configuration',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Credentials = 'credentials',
  /** column name */
  DeviceType = 'device_type',
  /** column name */
  Fps = 'fps',
  /** column name */
  HealthStatus = 'health_status',
  /** column name */
  Id = 'id',
  /** column name */
  LastSeen = 'last_seen',
  /** column name */
  Name = 'name',
  /** column name */
  RecognitionEnabled = 'recognition_enabled',
  /** column name */
  RecognitionFps = 'recognition_fps',
  /** column name */
  Resolution = 'resolution',
  /** column name */
  Status = 'status',
  /** column name */
  StreamUrl = 'stream_url',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** select "itap_devices_aggregate_bool_exp_bool_and_arguments_columns" columns of table "itap.devices" */
export enum Itap_Devices_Select_Column_Itap_Devices_Aggregate_Bool_Exp_Bool_And_Arguments_Columns {
  /** column name */
  RecognitionEnabled = 'recognition_enabled'
}

/** select "itap_devices_aggregate_bool_exp_bool_or_arguments_columns" columns of table "itap.devices" */
export enum Itap_Devices_Select_Column_Itap_Devices_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns {
  /** column name */
  RecognitionEnabled = 'recognition_enabled'
}

/** input type for updating data in table "itap.devices" */
export type Itap_Devices_Set_Input = {
  area_id?: InputMaybe<Scalars['uuid']['input']>;
  configuration?: InputMaybe<Scalars['jsonb']['input']>;
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
  device_type?: InputMaybe<Scalars['String']['input']>;
  fps?: InputMaybe<Scalars['Int']['input']>;
  health_status?: InputMaybe<Scalars['String']['input']>;
  last_seen?: InputMaybe<Scalars['timestamptz']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  recognition_enabled?: InputMaybe<Scalars['Boolean']['input']>;
  recognition_fps?: InputMaybe<Scalars['Int']['input']>;
  resolution?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  stream_url?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate stddev on columns */
export type Itap_Devices_Stddev_Fields = {
  __typename?: 'itap_devices_stddev_fields';
  fps?: Maybe<Scalars['Float']['output']>;
  recognition_fps?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "itap.devices" */
export type Itap_Devices_Stddev_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Itap_Devices_Stddev_Pop_Fields = {
  __typename?: 'itap_devices_stddev_pop_fields';
  fps?: Maybe<Scalars['Float']['output']>;
  recognition_fps?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "itap.devices" */
export type Itap_Devices_Stddev_Pop_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Itap_Devices_Stddev_Samp_Fields = {
  __typename?: 'itap_devices_stddev_samp_fields';
  fps?: Maybe<Scalars['Float']['output']>;
  recognition_fps?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "itap.devices" */
export type Itap_Devices_Stddev_Samp_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "itap_devices" */
export type Itap_Devices_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Devices_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Devices_Stream_Cursor_Value_Input = {
  area_id?: InputMaybe<Scalars['uuid']['input']>;
  configuration?: InputMaybe<Scalars['jsonb']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
  device_type?: InputMaybe<Scalars['String']['input']>;
  fps?: InputMaybe<Scalars['Int']['input']>;
  health_status?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  last_seen?: InputMaybe<Scalars['timestamptz']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  recognition_enabled?: InputMaybe<Scalars['Boolean']['input']>;
  recognition_fps?: InputMaybe<Scalars['Int']['input']>;
  resolution?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  stream_url?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate sum on columns */
export type Itap_Devices_Sum_Fields = {
  __typename?: 'itap_devices_sum_fields';
  fps?: Maybe<Scalars['Int']['output']>;
  recognition_fps?: Maybe<Scalars['Int']['output']>;
};

/** order by sum() on columns of table "itap.devices" */
export type Itap_Devices_Sum_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** update columns of table "itap.devices" */
export enum Itap_Devices_Update_Column {
  /** column name */
  AreaId = 'area_id',
  /** column name */
  Configuration = 'configuration',
  /** column name */
  Credentials = 'credentials',
  /** column name */
  DeviceType = 'device_type',
  /** column name */
  Fps = 'fps',
  /** column name */
  HealthStatus = 'health_status',
  /** column name */
  LastSeen = 'last_seen',
  /** column name */
  Name = 'name',
  /** column name */
  RecognitionEnabled = 'recognition_enabled',
  /** column name */
  RecognitionFps = 'recognition_fps',
  /** column name */
  Resolution = 'resolution',
  /** column name */
  Status = 'status',
  /** column name */
  StreamUrl = 'stream_url'
}

export type Itap_Devices_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Itap_Devices_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Itap_Devices_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Itap_Devices_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Itap_Devices_Delete_Key_Input>;
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Itap_Devices_Inc_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Itap_Devices_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Itap_Devices_Set_Input>;
  /** filter the rows which have to be updated */
  where: Itap_Devices_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Itap_Devices_Var_Pop_Fields = {
  __typename?: 'itap_devices_var_pop_fields';
  fps?: Maybe<Scalars['Float']['output']>;
  recognition_fps?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "itap.devices" */
export type Itap_Devices_Var_Pop_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Itap_Devices_Var_Samp_Fields = {
  __typename?: 'itap_devices_var_samp_fields';
  fps?: Maybe<Scalars['Float']['output']>;
  recognition_fps?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "itap.devices" */
export type Itap_Devices_Var_Samp_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Itap_Devices_Variance_Fields = {
  __typename?: 'itap_devices_variance_fields';
  fps?: Maybe<Scalars['Float']['output']>;
  recognition_fps?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "itap.devices" */
export type Itap_Devices_Variance_Order_By = {
  fps?: InputMaybe<Order_By>;
  recognition_fps?: InputMaybe<Order_By>;
};

/** columns and relationships of "itap.facilities" */
export type Itap_Facilities = {
  __typename?: 'itap_facilities';
  address?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  areas: Array<Itap_Areas>;
  /** An aggregate relationship */
  areas_aggregate: Itap_Areas_Aggregate;
  created_at: Scalars['timestamptz']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  name: Scalars['String']['output'];
  status: Scalars['String']['output'];
  timezone: Scalars['String']['output'];
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "itap.facilities" */
export type Itap_FacilitiesAreasArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


/** columns and relationships of "itap.facilities" */
export type Itap_FacilitiesAreas_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};

/** aggregated selection of "itap.facilities" */
export type Itap_Facilities_Aggregate = {
  __typename?: 'itap_facilities_aggregate';
  aggregate?: Maybe<Itap_Facilities_Aggregate_Fields>;
  nodes: Array<Itap_Facilities>;
};

/** aggregate fields of "itap.facilities" */
export type Itap_Facilities_Aggregate_Fields = {
  __typename?: 'itap_facilities_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Facilities_Max_Fields>;
  min?: Maybe<Itap_Facilities_Min_Fields>;
};


/** aggregate fields of "itap.facilities" */
export type Itap_Facilities_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Facilities_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "itap.facilities". All fields are combined with a logical 'AND'. */
export type Itap_Facilities_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Facilities_Bool_Exp>>;
  _not?: InputMaybe<Itap_Facilities_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Facilities_Bool_Exp>>;
  address?: InputMaybe<String_Comparison_Exp>;
  areas?: InputMaybe<Itap_Areas_Bool_Exp>;
  areas_aggregate?: InputMaybe<Itap_Areas_Aggregate_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  status?: InputMaybe<String_Comparison_Exp>;
  timezone?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.facilities" */
export enum Itap_Facilities_Constraint {
  /** unique or primary key constraint on columns "id" */
  FacilitiesPkey = 'facilities_pkey'
}

/** input type for inserting data into table "itap.facilities" */
export type Itap_Facilities_Insert_Input = {
  address?: InputMaybe<Scalars['String']['input']>;
  areas?: InputMaybe<Itap_Areas_Arr_Rel_Insert_Input>;
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  timezone?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Itap_Facilities_Max_Fields = {
  __typename?: 'itap_facilities_max_fields';
  address?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  timezone?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** aggregate min on columns */
export type Itap_Facilities_Min_Fields = {
  __typename?: 'itap_facilities_min_fields';
  address?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  timezone?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** response of any mutation on the table "itap.facilities" */
export type Itap_Facilities_Mutation_Response = {
  __typename?: 'itap_facilities_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Facilities>;
};

/** input type for inserting object relation for remote table "itap.facilities" */
export type Itap_Facilities_Obj_Rel_Insert_Input = {
  data: Itap_Facilities_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Facilities_On_Conflict>;
};

/** on_conflict condition type for table "itap.facilities" */
export type Itap_Facilities_On_Conflict = {
  constraint: Itap_Facilities_Constraint;
  update_columns?: Array<Itap_Facilities_Update_Column>;
  where?: InputMaybe<Itap_Facilities_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.facilities". */
export type Itap_Facilities_Order_By = {
  address?: InputMaybe<Order_By>;
  areas_aggregate?: InputMaybe<Itap_Areas_Aggregate_Order_By>;
  created_at?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  timezone?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: itap.facilities */
export type Itap_Facilities_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "itap.facilities" */
export enum Itap_Facilities_Select_Column {
  /** column name */
  Address = 'address',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  Name = 'name',
  /** column name */
  Status = 'status',
  /** column name */
  Timezone = 'timezone',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "itap.facilities" */
export type Itap_Facilities_Set_Input = {
  address?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  timezone?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "itap_facilities" */
export type Itap_Facilities_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Facilities_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Facilities_Stream_Cursor_Value_Input = {
  address?: InputMaybe<Scalars['String']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  timezone?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** update columns of table "itap.facilities" */
export enum Itap_Facilities_Update_Column {
  /** column name */
  Address = 'address',
  /** column name */
  Description = 'description',
  /** column name */
  Name = 'name',
  /** column name */
  Status = 'status',
  /** column name */
  Timezone = 'timezone'
}

export type Itap_Facilities_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Itap_Facilities_Set_Input>;
  /** filter the rows which have to be updated */
  where: Itap_Facilities_Bool_Exp;
};

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

/** input type for inserting object relation for remote table "itap.identities" */
export type Itap_Identities_Obj_Rel_Insert_Input = {
  data: Itap_Identities_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Identities_On_Conflict>;
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

/** columns and relationships of "itap.segment_memberships" */
export type Itap_Segment_Memberships = {
  __typename?: 'itap_segment_memberships';
  created_at: Scalars['timestamptz']['output'];
  id: Scalars['uuid']['output'];
  /** An object relationship */
  identity: Itap_Identities;
  identity_id: Scalars['uuid']['output'];
  is_active: Scalars['Boolean']['output'];
  /** An object relationship */
  segment: Itap_Segments;
  segment_id: Scalars['uuid']['output'];
};

/** aggregated selection of "itap.segment_memberships" */
export type Itap_Segment_Memberships_Aggregate = {
  __typename?: 'itap_segment_memberships_aggregate';
  aggregate?: Maybe<Itap_Segment_Memberships_Aggregate_Fields>;
  nodes: Array<Itap_Segment_Memberships>;
};

export type Itap_Segment_Memberships_Aggregate_Bool_Exp = {
  bool_and?: InputMaybe<Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_And>;
  bool_or?: InputMaybe<Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_Or>;
  count?: InputMaybe<Itap_Segment_Memberships_Aggregate_Bool_Exp_Count>;
};

export type Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_And = {
  arguments: Itap_Segment_Memberships_Select_Column_Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Itap_Segment_Memberships_Select_Column_Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Itap_Segment_Memberships_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "itap.segment_memberships" */
export type Itap_Segment_Memberships_Aggregate_Fields = {
  __typename?: 'itap_segment_memberships_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Segment_Memberships_Max_Fields>;
  min?: Maybe<Itap_Segment_Memberships_Min_Fields>;
};


/** aggregate fields of "itap.segment_memberships" */
export type Itap_Segment_Memberships_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "itap.segment_memberships" */
export type Itap_Segment_Memberships_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Itap_Segment_Memberships_Max_Order_By>;
  min?: InputMaybe<Itap_Segment_Memberships_Min_Order_By>;
};

/** input type for inserting array relation for remote table "itap.segment_memberships" */
export type Itap_Segment_Memberships_Arr_Rel_Insert_Input = {
  data: Array<Itap_Segment_Memberships_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Segment_Memberships_On_Conflict>;
};

/** Boolean expression to filter rows from the table "itap.segment_memberships". All fields are combined with a logical 'AND'. */
export type Itap_Segment_Memberships_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Segment_Memberships_Bool_Exp>>;
  _not?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Segment_Memberships_Bool_Exp>>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  identity?: InputMaybe<Itap_Identities_Bool_Exp>;
  identity_id?: InputMaybe<Uuid_Comparison_Exp>;
  is_active?: InputMaybe<Boolean_Comparison_Exp>;
  segment?: InputMaybe<Itap_Segments_Bool_Exp>;
  segment_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.segment_memberships" */
export enum Itap_Segment_Memberships_Constraint {
  /** unique or primary key constraint on columns "id" */
  SegmentMembershipsPkey = 'segment_memberships_pkey',
  /** unique or primary key constraint on columns "segment_id", "identity_id" */
  SegmentMembershipsSegmentIdIdentityIdKey = 'segment_memberships_segment_id_identity_id_key'
}

/** input type for inserting data into table "itap.segment_memberships" */
export type Itap_Segment_Memberships_Insert_Input = {
  identity?: InputMaybe<Itap_Identities_Obj_Rel_Insert_Input>;
  identity_id?: InputMaybe<Scalars['uuid']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  segment?: InputMaybe<Itap_Segments_Obj_Rel_Insert_Input>;
  segment_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Itap_Segment_Memberships_Max_Fields = {
  __typename?: 'itap_segment_memberships_max_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  identity_id?: Maybe<Scalars['uuid']['output']>;
  segment_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "itap.segment_memberships" */
export type Itap_Segment_Memberships_Max_Order_By = {
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  identity_id?: InputMaybe<Order_By>;
  segment_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Itap_Segment_Memberships_Min_Fields = {
  __typename?: 'itap_segment_memberships_min_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  identity_id?: Maybe<Scalars['uuid']['output']>;
  segment_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "itap.segment_memberships" */
export type Itap_Segment_Memberships_Min_Order_By = {
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  identity_id?: InputMaybe<Order_By>;
  segment_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "itap.segment_memberships" */
export type Itap_Segment_Memberships_Mutation_Response = {
  __typename?: 'itap_segment_memberships_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Segment_Memberships>;
};

/** on_conflict condition type for table "itap.segment_memberships" */
export type Itap_Segment_Memberships_On_Conflict = {
  constraint: Itap_Segment_Memberships_Constraint;
  update_columns?: Array<Itap_Segment_Memberships_Update_Column>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.segment_memberships". */
export type Itap_Segment_Memberships_Order_By = {
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  identity?: InputMaybe<Itap_Identities_Order_By>;
  identity_id?: InputMaybe<Order_By>;
  is_active?: InputMaybe<Order_By>;
  segment?: InputMaybe<Itap_Segments_Order_By>;
  segment_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: itap.segment_memberships */
export type Itap_Segment_Memberships_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "itap.segment_memberships" */
export enum Itap_Segment_Memberships_Select_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  IdentityId = 'identity_id',
  /** column name */
  IsActive = 'is_active',
  /** column name */
  SegmentId = 'segment_id'
}

/** select "itap_segment_memberships_aggregate_bool_exp_bool_and_arguments_columns" columns of table "itap.segment_memberships" */
export enum Itap_Segment_Memberships_Select_Column_Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_And_Arguments_Columns {
  /** column name */
  IsActive = 'is_active'
}

/** select "itap_segment_memberships_aggregate_bool_exp_bool_or_arguments_columns" columns of table "itap.segment_memberships" */
export enum Itap_Segment_Memberships_Select_Column_Itap_Segment_Memberships_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns {
  /** column name */
  IsActive = 'is_active'
}

/** input type for updating data in table "itap.segment_memberships" */
export type Itap_Segment_Memberships_Set_Input = {
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Streaming cursor of the table "itap_segment_memberships" */
export type Itap_Segment_Memberships_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Segment_Memberships_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Segment_Memberships_Stream_Cursor_Value_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  identity_id?: InputMaybe<Scalars['uuid']['input']>;
  is_active?: InputMaybe<Scalars['Boolean']['input']>;
  segment_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "itap.segment_memberships" */
export enum Itap_Segment_Memberships_Update_Column {
  /** column name */
  IsActive = 'is_active'
}

export type Itap_Segment_Memberships_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Itap_Segment_Memberships_Set_Input>;
  /** filter the rows which have to be updated */
  where: Itap_Segment_Memberships_Bool_Exp;
};

/** columns and relationships of "itap.segments" */
export type Itap_Segments = {
  __typename?: 'itap_segments';
  color: Scalars['String']['output'];
  conditions: Scalars['jsonb']['output'];
  created_at: Scalars['timestamptz']['output'];
  description?: Maybe<Scalars['String']['output']>;
  icon?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  /** An array relationship */
  memberships: Array<Itap_Segment_Memberships>;
  /** An aggregate relationship */
  memberships_aggregate: Itap_Segment_Memberships_Aggregate;
  name: Scalars['String']['output'];
  segment_type: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "itap.segments" */
export type Itap_SegmentsConditionsArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};


/** columns and relationships of "itap.segments" */
export type Itap_SegmentsMembershipsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segment_Memberships_Order_By>>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};


/** columns and relationships of "itap.segments" */
export type Itap_SegmentsMemberships_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segment_Memberships_Order_By>>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};

/** aggregated selection of "itap.segments" */
export type Itap_Segments_Aggregate = {
  __typename?: 'itap_segments_aggregate';
  aggregate?: Maybe<Itap_Segments_Aggregate_Fields>;
  nodes: Array<Itap_Segments>;
};

/** aggregate fields of "itap.segments" */
export type Itap_Segments_Aggregate_Fields = {
  __typename?: 'itap_segments_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Itap_Segments_Max_Fields>;
  min?: Maybe<Itap_Segments_Min_Fields>;
};


/** aggregate fields of "itap.segments" */
export type Itap_Segments_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Itap_Segments_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Itap_Segments_Append_Input = {
  conditions?: InputMaybe<Scalars['jsonb']['input']>;
};

/** Boolean expression to filter rows from the table "itap.segments". All fields are combined with a logical 'AND'. */
export type Itap_Segments_Bool_Exp = {
  _and?: InputMaybe<Array<Itap_Segments_Bool_Exp>>;
  _not?: InputMaybe<Itap_Segments_Bool_Exp>;
  _or?: InputMaybe<Array<Itap_Segments_Bool_Exp>>;
  color?: InputMaybe<String_Comparison_Exp>;
  conditions?: InputMaybe<Jsonb_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  icon?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  memberships?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
  memberships_aggregate?: InputMaybe<Itap_Segment_Memberships_Aggregate_Bool_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  segment_type?: InputMaybe<String_Comparison_Exp>;
  status?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "itap.segments" */
export enum Itap_Segments_Constraint {
  /** unique or primary key constraint on columns "id" */
  SegmentsPkey = 'segments_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Itap_Segments_Delete_At_Path_Input = {
  conditions?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Itap_Segments_Delete_Elem_Input = {
  conditions?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Itap_Segments_Delete_Key_Input = {
  conditions?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "itap.segments" */
export type Itap_Segments_Insert_Input = {
  color?: InputMaybe<Scalars['String']['input']>;
  conditions?: InputMaybe<Scalars['jsonb']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  icon?: InputMaybe<Scalars['String']['input']>;
  memberships?: InputMaybe<Itap_Segment_Memberships_Arr_Rel_Insert_Input>;
  name?: InputMaybe<Scalars['String']['input']>;
  segment_type?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Itap_Segments_Max_Fields = {
  __typename?: 'itap_segments_max_fields';
  color?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  icon?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  segment_type?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** aggregate min on columns */
export type Itap_Segments_Min_Fields = {
  __typename?: 'itap_segments_min_fields';
  color?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  icon?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  segment_type?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** response of any mutation on the table "itap.segments" */
export type Itap_Segments_Mutation_Response = {
  __typename?: 'itap_segments_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Itap_Segments>;
};

/** input type for inserting object relation for remote table "itap.segments" */
export type Itap_Segments_Obj_Rel_Insert_Input = {
  data: Itap_Segments_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Itap_Segments_On_Conflict>;
};

/** on_conflict condition type for table "itap.segments" */
export type Itap_Segments_On_Conflict = {
  constraint: Itap_Segments_Constraint;
  update_columns?: Array<Itap_Segments_Update_Column>;
  where?: InputMaybe<Itap_Segments_Bool_Exp>;
};

/** Ordering options when selecting data from "itap.segments". */
export type Itap_Segments_Order_By = {
  color?: InputMaybe<Order_By>;
  conditions?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  icon?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  memberships_aggregate?: InputMaybe<Itap_Segment_Memberships_Aggregate_Order_By>;
  name?: InputMaybe<Order_By>;
  segment_type?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: itap.segments */
export type Itap_Segments_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Itap_Segments_Prepend_Input = {
  conditions?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "itap.segments" */
export enum Itap_Segments_Select_Column {
  /** column name */
  Color = 'color',
  /** column name */
  Conditions = 'conditions',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Description = 'description',
  /** column name */
  Icon = 'icon',
  /** column name */
  Id = 'id',
  /** column name */
  Name = 'name',
  /** column name */
  SegmentType = 'segment_type',
  /** column name */
  Status = 'status',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "itap.segments" */
export type Itap_Segments_Set_Input = {
  color?: InputMaybe<Scalars['String']['input']>;
  conditions?: InputMaybe<Scalars['jsonb']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  icon?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  segment_type?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "itap_segments" */
export type Itap_Segments_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Itap_Segments_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Itap_Segments_Stream_Cursor_Value_Input = {
  color?: InputMaybe<Scalars['String']['input']>;
  conditions?: InputMaybe<Scalars['jsonb']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  icon?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  segment_type?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** update columns of table "itap.segments" */
export enum Itap_Segments_Update_Column {
  /** column name */
  Color = 'color',
  /** column name */
  Conditions = 'conditions',
  /** column name */
  Description = 'description',
  /** column name */
  Icon = 'icon',
  /** column name */
  Name = 'name',
  /** column name */
  SegmentType = 'segment_type',
  /** column name */
  Status = 'status'
}

export type Itap_Segments_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Itap_Segments_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Itap_Segments_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Itap_Segments_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Itap_Segments_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Itap_Segments_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Itap_Segments_Set_Input>;
  /** filter the rows which have to be updated */
  where: Itap_Segments_Bool_Exp;
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
  /** delete data from the table: "itap.areas" */
  delete_itap_areas?: Maybe<Itap_Areas_Mutation_Response>;
  /** delete single row from the table: "itap.areas" */
  delete_itap_areas_by_pk?: Maybe<Itap_Areas>;
  /** delete data from the table: "itap.detections" */
  delete_itap_detections?: Maybe<Itap_Detections_Mutation_Response>;
  /** delete single row from the table: "itap.detections" */
  delete_itap_detections_by_pk?: Maybe<Itap_Detections>;
  /** delete data from the table: "itap.devices" */
  delete_itap_devices?: Maybe<Itap_Devices_Mutation_Response>;
  /** delete single row from the table: "itap.devices" */
  delete_itap_devices_by_pk?: Maybe<Itap_Devices>;
  /** delete data from the table: "itap.facilities" */
  delete_itap_facilities?: Maybe<Itap_Facilities_Mutation_Response>;
  /** delete single row from the table: "itap.facilities" */
  delete_itap_facilities_by_pk?: Maybe<Itap_Facilities>;
  /** delete data from the table: "itap.identities" */
  delete_itap_identities?: Maybe<Itap_Identities_Mutation_Response>;
  /** delete single row from the table: "itap.identities" */
  delete_itap_identities_by_pk?: Maybe<Itap_Identities>;
  /** delete data from the table: "itap.profiles" */
  delete_itap_profiles?: Maybe<Itap_Profiles_Mutation_Response>;
  /** delete single row from the table: "itap.profiles" */
  delete_itap_profiles_by_pk?: Maybe<Itap_Profiles>;
  /** delete data from the table: "itap.segment_memberships" */
  delete_itap_segment_memberships?: Maybe<Itap_Segment_Memberships_Mutation_Response>;
  /** delete single row from the table: "itap.segment_memberships" */
  delete_itap_segment_memberships_by_pk?: Maybe<Itap_Segment_Memberships>;
  /** delete data from the table: "itap.segments" */
  delete_itap_segments?: Maybe<Itap_Segments_Mutation_Response>;
  /** delete single row from the table: "itap.segments" */
  delete_itap_segments_by_pk?: Maybe<Itap_Segments>;
  /** insert data into the table: "itap.areas" */
  insert_itap_areas?: Maybe<Itap_Areas_Mutation_Response>;
  /** insert a single row into the table: "itap.areas" */
  insert_itap_areas_one?: Maybe<Itap_Areas>;
  /** insert data into the table: "itap.detections" */
  insert_itap_detections?: Maybe<Itap_Detections_Mutation_Response>;
  /** insert a single row into the table: "itap.detections" */
  insert_itap_detections_one?: Maybe<Itap_Detections>;
  /** insert data into the table: "itap.device_health_metrics" */
  insert_itap_device_health_metrics?: Maybe<Itap_Device_Health_Metrics_Mutation_Response>;
  /** insert a single row into the table: "itap.device_health_metrics" */
  insert_itap_device_health_metrics_one?: Maybe<Itap_Device_Health_Metrics>;
  /** insert data into the table: "itap.devices" */
  insert_itap_devices?: Maybe<Itap_Devices_Mutation_Response>;
  /** insert a single row into the table: "itap.devices" */
  insert_itap_devices_one?: Maybe<Itap_Devices>;
  /** insert data into the table: "itap.facilities" */
  insert_itap_facilities?: Maybe<Itap_Facilities_Mutation_Response>;
  /** insert a single row into the table: "itap.facilities" */
  insert_itap_facilities_one?: Maybe<Itap_Facilities>;
  /** insert data into the table: "itap.identities" */
  insert_itap_identities?: Maybe<Itap_Identities_Mutation_Response>;
  /** insert a single row into the table: "itap.identities" */
  insert_itap_identities_one?: Maybe<Itap_Identities>;
  /** insert data into the table: "itap.profiles" */
  insert_itap_profiles?: Maybe<Itap_Profiles_Mutation_Response>;
  /** insert a single row into the table: "itap.profiles" */
  insert_itap_profiles_one?: Maybe<Itap_Profiles>;
  /** insert data into the table: "itap.segment_memberships" */
  insert_itap_segment_memberships?: Maybe<Itap_Segment_Memberships_Mutation_Response>;
  /** insert a single row into the table: "itap.segment_memberships" */
  insert_itap_segment_memberships_one?: Maybe<Itap_Segment_Memberships>;
  /** insert data into the table: "itap.segments" */
  insert_itap_segments?: Maybe<Itap_Segments_Mutation_Response>;
  /** insert a single row into the table: "itap.segments" */
  insert_itap_segments_one?: Maybe<Itap_Segments>;
  /** update data of the table: "itap.areas" */
  update_itap_areas?: Maybe<Itap_Areas_Mutation_Response>;
  /** update single row of the table: "itap.areas" */
  update_itap_areas_by_pk?: Maybe<Itap_Areas>;
  /** update multiples rows of table: "itap.areas" */
  update_itap_areas_many?: Maybe<Array<Maybe<Itap_Areas_Mutation_Response>>>;
  /** update data of the table: "itap.devices" */
  update_itap_devices?: Maybe<Itap_Devices_Mutation_Response>;
  /** update single row of the table: "itap.devices" */
  update_itap_devices_by_pk?: Maybe<Itap_Devices>;
  /** update multiples rows of table: "itap.devices" */
  update_itap_devices_many?: Maybe<Array<Maybe<Itap_Devices_Mutation_Response>>>;
  /** update data of the table: "itap.facilities" */
  update_itap_facilities?: Maybe<Itap_Facilities_Mutation_Response>;
  /** update single row of the table: "itap.facilities" */
  update_itap_facilities_by_pk?: Maybe<Itap_Facilities>;
  /** update multiples rows of table: "itap.facilities" */
  update_itap_facilities_many?: Maybe<Array<Maybe<Itap_Facilities_Mutation_Response>>>;
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
  /** update data of the table: "itap.segment_memberships" */
  update_itap_segment_memberships?: Maybe<Itap_Segment_Memberships_Mutation_Response>;
  /** update single row of the table: "itap.segment_memberships" */
  update_itap_segment_memberships_by_pk?: Maybe<Itap_Segment_Memberships>;
  /** update multiples rows of table: "itap.segment_memberships" */
  update_itap_segment_memberships_many?: Maybe<Array<Maybe<Itap_Segment_Memberships_Mutation_Response>>>;
  /** update data of the table: "itap.segments" */
  update_itap_segments?: Maybe<Itap_Segments_Mutation_Response>;
  /** update single row of the table: "itap.segments" */
  update_itap_segments_by_pk?: Maybe<Itap_Segments>;
  /** update multiples rows of table: "itap.segments" */
  update_itap_segments_many?: Maybe<Array<Maybe<Itap_Segments_Mutation_Response>>>;
};


/** mutation root */
export type Mutation_RootDelete_Itap_AreasArgs = {
  where: Itap_Areas_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Areas_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Itap_DetectionsArgs = {
  where: Itap_Detections_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Detections_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Itap_DevicesArgs = {
  where: Itap_Devices_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Devices_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Itap_FacilitiesArgs = {
  where: Itap_Facilities_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Facilities_By_PkArgs = {
  id: Scalars['uuid']['input'];
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
export type Mutation_RootDelete_Itap_Segment_MembershipsArgs = {
  where: Itap_Segment_Memberships_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Segment_Memberships_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Itap_SegmentsArgs = {
  where: Itap_Segments_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Itap_Segments_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootInsert_Itap_AreasArgs = {
  objects: Array<Itap_Areas_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Areas_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Areas_OneArgs = {
  object: Itap_Areas_Insert_Input;
  on_conflict?: InputMaybe<Itap_Areas_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_DetectionsArgs = {
  objects: Array<Itap_Detections_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Detections_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Detections_OneArgs = {
  object: Itap_Detections_Insert_Input;
  on_conflict?: InputMaybe<Itap_Detections_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Device_Health_MetricsArgs = {
  objects: Array<Itap_Device_Health_Metrics_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Device_Health_Metrics_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Device_Health_Metrics_OneArgs = {
  object: Itap_Device_Health_Metrics_Insert_Input;
  on_conflict?: InputMaybe<Itap_Device_Health_Metrics_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_DevicesArgs = {
  objects: Array<Itap_Devices_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Devices_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Devices_OneArgs = {
  object: Itap_Devices_Insert_Input;
  on_conflict?: InputMaybe<Itap_Devices_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_FacilitiesArgs = {
  objects: Array<Itap_Facilities_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Facilities_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Facilities_OneArgs = {
  object: Itap_Facilities_Insert_Input;
  on_conflict?: InputMaybe<Itap_Facilities_On_Conflict>;
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
export type Mutation_RootInsert_Itap_Segment_MembershipsArgs = {
  objects: Array<Itap_Segment_Memberships_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Segment_Memberships_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Segment_Memberships_OneArgs = {
  object: Itap_Segment_Memberships_Insert_Input;
  on_conflict?: InputMaybe<Itap_Segment_Memberships_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_SegmentsArgs = {
  objects: Array<Itap_Segments_Insert_Input>;
  on_conflict?: InputMaybe<Itap_Segments_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Itap_Segments_OneArgs = {
  object: Itap_Segments_Insert_Input;
  on_conflict?: InputMaybe<Itap_Segments_On_Conflict>;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_AreasArgs = {
  _inc?: InputMaybe<Itap_Areas_Inc_Input>;
  _set?: InputMaybe<Itap_Areas_Set_Input>;
  where: Itap_Areas_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Areas_By_PkArgs = {
  _inc?: InputMaybe<Itap_Areas_Inc_Input>;
  _set?: InputMaybe<Itap_Areas_Set_Input>;
  pk_columns: Itap_Areas_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Areas_ManyArgs = {
  updates: Array<Itap_Areas_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_DevicesArgs = {
  _append?: InputMaybe<Itap_Devices_Append_Input>;
  _delete_at_path?: InputMaybe<Itap_Devices_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Itap_Devices_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Itap_Devices_Delete_Key_Input>;
  _inc?: InputMaybe<Itap_Devices_Inc_Input>;
  _prepend?: InputMaybe<Itap_Devices_Prepend_Input>;
  _set?: InputMaybe<Itap_Devices_Set_Input>;
  where: Itap_Devices_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Devices_By_PkArgs = {
  _append?: InputMaybe<Itap_Devices_Append_Input>;
  _delete_at_path?: InputMaybe<Itap_Devices_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Itap_Devices_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Itap_Devices_Delete_Key_Input>;
  _inc?: InputMaybe<Itap_Devices_Inc_Input>;
  _prepend?: InputMaybe<Itap_Devices_Prepend_Input>;
  _set?: InputMaybe<Itap_Devices_Set_Input>;
  pk_columns: Itap_Devices_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Devices_ManyArgs = {
  updates: Array<Itap_Devices_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_FacilitiesArgs = {
  _set?: InputMaybe<Itap_Facilities_Set_Input>;
  where: Itap_Facilities_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Facilities_By_PkArgs = {
  _set?: InputMaybe<Itap_Facilities_Set_Input>;
  pk_columns: Itap_Facilities_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Facilities_ManyArgs = {
  updates: Array<Itap_Facilities_Updates>;
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


/** mutation root */
export type Mutation_RootUpdate_Itap_Segment_MembershipsArgs = {
  _set?: InputMaybe<Itap_Segment_Memberships_Set_Input>;
  where: Itap_Segment_Memberships_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Segment_Memberships_By_PkArgs = {
  _set?: InputMaybe<Itap_Segment_Memberships_Set_Input>;
  pk_columns: Itap_Segment_Memberships_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Segment_Memberships_ManyArgs = {
  updates: Array<Itap_Segment_Memberships_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_SegmentsArgs = {
  _append?: InputMaybe<Itap_Segments_Append_Input>;
  _delete_at_path?: InputMaybe<Itap_Segments_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Itap_Segments_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Itap_Segments_Delete_Key_Input>;
  _prepend?: InputMaybe<Itap_Segments_Prepend_Input>;
  _set?: InputMaybe<Itap_Segments_Set_Input>;
  where: Itap_Segments_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Segments_By_PkArgs = {
  _append?: InputMaybe<Itap_Segments_Append_Input>;
  _delete_at_path?: InputMaybe<Itap_Segments_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Itap_Segments_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Itap_Segments_Delete_Key_Input>;
  _prepend?: InputMaybe<Itap_Segments_Prepend_Input>;
  _set?: InputMaybe<Itap_Segments_Set_Input>;
  pk_columns: Itap_Segments_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Itap_Segments_ManyArgs = {
  updates: Array<Itap_Segments_Updates>;
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
  /** fetch data from the table: "itap.areas" */
  itap_areas: Array<Itap_Areas>;
  /** fetch aggregated fields from the table: "itap.areas" */
  itap_areas_aggregate: Itap_Areas_Aggregate;
  /** fetch data from the table: "itap.areas" using primary key columns */
  itap_areas_by_pk?: Maybe<Itap_Areas>;
  /** fetch data from the table: "itap.detections" */
  itap_detections: Array<Itap_Detections>;
  /** fetch aggregated fields from the table: "itap.detections" */
  itap_detections_aggregate: Itap_Detections_Aggregate;
  /** fetch data from the table: "itap.detections" using primary key columns */
  itap_detections_by_pk?: Maybe<Itap_Detections>;
  /** fetch data from the table: "itap.device_health_metrics" */
  itap_device_health_metrics: Array<Itap_Device_Health_Metrics>;
  /** fetch aggregated fields from the table: "itap.device_health_metrics" */
  itap_device_health_metrics_aggregate: Itap_Device_Health_Metrics_Aggregate;
  /** fetch data from the table: "itap.device_health_metrics" using primary key columns */
  itap_device_health_metrics_by_pk?: Maybe<Itap_Device_Health_Metrics>;
  /** fetch data from the table: "itap.devices" */
  itap_devices: Array<Itap_Devices>;
  /** fetch aggregated fields from the table: "itap.devices" */
  itap_devices_aggregate: Itap_Devices_Aggregate;
  /** fetch data from the table: "itap.devices" using primary key columns */
  itap_devices_by_pk?: Maybe<Itap_Devices>;
  /** fetch data from the table: "itap.facilities" */
  itap_facilities: Array<Itap_Facilities>;
  /** fetch aggregated fields from the table: "itap.facilities" */
  itap_facilities_aggregate: Itap_Facilities_Aggregate;
  /** fetch data from the table: "itap.facilities" using primary key columns */
  itap_facilities_by_pk?: Maybe<Itap_Facilities>;
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
  /** fetch data from the table: "itap.segment_memberships" */
  itap_segment_memberships: Array<Itap_Segment_Memberships>;
  /** fetch aggregated fields from the table: "itap.segment_memberships" */
  itap_segment_memberships_aggregate: Itap_Segment_Memberships_Aggregate;
  /** fetch data from the table: "itap.segment_memberships" using primary key columns */
  itap_segment_memberships_by_pk?: Maybe<Itap_Segment_Memberships>;
  /** fetch data from the table: "itap.segments" */
  itap_segments: Array<Itap_Segments>;
  /** fetch aggregated fields from the table: "itap.segments" */
  itap_segments_aggregate: Itap_Segments_Aggregate;
  /** fetch data from the table: "itap.segments" using primary key columns */
  itap_segments_by_pk?: Maybe<Itap_Segments>;
};


export type Query_RootItap_AreasArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


export type Query_RootItap_Areas_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


export type Query_RootItap_Areas_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItap_DetectionsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Detections_Order_By>>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};


export type Query_RootItap_Detections_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Detections_Order_By>>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};


export type Query_RootItap_Detections_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItap_Device_Health_MetricsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Device_Health_Metrics_Order_By>>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};


export type Query_RootItap_Device_Health_Metrics_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Device_Health_Metrics_Order_By>>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};


export type Query_RootItap_Device_Health_Metrics_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItap_DevicesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Devices_Order_By>>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};


export type Query_RootItap_Devices_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Devices_Order_By>>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};


export type Query_RootItap_Devices_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItap_FacilitiesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Facilities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Facilities_Order_By>>;
  where?: InputMaybe<Itap_Facilities_Bool_Exp>;
};


export type Query_RootItap_Facilities_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Facilities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Facilities_Order_By>>;
  where?: InputMaybe<Itap_Facilities_Bool_Exp>;
};


export type Query_RootItap_Facilities_By_PkArgs = {
  id: Scalars['uuid']['input'];
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


export type Query_RootItap_Segment_MembershipsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segment_Memberships_Order_By>>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};


export type Query_RootItap_Segment_Memberships_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segment_Memberships_Order_By>>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};


export type Query_RootItap_Segment_Memberships_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItap_SegmentsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segments_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segments_Order_By>>;
  where?: InputMaybe<Itap_Segments_Bool_Exp>;
};


export type Query_RootItap_Segments_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segments_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segments_Order_By>>;
  where?: InputMaybe<Itap_Segments_Bool_Exp>;
};


export type Query_RootItap_Segments_By_PkArgs = {
  id: Scalars['uuid']['input'];
};

export type Subscription_Root = {
  __typename?: 'subscription_root';
  /** fetch data from the table: "itap.areas" */
  itap_areas: Array<Itap_Areas>;
  /** fetch aggregated fields from the table: "itap.areas" */
  itap_areas_aggregate: Itap_Areas_Aggregate;
  /** fetch data from the table: "itap.areas" using primary key columns */
  itap_areas_by_pk?: Maybe<Itap_Areas>;
  /** fetch data from the table in a streaming manner: "itap.areas" */
  itap_areas_stream: Array<Itap_Areas>;
  /** fetch data from the table: "itap.detections" */
  itap_detections: Array<Itap_Detections>;
  /** fetch aggregated fields from the table: "itap.detections" */
  itap_detections_aggregate: Itap_Detections_Aggregate;
  /** fetch data from the table: "itap.detections" using primary key columns */
  itap_detections_by_pk?: Maybe<Itap_Detections>;
  /** fetch data from the table in a streaming manner: "itap.detections" */
  itap_detections_stream: Array<Itap_Detections>;
  /** fetch data from the table: "itap.device_health_metrics" */
  itap_device_health_metrics: Array<Itap_Device_Health_Metrics>;
  /** fetch aggregated fields from the table: "itap.device_health_metrics" */
  itap_device_health_metrics_aggregate: Itap_Device_Health_Metrics_Aggregate;
  /** fetch data from the table: "itap.device_health_metrics" using primary key columns */
  itap_device_health_metrics_by_pk?: Maybe<Itap_Device_Health_Metrics>;
  /** fetch data from the table in a streaming manner: "itap.device_health_metrics" */
  itap_device_health_metrics_stream: Array<Itap_Device_Health_Metrics>;
  /** fetch data from the table: "itap.devices" */
  itap_devices: Array<Itap_Devices>;
  /** fetch aggregated fields from the table: "itap.devices" */
  itap_devices_aggregate: Itap_Devices_Aggregate;
  /** fetch data from the table: "itap.devices" using primary key columns */
  itap_devices_by_pk?: Maybe<Itap_Devices>;
  /** fetch data from the table in a streaming manner: "itap.devices" */
  itap_devices_stream: Array<Itap_Devices>;
  /** fetch data from the table: "itap.facilities" */
  itap_facilities: Array<Itap_Facilities>;
  /** fetch aggregated fields from the table: "itap.facilities" */
  itap_facilities_aggregate: Itap_Facilities_Aggregate;
  /** fetch data from the table: "itap.facilities" using primary key columns */
  itap_facilities_by_pk?: Maybe<Itap_Facilities>;
  /** fetch data from the table in a streaming manner: "itap.facilities" */
  itap_facilities_stream: Array<Itap_Facilities>;
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
  /** fetch data from the table: "itap.segment_memberships" */
  itap_segment_memberships: Array<Itap_Segment_Memberships>;
  /** fetch aggregated fields from the table: "itap.segment_memberships" */
  itap_segment_memberships_aggregate: Itap_Segment_Memberships_Aggregate;
  /** fetch data from the table: "itap.segment_memberships" using primary key columns */
  itap_segment_memberships_by_pk?: Maybe<Itap_Segment_Memberships>;
  /** fetch data from the table in a streaming manner: "itap.segment_memberships" */
  itap_segment_memberships_stream: Array<Itap_Segment_Memberships>;
  /** fetch data from the table: "itap.segments" */
  itap_segments: Array<Itap_Segments>;
  /** fetch aggregated fields from the table: "itap.segments" */
  itap_segments_aggregate: Itap_Segments_Aggregate;
  /** fetch data from the table: "itap.segments" using primary key columns */
  itap_segments_by_pk?: Maybe<Itap_Segments>;
  /** fetch data from the table in a streaming manner: "itap.segments" */
  itap_segments_stream: Array<Itap_Segments>;
};


export type Subscription_RootItap_AreasArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


export type Subscription_RootItap_Areas_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Areas_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


export type Subscription_RootItap_Areas_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Areas_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Areas_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
};


export type Subscription_RootItap_DetectionsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Detections_Order_By>>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};


export type Subscription_RootItap_Detections_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Detections_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Detections_Order_By>>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};


export type Subscription_RootItap_Detections_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Detections_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Detections_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Detections_Bool_Exp>;
};


export type Subscription_RootItap_Device_Health_MetricsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Device_Health_Metrics_Order_By>>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};


export type Subscription_RootItap_Device_Health_Metrics_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Device_Health_Metrics_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Device_Health_Metrics_Order_By>>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};


export type Subscription_RootItap_Device_Health_Metrics_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Device_Health_Metrics_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Device_Health_Metrics_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Device_Health_Metrics_Bool_Exp>;
};


export type Subscription_RootItap_DevicesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Devices_Order_By>>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};


export type Subscription_RootItap_Devices_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Devices_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Devices_Order_By>>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};


export type Subscription_RootItap_Devices_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Devices_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Devices_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
};


export type Subscription_RootItap_FacilitiesArgs = {
  distinct_on?: InputMaybe<Array<Itap_Facilities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Facilities_Order_By>>;
  where?: InputMaybe<Itap_Facilities_Bool_Exp>;
};


export type Subscription_RootItap_Facilities_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Facilities_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Facilities_Order_By>>;
  where?: InputMaybe<Itap_Facilities_Bool_Exp>;
};


export type Subscription_RootItap_Facilities_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Facilities_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Facilities_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Facilities_Bool_Exp>;
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


export type Subscription_RootItap_Segment_MembershipsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segment_Memberships_Order_By>>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};


export type Subscription_RootItap_Segment_Memberships_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segment_Memberships_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segment_Memberships_Order_By>>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};


export type Subscription_RootItap_Segment_Memberships_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Segment_Memberships_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Segment_Memberships_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Segment_Memberships_Bool_Exp>;
};


export type Subscription_RootItap_SegmentsArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segments_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segments_Order_By>>;
  where?: InputMaybe<Itap_Segments_Bool_Exp>;
};


export type Subscription_RootItap_Segments_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Itap_Segments_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Itap_Segments_Order_By>>;
  where?: InputMaybe<Itap_Segments_Bool_Exp>;
};


export type Subscription_RootItap_Segments_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItap_Segments_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Itap_Segments_Stream_Cursor_Input>>;
  where?: InputMaybe<Itap_Segments_Bool_Exp>;
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

export type DashboardMetricsQueryQueryVariables = Exact<{ [key: string]: never; }>;


export type DashboardMetricsQueryQuery = { __typename?: 'query_root', identities_total: { __typename?: 'itap_identities_aggregate', aggregate?: { __typename?: 'itap_identities_aggregate_fields', count: number } | null }, identities_verified: { __typename?: 'itap_identities_aggregate', aggregate?: { __typename?: 'itap_identities_aggregate_fields', count: number } | null }, identities_linked: { __typename?: 'itap_identities_aggregate', aggregate?: { __typename?: 'itap_identities_aggregate_fields', count: number } | null }, profiles_total: { __typename?: 'itap_profiles_aggregate', aggregate?: { __typename?: 'itap_profiles_aggregate_fields', count: number } | null }, facilities_total: { __typename?: 'itap_facilities_aggregate', aggregate?: { __typename?: 'itap_facilities_aggregate_fields', count: number } | null }, segments_total: { __typename?: 'itap_segments_aggregate', aggregate?: { __typename?: 'itap_segments_aggregate_fields', count: number } | null }, devices_total: { __typename?: 'itap_devices_aggregate', aggregate?: { __typename?: 'itap_devices_aggregate_fields', count: number } | null }, devices_online: { __typename?: 'itap_devices_aggregate', aggregate?: { __typename?: 'itap_devices_aggregate_fields', count: number } | null }, devices_error: { __typename?: 'itap_devices_aggregate', aggregate?: { __typename?: 'itap_devices_aggregate_fields', count: number } | null }, recent_identities: Array<{ __typename?: 'itap_identities', id: any, status: string, created_at: any, profile?: { __typename?: 'itap_profiles', first_name?: string | null, last_name?: string | null } | null }>, identity_timeline: Array<{ __typename?: 'itap_identities', created_at: any }> };

export type Itap_AreaFragment = { __typename?: 'itap_areas', id: any, created_at: any, updated_at: any, facility_id: any, parent_id?: any | null, name: string, description?: string | null, area_type: string, access_level: string, capacity?: number | null, status: string, facility: { __typename?: 'itap_facilities', id: any, name: string }, parent?: { __typename?: 'itap_areas', id: any, name: string } | null };

export type AreaListQueryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By> | Itap_Areas_Order_By>;
}>;


export type AreaListQueryQuery = { __typename?: 'query_root', itap_areas: Array<{ __typename?: 'itap_areas', id: any, created_at: any, updated_at: any, facility_id: any, parent_id?: any | null, name: string, description?: string | null, area_type: string, access_level: string, capacity?: number | null, status: string, facility: { __typename?: 'itap_facilities', id: any, name: string }, parent?: { __typename?: 'itap_areas', id: any, name: string } | null }>, itap_areas_aggregate: { __typename?: 'itap_areas_aggregate', aggregate?: { __typename?: 'itap_areas_aggregate_fields', count: number } | null } };

export type AreaOneQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type AreaOneQueryQuery = { __typename?: 'query_root', itap_areas_by_pk?: { __typename?: 'itap_areas', id: any, created_at: any, updated_at: any, facility_id: any, parent_id?: any | null, name: string, description?: string | null, area_type: string, access_level: string, capacity?: number | null, status: string, facility: { __typename?: 'itap_facilities', id: any, name: string }, parent?: { __typename?: 'itap_areas', id: any, name: string } | null } | null };

export type AreaInsertOneMutationMutationVariables = Exact<{
  object: Itap_Areas_Insert_Input;
}>;


export type AreaInsertOneMutationMutation = { __typename?: 'mutation_root', insert_itap_areas_one?: { __typename?: 'itap_areas', id: any, created_at: any, updated_at: any, facility_id: any, parent_id?: any | null, name: string, description?: string | null, area_type: string, access_level: string, capacity?: number | null, status: string, facility: { __typename?: 'itap_facilities', id: any, name: string }, parent?: { __typename?: 'itap_areas', id: any, name: string } | null } | null };

export type AreaUpdateOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  object: Itap_Areas_Set_Input;
}>;


export type AreaUpdateOneMutationMutation = { __typename?: 'mutation_root', update_itap_areas_by_pk?: { __typename?: 'itap_areas', id: any, created_at: any, updated_at: any, facility_id: any, parent_id?: any | null, name: string, description?: string | null, area_type: string, access_level: string, capacity?: number | null, status: string, facility: { __typename?: 'itap_facilities', id: any, name: string }, parent?: { __typename?: 'itap_areas', id: any, name: string } | null } | null };

export type AreaDeleteOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type AreaDeleteOneMutationMutation = { __typename?: 'mutation_root', delete_itap_areas_by_pk?: { __typename?: 'itap_areas', id: any, created_at: any, updated_at: any, facility_id: any, parent_id?: any | null, name: string, description?: string | null, area_type: string, access_level: string, capacity?: number | null, status: string, facility: { __typename?: 'itap_facilities', id: any, name: string }, parent?: { __typename?: 'itap_areas', id: any, name: string } | null } | null };

export type AreasByFacilityQueryQueryVariables = Exact<{
  where?: InputMaybe<Itap_Areas_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Areas_Order_By> | Itap_Areas_Order_By>;
}>;


export type AreasByFacilityQueryQuery = { __typename?: 'query_root', itap_areas: Array<{ __typename?: 'itap_areas', id: any, name: string, parent_id?: any | null, area_type: string }>, itap_areas_aggregate: { __typename?: 'itap_areas_aggregate', aggregate?: { __typename?: 'itap_areas_aggregate_fields', count: number } | null } };

export type Itap_DeviceFragment = { __typename?: 'itap_devices', id: any, created_at: any, updated_at: any, name: string, device_type: string, area_id?: any | null, stream_url?: string | null, resolution?: string | null, fps?: number | null, status: string, health_status: string, last_seen?: any | null, configuration?: any | null, recognition_enabled: boolean, recognition_fps: number, area?: { __typename?: 'itap_areas', id: any, name: string, facility: { __typename?: 'itap_facilities', id: any, name: string } } | null };

export type DeviceListQueryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Itap_Devices_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Devices_Order_By> | Itap_Devices_Order_By>;
}>;


export type DeviceListQueryQuery = { __typename?: 'query_root', itap_devices: Array<{ __typename?: 'itap_devices', id: any, created_at: any, updated_at: any, name: string, device_type: string, area_id?: any | null, stream_url?: string | null, resolution?: string | null, fps?: number | null, status: string, health_status: string, last_seen?: any | null, configuration?: any | null, recognition_enabled: boolean, recognition_fps: number, area?: { __typename?: 'itap_areas', id: any, name: string, facility: { __typename?: 'itap_facilities', id: any, name: string } } | null }>, itap_devices_aggregate: { __typename?: 'itap_devices_aggregate', aggregate?: { __typename?: 'itap_devices_aggregate_fields', count: number } | null } };

export type DeviceOneQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type DeviceOneQueryQuery = { __typename?: 'query_root', itap_devices_by_pk?: { __typename?: 'itap_devices', credentials?: any | null, id: any, created_at: any, updated_at: any, name: string, device_type: string, area_id?: any | null, stream_url?: string | null, resolution?: string | null, fps?: number | null, status: string, health_status: string, last_seen?: any | null, configuration?: any | null, recognition_enabled: boolean, recognition_fps: number, health_metrics: Array<{ __typename?: 'itap_device_health_metrics', id: any, timestamp: any, cpu_usage?: number | null, memory_usage?: number | null, disk_usage?: number | null, network_latency?: number | null, frame_rate?: number | null, error_count?: number | null }>, area?: { __typename?: 'itap_areas', id: any, name: string, facility: { __typename?: 'itap_facilities', id: any, name: string } } | null } | null };

export type DeviceInsertOneMutationMutationVariables = Exact<{
  object: Itap_Devices_Insert_Input;
}>;


export type DeviceInsertOneMutationMutation = { __typename?: 'mutation_root', insert_itap_devices_one?: { __typename?: 'itap_devices', id: any, created_at: any, updated_at: any, name: string, device_type: string, area_id?: any | null, stream_url?: string | null, resolution?: string | null, fps?: number | null, status: string, health_status: string, last_seen?: any | null, configuration?: any | null, recognition_enabled: boolean, recognition_fps: number, area?: { __typename?: 'itap_areas', id: any, name: string, facility: { __typename?: 'itap_facilities', id: any, name: string } } | null } | null };

export type DeviceUpdateOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  object: Itap_Devices_Set_Input;
}>;


export type DeviceUpdateOneMutationMutation = { __typename?: 'mutation_root', update_itap_devices_by_pk?: { __typename?: 'itap_devices', id: any, created_at: any, updated_at: any, name: string, device_type: string, area_id?: any | null, stream_url?: string | null, resolution?: string | null, fps?: number | null, status: string, health_status: string, last_seen?: any | null, configuration?: any | null, recognition_enabled: boolean, recognition_fps: number, area?: { __typename?: 'itap_areas', id: any, name: string, facility: { __typename?: 'itap_facilities', id: any, name: string } } | null } | null };

export type DeviceDeleteOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type DeviceDeleteOneMutationMutation = { __typename?: 'mutation_root', delete_itap_devices_by_pk?: { __typename?: 'itap_devices', id: any, created_at: any, updated_at: any, name: string, device_type: string, area_id?: any | null, stream_url?: string | null, resolution?: string | null, fps?: number | null, status: string, health_status: string, last_seen?: any | null, configuration?: any | null, recognition_enabled: boolean, recognition_fps: number, area?: { __typename?: 'itap_areas', id: any, name: string, facility: { __typename?: 'itap_facilities', id: any, name: string } } | null } | null };

export type DeviceDetectionsQueryQueryVariables = Exact<{
  device_id: Scalars['uuid']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type DeviceDetectionsQueryQuery = { __typename?: 'query_root', itap_detections: Array<{ __typename?: 'itap_detections', id: any, created_at: any, confidence: number, similarity?: number | null, is_new_identity: boolean, bbox?: any | null, thumbnail?: string | null, identity?: { __typename?: 'itap_identities', id: any, status: string, attributes: any } | null }>, itap_detections_aggregate: { __typename?: 'itap_detections_aggregate', aggregate?: { __typename?: 'itap_detections_aggregate_fields', count: number } | null } };

export type AreasWithFacilityQueryQueryVariables = Exact<{ [key: string]: never; }>;


export type AreasWithFacilityQueryQuery = { __typename?: 'query_root', itap_areas: Array<{ __typename?: 'itap_areas', id: any, name: string, facility: { __typename?: 'itap_facilities', id: any, name: string } }>, itap_areas_aggregate: { __typename?: 'itap_areas_aggregate', aggregate?: { __typename?: 'itap_areas_aggregate_fields', count: number } | null } };

export type Itap_FacilityFragment = { __typename?: 'itap_facilities', id: any, created_at: any, updated_at: any, name: string, description?: string | null, address?: string | null, timezone: string, status: string };

export type FacilityListQueryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Itap_Facilities_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Facilities_Order_By> | Itap_Facilities_Order_By>;
}>;


export type FacilityListQueryQuery = { __typename?: 'query_root', itap_facilities: Array<{ __typename?: 'itap_facilities', id: any, created_at: any, updated_at: any, name: string, description?: string | null, address?: string | null, timezone: string, status: string }>, itap_facilities_aggregate: { __typename?: 'itap_facilities_aggregate', aggregate?: { __typename?: 'itap_facilities_aggregate_fields', count: number } | null } };

export type FacilityOneQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type FacilityOneQueryQuery = { __typename?: 'query_root', itap_facilities_by_pk?: { __typename?: 'itap_facilities', id: any, created_at: any, updated_at: any, name: string, description?: string | null, address?: string | null, timezone: string, status: string } | null };

export type FacilityWithAreasQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type FacilityWithAreasQueryQuery = { __typename?: 'query_root', itap_facilities_by_pk?: { __typename?: 'itap_facilities', id: any, created_at: any, updated_at: any, name: string, description?: string | null, address?: string | null, timezone: string, status: string, areas: Array<{ __typename?: 'itap_areas', id: any, name: string, area_type: string, access_level: string, parent_id?: any | null, status: string, capacity?: number | null }> } | null };

export type FacilityInsertOneMutationMutationVariables = Exact<{
  object: Itap_Facilities_Insert_Input;
}>;


export type FacilityInsertOneMutationMutation = { __typename?: 'mutation_root', insert_itap_facilities_one?: { __typename?: 'itap_facilities', id: any, created_at: any, updated_at: any, name: string, description?: string | null, address?: string | null, timezone: string, status: string } | null };

export type FacilityUpdateOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  object: Itap_Facilities_Set_Input;
}>;


export type FacilityUpdateOneMutationMutation = { __typename?: 'mutation_root', update_itap_facilities_by_pk?: { __typename?: 'itap_facilities', id: any, created_at: any, updated_at: any, name: string, description?: string | null, address?: string | null, timezone: string, status: string } | null };

export type FacilityDeleteOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type FacilityDeleteOneMutationMutation = { __typename?: 'mutation_root', delete_itap_facilities_by_pk?: { __typename?: 'itap_facilities', id: any, created_at: any, updated_at: any, name: string, description?: string | null, address?: string | null, timezone: string, status: string } | null };

export type AllFacilitiesQueryQueryVariables = Exact<{ [key: string]: never; }>;


export type AllFacilitiesQueryQuery = { __typename?: 'query_root', itap_facilities: Array<{ __typename?: 'itap_facilities', id: any, name: string }>, itap_facilities_aggregate: { __typename?: 'itap_facilities_aggregate', aggregate?: { __typename?: 'itap_facilities_aggregate_fields', count: number } | null } };

export type Itap_IdentityFragment = { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any, profile?: { __typename?: 'itap_profiles', id: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null };

export type IdentityListQueryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Identities_Order_By> | Itap_Identities_Order_By>;
}>;


export type IdentityListQueryQuery = { __typename?: 'query_root', itap_identities: Array<{ __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any, profile?: { __typename?: 'itap_profiles', id: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null }>, itap_identities_aggregate: { __typename?: 'itap_identities_aggregate', aggregate?: { __typename?: 'itap_identities_aggregate_fields', count: number } | null } };

export type IdentityOneQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type IdentityOneQueryQuery = { __typename?: 'query_root', itap_identities_by_pk?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any, profile?: { __typename?: 'itap_profiles', id: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null } | null };

export type IdentityInsertOneMutationMutationVariables = Exact<{
  object: Itap_Identities_Insert_Input;
}>;


export type IdentityInsertOneMutationMutation = { __typename?: 'mutation_root', insert_itap_identities_one?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any, profile?: { __typename?: 'itap_profiles', id: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null } | null };

export type IdentityUpdateOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  object: Itap_Identities_Set_Input;
}>;


export type IdentityUpdateOneMutationMutation = { __typename?: 'mutation_root', update_itap_identities_by_pk?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any, profile?: { __typename?: 'itap_profiles', id: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null } | null };

export type IdentityDeleteOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type IdentityDeleteOneMutationMutation = { __typename?: 'mutation_root', delete_itap_identities_by_pk?: { __typename?: 'itap_identities', attributes: any, created_at: any, embedding?: any | null, id: any, images: Array<string>, status: string, profile_id?: any | null, updated_at: any, profile?: { __typename?: 'itap_profiles', id: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null } | null };

export type Itap_ProfileFragment = { __typename?: 'itap_profiles', id: any, created_at: any, updated_at: any, first_name?: string | null, last_name?: string | null, email?: string | null };

export type ProfileListQueryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Itap_Profiles_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Profiles_Order_By> | Itap_Profiles_Order_By>;
}>;


export type ProfileListQueryQuery = { __typename?: 'query_root', itap_profiles: Array<{ __typename?: 'itap_profiles', id: any, created_at: any, updated_at: any, first_name?: string | null, last_name?: string | null, email?: string | null }>, itap_profiles_aggregate: { __typename?: 'itap_profiles_aggregate', aggregate?: { __typename?: 'itap_profiles_aggregate_fields', count: number } | null } };

export type ProfileOneQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type ProfileOneQueryQuery = { __typename?: 'query_root', itap_profiles_by_pk?: { __typename?: 'itap_profiles', id: any, created_at: any, updated_at: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null };

export type ProfileInsertOneMutationMutationVariables = Exact<{
  object: Itap_Profiles_Insert_Input;
}>;


export type ProfileInsertOneMutationMutation = { __typename?: 'mutation_root', insert_itap_profiles_one?: { __typename?: 'itap_profiles', id: any, created_at: any, updated_at: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null };

export type ProfileUpdateOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  object: Itap_Profiles_Set_Input;
}>;


export type ProfileUpdateOneMutationMutation = { __typename?: 'mutation_root', update_itap_profiles_by_pk?: { __typename?: 'itap_profiles', id: any, created_at: any, updated_at: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null };

export type ProfileDeleteOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type ProfileDeleteOneMutationMutation = { __typename?: 'mutation_root', delete_itap_profiles_by_pk?: { __typename?: 'itap_profiles', id: any, created_at: any, updated_at: any, first_name?: string | null, last_name?: string | null, email?: string | null } | null };

export type Itap_SegmentFragment = { __typename?: 'itap_segments', id: any, created_at: any, updated_at: any, name: string, description?: string | null, color: string, icon?: string | null, segment_type: string, conditions: any, status: string };

export type SegmentListQueryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<Itap_Segments_Bool_Exp>;
  order_by?: InputMaybe<Array<Itap_Segments_Order_By> | Itap_Segments_Order_By>;
}>;


export type SegmentListQueryQuery = { __typename?: 'query_root', itap_segments: Array<{ __typename?: 'itap_segments', id: any, created_at: any, updated_at: any, name: string, description?: string | null, color: string, icon?: string | null, segment_type: string, conditions: any, status: string, memberships_aggregate: { __typename?: 'itap_segment_memberships_aggregate', aggregate?: { __typename?: 'itap_segment_memberships_aggregate_fields', count: number } | null } }>, itap_segments_aggregate: { __typename?: 'itap_segments_aggregate', aggregate?: { __typename?: 'itap_segments_aggregate_fields', count: number } | null } };

export type SegmentOneQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type SegmentOneQueryQuery = { __typename?: 'query_root', itap_segments_by_pk?: { __typename?: 'itap_segments', id: any, created_at: any, updated_at: any, name: string, description?: string | null, color: string, icon?: string | null, segment_type: string, conditions: any, status: string } | null };

export type SegmentWithMembersQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type SegmentWithMembersQueryQuery = { __typename?: 'query_root', itap_segments_by_pk?: { __typename?: 'itap_segments', id: any, created_at: any, updated_at: any, name: string, description?: string | null, color: string, icon?: string | null, segment_type: string, conditions: any, status: string, memberships: Array<{ __typename?: 'itap_segment_memberships', id: any, created_at: any, identity: { __typename?: 'itap_identities', id: any, status: string, images: Array<string>, profile?: { __typename?: 'itap_profiles', first_name?: string | null, last_name?: string | null } | null } }>, memberships_aggregate: { __typename?: 'itap_segment_memberships_aggregate', aggregate?: { __typename?: 'itap_segment_memberships_aggregate_fields', count: number } | null } } | null };

export type SegmentInsertOneMutationMutationVariables = Exact<{
  object: Itap_Segments_Insert_Input;
}>;


export type SegmentInsertOneMutationMutation = { __typename?: 'mutation_root', insert_itap_segments_one?: { __typename?: 'itap_segments', id: any, created_at: any, updated_at: any, name: string, description?: string | null, color: string, icon?: string | null, segment_type: string, conditions: any, status: string } | null };

export type SegmentUpdateOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  object: Itap_Segments_Set_Input;
}>;


export type SegmentUpdateOneMutationMutation = { __typename?: 'mutation_root', update_itap_segments_by_pk?: { __typename?: 'itap_segments', id: any, created_at: any, updated_at: any, name: string, description?: string | null, color: string, icon?: string | null, segment_type: string, conditions: any, status: string } | null };

export type SegmentDeleteOneMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type SegmentDeleteOneMutationMutation = { __typename?: 'mutation_root', delete_itap_segments_by_pk?: { __typename?: 'itap_segments', id: any, created_at: any, updated_at: any, name: string, description?: string | null, color: string, icon?: string | null, segment_type: string, conditions: any, status: string } | null };

export type SegmentAddMembersMutationMutationVariables = Exact<{
  objects: Array<Itap_Segment_Memberships_Insert_Input> | Itap_Segment_Memberships_Insert_Input;
}>;


export type SegmentAddMembersMutationMutation = { __typename?: 'mutation_root', insert_itap_segment_memberships?: { __typename?: 'itap_segment_memberships_mutation_response', affected_rows: number } | null };

export type SegmentRemoveMemberMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type SegmentRemoveMemberMutationMutation = { __typename?: 'mutation_root', delete_itap_segment_memberships_by_pk?: { __typename?: 'itap_segment_memberships', id: any } | null };

export type SegmentPreviewCountQueryQueryVariables = Exact<{
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
}>;


export type SegmentPreviewCountQueryQuery = { __typename?: 'query_root', itap_identities_aggregate: { __typename?: 'itap_identities_aggregate', aggregate?: { __typename?: 'itap_identities_aggregate_fields', count: number } | null } };

export type SegmentMatchingIdentitiesQueryQueryVariables = Exact<{
  where?: InputMaybe<Itap_Identities_Bool_Exp>;
}>;


export type SegmentMatchingIdentitiesQueryQuery = { __typename?: 'query_root', itap_identities: Array<{ __typename?: 'itap_identities', id: any }> };

export const Itap_AreaFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_area"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"facility_id"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}},{"kind":"Field","name":{"kind":"Name","value":"access_level"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<Itap_AreaFragment, unknown>;
export const Itap_DeviceFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_device"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"device_type"}},{"kind":"Field","name":{"kind":"Name","value":"area_id"}},{"kind":"Field","name":{"kind":"Name","value":"stream_url"}},{"kind":"Field","name":{"kind":"Name","value":"resolution"}},{"kind":"Field","name":{"kind":"Name","value":"fps"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"health_status"}},{"kind":"Field","name":{"kind":"Name","value":"last_seen"}},{"kind":"Field","name":{"kind":"Name","value":"configuration"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_enabled"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_fps"}},{"kind":"Field","name":{"kind":"Name","value":"area"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<Itap_DeviceFragment, unknown>;
export const Itap_FacilityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_facility"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"timezone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<Itap_FacilityFragment, unknown>;
export const Itap_IdentityFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<Itap_IdentityFragment, unknown>;
export const Itap_ProfileFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_profile"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]} as unknown as DocumentNode<Itap_ProfileFragment, unknown>;
export const Itap_SegmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_segment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"segment_type"}},{"kind":"Field","name":{"kind":"Name","value":"conditions"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<Itap_SegmentFragment, unknown>;
export const DashboardMetricsQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"DashboardMetricsQuery"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","alias":{"kind":"Name","value":"identities_total"},"name":{"kind":"Name","value":"itap_identities_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"identities_verified"},"name":{"kind":"Name","value":"itap_identities_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"status"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"verified","block":false}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"identities_linked"},"name":{"kind":"Name","value":"itap_identities_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"profile_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_is_null"},"value":{"kind":"BooleanValue","value":false}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"profiles_total"},"name":{"kind":"Name","value":"itap_profiles_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"facilities_total"},"name":{"kind":"Name","value":"itap_facilities_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"segments_total"},"name":{"kind":"Name","value":"itap_segments_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"devices_total"},"name":{"kind":"Name","value":"itap_devices_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"devices_online"},"name":{"kind":"Name","value":"itap_devices_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"status"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"active","block":false}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"health_status"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_in"},"value":{"kind":"ListValue","values":[{"kind":"StringValue","value":"healthy","block":false},{"kind":"StringValue","value":"warning","block":false}]}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"devices_error"},"name":{"kind":"Name","value":"itap_devices_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_or"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"status"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"error","block":false}}]}}]},{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"status"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"StringValue","value":"inactive","block":false}}]}}]}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"recent_identities"},"name":{"kind":"Name","value":"itap_identities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}}]}}]}},{"kind":"Field","alias":{"kind":"Name","value":"identity_timeline"},"name":{"kind":"Name","value":"itap_identities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"asc"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"365"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"created_at"}}]}}]}}]} as unknown as DocumentNode<DashboardMetricsQueryQuery, DashboardMetricsQueryQueryVariables>;
export const AreaListQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AreaListQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_areas"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_area"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_areas_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_area"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"facility_id"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}},{"kind":"Field","name":{"kind":"Name","value":"access_level"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AreaListQueryQuery, AreaListQueryQueryVariables>;
export const AreaOneQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AreaOneQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_areas_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_area"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_area"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"facility_id"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}},{"kind":"Field","name":{"kind":"Name","value":"access_level"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AreaOneQueryQuery, AreaOneQueryQueryVariables>;
export const AreaInsertOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AreaInsertOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_areas_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_area"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_area"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"facility_id"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}},{"kind":"Field","name":{"kind":"Name","value":"access_level"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AreaInsertOneMutationMutation, AreaInsertOneMutationMutationVariables>;
export const AreaUpdateOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AreaUpdateOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_itap_areas_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_area"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_area"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"facility_id"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}},{"kind":"Field","name":{"kind":"Name","value":"access_level"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AreaUpdateOneMutationMutation, AreaUpdateOneMutationMutationVariables>;
export const AreaDeleteOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AreaDeleteOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_areas_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_area"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_area"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"facility_id"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}},{"kind":"Field","name":{"kind":"Name","value":"access_level"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<AreaDeleteOneMutationMutation, AreaDeleteOneMutationMutationVariables>;
export const AreasByFacilityQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AreasByFacilityQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_areas_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_areas"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_areas_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}}]} as unknown as DocumentNode<AreasByFacilityQueryQuery, AreasByFacilityQueryQueryVariables>;
export const DeviceListQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"DeviceListQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_devices"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_device"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_devices_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_device"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"device_type"}},{"kind":"Field","name":{"kind":"Name","value":"area_id"}},{"kind":"Field","name":{"kind":"Name","value":"stream_url"}},{"kind":"Field","name":{"kind":"Name","value":"resolution"}},{"kind":"Field","name":{"kind":"Name","value":"fps"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"health_status"}},{"kind":"Field","name":{"kind":"Name","value":"last_seen"}},{"kind":"Field","name":{"kind":"Name","value":"configuration"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_enabled"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_fps"}},{"kind":"Field","name":{"kind":"Name","value":"area"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<DeviceListQueryQuery, DeviceListQueryQueryVariables>;
export const DeviceOneQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"DeviceOneQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_devices_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_device"}},{"kind":"Field","name":{"kind":"Name","value":"credentials"}},{"kind":"Field","name":{"kind":"Name","value":"health_metrics"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"20"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"timestamp"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"cpu_usage"}},{"kind":"Field","name":{"kind":"Name","value":"memory_usage"}},{"kind":"Field","name":{"kind":"Name","value":"disk_usage"}},{"kind":"Field","name":{"kind":"Name","value":"network_latency"}},{"kind":"Field","name":{"kind":"Name","value":"frame_rate"}},{"kind":"Field","name":{"kind":"Name","value":"error_count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_device"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"device_type"}},{"kind":"Field","name":{"kind":"Name","value":"area_id"}},{"kind":"Field","name":{"kind":"Name","value":"stream_url"}},{"kind":"Field","name":{"kind":"Name","value":"resolution"}},{"kind":"Field","name":{"kind":"Name","value":"fps"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"health_status"}},{"kind":"Field","name":{"kind":"Name","value":"last_seen"}},{"kind":"Field","name":{"kind":"Name","value":"configuration"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_enabled"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_fps"}},{"kind":"Field","name":{"kind":"Name","value":"area"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<DeviceOneQueryQuery, DeviceOneQueryQueryVariables>;
export const DeviceInsertOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeviceInsertOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_devices_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_device"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_device"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"device_type"}},{"kind":"Field","name":{"kind":"Name","value":"area_id"}},{"kind":"Field","name":{"kind":"Name","value":"stream_url"}},{"kind":"Field","name":{"kind":"Name","value":"resolution"}},{"kind":"Field","name":{"kind":"Name","value":"fps"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"health_status"}},{"kind":"Field","name":{"kind":"Name","value":"last_seen"}},{"kind":"Field","name":{"kind":"Name","value":"configuration"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_enabled"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_fps"}},{"kind":"Field","name":{"kind":"Name","value":"area"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<DeviceInsertOneMutationMutation, DeviceInsertOneMutationMutationVariables>;
export const DeviceUpdateOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeviceUpdateOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_itap_devices_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_device"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_device"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"device_type"}},{"kind":"Field","name":{"kind":"Name","value":"area_id"}},{"kind":"Field","name":{"kind":"Name","value":"stream_url"}},{"kind":"Field","name":{"kind":"Name","value":"resolution"}},{"kind":"Field","name":{"kind":"Name","value":"fps"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"health_status"}},{"kind":"Field","name":{"kind":"Name","value":"last_seen"}},{"kind":"Field","name":{"kind":"Name","value":"configuration"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_enabled"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_fps"}},{"kind":"Field","name":{"kind":"Name","value":"area"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<DeviceUpdateOneMutationMutation, DeviceUpdateOneMutationMutationVariables>;
export const DeviceDeleteOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeviceDeleteOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_devices_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_device"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_device"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_devices"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"device_type"}},{"kind":"Field","name":{"kind":"Name","value":"area_id"}},{"kind":"Field","name":{"kind":"Name","value":"stream_url"}},{"kind":"Field","name":{"kind":"Name","value":"resolution"}},{"kind":"Field","name":{"kind":"Name","value":"fps"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"health_status"}},{"kind":"Field","name":{"kind":"Name","value":"last_seen"}},{"kind":"Field","name":{"kind":"Name","value":"configuration"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_enabled"}},{"kind":"Field","name":{"kind":"Name","value":"recognition_fps"}},{"kind":"Field","name":{"kind":"Name","value":"area"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<DeviceDeleteOneMutationMutation, DeviceDeleteOneMutationMutationVariables>;
export const DeviceDetectionsQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"DeviceDetectionsQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"device_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"50"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_detections"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"device_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"device_id"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"confidence"}},{"kind":"Field","name":{"kind":"Name","value":"similarity"}},{"kind":"Field","name":{"kind":"Name","value":"is_new_identity"}},{"kind":"Field","name":{"kind":"Name","value":"bbox"}},{"kind":"Field","name":{"kind":"Name","value":"thumbnail"}},{"kind":"Field","name":{"kind":"Name","value":"identity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"attributes"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_detections_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"device_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"device_id"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}}]} as unknown as DocumentNode<DeviceDetectionsQueryQuery, DeviceDetectionsQueryQueryVariables>;
export const AreasWithFacilityQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AreasWithFacilityQuery"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_areas"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"asc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"facility"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_areas_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}}]} as unknown as DocumentNode<AreasWithFacilityQueryQuery, AreasWithFacilityQueryQueryVariables>;
export const FacilityListQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FacilityListQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_facilities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_facility"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_facilities_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_facility"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"timezone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<FacilityListQueryQuery, FacilityListQueryQueryVariables>;
export const FacilityOneQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FacilityOneQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_facilities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_facility"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_facility"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"timezone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<FacilityOneQueryQuery, FacilityOneQueryQueryVariables>;
export const FacilityWithAreasQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FacilityWithAreasQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_facilities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_facility"}},{"kind":"Field","name":{"kind":"Name","value":"areas"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"asc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"area_type"}},{"kind":"Field","name":{"kind":"Name","value":"access_level"}},{"kind":"Field","name":{"kind":"Name","value":"parent_id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_facility"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"timezone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<FacilityWithAreasQueryQuery, FacilityWithAreasQueryQueryVariables>;
export const FacilityInsertOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"FacilityInsertOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_facilities_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_facility"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_facility"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"timezone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<FacilityInsertOneMutationMutation, FacilityInsertOneMutationMutationVariables>;
export const FacilityUpdateOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"FacilityUpdateOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_itap_facilities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_facility"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_facility"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"timezone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<FacilityUpdateOneMutationMutation, FacilityUpdateOneMutationMutationVariables>;
export const FacilityDeleteOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"FacilityDeleteOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_facilities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_facility"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_facility"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_facilities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"timezone"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<FacilityDeleteOneMutationMutation, FacilityDeleteOneMutationMutationVariables>;
export const AllFacilitiesQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AllFacilitiesQuery"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_facilities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"name"},"value":{"kind":"EnumValue","value":"asc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_facilities_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}}]} as unknown as DocumentNode<AllFacilitiesQueryQuery, AllFacilitiesQueryQueryVariables>;
export const IdentityListQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IdentityListQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_identities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_identities_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<IdentityListQueryQuery, IdentityListQueryQueryVariables>;
export const IdentityOneQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"IdentityOneQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_identities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<IdentityOneQueryQuery, IdentityOneQueryQueryVariables>;
export const IdentityInsertOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"IdentityInsertOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_identities_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<IdentityInsertOneMutationMutation, IdentityInsertOneMutationMutationVariables>;
export const IdentityUpdateOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"IdentityUpdateOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_itap_identities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<IdentityUpdateOneMutationMutation, IdentityUpdateOneMutationMutationVariables>;
export const IdentityDeleteOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"IdentityDeleteOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_identities_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_identity"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_identity"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"attributes"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"embedding"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"profile_id"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<IdentityDeleteOneMutationMutation, IdentityDeleteOneMutationMutationVariables>;
export const ProfileListQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ProfileListQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_profiles"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_profile"}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_profiles_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_profile"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]} as unknown as DocumentNode<ProfileListQueryQuery, ProfileListQueryQueryVariables>;
export const ProfileOneQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ProfileOneQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_profiles_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_profile"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_profile"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]} as unknown as DocumentNode<ProfileOneQueryQuery, ProfileOneQueryQueryVariables>;
export const ProfileInsertOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ProfileInsertOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_profiles_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_profile"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_profile"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]} as unknown as DocumentNode<ProfileInsertOneMutationMutation, ProfileInsertOneMutationMutationVariables>;
export const ProfileUpdateOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ProfileUpdateOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_itap_profiles_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_profile"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_profile"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]} as unknown as DocumentNode<ProfileUpdateOneMutationMutation, ProfileUpdateOneMutationMutationVariables>;
export const ProfileDeleteOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ProfileDeleteOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_profiles_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_profile"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_profile"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_profiles"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]} as unknown as DocumentNode<ProfileDeleteOneMutationMutation, ProfileDeleteOneMutationMutationVariables>;
export const SegmentListQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SegmentListQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"10"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"0"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments_order_by"}}}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_segments"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_segment"}},{"kind":"Field","name":{"kind":"Name","value":"memberships_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"itap_segments_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"Variable","name":{"kind":"Name","value":"order_by"}}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_segment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"segment_type"}},{"kind":"Field","name":{"kind":"Name","value":"conditions"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<SegmentListQueryQuery, SegmentListQueryQueryVariables>;
export const SegmentOneQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SegmentOneQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_segments_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_segment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_segment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"segment_type"}},{"kind":"Field","name":{"kind":"Name","value":"conditions"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<SegmentOneQueryQuery, SegmentOneQueryQueryVariables>;
export const SegmentWithMembersQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SegmentWithMembersQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_segments_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_segment"}},{"kind":"Field","name":{"kind":"Name","value":"memberships"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is_active"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"100"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"identity"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"images"}},{"kind":"Field","name":{"kind":"Name","value":"profile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"first_name"}},{"kind":"Field","name":{"kind":"Name","value":"last_name"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"memberships_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"is_active"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"BooleanValue","value":true}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_segment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"segment_type"}},{"kind":"Field","name":{"kind":"Name","value":"conditions"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<SegmentWithMembersQueryQuery, SegmentWithMembersQueryQueryVariables>;
export const SegmentInsertOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SegmentInsertOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_segments_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_segment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_segment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"segment_type"}},{"kind":"Field","name":{"kind":"Name","value":"conditions"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<SegmentInsertOneMutationMutation, SegmentInsertOneMutationMutationVariables>;
export const SegmentUpdateOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SegmentUpdateOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_itap_segments_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_segment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_segment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"segment_type"}},{"kind":"Field","name":{"kind":"Name","value":"conditions"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<SegmentUpdateOneMutationMutation, SegmentUpdateOneMutationMutationVariables>;
export const SegmentDeleteOneMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SegmentDeleteOneMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_segments_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"itap_segment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"itap_segment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segments"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"updated_at"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"segment_type"}},{"kind":"Field","name":{"kind":"Name","value":"conditions"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]} as unknown as DocumentNode<SegmentDeleteOneMutationMutation, SegmentDeleteOneMutationMutationVariables>;
export const SegmentAddMembersMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SegmentAddMembersMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objects"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_segment_memberships_insert_input"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_itap_segment_memberships"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objects"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objects"}}},{"kind":"Argument","name":{"kind":"Name","value":"on_conflict"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"constraint"},"value":{"kind":"EnumValue","value":"segment_memberships_segment_id_identity_id_key"}},{"kind":"ObjectField","name":{"kind":"Name","value":"update_columns"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"is_active"}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affected_rows"}}]}}]}}]} as unknown as DocumentNode<SegmentAddMembersMutationMutation, SegmentAddMembersMutationMutationVariables>;
export const SegmentRemoveMemberMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SegmentRemoveMemberMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_itap_segment_memberships_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<SegmentRemoveMemberMutationMutation, SegmentRemoveMemberMutationMutationVariables>;
export const SegmentPreviewCountQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SegmentPreviewCountQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_identities_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}}]} as unknown as DocumentNode<SegmentPreviewCountQueryQuery, SegmentPreviewCountQueryQueryVariables>;
export const SegmentMatchingIdentitiesQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SegmentMatchingIdentitiesQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"itap_identities_bool_exp"}},"defaultValue":{"kind":"ObjectValue","fields":[]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itap_identities"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<SegmentMatchingIdentitiesQueryQuery, SegmentMatchingIdentitiesQueryQueryVariables>;