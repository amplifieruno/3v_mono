import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Flat config (ESLint v9): recommended rules for all backend code.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
