import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    typecheck: { enabled: true, include: ['tests/**/*.test-d.ts'], tsconfig: 'tests/tsconfig.json' },
    coverage: { include: ['src/**'], reporter: ['text'] },
  },
});
