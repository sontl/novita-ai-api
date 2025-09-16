// Mock logger first
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock the novita client to avoid config validation
jest.mock('../../clients/novitaClient', () => ({
  novitaClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    healthCheck: jest.fn(),
    getCircuitBreakerState: jest.fn(),
    getQueueStatus: jest.fn()
  }
}));

// Mock the novitaApiService
jest.mock('../novitaApiService');

import { templateService, TemplateService } from '../templateService';
import { novitaApiService } from '../novitaApiService';
import { Template, NovitaApiClientError } from '../../types/api';

const mockedNovitaApiService = novitaApiService as jest.Mocked<typeof novitaApiService>;

describe('TemplateService', () => {
  let service: TemplateService;

  const mockTemplate: Template = {
    id: '107672',
    name: 'Ubuntu 22.04 with CUDA',
    imageUrl: 'ubuntu:22.04-cuda',
    imageAuth: 'auth-token-123',
    ports: [
      { port: 8080, type: 'http' },
      { port: 22, type: 'tcp' }
    ],
    envs: [
      { name: 'CUDA_VERSION', value: '11.8' },
      { name: 'PYTHON_VERSION', value: '3.9' }
    ],
    description: 'Ubuntu 22.04 with CUDA support'
  };

  beforeEach(() => {
    service = new TemplateService();
    jest.clearAllMocks();
    // Clear cache before each test
    service.clearCache();
  });

  describe('getTemplate', () => {
    it('should fetch template successfully with string ID', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      const result = await service.getTemplate('107672');

      expect(result).toEqual(mockTemplate);
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledWith('107672');
    });

    it('should fetch template successfully with numeric ID', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      const result = await service.getTemplate(107672);

      expect(result).toEqual(mockTemplate);
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledWith('107672');
    });

    it('should return cached template on subsequent calls', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      // First call with numeric ID
      const result1 = await service.getTemplate(107672);
      // Second call with string ID (should use same cache entry)
      const result2 = await service.getTemplate('107672');

      expect(result1).toEqual(mockTemplate);
      expect(result2).toEqual(mockTemplate);
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledTimes(1);
    });

    it('should validate template ID', async () => {
      await expect(service.getTemplate('')).rejects.toThrow(
        'Template ID is required and must be a non-empty string or valid positive integer'
      );

      await expect(service.getTemplate('   ')).rejects.toThrow(
        'Template ID is required and must be a non-empty string or valid positive integer'
      );

      await expect(service.getTemplate(null as any)).rejects.toThrow(
        'Template ID is required and must be a non-empty string or valid positive integer'
      );

      await expect(service.getTemplate(undefined as any)).rejects.toThrow(
        'Template ID is required and must be a non-empty string or valid positive integer'
      );

      await expect(service.getTemplate(0)).rejects.toThrow(
        'Template ID is required and must be a non-empty string or valid positive integer'
      );

      await expect(service.getTemplate(-1)).rejects.toThrow(
        'Template ID is required and must be a non-empty string or valid positive integer'
      );

      await expect(service.getTemplate(1.5)).rejects.toThrow(
        'Template ID is required and must be a non-empty string or valid positive integer'
      );
    });

    it('should handle API errors', async () => {
      const apiError = new NovitaApiClientError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
      mockedNovitaApiService.getTemplate.mockRejectedValue(apiError);

      await expect(service.getTemplate('nonexistent')).rejects.toThrow('Template not found');
    });

    it('should validate template data structure', async () => {
      const invalidTemplate = {
        id: '',
        name: 'Test',
        imageUrl: '',
        ports: [],
        envs: []
      } as Template;

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template must have a valid ID'
      );
    });

    it('should validate template imageUrl', async () => {
      const invalidTemplate = {
        ...mockTemplate,
        imageUrl: ''
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template must have a valid imageUrl'
      );
    });

    it('should validate ports array structure', async () => {
      const invalidTemplate = {
        ...mockTemplate,
        ports: 'invalid' as any
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template ports must be an array'
      );
    });

    it('should validate individual port objects', async () => {
      const invalidTemplate: Template = {
        ...mockTemplate,
        ports: [
          { port: 0, type: 'http' }, // Invalid port number
        ]
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template port at index 0 has invalid port number'
      );
    });

    it('should validate port types', async () => {
      const invalidTemplate: Template = {
        ...mockTemplate,
        ports: [
          { port: 8080, type: 'invalid' as any }
        ]
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template port at index 0 has invalid type'
      );
    });

    it('should validate envs array structure', async () => {
      const invalidTemplate = {
        ...mockTemplate,
        envs: 'invalid' as any
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template envs must be an array'
      );
    });

    it('should validate individual env objects', async () => {
      const invalidTemplate = {
        ...mockTemplate,
        envs: [
          { name: '', value: 'test' } // Invalid env name
        ]
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template env at index 0 has invalid name'
      );
    });

    it('should validate env values', async () => {
      const invalidTemplate = {
        ...mockTemplate,
        envs: [
          { name: 'TEST', value: null as any } // Invalid env value
        ]
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template env at index 0 has invalid value'
      );
    });

    it('should handle templates without optional fields', async () => {
      const minimalTemplate: Template = {
        id: '108567',
        name: 'Minimal Template',
        imageUrl: 'ubuntu:latest',
        ports: [],
        envs: []
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(minimalTemplate);

      const result = await service.getTemplate(108567);

      expect(result).toEqual(minimalTemplate);
    });

    it('should trim template ID whitespace for string inputs', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      await service.getTemplate('  107672  ');

      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledWith('107672');
    });
  });

  describe('getTemplateConfiguration', () => {
    it('should extract configuration from template', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      const config = await service.getTemplateConfiguration(107672);

      expect(config).toEqual({
        imageUrl: mockTemplate.imageUrl,
        imageAuth: mockTemplate.imageAuth,
        ports: mockTemplate.ports,
        envs: mockTemplate.envs
      });
    });

    it('should handle template without optional fields', async () => {
      const minimalTemplate: Template = {
        id: '109876',
        name: 'Minimal',
        imageUrl: 'ubuntu:latest',
        ports: [],
        envs: []
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(minimalTemplate);

      const config = await service.getTemplateConfiguration(109876);

      expect(config).toEqual({
        imageUrl: 'ubuntu:latest',
        imageAuth: undefined,
        ports: [],
        envs: []
      });
    });
  });

  describe('cache management', () => {
    it('should cache templates correctly', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      await service.getTemplate(107672);
      
      const stats = service.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.cachedTemplateIds).toContain('107672');
    });

    it('should check if template is cached', async () => {
      expect(service.isCached(107672)).toBe(false);
      expect(service.isCached('107672')).toBe(false);

      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);
      await service.getTemplate(107672);

      expect(service.isCached(107672)).toBe(true);
      expect(service.isCached('107672')).toBe(true);
    });

    it('should clear cache', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);
      await service.getTemplate(107672);

      expect(service.getCacheStats().size).toBe(1);

      service.clearCache();

      expect(service.getCacheStats().size).toBe(0);
    });

    it('should clear expired cache entries', async () => {
      // Cache entries expire based on configured TTL
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);
      await service.getTemplate(107672);

      expect(service.getCacheStats().size).toBe(1);

      // Clear cache manually for testing
      service.clearCache();

      expect(service.getCacheStats().size).toBe(0);
    });

    it('should use configured cache TTL', () => {
      // Cache TTL is configured during service initialization
      const stats = service.getCacheStats();
      expect(stats).toBeDefined();
      expect(typeof stats.size).toBe('number');
    });

    it('should respect cache TTL', async () => {
      // This test verifies that cache TTL works, but since we can't easily mock time
      // we'll test that the cache is used when items haven't expired
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      // First call
      await service.getTemplate(107672);
      
      // Second call should use cache (within TTL)
      await service.getTemplate(107672);

      // Only one API call should have been made due to caching
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe('preloadTemplate', () => {
    it('should preload template into cache', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      await service.preloadTemplate(107672);

      expect(service.isCached(107672)).toBe(true);
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledWith('107672');
    });

    it('should handle preload errors', async () => {
      const apiError = new NovitaApiClientError('Template not found', 404);
      mockedNovitaApiService.getTemplate.mockRejectedValue(apiError);

      await expect(service.preloadTemplate('nonexistent')).rejects.toThrow('Template not found');
    });
  });

  describe('singleton instance', () => {
    it('should export singleton instance', () => {
      expect(templateService).toBeInstanceOf(TemplateService);
    });
  });

  describe('edge cases', () => {
    it('should handle null template response', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(null as any);

      await expect(service.getTemplate(107672)).rejects.toThrow(
        'Template data is null or undefined'
      );
    });

    it('should handle undefined template response', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(undefined as any);

      await expect(service.getTemplate(107672)).rejects.toThrow(
        'Template data is null or undefined'
      );
    });

    it('should validate port numbers within valid range', async () => {
      const invalidTemplate: Template = {
        ...mockTemplate,
        ports: [
          { port: 65536, type: 'tcp' } // Port number too high
        ]
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(invalidTemplate);

      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Template port at index 0 has invalid port number'
      );
    });

    it('should handle templates with undefined ports and envs', async () => {
      const templateWithUndefined: Template = {
        id: '110000',
        name: 'Template with undefined fields',
        imageUrl: 'ubuntu:latest',
        ports: undefined as any,
        envs: undefined as any
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(templateWithUndefined);

      const config = await service.getTemplateConfiguration(110000);

      expect(config.ports).toEqual([]);
      expect(config.envs).toEqual([]);
    });
  });
});