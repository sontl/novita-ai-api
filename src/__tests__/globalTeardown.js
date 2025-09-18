/**
 * Global teardown for migration integration tests
 * Cleans up test environment and reports final metrics
 */

const { performance } = require('perf_hooks');

module.exports = async () => {
  console.log('');
  console.log('🧹 Cleaning up migration integration test environment...');
  
  const startTime = performance.now();

  // Calculate total test execution time
  const totalTestTime = performance.now() - (global.__TEST_START_TIME__ || 0);

  // Clean up any remaining resources
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Clear any remaining timers or intervals
  // (Jest should handle this, but being explicit)

  // Report final metrics if available
  if (global.__TEST_METRICS__) {
    const metrics = global.__TEST_METRICS__;
    console.log('📊 Final Test Metrics:');
    console.log(`   Total execution time: ${(totalTestTime / 1000).toFixed(2)}s`);
    console.log(`   Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);
  }

  const teardownTime = performance.now() - startTime;
  console.log(`✅ Cleanup completed (${teardownTime.toFixed(2)}ms)`);
  console.log('');
};