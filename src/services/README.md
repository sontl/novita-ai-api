# Job Queue System

This directory contains the job queue system for asynchronous processing of GPU instance operations.

## Components

### JobQueueService (`jobQueueService.ts`)

An in-memory job queue service that provides:

- **Priority-based job scheduling** - Jobs are processed in priority order (CRITICAL > HIGH > NORMAL > LOW)
- **Retry mechanism** - Failed jobs are automatically retried with exponential backoff
- **Job status tracking** - Track jobs through PENDING → PROCESSING → COMPLETED/FAILED states
- **Background processing** - Continuous job processing with configurable intervals
- **Statistics and monitoring** - Real-time queue statistics and job metrics
- **Graceful shutdown** - Clean shutdown with job completion waiting

### JobWorkerService (`jobWorkerService.ts`)

Background worker service that handles job execution:

- **Job type handlers** - Separate handlers for CREATE_INSTANCE, MONITOR_INSTANCE, and SEND_WEBHOOK jobs
- **Error handling** - Comprehensive error handling with logging and retry logic
- **Webhook integration** - Automatic webhook notifications for job completion/failure
- **Lifecycle management** - Start, stop, and graceful shutdown capabilities

### Job Types (`../types/job.ts`)

Type definitions for:

- **Job interfaces** - Job, JobStatus, JobType, JobPriority enums
- **Payload types** - Specific payload interfaces for each job type
- **Queue statistics** - JobQueueStats interface for monitoring

## Usage

### Basic Setup

```typescript
import { JobQueueService } from './services/jobQueueService';
import { JobWorkerService } from './services/jobWorkerService';
import { JobType, JobPriority } from './types/job';

// Create queue and worker
const jobQueue = new JobQueueService();
const jobWorker = new JobWorkerService(jobQueue);

// Start processing
jobWorker.start();
```

### Adding Jobs

```typescript
// Create instance job
const createJobId = await jobQueue.addJob(JobType.CREATE_INSTANCE, {
  instanceId: 'my-instance',
  name: 'My GPU Instance',
  productName: 'RTX 4090 24GB',
  templateId: 'template-123',
  gpuNum: 2,
  rootfsSize: 100,
  region: 'CN-HK-01',
  webhookUrl: 'https://example.com/webhook'
}, JobPriority.HIGH);

// Monitor instance job
const monitorJobId = await jobQueue.addJob(JobType.MONITOR_INSTANCE, {
  instanceId: 'my-instance',
  novitaInstanceId: 'novita-abc123',
  startTime: new Date(),
  maxWaitTime: 600000, // 10 minutes
  webhookUrl: 'https://example.com/webhook'
});

// Send webhook job
const webhookJobId = await jobQueue.addJob(JobType.SEND_WEBHOOK, {
  url: 'https://example.com/status',
  payload: {
    instanceId: 'my-instance',
    status: 'running',
    timestamp: new Date().toISOString()
  }
});
```

### Monitoring Jobs

```typescript
// Get job status
const job = jobQueue.getJob(jobId);
console.log(`Job ${job.id} is ${job.status}`);

// Get queue statistics
const stats = jobQueue.getStats();
console.log(`Queue has ${stats.pendingJobs} pending jobs`);

// List jobs by type
const createJobs = jobQueue.getJobs({ 
  type: JobType.CREATE_INSTANCE,
  status: JobStatus.PENDING 
});
```

### Cleanup and Shutdown

```typescript
// Clean up old completed jobs (older than 24 hours)
const removedCount = jobQueue.cleanup(24 * 60 * 60 * 1000);

// Graceful shutdown
await jobWorker.shutdown(30000); // 30 second timeout
```

## Configuration

### JobQueueService Options

- `processingIntervalMs` - How often to check for new jobs (default: 1000ms)
- `maxRetryDelay` - Maximum delay between retries (default: 300000ms = 5 minutes)

### Job Options

- `maxAttempts` - Maximum retry attempts (default: 3)
- `priority` - Job priority level (default: NORMAL)

## Job Flow

1. **Job Creation** - Jobs are added to the queue with PENDING status
2. **Job Selection** - Highest priority pending jobs are selected for processing
3. **Job Execution** - Jobs are marked PROCESSING and executed by appropriate handlers
4. **Completion/Failure** - Jobs are marked COMPLETED or FAILED based on execution result
5. **Retry Logic** - Failed jobs are retried up to maxAttempts with exponential backoff
6. **Cleanup** - Old completed/failed jobs are periodically removed

## Error Handling

- **Network errors** - Automatic retry with exponential backoff
- **Validation errors** - Jobs fail immediately with descriptive error messages
- **Timeout errors** - Jobs fail after configured timeout periods
- **Handler errors** - Caught and logged with job marked as failed

## Testing

The job queue system includes comprehensive unit tests:

- `jobQueueService.test.ts` - Tests for queue operations, job management, and processing
- `jobWorkerService.test.ts` - Tests for job handlers and worker lifecycle
- `jobIntegration.test.ts` - End-to-end integration tests

Run tests with:
```bash
npm test -- --testPathPattern="job"
```

## Examples

See `../examples/jobQueueExample.ts` for a complete usage demonstration.