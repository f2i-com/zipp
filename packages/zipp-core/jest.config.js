/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        diagnostics: false,
      },
    ],
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/modules/__tests__/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    'modules/**/runtime.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Coverage thresholds - enforced minimums based on current test suite
  // Current coverage: ~30% statements, ~24% branches, ~37% functions, ~31% lines
  coverageThreshold: {
    global: {
      statements: 28,
      branches: 20,
      functions: 34,
      lines: 28,
    },
  },
};
