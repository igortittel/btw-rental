import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
  // tsconfig keeps JSX for Next.js; the email templates need it compiled here.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // `server-only` throws outside the Next.js server bundle; it is a no-op in tests.
      'server-only': path.resolve(__dirname, 'tests/unit/server-only-stub.ts'),
    },
  },
})
