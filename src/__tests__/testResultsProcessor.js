/**
 * Test results processor for migration integration tests
 * Provides enhanced reporting and metrics collection
 */

const fs = require('fs');
const path = require('path');

module.exports = (results) => {
  const {
    numTotalTests,
    numPassedTests,
    numFailedTests,
    numPendingTests,
    testResults,
    startTime,
    success
  } = results;

  // Calculate execution time
  const executionTime = Date.now() - startTime;

  // Process individual test results
  const processedResults = testResults.map(testResult => {
    const {
      testFilePath,
      numPassingTests,
      numFailingTests,
      numPendingTests,
      perfStats,
      testResults: individualTests
    } = testResult;

    return {
      file: path.basename(testFilePath),
      passed: numPassingTests,
      failed: numFailingTests,
      pending: numPendingTests,
      duration: perfStats.end - perfStats.start,
      tests: individualTests.map(test => ({
        title: test.fullName,
        status: test.status,
        duration: test.duration || 0,
        error: test.failureMessages.length > 0 ? test.failureMessages[0] : null
      }))
    };
  });

  // Generate summary report
  const report = {
    summary: {
      total: numTotalTests,
      passed: numPassedTests,
      failed: numFailedTests,
      pending: numPendingTests,
      success: success,
      executionTime: executionTime,
      successRate: numTotalTests > 0 ? (numPassedTests / numTotalTests * 100).toFixed(2) : 0
    },
    testFiles: processedResults,
    timestamp: new Date().toISOString()
  };

  // Write detailed report to file
  const reportDir = path.join(process.cwd(), 'coverage', 'integration');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, 'integration-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Generate human-readable summary
  const summaryPath = path.join(reportDir, 'integration-test-summary.txt');
  const summaryContent = generateSummaryText(report);
  fs.writeFileSync(summaryPath, summaryContent);

  // Console output
  console.log('\n📊 Integration Test Results Summary');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${numTotalTests}`);
  console.log(`Passed: ${numPassedTests} (${report.summary.successRate}%)`);
  console.log(`Failed: ${numFailedTests}`);
  console.log(`Pending: ${numPendingTests}`);
  console.log(`Execution Time: ${(executionTime / 1000).toFixed(2)}s`);
  console.log(`Status: ${success ? '✅ SUCCESS' : '❌ FAILURE'}`);

  if (numFailedTests > 0) {
    console.log('\n❌ Failed Tests:');
    processedResults.forEach(fileResult => {
      if (fileResult.failed > 0) {
        console.log(`  📁 ${fileResult.file}:`);
        fileResult.tests
          .filter(test => test.status === 'failed')
          .forEach(test => {
            console.log(`    ❌ ${test.title}`);
            if (test.error) {
              const errorLines = test.error.split('\n').slice(0, 3);
              errorLines.forEach(line => console.log(`       ${line}`));
            }
          });
      }
    });
  }

  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  console.log(`📄 Summary saved to: ${summaryPath}`);

  return results;
};

function generateSummaryText(report) {
  const { summary, testFiles } = report;
  
  let content = 'Migration Integration Test Summary\n';
  content += '='.repeat(50) + '\n\n';
  
  content += `Execution Date: ${report.timestamp}\n`;
  content += `Total Tests: ${summary.total}\n`;
  content += `Passed: ${summary.passed}\n`;
  content += `Failed: ${summary.failed}\n`;
  content += `Pending: ${summary.pending}\n`;
  content += `Success Rate: ${summary.successRate}%\n`;
  content += `Execution Time: ${(summary.executionTime / 1000).toFixed(2)}s\n`;
  content += `Overall Status: ${summary.success ? 'SUCCESS' : 'FAILURE'}\n\n`;

  content += 'Test File Results:\n';
  content += '-'.repeat(30) + '\n';
  
  testFiles.forEach(file => {
    content += `📁 ${file.file}\n`;
    content += `   Passed: ${file.passed}, Failed: ${file.failed}, Pending: ${file.pending}\n`;
    content += `   Duration: ${(file.duration / 1000).toFixed(2)}s\n`;
    
    if (file.failed > 0) {
      content += '   Failed Tests:\n';
      file.tests
        .filter(test => test.status === 'failed')
        .forEach(test => {
          content += `     ❌ ${test.title}\n`;
        });
    }
    content += '\n';
  });

  if (summary.failed > 0) {
    content += 'Recommendations:\n';
    content += '-'.repeat(20) + '\n';
    content += '• Review failed test output for specific error details\n';
    content += '• Check for timing issues or race conditions\n';
    content += '• Verify mock configurations and API responses\n';
    content += '• Consider increasing test timeouts if needed\n';
    content += '• Run individual test files for detailed debugging\n\n';
  }

  content += 'Test Coverage Areas:\n';
  content += '-'.repeat(25) + '\n';
  content += '✅ End-to-end migration workflow\n';
  content += '✅ Scheduler integration and lifecycle\n';
  content += '✅ Job queue integration\n';
  content += '✅ Instance status scenarios\n';
  content += '✅ API error handling and recovery\n';
  content += '✅ Performance and scalability\n';
  content += '✅ Concurrent processing\n';
  content += '✅ Memory usage optimization\n';
  content += '✅ Error metrics and monitoring\n';
  content += '✅ Circuit breaker patterns\n';
  content += '✅ Retry logic and backoff strategies\n';
  content += '✅ Health check integration\n';

  return content;
}