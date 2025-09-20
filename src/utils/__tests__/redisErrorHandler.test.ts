import {
  RedisError,
  RedisConnectionError,
  RedisTimeoutError,
  RedisAuthenticationError,
  RedisCommandError,
  RedisSerializationError,
  RedisCircuitBreakerError,
  RedisErrorType,
  RedisErrorSeverity,
  RedisCircuitBreaker,
  CircuitBreakerState,
  RedisRetryHandler,
  RedisErrorCategorizer
} from '../redisErrorHandler';

describe('RedisError Classes', () => {
  describe('RedisError', () => {
    it('should create a basic Redis error with default values', () => {
      const error = new RedisError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('RedisError');
      expect(error.type).toBe(RedisErrorType.UNKNOWN);
      expect(error.severity).toBe(RedisErrorSeverity.MEDIUM);
      expect(error.isRetryable).toBe(false);
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.context).toEqual({});
    });

    it('should create a Redis error with custom properties', () => {
      const context = { key: 'test-key', operation: 'GET' };
      const error = new RedisError(
        'Custom error',
        RedisErrorType.CONNECTION,
        RedisErrorSeverity.HIGH,
        true,
        context
      );
      
      expect(error.message).toBe('Custom error');
      expect(error.type).toBe(RedisErrorType.CONNECTION);
      expect(error.severity).toBe(RedisErrorSeverity.HIGH);
      expect(error.isRetryable).toBe(true);
      expect(error.context).toEqual(context);
    });
  });

  describe('RedisConnectionError', () => {
    it('should create a connection error with correct properties', () => {
      const context = { url: 'redis://localhost:6379' };
      const error = new RedisConnectionError('Connection failed', context);
      
      expect(error.name).toBe('RedisConnectionError');
      expect(error.type).toBe(RedisErrorType.CONNECTION);
      expect(error.severity).toBe(RedisErrorSeverity.HIGH);
      expect(error.isRetryable).toBe(true);
      expect(error.context).toEqual(context);
    });
  });

  describe('RedisTimeoutError', () => {
    it('should create a timeout error with correct properties', () => {
      const error = new RedisTimeoutError('Operation timed out');
      
      expect(error.name).toBe('RedisTimeoutError');
      expect(error.type).toBe(RedisErrorType.TIMEOUT);
      expect(error.severity).toBe(RedisErrorSeverity.MEDIUM);
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('RedisAuthenticationError', () => {
    it('should create an authentication error with correct properties', () => {
      const error = new RedisAuthenticationError('Invalid credentials');
      
      expect(error.name).toBe('RedisAuthenticationError');
      expect(error.type).toBe(RedisErrorType.AUTHENTICATION);
      expect(error.severity).toBe(RedisErrorSeverity.CRITICAL);
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('RedisCommandError', () => {
    it('should create a command error with correct properties', () => {
      const error = new RedisCommandError('Invalid command', 'GET');
      
      expect(error.name).toBe('RedisCommandError');
      expect(error.type).toBe(RedisErrorType.COMMAND);
      expect(error.severity).toBe(RedisErrorSeverity.MEDIUM);
      expect(error.isRetryable).toBe(false);
      expect(error.context.command).toBe('GET');
    });
  });

  describe('RedisSerializationError', () => {
    it('should create a serialization error with correct properties', () => {
      const error = new RedisSerializationError('Serialization failed');
      
      expect(error.name).toBe('RedisSerializationError');
      expect(error.type).toBe(RedisErrorType.SERIALIZATION);
      expect(error.severity).toBe(RedisErrorSeverity.HIGH);
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('RedisCircuitBreakerError', () => {
    it('should create a circuit breaker error with correct properties', () => {
      const error = new RedisCircuitBreakerError();
      
      expect(error.name).toBe('RedisCircuitBreakerError');
      expect(error.type).toBe(RedisErrorType.CIRCUIT_BREAKER);
      expect(error.severity).toBe(RedisErrorSeverity.HIGH);
      expect(error.isRetryable).toBe(false);
      expect(error.message).toBe('Redis circuit breaker is open');
    });
  });
});

describe('RedisCircuitBreaker', () => {
  let circuitBreaker: RedisCircuitBreaker;
  
  beforeEach(() => {
    circuitBreaker = new RedisCircuitBreaker({
      failureThreshold: 0.5,
      recoveryTimeoutMs: 1000,
      monitoringPeriodMs: 10000,
      minimumRequests: 3
    });
  });

  describe('execute', () => {
    it('should execute operation successfully when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open circuit after failure threshold is reached', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Execute enough requests to meet minimum threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-op');
        } catch (error) {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should throw circuit breaker error when circuit is open', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-op');
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Next operation should throw circuit breaker error
      await expect(circuitBreaker.execute(operation, 'test-op'))
        .rejects.toThrow(RedisCircuitBreakerError);
    });

    it('should transition to half-open after recovery timeout', async () => {
      jest.useFakeTimers();
      
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-op');
        } catch (error) {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Fast forward past recovery timeout
      jest.advanceTimersByTime(1001);
      
      // Mock successful operation for half-open test
      operation.mockResolvedValueOnce('success');
      
      const result = await circuitBreaker.execute(operation, 'test-op');
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      
      jest.useRealTimers();
    });

    it('should close circuit after successful operation in half-open state', async () => {
      jest.useFakeTimers();
      
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'))
        .mockResolvedValueOnce('success');
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-op');
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Fast forward past recovery timeout
      jest.advanceTimersByTime(1001);
      
      // Execute successful operation
      const result = await circuitBreaker.execute(operation, 'test-op');
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      
      jest.useRealTimers();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const operation = jest.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('failure'));
      
      await circuitBreaker.execute(operation, 'test-op');
      
      try {
        await circuitBreaker.execute(operation, 'test-op');
      } catch (error) {
        // Expected to fail
      }
      
      const stats = circuitBreaker.getStats();
      
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(1);
      expect(stats.requestCount).toBe(2);
      expect(stats.failureRate).toBe(0.5);
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Execute some operations
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation, 'test-op');
        } catch (error) {
          // Expected to fail
        }
      }
      
      circuitBreaker.reset();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.requestCount).toBe(0);
    });
  });
});

describe('RedisRetryHandler', () => {
  let retryHandler: RedisRetryHandler;
  
  beforeEach(() => {
    retryHandler = new RedisRetryHandler({
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterMs: 10
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await retryHandler.executeWithRetry(operation, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new RedisConnectionError('Connection failed'))
        .mockResolvedValueOnce('success');
      
      const result = await retryHandler.executeWithRetry(operation, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new RedisAuthenticationError('Auth failed'));
      
      await expect(retryHandler.executeWithRetry(operation, 'test-op'))
        .rejects.toThrow(RedisError);
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should fail after max attempts with retryable error', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new RedisTimeoutError('Timeout'));
      
      await expect(retryHandler.executeWithRetry(operation, 'test-op'))
        .rejects.toThrow(RedisError);
      
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle generic errors with retry patterns', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce('success');
      
      const result = await retryHandler.executeWithRetry(operation, 'test-op');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});

describe('RedisErrorCategorizer', () => {
  describe('categorizeError', () => {
    it('should categorize connection errors', () => {
      const errors = [
        new Error('Connection refused'),
        new Error('ECONNREFUSED'),
        new Error('Network error'),
        new Error('connect ETIMEDOUT')
      ];
      
      errors.forEach(error => {
        expect(RedisErrorCategorizer.categorizeError(error))
          .toBe(RedisErrorType.CONNECTION);
      });
    });

    it('should categorize timeout errors', () => {
      const errors = [
        new Error('Operation timed out'),
        new Error('ETIMEDOUT'),
        new Error('Request timeout')
      ];
      
      errors.forEach(error => {
        expect(RedisErrorCategorizer.categorizeError(error))
          .toBe(RedisErrorType.TIMEOUT);
      });
    });

    it('should categorize authentication errors', () => {
      const errors = [
        new Error('Authentication failed'),
        new Error('Unauthorized access'),
        new Error('Invalid credentials')
      ];
      
      errors.forEach(error => {
        expect(RedisErrorCategorizer.categorizeError(error))
          .toBe(RedisErrorType.AUTHENTICATION);
      });
    });

    it('should categorize serialization errors', () => {
      const errors = [
        new Error('JSON parse error'),
        new Error('Serialization failed'),
        new Error('Invalid format')
      ];
      
      errors.forEach(error => {
        expect(RedisErrorCategorizer.categorizeError(error))
          .toBe(RedisErrorType.SERIALIZATION);
      });
    });

    it('should categorize command errors', () => {
      const errors = [
        new Error('Invalid command'),
        new Error('Syntax error'),
        new Error('Wrong number of arguments')
      ];
      
      errors.forEach(error => {
        expect(RedisErrorCategorizer.categorizeError(error))
          .toBe(RedisErrorType.COMMAND);
      });
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      const error = new Error('Some random error');
      
      expect(RedisErrorCategorizer.categorizeError(error))
        .toBe(RedisErrorType.UNKNOWN);
    });

    it('should preserve existing Redis error types', () => {
      const redisError = new RedisConnectionError('Connection failed');
      
      expect(RedisErrorCategorizer.categorizeError(redisError))
        .toBe(RedisErrorType.CONNECTION);
    });
  });

  describe('createRedisError', () => {
    it('should create Redis error from generic error', () => {
      const genericError = new Error('Operation timed out');
      const context = { operation: 'GET', key: 'test' };
      
      const redisError = RedisErrorCategorizer.createRedisError(genericError, context);
      
      expect(redisError).toBeInstanceOf(RedisError);
      expect(redisError.type).toBe(RedisErrorType.TIMEOUT);
      expect(redisError.severity).toBe(RedisErrorSeverity.MEDIUM);
      expect(redisError.isRetryable).toBe(true);
      expect(redisError.context).toEqual(context);
    });

    it('should return existing Redis error unchanged', () => {
      const redisError = new RedisConnectionError('Connection failed');
      
      const result = RedisErrorCategorizer.createRedisError(redisError);
      
      expect(result).toBe(redisError);
    });

    it('should handle non-Error objects', () => {
      const errorString = 'Some error string';
      
      const redisError = RedisErrorCategorizer.createRedisError(errorString);
      
      expect(redisError).toBeInstanceOf(RedisError);
      expect(redisError.message).toBe(errorString);
      expect(redisError.type).toBe(RedisErrorType.UNKNOWN);
    });
  });
});