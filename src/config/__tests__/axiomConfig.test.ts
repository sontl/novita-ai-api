import { loadAxiomConfig, getAxiomStatus } from '../axiomConfig';

describe('Axiom Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadAxiomConfig', () => {
    test('should load valid configuration when all required env vars are set', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_ORG_ID = 'test-org';

      const config = loadAxiomConfig();

      expect(config).toEqual({
        enabled: true,
        dataset: 'test-dataset',
        token: 'test-token',
        orgId: 'test-org',
        flushInterval: 5000,
        maxBatchSize: 100
      });
    });

    test('should be disabled when required env vars are missing', () => {
      delete process.env.AXIOM_DATASET;
      delete process.env.AXIOM_TOKEN;

      const config = loadAxiomConfig();

      expect(config).toEqual({
        enabled: false,
        dataset: '',
        token: '',
        orgId: undefined,
        flushInterval: 5000,
        maxBatchSize: 100
      });
    });

    test('should be enabled when only dataset and token are provided', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';
      delete process.env.AXIOM_ORG_ID;

      const config = loadAxiomConfig();

      expect(config.enabled).toBe(true);
      expect(config.orgId).toBeUndefined();
    });

    test('should parse custom flush interval and batch size', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_FLUSH_INTERVAL = '10000';
      process.env.AXIOM_MAX_BATCH_SIZE = '200';

      const config = loadAxiomConfig();

      expect(config.flushInterval).toBe(10000);
      expect(config.maxBatchSize).toBe(200);
    });

    test('should use default values for optional settings', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';

      const config = loadAxiomConfig();

      expect(config.flushInterval).toBe(5000);
      expect(config.maxBatchSize).toBe(100);
    });

    test('should throw error for invalid flush interval', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_FLUSH_INTERVAL = '500'; // Below minimum

      expect(() => loadAxiomConfig()).toThrow('Axiom configuration validation failed');
    });

    test('should throw error for invalid batch size', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_MAX_BATCH_SIZE = '0'; // Below minimum

      expect(() => loadAxiomConfig()).toThrow('Axiom configuration validation failed');
    });
  });

  describe('getAxiomStatus', () => {
    test('should return enabled and configured when valid config exists', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';

      const status = getAxiomStatus();

      expect(status).toEqual({
        enabled: true,
        configured: true
      });
    });

    test('should return disabled when env vars are missing', () => {
      delete process.env.AXIOM_DATASET;
      delete process.env.AXIOM_TOKEN;

      const status = getAxiomStatus();

      expect(status).toEqual({
        enabled: false,
        configured: false
      });
    });

    test('should return error when configuration is invalid', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_FLUSH_INTERVAL = 'invalid';

      const status = getAxiomStatus();

      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
      expect(status.error).toContain('Axiom configuration validation failed');
    });

    test('should handle partial configuration', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      delete process.env.AXIOM_TOKEN;

      const status = getAxiomStatus();

      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty string values', () => {
      process.env.AXIOM_DATASET = '';
      process.env.AXIOM_TOKEN = '';

      const config = loadAxiomConfig();

      expect(config.enabled).toBe(false);
    });

    test('should handle whitespace-only values', () => {
      process.env.AXIOM_DATASET = '   ';
      process.env.AXIOM_TOKEN = '   ';

      const status = getAxiomStatus();

      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
    });

    test('should handle numeric strings for intervals', () => {
      process.env.AXIOM_DATASET = 'test-dataset';
      process.env.AXIOM_TOKEN = 'test-token';
      process.env.AXIOM_FLUSH_INTERVAL = '15000';
      process.env.AXIOM_MAX_BATCH_SIZE = '50';

      const config = loadAxiomConfig();

      expect(config.flushInterval).toBe(15000);
      expect(config.maxBatchSize).toBe(50);
    });
  });
});