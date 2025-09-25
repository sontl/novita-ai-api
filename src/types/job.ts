/**
 * Job queue types and interfaces for asynchronous processing
 */

export enum JobType {
  CREATE_INSTANCE = 'create_instance',
  MONITOR_INSTANCE = 'monitor_instance',
  MONITOR_STARTUP = 'monitor_startup',
  SEND_WEBHOOK = 'send_webhook',
  MIGRATE_SPOT_INSTANCES = 'migrate_spot_instances',
  AUTO_STOP_CHECK = 'auto_stop_check',
  HANDLE_FAILED_MIGRATIONS = 'handle_failed_migrations'
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum JobPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

export interface Job {
  id: string;
  type: JobType;
  payload: any;
  status: JobStatus;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  nextRetryAt?: Date;
  error?: string;
}

export interface CreateInstanceJobPayload {
  instanceId: string;
  name: string;
  productName: string;
  templateId: string | number; // Support both string and number for template IDs
  gpuNum: number;
  rootfsSize: number;
  region: string;
  webhookUrl?: string;
}

export interface MonitorInstanceJobPayload {
  instanceId: string;
  novitaInstanceId: string;
  webhookUrl?: string;
  startTime: Date;
  maxWaitTime: number; // in milliseconds
  healthCheckConfig?: import('./api').HealthCheckConfig;
}

export interface SendWebhookJobPayload {
  url: string;
  payload: any;
  headers?: Record<string, string>;
}

export interface MigrateSpotInstancesJobPayload {
  scheduledAt: Date;
  jobId: string;
  config?: {
    dryRun?: boolean;
    maxMigrations?: number;
  };
}

export interface MigrationEligibilityResult {
  eligible: boolean;
  reason: string;
  instanceId: string;
  lastMigrationTime?: string | undefined;
  hoursSinceLastMigration?: number | undefined;
}

export interface MigrationAttempt {
  instanceId: string;
  instanceName: string;
  status: import('./api').InstanceStatus;
  eligibilityCheck: MigrationEligibilityResult;
  migrationResult?: {
    success: boolean;
    error?: string;
    responseTime: number;
  };
  processedAt: Date;
}

export interface MigrationJobResult {
  totalProcessed: number;
  migrated: number;
  skipped: number;
  errors: number;
  executionTimeMs: number;
}

export interface MigrationJobSummary {
  jobId: string;
  startedAt: Date;
  completedAt: Date;
  totalInstances: number;
  exitedInstances: number;
  eligibleInstances: number;
  migratedInstances: number;
  skippedInstances: number;
  errorCount: number;
  attempts: MigrationAttempt[];
}

export interface AutoStopCheckJobPayload {
  scheduledAt: Date;
  jobId: string;
  config?: {
    dryRun?: boolean;
    inactivityThresholdMinutes?: number; // defaults to 20 minutes
  };
}

export interface HandleFailedMigrationsJobPayload {
  scheduledAt: Date;
  jobId: string;
  config?: {
    dryRun?: boolean;
  };
}

export interface JobQueueStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  jobsByType: Record<JobType, number>;
}