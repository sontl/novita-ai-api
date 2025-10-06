/**
 * Test Setup and Configuration
 * 
 * Global test setup, mocks, and utilities used across all test files.
 */

import { config } from '../config/config';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.NOVITA_API_KEY = 'test-api-key';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  // Restore console methods
  Object.assign(console, originalConsole);
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toBeValidInstanceId(): R;
      toBeValidJobId(): R;
      toHaveValidTimestamp(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },

  toBeValidInstanceId(received: string) {
    const pass = /^inst-\d+-[a-z0-9]+$/.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid instance ID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid instance ID (format: inst-{timestamp}-{random})`,
        pass: false,
      };
    }
  },

  toBeValidJobId(received: string) {
    const pass = /^job-\d+-[a-z0-9]+$/.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid job ID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid job ID (format: job-{timestamp}-{random})`,
        pass: false,
      };
    }
  },

  toHaveValidTimestamp(received: any) {
    const timestamp = typeof received === 'string' ? received : received?.timestamp;
    const pass = timestamp && !isNaN(Date.parse(timestamp));
    if (pass) {
      return {
        message: () => `expected object not to have a valid timestamp`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected object to have a valid timestamp`,
        pass: false,
      };
    }
  },
});

// Mock implementations for external services
export const mockNovitaApiService = {
  getProducts: jest.fn(),
  getTemplate: jest.fn(),
  createInstance: jest.fn(),
  startInstance: jest.fn(),
  getInstanceStatus: jest.fn(),
  stopInstance: jest.fn(),
  deleteInstance: jest.fn(),
};

export const mockWebhookClient = {
  sendWebhook: jest.fn(),
};

export const mockProductService = {
  getOptimalProduct: jest.fn(),
  getCacheStats: jest.fn(),
  clearCache: jest.fn(),
};

export const mockTemplateService = {
  getTemplate: jest.fn(),
  getCacheStats: jest.fn(),
  clearCache: jest.fn(),
  clearExpiredCache: jest.fn(),
  isCached: jest.fn(),
};

export const mockInstanceService = {
  createInstance: jest.fn(),
  getInstanceStatus: jest.fn(),
  listInstances: jest.fn(),
  getCacheStats: jest.fn(),
  clearCache: jest.fn(),
};

// Test utilities
export class TestHelpers {
  /**
   * Create a mock Express request object
   */
  static createMockRequest(overrides: any = {}) {
    return {
      body: {},
      params: {},
      query: {},
      headers: {},
      method: 'GET',
      url: '/',
      ...overrides,
    };
  }

  /**
   * Create a mock Express response object
   */
  static createMockResponse() {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
    };
    return res;
  }

  /**
   * Create a mock Express next function
   */
  static createMockNext() {
    return jest.fn();
  }

  /**
   * Wait for all pending promises to resolve
   */
  static async flushPromises() {
    return new Promise(resolve => setImmediate(resolve));
  }

  /**
   * Generate a unique test ID
   */
  static generateTestId(prefix: string = 'test') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a mock timer that can be controlled
   */
  static createMockTimer() {
    const callbacks: Array<() => void> = [];
    const timer = {
      setTimeout: jest.fn((callback: () => void, delay: number) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
      clearTimeout: jest.fn(),
      tick: (times: number = 1) => {
        for (let i = 0; i < times; i++) {
          const callback = callbacks.shift();
          if (callback) callback();
        }
      },
      tickAll: () => {
        while (callbacks.length > 0) {
          const callback = callbacks.shift();
          if (callback) callback();
        }
      },
    };
    return timer;
  }

  /**
   * Assert that a function throws an error with specific message
   */
  static async expectToThrow(
    fn: () => Promise<any> | any,
    expectedMessage?: string | RegExp
  ) {
    try {
      await fn();
      throw new Error('Expected function to throw, but it did not');
    } catch (error: any) {
      if (expectedMessage) {
        if (typeof expectedMessage === 'string') {
          expect(error.message).toContain(expectedMessage);
        } else {
          expect(error.message).toMatch(expectedMessage);
        }
      }
      return error;
    }
  }

  /**
   * Create a mock that resolves after a delay
   */
  static createDelayedMock<T>(value: T, delay: number = 100) {
    return jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(value), delay))
    );
  }

  /**
   * Create a mock that rejects after a delay
   */
  static createDelayedErrorMock(error: Error, delay: number = 100) {
    return jest.fn().mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(error), delay))
    );
  }

  /**
   * Verify that all mocks have been called as expected
   */
  static verifyMocks(...mocks: jest.Mock[]) {
    mocks.forEach(mock => {
      expect(mock).toHaveBeenCalled();
    });
  }

  /**
   * Reset all provided mocks
   */
  static resetMocks(...mocks: jest.Mock[]) {
    mocks.forEach(mock => {
      mock.mockReset();
    });
  }

  /**
   * Create a spy on an object method
   */
  static spyOn<T extends object, K extends keyof T>(
    object: T,
    method: K
  ): jest.SpyInstance {
    return jest.spyOn(object, method as any);
  }
}

// Export commonly used test data
export const testConstants = {
  VALID_INSTANCE_ID: 'inst-1234567890-abcdef123',
  VALID_JOB_ID: 'job-1234567890-abcdef123',
  VALID_NOVITA_INSTANCE_ID: 'novita-inst-123456',
  VALID_PRODUCT_ID: 'prod-rtx4090-hk',
  VALID_TEMPLATE_ID: 'template-cuda-dev',
  VALID_REGION: 'OC-AU-01',
  VALID_WEBHOOK_URL: 'https://example.com/webhook',
  TEST_API_KEY: 'test-api-key-12345',
  TEST_TIMEOUT: 5000,
};

// Global error handler for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log the error
});

// Global error handler for uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests, just log the error
});