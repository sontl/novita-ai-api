/**
 * Job queue types and interfaces for asynchronous processing
 */

export enum JobType {
  CREATE_INSTANCE = 'create_instance',
  MONITOR_INSTANCE = 'monitor_instance',
  SEND_WEBHOOK = 'send_webhook'
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

export interface JobQueueStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  jobsByType: Record<JobType, number>;
}