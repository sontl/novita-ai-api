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
    id: 'template-123',
    name: 'Ubuntu 22.04 with CUDA',
    imageUrl: 'ubuntu:22.04-cuda',
    imageAuth: 'auth-token-123',
    ports: [
      { port: 8080, type: 'http', name: 'web' },
      { port: 22, type: 'tcp', name: 'ssh' }
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
  });

  describe('getTemplate', () => {
    it('should fetch template successfully', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      const result = await service.getTemplate('template-123');

      expect(result).toEqual(mockTemplate);
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledWith('template-123');
    });

    it('should return cached template on subsequent calls', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      // First call
      const result1 = await service.getTemplate('template-123');
      // Second call
      const result2 = await service.getTemplate('template-123');

      expect(result1).toEqual(mockTemplate);
      expect(result2).toEqual(mockTemplate);
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledTimes(1);
    });

    it('should validate template ID', async () => {
      await expect(service.getTemplate('')).rejects.toThrow(
        'Template ID is required and must be a non-empty string'
      );

      await expect(service.getTemplate('   ')).rejects.toThrow(
        'Template ID is required and must be a non-empty string'
      );

      await expect(service.getTemplate(null as any)).rejects.toThrow(
        'Template ID is required and must be a non-empty string'
      );

      await expect(service.getTemplate(undefined as any)).rejects.toThrow(
        'Template ID is required and must be a non-empty string'
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
        id: 'minimal-template',
        name: 'Minimal Template',
        imageUrl: 'ubuntu:latest',
        ports: [],
        envs: []
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(minimalTemplate);

      const result = await service.getTemplate('minimal-template');

      expect(result).toEqual(minimalTemplate);
    });

    it('should trim template ID whitespace', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      await service.getTemplate('  template-123  ');

      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledWith('template-123');
    });
  });

  describe('getTemplateConfiguration', () => {
    it('should extract configuration from template', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      const config = await service.getTemplateConfiguration('template-123');

      expect(config).toEqual({
        imageUrl: mockTemplate.imageUrl,
        imageAuth: mockTemplate.imageAuth,
        ports: mockTemplate.ports,
        envs: mockTemplate.envs
      });
    });

    it('should handle template without optional fields', async () => {
      const minimalTemplate: Template = {
        id: 'minimal',
        name: 'Minimal',
        imageUrl: 'ubuntu:latest',
        ports: [],
        envs: []
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(minimalTemplate);

      const config = await service.getTemplateConfiguration('minimal');

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

      await service.getTemplate('template-123');
      
      const stats = service.getCacheStats();
      expect(stats.templateCacheSize).toBe(1);
      expect(stats.cachedTemplateIds).toContain('template-123');
    });

    it('should check if template is cached', async () => {
      expect(service.isCached('template-123')).toBe(false);

      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);
      await service.getTemplate('template-123');

      expect(service.isCached('template-123')).toBe(true);
    });

    it('should clear cache', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);
      await service.getTemplate('template-123');

      expect(service.getCacheStats().templateCacheSize).toBe(1);

      service.clearCache();

      expect(service.getCacheStats().templateCacheSize).toBe(0);
    });

    it('should clear expired cache entries', async () => {
      // Set very short TTL for testing
      service.setCacheTtl(1);
      
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);
      await service.getTemplate('template-123');

      expect(service.getCacheStats().templateCacheSize).toBe(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      service.clearExpiredCache();

      expect(service.getCacheStats().templateCacheSize).toBe(0);
    });

    it('should set custom cache TTL', () => {
      expect(() => service.setCacheTtl(5000)).not.toThrow();
      expect(() => service.setCacheTtl(-1)).toThrow('Cache TTL must be non-negative');
    });

    it('should respect cache TTL', async () => {
      // Set very short TTL
      service.setCacheTtl(1);
      
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      // First call
      await service.getTemplate('template-123');
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Second call should fetch from API again
      await service.getTemplate('template-123');

      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledTimes(2);
    });
  });

  describe('preloadTemplate', () => {
    it('should preload template into cache', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(mockTemplate);

      await service.preloadTemplate('template-123');

      expect(service.isCached('template-123')).toBe(true);
      expect(mockedNovitaApiService.getTemplate).toHaveBeenCalledWith('template-123');
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

      await expect(service.getTemplate('template-123')).rejects.toThrow(
        'Template data is null or undefined'
      );
    });

    it('should handle undefined template response', async () => {
      mockedNovitaApiService.getTemplate.mockResolvedValue(undefined as any);

      await expect(service.getTemplate('template-123')).rejects.toThrow(
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
        id: 'template-undefined',
        name: 'Template with undefined fields',
        imageUrl: 'ubuntu:latest',
        ports: undefined as any,
        envs: undefined as any
      };

      mockedNovitaApiService.getTemplate.mockResolvedValue(templateWithUndefined);

      const config = await service.getTemplateConfiguration('template-undefined');

      expect(config.ports).toEqual([]);
      expect(config.envs).toEqual([]);
    });
  });
});