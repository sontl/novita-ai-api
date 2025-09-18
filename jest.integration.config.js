/**
 * Jest configuration for migration integration tests
 * Optimized for integration testing with longer timeouts and specific test patterns
 */

module.exports = {
  // Extend base Jest configuration
  ...require('./jest.config.js'),

  // Test environment
  testEnvironment: 'node',

  // Test file patterns for integration tests
  testMatch: [
    '<rootDir>/src/__tests__/*integration*.test.ts',
    '<rootDir>/src/__tests__/migration*.integration.test.ts'
  ],

  // Longer timeouts for integration tests
  testTimeout: 60000, // 60 seconds

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/setup.ts'
  ],

  // Coverage configuration for integration tests
  collectCoverageFrom: [
    'src/services/instanceMigrationService.ts',
    'src/services/migrationScheduler.ts',
    'src/services/jobWorkerService.ts',
    'src/utils/migrationErrorHandler.ts',
    'src/utils/migrationMetrics.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**'
  ],

  // Coverage thresholds for integration tests
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    },
    './src/services/instanceMigrationService.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/services/migrationScheduler.ts': {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Reporters for detailed output
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './coverage/integration',
        outputName: 'integration-test-results.xml',
        suiteName: 'Migration Integration Tests'
      }
    ]
  ],

  // Module path mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/src/__tests__/$1'
  },

  // Global setup and teardown
  globalSetup: '<rootDir>/src/__tests__/globalSetup.js',
  globalTeardown: '<rootDir>/src/__tests__/globalTeardown.js',

  // Verbose output for integration tests
  verbose: true,

  // Detect open handles to prevent hanging tests
  detectOpenHandles: true,

  // Force exit after tests complete
  forceExit: true,

  // Maximum number of concurrent workers
  maxWorkers: 2, // Limit concurrency for integration tests

  // Retry failed tests
  retry: 1,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Test result processor
  testResultsProcessor: '<rootDir>/src/__tests__/testResultsProcessor.js'
};