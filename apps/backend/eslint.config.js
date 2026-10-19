import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Flat config (ESLint v9). Legacy TypeORM/recognition code (config, entities, routes,
// services, middleware, scripts) is linted with the recommended rules relaxed where the
// legacy code violates them; slice-1 code is linted strictly. TypeORM is removed in slice 2.
const legacy = [
  'src/index.ts',
  'src/config/database.ts',
  'src/entities/**',
  'src/routes/**',
  'src/scripts/**',
  'src/services/**',
  'src/middleware/**',
]

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: legacy,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
)
