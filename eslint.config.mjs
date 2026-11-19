import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'types/database.ts', 'lib/pdf/assets.generated.ts', 'supabase/**', 'test-results/**', 'playwright-report/**'],
  },
  {
    rules: {
      // Unused arguments named with a leading underscore are intentional (server action signatures).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
]

export default config
