import { CodegenConfig } from '@graphql-codegen/cli';
import 'dotenv/config';

const schema: CodegenConfig['schema'] = [];

if (process.env.CODEGEN_GQL_URL) {
  const schemaHeaders: Record<string, string> = {};

  if (process.env.CODEGEN_GQL_ADMIN_SECRET) {
    schemaHeaders['X-Hasura-Admin-Secret'] =
      process.env.CODEGEN_GQL_ADMIN_SECRET;
    schemaHeaders['X-Hasura-Role'] = 'staff';
  } else if (process.env.CODEGEN_GQL_AUTH_TOKEN) {
    schemaHeaders.Authorization = `Bearer ${process.env.CODEGEN_GQL_AUTH_TOKEN}`;
  }

  schema.push({
    [process.env.CODEGEN_GQL_URL]: {
      headers: schemaHeaders,
    },
  });
} else {
  schema.push('./graphql.schema.json');
}

const config: CodegenConfig = {
  schema,
  documents: ['./src/**/*.{ts,tsx}'],
  overwrite: true,
  generates: {
    './src/shared/api/hasura/@gql/': {
      preset: 'client',
      presetConfig: {
        gqlTagName: 'gql',
        fragmentMasking: false,
      },
      plugins: [],
    },
    './src/shared/api/hasura/graphql.schema.json': {
      plugins: ['introspection'],
    },
  },
  ignoreNoDocuments: true,
};

export default config;
