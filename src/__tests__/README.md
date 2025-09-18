# Migration Workflow Integration Tests

This directory contains comprehensive integration tests for the spot instance auto-migration system. These tests validate the complete migration workflow, including scheduler integration, error handling, performance characteristics, and various edge cases.

## Test Suites

### 1. Migration Workflow Integration (`migrationWorkflow.integration.test.ts`)
**Purpose**: End-to-end testing of the complete migration workflow

**Test Coverage**:
- ✅ Complete migration workflow from instance detection to migration execution
- ✅ Mixed success/failure scenarios
- ✅ API fetch failures and graceful degradation
- ✅ Instance eligibility checking with various status combinations
- ✅ Job worker integration and processing
- ✅ Metrics collection and reporting

**Key Test Cases**:
- Full workflow with 1000+ instances
- Mixed success/failure rates (50% error scenarios)
- API timeout and connection failures
- Various instance status combinations
- Concurrent batch processing

### 2. Migration Scheduler Integration (`migrationScheduler.integration.test.ts`)
**Purpose**: Testing scheduler lifecycle, timing, and job management

**Test Coverage**:
- ✅ Scheduler start/stop lifecycle
- ✅ Job scheduling at regular intervals
- ✅ Job deduplication to prevent overlaps
- ✅ Graceful shutdown with timeout handling
- ✅ Health monitoring and status reporting
- ✅ Manual execution capabilities
- ✅ Configuration handling (dry run, retry settings)

**Key Test Cases**:
- Multiple start/stop cycles
- Overlapping job prevention
- Shutdown timeout scenarios
- High-frequency scheduling
- Configuration validation

### 3. Migration Performance Integration (`migrationPerformance.integration.test.ts`)
**Purpose**: Performance testing and scalability validation

**Test Coverage**:
- ✅ Large-scale batch processing (1000+ instances)
- ✅ Concurrent migration operations
- ✅ Memory usage optimization
- ✅ API response time handling
- ✅ Resource usage under continuous load
- ✅ Performance regression detection

**Key Test Cases**:
- Processing 1000+ instances efficiently
- Concurrent batch execution
- Memory pressure testing
- Slow API response handling
- Sustained load testing
- Performance baseline validation

### 4. Migration Error Handling Integration (`migrationErrorHandling.integration.test.ts`)
**Purpose**: Comprehensive error handling and recovery testing

**Test Coverage**:
- ✅ Various API failure modes (503, 429, 404, timeouts)
- ✅ Retry logic with exponential backoff
- ✅ Circuit breaker patterns
- ✅ Partial failure scenarios
- ✅ Error metrics and monitoring
- ✅ Recovery strategies and jittered retries

**Key Test Cases**:
- Service unavailable (503) with retry
- Rate limiting (429) with backoff
- Not found (404) without retry
- Network timeouts and connection failures
- Mixed success/failure batches
- Circuit breaker activation and recovery

### 5. Migration Integration (Existing) (`migrationIntegration.test.ts`)
**Purpose**: Health check integration and service registry functionality

**Test Coverage**:
- ✅ Health check endpoint integration
- ✅ Service registry management
- ✅ Migration service status reporting

## Running the Tests

### Run All Integration Tests
```bash
npm run test:integration
```

### Run Migration-Specific Test Runner
```bash
npm run test:migration
```

### Run Specific Test Suite
```bash
npm run test:migration:suite "workflow"
npm run test:migration:suite "scheduler"
npm run test:migration:suite "performance"
npm run test:migration:suite "error"
```

### Run Individual Test Files
```bash
npx jest migrationWorkflow.integration.test.ts
npx jest migrationScheduler.integration.test.ts
npx jest migrationPerformance.integration.test.ts
npx jest migrationErrorHandling.integration.test.ts
```

### Watch Mode for Development
```bash
npm run test:integration:watch
```

## Test Configuration

### Jest Configuration (`jest.integration.config.js`)
- **Timeout**: 60 seconds per test
- **Environment**: Node.js
- **Coverage**: Focused on migration services
- **Reporters**: Default + JUnit XML
- **Workers**: Limited to 2 for stability

### Environment Variables
```bash
NODE_ENV=test
LOG_LEVEL=error
NOVITA_API_KEY=test-api-key-integration
MIGRATION_ENABLED=true
MIGRATION_INTERVAL_MINUTES=1
MIGRATION_DRY_RUN=false
MIGRATION_MAX_CONCURRENT=5
```

## Test Data and Fixtures

### Mock Instances
- **Reclaimed Spot Instances**: `spotStatus: 'reclaimed'`, `spotReclaimTime: '1704067200'`
- **Normal Exit Instances**: `spotStatus: ''`, `spotReclaimTime: '0'`
- **Running Instances**: `status: 'running'`
- **Failed Instances**: `status: 'failed'`

### Mock API Responses
- **Successful Migration**: `{ success: true, newInstanceId: 'migrated-xxx' }`
- **Failed Migration**: `{ success: false, error: 'Migration failed' }`
- **API Errors**: Various HTTP status codes (429, 503, 404, 500)

## Performance Benchmarks

### Expected Performance Metrics
- **Batch Processing**: < 10 seconds for 1000 instances
- **Migration Throughput**: > 30 migrations/second
- **Memory Usage**: < 5KB per instance
- **API Call Overhead**: < 100ms per call
- **Error Recovery**: < 5 seconds for transient failures

### Performance Test Results
Results are automatically generated and saved to:
- `coverage/integration/integration-test-report.json`
- `coverage/integration/integration-test-summary.txt`

## Debugging Failed Tests

### Common Issues and Solutions

1. **Timeout Errors**
   - Increase test timeout in Jest configuration
   - Check for infinite loops or hanging promises
   - Verify mock implementations don't cause delays

2. **Race Conditions**
   - Use `TestUtils.waitFor()` for async conditions
   - Add proper delays between operations
   - Ensure proper cleanup in afterEach hooks

3. **Memory Issues**
   - Check for memory leaks in long-running tests
   - Verify proper cleanup of timers and intervals
   - Monitor memory usage during large-scale tests

4. **Mock Configuration**
   - Verify mock implementations match expected behavior
   - Check mock call counts and arguments
   - Ensure mocks are reset between tests

### Debug Commands
```bash
# Run with verbose output
npx jest --config jest.integration.config.js --verbose

# Run specific test with debugging
npx jest --config jest.integration.config.js --testNamePattern="should handle large batches"

# Run with coverage
npx jest --config jest.integration.config.js --coverage

# Run with detectOpenHandles to find hanging resources
npx jest --config jest.integration.config.js --detectOpenHandles
```

## Test Reports and Metrics

### Generated Reports
- **JUnit XML**: `coverage/integration/integration-test-results.xml`
- **JSON Report**: `coverage/integration/integration-test-report.json`
- **Text Summary**: `coverage/integration/integration-test-summary.txt`
- **Coverage Report**: `coverage/integration/lcov-report/index.html`

### Metrics Tracked
- Test execution time and performance
- Memory usage during tests
- API call patterns and timing
- Error rates and recovery times
- Coverage percentages by service

## Requirements Validation

These integration tests validate the following requirements from the migration specification:

### Requirement 1.1-1.4 (Instance Detection)
- ✅ Fetch instances from Novita API
- ✅ Filter for exited instances
- ✅ Handle API failures gracefully
- ✅ Log decision rationale

### Requirement 2.1-2.5 (Eligibility Checking)
- ✅ Check spotStatus and spotReclaimTime
- ✅ Skip instances with empty spotStatus and spotReclaimTime "0"
- ✅ Mark instances eligible when spotReclaimTime != "0"
- ✅ Log eligibility decisions

### Requirement 3.1-3.5 (Migration Execution)
- ✅ Call Novita migrate API with correct parameters
- ✅ Handle successful and failed migrations
- ✅ Continue processing despite individual failures
- ✅ Log migration results

### Requirement 4.1-4.4 (Scheduling)
- ✅ Schedule jobs every 15 minutes
- ✅ Prevent overlapping executions
- ✅ Handle graceful shutdown
- ✅ Log execution details

### Requirement 5.1-5.6 (Error Handling and Logging)
- ✅ Comprehensive error logging
- ✅ Detailed instance processing logs
- ✅ Migration attempt logging
- ✅ Summary statistics
- ✅ Error handling without job termination

### Requirement 6.1-6.5 (Configuration)
- ✅ Configurable scheduling intervals
- ✅ Configurable timeouts
- ✅ Enable/disable functionality
- ✅ Configuration validation
- ✅ Configuration logging

## Continuous Integration

### CI/CD Integration
Add to your CI pipeline:
```yaml
- name: Run Integration Tests
  run: npm run test:integration
  
- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: integration-test-results
    path: coverage/integration/
```

### Quality Gates
- All integration tests must pass
- Coverage thresholds must be met
- Performance benchmarks must be satisfied
- No memory leaks detected

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Include comprehensive error scenarios
3. Add performance considerations for large-scale operations
4. Update this README with new test coverage
5. Ensure tests are deterministic and don't rely on external services
6. Add appropriate timeouts and cleanup procedures

## Troubleshooting

### Common Test Failures

1. **"Jest did not exit one second after the test run completed"**
   - Check for unclosed timers, intervals, or promises
   - Ensure proper cleanup in afterEach/afterAll hooks
   - Use `--detectOpenHandles` flag to identify issues

2. **"Timeout - Async callback was not invoked within the timeout"**
   - Increase test timeout in configuration
   - Check for infinite loops or hanging operations
   - Verify mock implementations complete properly

3. **"Cannot read property of undefined"**
   - Check mock configurations and return values
   - Verify test data setup and fixtures
   - Ensure proper async/await usage

### Getting Help

For issues with integration tests:
1. Check the test output and error messages
2. Review the generated test reports
3. Run individual test suites for isolation
4. Use debugging commands with verbose output
5. Check the migration service logs for additional context