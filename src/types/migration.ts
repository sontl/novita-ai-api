/**
 * Migration-specific error types and interfaces
 */

import { InstanceResponse } from './api';

/**
 * Migration error categories for different types of failures
 */
export enum MigrationErrorType {
  SCHEDULING = 'scheduling',
  API = 'api',
  ELIGIBILITY = 'eligibility',
  MIGRATION = 'migration',
  CONFIGURATION = 'configuration',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network'
}

/**
 * Migration error severity levels
 */
export enum MigrationErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Comprehensive migration error class with categorization and recovery strategies
 */
export class MigrationError extends Error {
  public readonly type: MigrationErrorType;
  public readonly severity: MigrationErrorSeverity;
  public readonly instanceId: string | undefined;
  public readonly originalError: Error | undefined;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly retryable: boolean;
  public readonly context: Record<string, any> | undefined;

  constructor(
    message: string,
    type: MigrationErrorType,
    options: {
      severity?: MigrationErrorSeverity;
      instanceId?: string;
      originalError?: Error;
      recoverable?: boolean;
      retryable?: boolean;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message);
    this.name = 'MigrationError';
    this.type = type;
    this.severity = options.severity || MigrationErrorSeverity.MEDIUM;
    this.instanceId = options.instanceId;
    this.originalError = options.originalError;
    this.timestamp = new Date();
    this.recoverable = options.recoverable ?? this.determineRecoverability(type);
    this.retryable = options.retryable ?? this.determineRetryability(type);
    this.context = options.context;
  }

  /**
   * Determine if an error type is generally recoverable
   */
  private determineRecoverability(type: MigrationErrorType): boolean {
    switch (type) {
      case MigrationErrorType.NETWORK:
      case MigrationErrorType.TIMEOUT:
      case MigrationErrorType.RATE_LIMIT:
      case MigrationErrorType.API:
        return true;
      case MigrationErrorType.CONFIGURATION:
      case MigrationErrorType.ELIGIBILITY:
        return false;
      case MigrationErrorType.SCHEDULING:
      case MigrationErrorType.MIGRATION:
        return true; // Depends on specific case, but generally retryable
      default:
        return false;
    }
  }

  /**
   * Determine if an error type is retryable
   */
  private determineRetryability(type: MigrationErrorType): boolean {
    switch (type) {
      case MigrationErrorType.NETWORK:
      case MigrationErrorType.TIMEOUT:
      case MigrationErrorType.RATE_LIMIT:
        return true;
      case MigrationErrorType.API:
      case MigrationErrorType.MIGRATION:
        return true; // May be retryable depending on specific error
      case MigrationErrorType.CONFIGURATION:
      case MigrationErrorType.ELIGIBILITY:
        return false;
      case MigrationErrorType.SCHEDULING:
        return true;
      default:
        return false;
    }
  }

  /**
   * Convert error to a serializable object for logging
   */
  toLogObject(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      instanceId: this.instanceId,
      recoverable: this.recoverable,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }
}

/**
 * Migration retry configuration
 */
export interface MigrationRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

/**
 * Migration metrics for monitoring and reporting
 */
export interface MigrationMetrics {
  // Execution metrics
  totalJobsExecuted: number;
  totalInstancesProcessed: number;
  totalMigrationsPerformed: number;
  totalMigrationsFailed: number;
  
  // Timing metrics
  averageJobExecutionTime: number;
  averageMigrationTime: number;
  lastExecutionTime: Date | undefined;
  nextScheduledExecution: Date | undefined;
  
  // Error metrics
  errorRate: number;
  errorsByType: Record<MigrationErrorType, number>;
  errorsBySeverity: Record<MigrationErrorSeverity, number>;
  recentErrors: MigrationError[];
  
  // Performance metrics
  instancesPerMinute: number;
  successRate: number;
  retryRate: number;
  
  // Status metrics
  currentStatus: 'idle' | 'running' | 'error' | 'disabled';
  uptime: number;
  lastHealthCheck: Date | undefined;
}

/**
 * Migration workflow step for detailed logging
 */
export interface MigrationWorkflowStep {
  step: string;
  instanceId?: string;
  startTime: Date;
  endTime?: Date;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  details?: Record<string, any>;
  error?: MigrationError;
}

/**
 * Detailed migration execution context for logging
 */
export interface MigrationExecutionContext {
  jobId: string;
  scheduledAt: Date;
  startedAt: Date;
  completedAt?: Date;
  totalInstances: number;
  processedInstances: number;
  steps: MigrationWorkflowStep[];
  errors: MigrationError[];
  metrics: {
    fetchTime: number;
    eligibilityCheckTime: number;
    migrationTime: number;
    totalTime: number;
  };
}

/**
 * Migration recovery strategy
 */
export interface MigrationRecoveryStrategy {
  errorType: MigrationErrorType;
  action: 'retry' | 'skip' | 'abort' | 'escalate';
  delayMs?: number;
  maxRetries?: number;
  condition?: (error: MigrationError, attempt: number) => boolean;
}

/**
 * Migration health status
 */
export interface MigrationHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
  lastExecution: Date | undefined;
  nextExecution: Date | undefined;
  recentErrors: number;
  errorRate: number;
  uptime: number;
  details: {
    schedulerRunning: boolean;
    lastSuccessfulExecution: Date | undefined;
    consecutiveFailures: number;
    avgExecutionTime: number;
  };
}

/**
 * Migration alert configuration
 */
export interface MigrationAlert {
  type: 'error_rate' | 'consecutive_failures' | 'execution_time' | 'service_down';
  threshold: number;
  windowMs: number;
  severity: MigrationErrorSeverity;
  message: string;
  triggered: boolean;
  lastTriggered: Date | undefined;
}