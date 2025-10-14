import type {
  DocumentTypeDecoration,
  TypedDocumentNode,
} from '@graphql-typed-document-node/core';

export type FragmentData<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends DocumentTypeDecoration<infer Value, any> ? Value : unknown;

export type QueryVariables<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends TypedDocumentNode<any, infer Value> ? Value : unknown;
