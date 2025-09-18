/**
 * Global setup for migration integration tests
 * Prepares test environment and shared resources
 */

const { performance } = require('perf_hooks');

module.exports = async () => {
  console.log('🔧 Setting up migration integration test environment...');
  
  const startTime = performance.now();

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.NOVITA_API_KEY = 'test-api-key-integration';
  process.env.MIGRATION_ENABLED = 'true';
  process.env.MIGRATION_INTERVAL_MINUTES = '1'; // Fast interval for testing
  process.env.MIGRATION_DRY_RUN = 'false';
  process.env.MIGRATION_MAX_CONCURRENT = '5';

  // Increase memory limit for large-scale tests
  if (!process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = '--max-old-space-size=2048';
  }

  // Configure test timeouts
  process.env.JEST_TIMEOUT = '60000';

  // Setup test database or external dependencies if needed
  // (Currently using in-memory implementations, so no external setup required)

  // Initialize test metrics
  global.__TEST_START_TIME__ = startTime;
  global.__TEST_METRICS__ = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    totalDuration: 0
  };

  const setupTime = performance.now() - startTime;
  console.log(`✅ Integration test environment ready (${setupTime.toFixed(2)}ms)`);
  console.log('');
};