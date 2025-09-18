/**
 * Tests for migration error handling and recovery strategies
 */

import {
  MigrationError,
  MigrationErrorType,
  MigrationErrorSeverity
} from '../../types/migration';
import {
  MigrationErrorHandler,
  DEFAULT_RETRY_CONFIG
} from '../migrationErrorHandler';
import {
  NovitaApiClientError,
  RateLimitError,
  CircuitBreakerError,
  TimeoutError
} from '../../types/api';

describe('MigrationErrorHandler', () => {
  let errorHandler: MigrationErrorHandler;

  beforeEach(() => {
    errorHandler = new MigrationErrorHandler();
    // Clear error history before each test
    errorHandler.clearErrorHistory();
  });

  describe('createMigrationError', () => {
    it('should categorize rate limit errors correctly', () => {
      const rateLimitError = new RateLimitError('Rate limit exceeded', 60);
      const migrationError = errorHandler.createMigrationError(rateLimitError, 'instance-123');

      expect(migrationError.type).toBe(MigrationErrorType.RATE_LIMIT);
      expect(migrationError.severity).toBe(MigrationErrorSeverity.MEDIUM);
      expect(migrationError.instanceId).toBe('instance-123');
      expect(migrationError.retryable).toBe(true);
      expect(migrationError.recoverable).toBe(true);
    });

    it('should categorize circuit breaker errors correctly', () => {
      const circuitBreakerError = new CircuitBreakerError('Circuit breaker open');
      const migrationError = errorHandler.createMigrationError(circuitBreakerError);

      expect(migrationError.type).toBe(MigrationErrorType.API);
      expect(migrationError.severity).toBe(MigrationErrorSeverity.HIGH);
      expect(migrationError.retryable).toBe(true);
      expect(migrationError.recoverable).toBe(true);
    });

    it('should categorize timeout errors correctly', () => {
      const timeoutError = new TimeoutError('Request timeout');
      const migrationError = errorHandler.createMigrationError(timeoutError, 'instance-456');

      expect(migrationError.type).toBe(MigrationErrorType.TIMEOUT);
      expect(migrationError.severity).toBe(MigrationErrorSeverity.MEDIUM);
      expect(migrationError.instanceId).toBe('instance-456');
      expect(migrationError.retryable).toBe(true);
    });

    it('should categorize API errors based on status code', () => {
      const serverError = new NovitaApiClientError('Internal server error', 500);
      const migrationError = errorHandler.createMigrationError(serverError);

      expect(migrationError.type).toBe(MigrationErrorType.API);
      expect(migrationError.severity).toBe(MigrationErrorSeverity.HIGH);

      const clientError = new NovitaApiClientError('Bad request', 400);
      const migrationError2 = errorHandler.createMigrationError(clientError);

      expect(migrationError2.type).toBe(MigrationErrorType.API);
      expect(migrationError2.severity).toBe(MigrationErrorSeverity.MEDIUM);
    });

    it('should categorize network errors correctly', () => {
      const networkError = new Error('network timeout ECONNRESET');
      const migrationError = errorHandler.createMigrationError(networkError);

      expect(migrationError.type).toBe(MigrationErrorType.NETWORK);
      expect(migrationError.severity).toBe(MigrationErrorSeverity.MEDIUM);
      expect(migrationError.retryable).toBe(true);
    });

    it('should categorize configuration errors correctly', () => {
      const configError = new Error('Invalid configuration provided');
      const migrationError = errorHandler.createMigrationError(configError);

      expect(migrationError.type).toBe(MigrationErrorType.CONFIGURATION);
      expect(migrationError.severity).toBe(MigrationErrorSeverity.HIGH);
      expect(migrationError.retryable).toBe(false);
      expect(migrationError.recoverable).toBe(false);
    });
  });

  describe('handleError', () => {
    it('should recommend retry for retryable errors within max attempts', async () => {
      const networkError = new MigrationError(
        'Network connection failed',
        MigrationErrorType.NETWORK,
        { severity: MigrationErrorSeverity.MEDIUM }
      );

      const result = await errorHandler.handleError(networkError, 1);

      expect(result.shouldRetry).toBe(true);
      expect(result.delayMs).toBeGreaterThan(0);
      expect(result.action).toBe('retry');
    });

    it('should not recommend retry when max attempts exceeded', async () => {
      const networkError = new MigrationError(
        'Network connection failed',
        MigrationErrorType.NETWORK,
        { severity: MigrationErrorSeverity.MEDIUM }
      );

      const result = await errorHandler.handleError(networkError, 5);

      expect(result.shouldRetry).toBe(false);
      expect(result.delayMs).toBe(0);
    });

    it('should not recommend retry for non-retryable errors', async () => {
      const configError = new MigrationError(
        'Invalid configuration',
        MigrationErrorType.CONFIGURATION,
        { severity: MigrationErrorSeverity.HIGH }
      );

      const result = await errorHandler.handleError(configError, 1);

      expect(result.shouldRetry).toBe(false);
      expect(result.delayMs).toBe(0);
      expect(result.action).toBe('escalate');
    });

    it('should recommend skip for eligibility errors', async () => {
      const eligibilityError = new MigrationError(
        'Instance not eligible for migration',
        MigrationErrorType.ELIGIBILITY,
        { severity: MigrationErrorSeverity.LOW }
      );

      const result = await errorHandler.handleError(eligibilityError, 1);

      expect(result.shouldRetry).toBe(false);
      expect(result.action).toBe('skip');
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff delay', () => {
      const delay1 = errorHandler.calculateRetryDelay(1, MigrationErrorType.NETWORK);
      const delay2 = errorHandler.calculateRetryDelay(2, MigrationErrorType.NETWORK);
      const delay3 = errorHandler.calculateRetryDelay(3, MigrationErrorType.NETWORK);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should respect max delay limit', () => {
      const delay = errorHandler.calculateRetryDelay(10, MigrationErrorType.NETWORK);
      expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs + DEFAULT_RETRY_CONFIG.jitterMs);
    });

    it('should use strategy-specific delays when available', () => {
      const rateLimitDelay = errorHandler.calculateRetryDelay(1, MigrationErrorType.RATE_LIMIT);
      const networkDelay = errorHandler.calculateRetryDelay(1, MigrationErrorType.NETWORK);

      // Rate limit should have longer base delay
      expect(rateLimitDelay).toBeGreaterThan(networkDelay);
    });
  });

  describe('shouldRetry', () => {
    it('should respect custom retry conditions', async () => {
      const apiError = new MigrationError(
        'API error',
        MigrationErrorType.API,
        {
          originalError: new NovitaApiClientError('Bad request', 400),
          severity: MigrationErrorSeverity.MEDIUM
        }
      );

      // First attempt should not retry for 400 errors
      const result1 = await errorHandler.handleError(apiError, 1);
      expect(result1.shouldRetry).toBe(false);

      // But 500 errors should retry
      const serverError = new MigrationError(
        'Server error',
        MigrationErrorType.API,
        {
          originalError: new NovitaApiClientError('Internal server error', 500),
          severity: MigrationErrorSeverity.HIGH
        }
      );

      const result2 = await errorHandler.handleError(serverError, 1);
      expect(result2.shouldRetry).toBe(true);
    });
  });

  describe('error statistics', () => {
    it('should track error statistics correctly', async () => {
      const networkError = new MigrationError(
        'Network error',
        MigrationErrorType.NETWORK,
        { severity: MigrationErrorSeverity.MEDIUM }
      );

      const apiError = new MigrationError(
        'API error',
        MigrationErrorType.API,
        { severity: MigrationErrorSeverity.HIGH }
      );

      await errorHandler.handleError(networkError, 1);
      await errorHandler.handleError(apiError, 1);

      const stats = errorHandler.getErrorStats();

      expect(stats.totalErrors).toBe(2);
      expect(stats.errorsByType[MigrationErrorType.NETWORK]).toBe(1);
      expect(stats.errorsByType[MigrationErrorType.API]).toBe(1);
      expect(stats.errorsBySeverity[MigrationErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.errorsBySeverity[MigrationErrorSeverity.HIGH]).toBe(1);
    });

    it('should track recent errors within time window', async () => {
      const error = new MigrationError(
        'Test error',
        MigrationErrorType.MIGRATION,
        { severity: MigrationErrorSeverity.MEDIUM }
      );

      await errorHandler.handleError(error, 1);
      const stats = errorHandler.getErrorStats();

      expect(stats.recentErrors).toBe(1);
    });
  });

  describe('alert system', () => {
    it('should trigger consecutive failures alert', async () => {
      // Create multiple critical errors
      for (let i = 0; i < 4; i++) {
        const criticalError = new MigrationError(
          `Critical error ${i}`,
          MigrationErrorType.MIGRATION,
          { severity: MigrationErrorSeverity.CRITICAL }
        );
        await errorHandler.handleError(criticalError, 1);
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.activeAlerts).toBeGreaterThan(0);
    });
  });

  describe('MigrationError class', () => {
    it('should create error with all properties', () => {
      const originalError = new Error('Original error');
      const context = { key: 'value' };

      const migrationError = new MigrationError(
        'Test migration error',
        MigrationErrorType.MIGRATION,
        {
          severity: MigrationErrorSeverity.HIGH,
          instanceId: 'instance-123',
          originalError,
          recoverable: true,
          retryable: false,
          context
        }
      );

      expect(migrationError.message).toBe('Test migration error');
      expect(migrationError.type).toBe(MigrationErrorType.MIGRATION);
      expect(migrationError.severity).toBe(MigrationErrorSeverity.HIGH);
      expect(migrationError.instanceId).toBe('instance-123');
      expect(migrationError.originalError).toBe(originalError);
      expect(migrationError.recoverable).toBe(true);
      expect(migrationError.retryable).toBe(false);
      expect(migrationError.context).toBe(context);
      expect(migrationError.timestamp).toBeInstanceOf(Date);
    });

    it('should serialize to log object correctly', () => {
      const migrationError = new MigrationError(
        'Test error',
        MigrationErrorType.API,
        {
          severity: MigrationErrorSeverity.MEDIUM,
          instanceId: 'instance-456',
          context: { test: true }
        }
      );

      const logObject = migrationError.toLogObject();

      expect(logObject.name).toBe('MigrationError');
      expect(logObject.message).toBe('Test error');
      expect(logObject.type).toBe(MigrationErrorType.API);
      expect(logObject.severity).toBe(MigrationErrorSeverity.MEDIUM);
      expect(logObject.instanceId).toBe('instance-456');
      expect(logObject.context).toEqual({ test: true });
      expect(logObject.timestamp).toBeDefined();
    });

    it('should determine recoverability correctly', () => {
      const networkError = new MigrationError('Network error', MigrationErrorType.NETWORK);
      expect(networkError.recoverable).toBe(true);

      const configError = new MigrationError('Config error', MigrationErrorType.CONFIGURATION);
      expect(configError.recoverable).toBe(false);

      const eligibilityError = new MigrationError('Eligibility error', MigrationErrorType.ELIGIBILITY);
      expect(eligibilityError.recoverable).toBe(false);
    });

    it('should determine retryability correctly', () => {
      const timeoutError = new MigrationError('Timeout error', MigrationErrorType.TIMEOUT);
      expect(timeoutError.retryable).toBe(true);

      const configError = new MigrationError('Config error', MigrationErrorType.CONFIGURATION);
      expect(configError.retryable).toBe(false);

      const eligibilityError = new MigrationError('Eligibility error', MigrationErrorType.ELIGIBILITY);
      expect(eligibilityError.retryable).toBe(false);
    });
  });
});