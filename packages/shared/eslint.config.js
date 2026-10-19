import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Shared types are legacy and use `any` widely; downgraded to a warning until the shared
// types are regenerated from the new schema.

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'warn' } },
)
