import { logger } from './logger';

/**
 * Redis error types for categorization
 */
export enum RedisErrorType {
  CONNECTION = 'CONNECTION',
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  COMMAND = 'COMMAND',
  SERIALIZATION = 'SERIALIZATION',
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Redis error severity levels
 */
export enum RedisErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Base Redis error class with categorization and context
 */
export class RedisError extends Error {
  public readonly type: RedisErrorType;
  public readonly severity: RedisErrorSeverity;
  public readonly isRetryable: boolean;
  public readonly timestamp: Date;
  public readonly context: Record<string, any>;

  constructor(
    message: string,
    type: RedisErrorType = RedisErrorType.UNKNOWN,
    severity: RedisErrorSeverity = RedisErrorSeverity.MEDIUM,
    isRetryable: boolean = false,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'RedisError';
    this.type = type;
    this.severity = severity;
    this.isRetryable = isRetryable;
    this.timestamp = new Date();
    this.context = context;
  }
}

/**
 * Redis connection error
 */
export class RedisConnectionError extends RedisError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(
      message,
      RedisErrorType.CONNECTION,
      RedisErrorSeverity.HIGH,
      true,
      context
    );
    this.name = 'RedisConnectionError';
  }
}

/**
 * Redis timeout error
 */
export class RedisTimeoutError extends RedisError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(
      message,
      RedisErrorType.TIMEOUT,
      RedisErrorSeverity.MEDIUM,
      true,
      context
    );
    this.name = 'RedisTimeoutError';
  }
}

/**
 * Redis authentication error
 */
export class RedisAuthenticationError extends RedisError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(
      message,
      RedisErrorType.AUTHENTICATION,
      RedisErrorSeverity.CRITICAL,
      false,
      context
    );
    this.name = 'RedisAuthenticationError';
  }
}

/**
 * Redis command error
 */
export class RedisCommandError extends RedisError {
  constructor(message: string, command: string, context: Record<string, any> = {}) {
    super(
      message,
      RedisErrorType.COMMAND,
      RedisErrorSeverity.MEDIUM,
      false,
      { ...context, command }
    );
    this.name = 'RedisCommandError';
  }
}

/**
 * Redis serialization error
 */
export class RedisSerializationError extends RedisError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(
      message,
      RedisErrorType.SERIALIZATION,
      RedisErrorSeverity.HIGH,
      false,
      context
    );
    this.name = 'RedisSerializationError';
  }
}

/**
 * Redis circuit breaker error
 */
export class RedisCircuitBreakerError extends RedisError {
  constructor(message: string = 'Redis circuit breaker is open', context: Record<string, any> = {}) {
    super(
      message,
      RedisErrorType.CIRCUIT_BREAKER,
      RedisErrorSeverity.HIGH,
      false,
      context
    );
    this.name = 'RedisCircuitBreakerError';
  }
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringPeriodMs: number;
  minimumRequests: number;
}

/**
 * Circuit breaker implementation for Redis operations
 */
export class RedisCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private requestCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private monitoringStartTime: number = Date.now();

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, operationName: string = 'redis-operation'): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new RedisCircuitBreakerError(
          `Circuit breaker is open for ${operationName}`,
          {
            state: this.state,
            failureCount: this.failureCount,
            nextAttemptTime: this.nextAttemptTime
          }
        );
      } else {
        this.state = CircuitBreakerState.HALF_OPEN;
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          operationName,
          failureCount: this.failureCount
        });
      }
    }

    this.requestCount++;

    try {
      const result = await operation();
      this.onSuccess(operationName);
      return result;
    } catch (error) {
      this.onFailure(error, operationName);
      throw error;
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    requestCount: number;
    failureRate: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      failureRate: this.requestCount > 0 ? this.failureCount / this.requestCount : 0,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.monitoringStartTime = Date.now();

    logger.info('Circuit breaker reset to CLOSED state');
  }

  private onSuccess(operationName: string): void {
    this.successCount++;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      this.failureCount = 0;
      logger.info('Circuit breaker closed after successful operation', {
        operationName,
        successCount: this.successCount
      });
    }

    // Reset monitoring period if needed
    this.resetMonitoringPeriodIfNeeded();
  }

  private onFailure(error: any, operationName: string): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn('Circuit breaker recorded failure', {
      operationName,
      failureCount: this.failureCount,
      error: error instanceof Error ? error.message : String(error)
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.openCircuit(operationName);
    } else if (this.shouldOpenCircuit()) {
      this.openCircuit(operationName);
    }
  }

  private shouldOpenCircuit(): boolean {
    // Need minimum requests before considering opening
    if (this.requestCount < this.config.minimumRequests) {
      return false;
    }

    // Check if failure rate exceeds threshold
    const failureRate = this.failureCount / this.requestCount;
    return failureRate >= this.config.failureThreshold;
  }

  private openCircuit(operationName: string): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.recoveryTimeoutMs;

    logger.error('Circuit breaker opened', {
      operationName,
      failureCount: this.failureCount,
      requestCount: this.requestCount,
      failureRate: this.failureCount / this.requestCount,
      nextAttemptTime: this.nextAttemptTime
    });
  }

  private resetMonitoringPeriodIfNeeded(): void {
    const now = Date.now();
    if (now - this.monitoringStartTime >= this.config.monitoringPeriodMs) {
      this.failureCount = 0;
      this.successCount = 0;
      this.requestCount = 0;
      this.monitoringStartTime = now;
    }
  }
}

/**
 * Retry configuration for Redis operations
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

/**
 * Retry utility with exponential backoff for Redis operations
 */
export class RedisRetryHandler {
  constructor(private config: RetryConfig) {}

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'redis-operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info('Redis operation succeeded after retry', {
            operationName,
            attempt,
            totalAttempts: this.config.maxAttempts
          });
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const isRetryable = this.isRetryableError(lastError);
        const isLastAttempt = attempt === this.config.maxAttempts;

        logger.warn('Redis operation failed', {
          operationName,
          attempt,
          totalAttempts: this.config.maxAttempts,
          error: lastError.message,
          isRetryable,
          isLastAttempt
        });

        if (isLastAttempt || !isRetryable) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        logger.debug('Retrying Redis operation after delay', {
          operationName,
          attempt,
          delayMs: delay
        });

        await this.sleep(delay);
      }
    }

    throw new RedisError(
      `Redis operation failed after ${this.config.maxAttempts} attempts: ${lastError?.message}`,
      RedisErrorType.UNKNOWN,
      RedisErrorSeverity.HIGH,
      false,
      {
        operationName,
        attempts: this.config.maxAttempts,
        lastError: lastError?.message
      }
    );
  }

  private isRetryableError(error: Error): boolean {
    if (error instanceof RedisError) {
      return error.isRetryable;
    }

    // Check for common retryable error patterns
    const retryablePatterns = [
      'timeout',
      'connection',
      'network',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern => errorMessage.includes(pattern.toLowerCase()));
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * this.config.jitterMs;
    
    return Math.floor(cappedDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Error categorization utility
 */
export class RedisErrorCategorizer {
  /**
   * Categorize an error into a Redis error type
   */
  static categorizeError(error: any): RedisErrorType {
    if (error instanceof RedisError) {
      return error.type;
    }

    const errorMessage = error?.message?.toLowerCase() || String(error).toLowerCase();

    // Serialization errors (check first as they might contain 'parse' which could match other patterns)
    if (this.matchesPatterns(errorMessage, [
      'json',
      'parse error',
      'serialization',
      'deserialization',
      'invalid format'
    ])) {
      return RedisErrorType.SERIALIZATION;
    }

    // Authentication errors
    if (this.matchesPatterns(errorMessage, [
      'auth',
      'authentication',
      'unauthorized',
      'invalid credentials',
      'access denied'
    ])) {
      return RedisErrorType.AUTHENTICATION;
    }

    // Connection errors (check before timeout as 'connect ETIMEDOUT' should be connection)
    if (this.matchesPatterns(errorMessage, [
      'connection refused',
      'connect etimedout',
      'econnrefused',
      'enotfound',
      'econnreset',
      'network error'
    ])) {
      return RedisErrorType.CONNECTION;
    }

    // Timeout errors
    if (this.matchesPatterns(errorMessage, [
      'timed out',
      'timeout',
      'etimedout'
    ]) && !this.matchesPatterns(errorMessage, ['connect', 'connection'])) {
      return RedisErrorType.TIMEOUT;
    }

    // Command errors
    if (this.matchesPatterns(errorMessage, [
      'command',
      'syntax error',
      'invalid command',
      'wrong number of arguments'
    ])) {
      return RedisErrorType.COMMAND;
    }

    return RedisErrorType.UNKNOWN;
  }

  /**
   * Create a Redis error from a generic error
   */
  static createRedisError(error: any, context: Record<string, any> = {}): RedisError {
    if (error instanceof RedisError) {
      return error;
    }

    const type = this.categorizeError(error);
    const message = error?.message || String(error);
    const severity = this.getSeverityForType(type);
    const isRetryable = this.isRetryableType(type);

    return new RedisError(message, type, severity, isRetryable, context);
  }

  private static matchesPatterns(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  private static getSeverityForType(type: RedisErrorType): RedisErrorSeverity {
    switch (type) {
      case RedisErrorType.AUTHENTICATION:
        return RedisErrorSeverity.CRITICAL;
      case RedisErrorType.CONNECTION:
      case RedisErrorType.SERIALIZATION:
        return RedisErrorSeverity.HIGH;
      case RedisErrorType.TIMEOUT:
      case RedisErrorType.COMMAND:
        return RedisErrorSeverity.MEDIUM;
      default:
        return RedisErrorSeverity.LOW;
    }
  }

  private static isRetryableType(type: RedisErrorType): boolean {
    switch (type) {
      case RedisErrorType.CONNECTION:
      case RedisErrorType.TIMEOUT:
        return true;
      case RedisErrorType.AUTHENTICATION:
      case RedisErrorType.COMMAND:
      case RedisErrorType.SERIALIZATION:
        return false;
      default:
        return false;
    }
  }
}