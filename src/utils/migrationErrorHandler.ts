/**
 * Comprehensive error handling and recovery strategies for migration operations
 */

import { logger } from './logger';
import {
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity,
  MigrationRetryConfig,
  MigrationRecoveryStrategy,
  MigrationAlert
} from '../types/migration';
import { NovitaApiClientError, RateLimitError, CircuitBreakerError, TimeoutError } from '../types/api';

/**
 * Default retry configuration for migration operations
 */
export const DEFAULT_RETRY_CONFIG: MigrationRetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 500
};

/**
 * Migration error handler with retry logic and recovery strategies
 */
export class MigrationErrorHandler {
  private retryConfig: MigrationRetryConfig;
  private recoveryStrategies: Map<MigrationErrorType, MigrationRecoveryStrategy>;
  private alerts: MigrationAlert[];
  private errorHistory: MigrationError[];
  private readonly maxErrorHistory = 100;

  constructor(retryConfig: MigrationRetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
    this.recoveryStrategies = new Map();
    this.alerts = [];
    this.errorHistory = [];
    this.initializeRecoveryStrategies();
    this.initializeAlerts();
  }

  /**
   * Initialize default recovery strategies for different error types
   */
  private initializeRecoveryStrategies(): void {
    // Network errors - retry with exponential backoff
    this.recoveryStrategies.set(MigrationErrorType.NETWORK, {
      errorType: MigrationErrorType.NETWORK,
      action: 'retry',
      maxRetries: 3,
      delayMs: 2000
    });

    // API errors - retry with caution
    this.recoveryStrategies.set(MigrationErrorType.API, {
      errorType: MigrationErrorType.API,
      action: 'retry',
      maxRetries: 2,
      delayMs: 5000,
      condition: (error, attempt) => {
        // Don't retry 4xx errors except rate limits
        if (error.originalError instanceof NovitaApiClientError) {
          const statusCode = error.originalError.statusCode;
          return !statusCode || statusCode >= 500 || statusCode === 429;
        }
        return true;
      }
    });

    // Rate limit errors - retry with longer delay
    this.recoveryStrategies.set(MigrationErrorType.RATE_LIMIT, {
      errorType: MigrationErrorType.RATE_LIMIT,
      action: 'retry',
      maxRetries: 5,
      delayMs: 10000
    });

    // Timeout errors - retry with shorter timeout
    this.recoveryStrategies.set(MigrationErrorType.TIMEOUT, {
      errorType: MigrationErrorType.TIMEOUT,
      action: 'retry',
      maxRetries: 2,
      delayMs: 3000
    });

    // Configuration errors - don't retry, escalate
    this.recoveryStrategies.set(MigrationErrorType.CONFIGURATION, {
      errorType: MigrationErrorType.CONFIGURATION,
      action: 'escalate',
      maxRetries: 0
    });

    // Eligibility errors - skip instance
    this.recoveryStrategies.set(MigrationErrorType.ELIGIBILITY, {
      errorType: MigrationErrorType.ELIGIBILITY,
      action: 'skip',
      maxRetries: 0
    });

    // Migration errors - retry with caution
    this.recoveryStrategies.set(MigrationErrorType.MIGRATION, {
      errorType: MigrationErrorType.MIGRATION,
      action: 'retry',
      maxRetries: 2,
      delayMs: 5000
    });

    // Scheduling errors - retry
    this.recoveryStrategies.set(MigrationErrorType.SCHEDULING, {
      errorType: MigrationErrorType.SCHEDULING,
      action: 'retry',
      maxRetries: 3,
      delayMs: 1000
    });
  }

  /**
   * Initialize alert configurations
   */
  private initializeAlerts(): void {
    this.alerts = [
      {
        type: 'error_rate',
        threshold: 0.5, // 50% error rate
        windowMs: 15 * 60 * 1000, // 15 minutes
        severity: MigrationErrorSeverity.HIGH,
        message: 'Migration error rate exceeds 50% in the last 15 minutes',
        triggered: false,
        lastTriggered: undefined
      },
      {
        type: 'consecutive_failures',
        threshold: 3,
        windowMs: 0, // Not time-based
        severity: MigrationErrorSeverity.CRITICAL,
        message: 'Migration service has failed 3 consecutive times',
        triggered: false,
        lastTriggered: undefined
      },
      {
        type: 'execution_time',
        threshold: 10 * 60 * 1000, // 10 minutes
        windowMs: 0,
        severity: MigrationErrorSeverity.MEDIUM,
        message: 'Migration execution time exceeds 10 minutes',
        triggered: false,
        lastTriggered: undefined
      }
    ];
  }

  /**
   * Handle a migration error with appropriate recovery strategy
   */
  async handleError(error: MigrationError, attempt: number = 1): Promise<{
    shouldRetry: boolean;
    delayMs: number;
    action: string;
  }> {
    // Add to error history
    this.addToErrorHistory(error);

    // Log the error with full context
    this.logError(error, attempt);

    // Check alerts
    this.checkAlerts();

    // Get recovery strategy
    const strategy = this.getRecoveryStrategy(error);
    
    // Determine if we should retry
    const shouldRetry = this.shouldRetry(error, attempt, strategy);
    const delayMs = shouldRetry ? this.calculateRetryDelay(attempt, error.type) : 0;

    logger.info('Migration error handling decision', {
      errorType: error.type,
      severity: error.severity,
      instanceId: error.instanceId,
      attempt,
      shouldRetry,
      delayMs,
      action: strategy.action,
      recoverable: error.recoverable,
      retryable: error.retryable
    });

    return {
      shouldRetry,
      delayMs,
      action: strategy.action
    };
  }

  /**
   * Create a migration error from a generic error
   */
  createMigrationError(
    originalError: Error,
    instanceId?: string,
    context?: Record<string, any>
  ): MigrationError {
    let type: MigrationErrorType;
    let severity: MigrationErrorSeverity;
    let message: string;

    // Categorize the error
    if (originalError instanceof RateLimitError) {
      type = MigrationErrorType.RATE_LIMIT;
      severity = MigrationErrorSeverity.MEDIUM;
      message = `Rate limit exceeded: ${originalError.message}`;
    } else if (originalError instanceof CircuitBreakerError) {
      type = MigrationErrorType.API;
      severity = MigrationErrorSeverity.HIGH;
      message = `Circuit breaker open: ${originalError.message}`;
    } else if (originalError instanceof TimeoutError) {
      type = MigrationErrorType.TIMEOUT;
      severity = MigrationErrorSeverity.MEDIUM;
      message = `Request timeout: ${originalError.message}`;
    } else if (originalError instanceof NovitaApiClientError) {
      type = MigrationErrorType.API;
      severity = originalError.statusCode && originalError.statusCode >= 500 
        ? MigrationErrorSeverity.HIGH 
        : MigrationErrorSeverity.MEDIUM;
      message = `API error: ${originalError.message}`;
    } else if (originalError.message.includes('network') || originalError.message.includes('ECONNRESET')) {
      type = MigrationErrorType.NETWORK;
      severity = MigrationErrorSeverity.MEDIUM;
      message = `Network error: ${originalError.message}`;
    } else if (originalError.message.includes('config') || originalError.message.includes('invalid')) {
      type = MigrationErrorType.CONFIGURATION;
      severity = MigrationErrorSeverity.HIGH;
      message = `Configuration error: ${originalError.message}`;
    } else {
      type = MigrationErrorType.MIGRATION;
      severity = MigrationErrorSeverity.MEDIUM;
      message = `Migration error: ${originalError.message}`;
    }

    return new MigrationError(message, type, {
      severity,
      ...(instanceId && { instanceId }),
      originalError,
      ...(context && { context })
    });
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetry(error: MigrationError, attempt: number, strategy: MigrationRecoveryStrategy): boolean {
    // Check if error is retryable
    if (!error.retryable || strategy.action !== 'retry') {
      return false;
    }

    // Check max attempts
    if (attempt >= (strategy.maxRetries || this.retryConfig.maxAttempts)) {
      return false;
    }

    // Check custom condition
    if (strategy.condition && !strategy.condition(error, attempt)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  calculateRetryDelay(attempt: number, errorType: MigrationErrorType): number {
    const strategy = this.recoveryStrategies.get(errorType);
    const baseDelay = strategy?.delayMs || this.retryConfig.baseDelayMs;
    
    // Exponential backoff
    const exponentialDelay = baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    
    // Apply max delay limit
    const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * this.retryConfig.jitterMs;
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Get recovery strategy for an error type
   */
  private getRecoveryStrategy(error: MigrationError): MigrationRecoveryStrategy {
    return this.recoveryStrategies.get(error.type) || {
      errorType: error.type,
      action: 'skip',
      maxRetries: 0
    };
  }

  /**
   * Add error to history and maintain size limit
   */
  private addToErrorHistory(error: MigrationError): void {
    this.errorHistory.unshift(error);
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory = this.errorHistory.slice(0, this.maxErrorHistory);
    }
  }

  /**
   * Log error with comprehensive context
   */
  private logError(error: MigrationError, attempt: number): void {
    const logLevel = this.getLogLevel(error.severity);
    const logData = {
      ...error.toLogObject(),
      attempt,
      retryConfig: this.retryConfig
    };

    switch (logLevel) {
      case 'error':
        logger.error('Migration error occurred', logData);
        break;
      case 'warn':
        logger.warn('Migration warning', logData);
        break;
      case 'info':
        logger.info('Migration info', logData);
        break;
      default:
        logger.debug('Migration debug', logData);
    }
  }

  /**
   * Get appropriate log level for error severity
   */
  private getLogLevel(severity: MigrationErrorSeverity): string {
    switch (severity) {
      case MigrationErrorSeverity.CRITICAL:
      case MigrationErrorSeverity.HIGH:
        return 'error';
      case MigrationErrorSeverity.MEDIUM:
        return 'warn';
      case MigrationErrorSeverity.LOW:
        return 'info';
      default:
        return 'debug';
    }
  }

  /**
   * Check and trigger alerts based on error patterns
   */
  private checkAlerts(): void {
    const now = Date.now();

    for (const alert of this.alerts) {
      let shouldTrigger = false;

      switch (alert.type) {
        case 'error_rate':
          shouldTrigger = this.checkErrorRateAlert(alert, now);
          break;
        case 'consecutive_failures':
          shouldTrigger = this.checkConsecutiveFailuresAlert(alert);
          break;
        case 'execution_time':
          // This would be checked externally when execution completes
          break;
      }

      if (shouldTrigger && !alert.triggered) {
        this.triggerAlert(alert);
      } else if (!shouldTrigger && alert.triggered) {
        this.clearAlert(alert);
      }
    }
  }

  /**
   * Check error rate alert condition
   */
  private checkErrorRateAlert(alert: MigrationAlert, now: number): boolean {
    const windowStart = now - alert.windowMs;
    const recentErrors = this.errorHistory.filter(error => 
      error.timestamp.getTime() >= windowStart
    );

    if (recentErrors.length === 0) return false;

    // For simplicity, assume all recent errors indicate failed operations
    // In a real implementation, you'd compare against total operations
    const errorRate = recentErrors.length / Math.max(recentErrors.length, 10); // Assume at least 10 operations
    return errorRate >= alert.threshold;
  }

  /**
   * Check consecutive failures alert condition
   */
  private checkConsecutiveFailuresAlert(alert: MigrationAlert): boolean {
    if (this.errorHistory.length < alert.threshold) return false;

    // Check if the last N errors are all critical/high severity
    const recentErrors = this.errorHistory.slice(0, alert.threshold);
    return recentErrors.every(error => 
      error.severity === MigrationErrorSeverity.CRITICAL || 
      error.severity === MigrationErrorSeverity.HIGH
    );
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: MigrationAlert): void {
    alert.triggered = true;
    alert.lastTriggered = new Date();

    logger.error('Migration alert triggered', {
      alertType: alert.type,
      threshold: alert.threshold,
      severity: alert.severity,
      message: alert.message,
      timestamp: alert.lastTriggered.toISOString()
    });

    // In a production system, you might send notifications here
    // e.g., send to monitoring system, email, Slack, etc.
  }

  /**
   * Clear an alert
   */
  private clearAlert(alert: MigrationAlert): void {
    if (alert.triggered) {
      alert.triggered = false;
      logger.info('Migration alert cleared', {
        alertType: alert.type,
        message: alert.message
      });
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<MigrationErrorType, number>;
    errorsBySeverity: Record<MigrationErrorSeverity, number>;
    recentErrors: number;
    activeAlerts: number;
  } {
    const errorsByType: Record<MigrationErrorType, number> = {} as any;
    const errorsBySeverity: Record<MigrationErrorSeverity, number> = {} as any;

    // Initialize counters
    Object.values(MigrationErrorType).forEach(type => {
      errorsByType[type] = 0;
    });
    Object.values(MigrationErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });

    // Count errors
    this.errorHistory.forEach(error => {
      errorsByType[error.type]++;
      errorsBySeverity[error.severity]++;
    });

    const now = Date.now();
    const recentErrors = this.errorHistory.filter(error => 
      now - error.timestamp.getTime() < 15 * 60 * 1000 // Last 15 minutes
    ).length;

    const activeAlerts = this.alerts.filter(alert => alert.triggered).length;

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      errorsBySeverity,
      recentErrors,
      activeAlerts
    };
  }

  /**
   * Clear error history (for testing or maintenance)
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
    this.alerts.forEach(alert => {
      alert.triggered = false;
      alert.lastTriggered = undefined;
    });
  }
}

// Export singleton instance
export const migrationErrorHandler = new MigrationErrorHandler();