// @ts-nocheck
import {
  validateCreateInstance,
  validateInstanceId,
  validateConfig
} from '../validation';

describe('Validation Schemas', () => {
  describe('validateCreateInstance', () => {
    it('should validate a valid create instance request', () => {
      const validRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123',
        gpuNum: 2,
        rootfsSize: 100,
        region: 'CN-HK-01',
        webhookUrl: 'https://example.com/webhook'
      };

      const result = validateCreateInstance(validRequest);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validRequest);
    });

    it('should apply default values for optional fields', () => {
      const minimalRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123'
      };

      const result = validateCreateInstance(minimalRequest);
      
      expect(result.error).toBeUndefined();
      expect(result.value.gpuNum).toBe(1);
      expect(result.value.rootfsSize).toBe(60);
      expect(result.value.region).toBe('CN-HK-01');
    });

    it('should reject invalid name with special characters', () => {
      const invalidRequest = {
        name: 'test@instance!',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123'
      };

      const result = validateCreateInstance(invalidRequest);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('name');
      expect(result.error.details[0].message).toContain('alphanumeric characters');
    });

    it('should reject empty required fields', () => {
      const invalidRequest = {
        name: '',
        productName: '',
        templateId: ''
      };

      const result = validateCreateInstance(invalidRequest);
      
      expect(result.error).toBeDefined();
      expect(result.error.details).toHaveLength(3);
    });

    it('should reject invalid GPU number', () => {
      const invalidRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123',
        gpuNum: 0
      };

      const result = validateCreateInstance(invalidRequest);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('gpuNum');
      expect(result.error.details[0].message).toContain('at least 1');
    });

    it('should reject invalid rootfs size', () => {
      const invalidRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123',
        rootfsSize: 10
      };

      const result = validateCreateInstance(invalidRequest);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('rootfsSize');
      expect(result.error.details[0].message).toContain('at least 20GB');
    });

    it('should reject invalid region', () => {
      const invalidRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123',
        region: 'INVALID-REGION'
      };

      const result = validateCreateInstance(invalidRequest);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('region');
      expect(result.error.details[0].message).toContain('must be one of');
    });

    it('should reject invalid webhook URL', () => {
      const invalidRequest = {
        name: 'test-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'template-123',
        webhookUrl: 'invalid-url'
      };

      const result = validateCreateInstance(invalidRequest);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('webhookUrl');
      expect(result.error.details[0].message).toContain('valid uri');
    });
  });

  describe('validateInstanceId', () => {
    it('should validate a valid instance ID', () => {
      const validId = 'instance-123_test';
      const result = validateInstanceId(validId);
      
      expect(result.error).toBeUndefined();
      expect(result.value).toBe(validId);
    });

    it('should reject instance ID with special characters', () => {
      const invalidId = 'instance@123!';
      const result = validateInstanceId(invalidId);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('instanceId');
    });

    it('should reject empty instance ID', () => {
      const result = validateInstanceId('');
      
      expect(result.error).toBeDefined();
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const validConfig = {
        NOVITA_API_KEY: 'test-api-key',
        PORT: 3000,
        NODE_ENV: 'development',
        LOG_LEVEL: 'info'
      };

      const result = validateConfig(validConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.value.NOVITA_API_KEY).toBe('test-api-key');
    });

    it('should apply default values', () => {
      const minimalConfig = {
        NOVITA_API_KEY: 'test-api-key'
      };

      const result = validateConfig(minimalConfig);
      
      expect(result.error).toBeUndefined();
      expect(result.value.PORT).toBe(3000);
      expect(result.value.NODE_ENV).toBe('development');
      expect(result.value.LOG_LEVEL).toBe('info');
    });

    it('should reject missing required API key', () => {
      const invalidConfig = {
        PORT: 3000
      };

      const result = validateConfig(invalidConfig);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('NOVITA_API_KEY');
    });

    it('should reject invalid port number', () => {
      const invalidConfig = {
        NOVITA_API_KEY: 'test-api-key',
        PORT: 70000
      };

      const result = validateConfig(invalidConfig);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('PORT');
    });

    it('should reject invalid webhook URL', () => {
      const invalidConfig = {
        NOVITA_API_KEY: 'test-api-key',
        DEFAULT_WEBHOOK_URL: 'not-a-url'
      };

      const result = validateConfig(invalidConfig);
      
      expect(result.error).toBeDefined();
      expect(result.error.details[0].field).toBe('DEFAULT_WEBHOOK_URL');
    });
  });
});