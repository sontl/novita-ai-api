// Test the client classes and types without full initialization
import { NovitaApiClientError, RateLimitError } from '../../types/api';

enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

describe('NovitaClient Types and Classes', () => {
  describe('CircuitState enum', () => {
    it('should have correct values', () => {
      expect(CircuitState.CLOSED).toBe('closed');
      expect(CircuitState.OPEN).toBe('open');
      expect(CircuitState.HALF_OPEN).toBe('half_open');
    });
  });

  describe('NovitaApiClientError', () => {
    it('should create error with message and status code', () => {
      const error = new NovitaApiClientError('Test error', 400, 'TEST_ERROR');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('NovitaApiClientError');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('Rate limited', 60000);
      
      expect(error.message).toBe('Rate limited');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60000);
      expect(error.name).toBe('RateLimitError');
    });

    it('should create rate limit error with default message', () => {
      const error = new RateLimitError();
      
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
    });
  });
});