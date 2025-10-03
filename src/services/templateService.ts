import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('template');
import { novitaApiService } from './novitaApiService';
import { Template, NovitaApiClientError } from '../types/api';
import { cacheManager } from './cacheService';
import { ICacheService } from './redisCacheManager';

export class TemplateService {
  private templateCache: ICacheService<Template> | null = null;
  private isInitialized = false;

  constructor() {
    // Initialize asynchronously
    this.initialize().catch(error => {
      logger.error('Failed to initialize template cache', { error: error.message });
    });
  }

  /**
   * Async initializer for cache - must be called before using the service
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    this.templateCache = await cacheManager.getCache<Template>('templates', {
      maxSize: 200,
      defaultTtl: 10 * 60 * 1000, // 10 minutes (templates change less frequently)
      cleanupIntervalMs: 2 * 60 * 1000 // Cleanup every 2 minutes
    });
    
    this.isInitialized = true;
  }

  /**
   * Ensure the service is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.templateCache) {
      throw new Error('Template cache failed to initialize');
    }
  }

  /**
   * Get template configuration by ID with caching support
   */
  async getTemplate(templateId: string | number): Promise<Template> {
    // Ensure cache is initialized
    await this.ensureInitialized();
    
    // Validate input first
    if (templateId === null || templateId === undefined || 
        (typeof templateId === 'string' && templateId.trim() === '') ||
        (typeof templateId === 'number' && (templateId <= 0 || !Number.isInteger(templateId)))) {
      throw new NovitaApiClientError(
        'Template ID is required and must be a non-empty string or valid positive integer',
        400,
        'INVALID_TEMPLATE_ID'
      );
    }

    // Convert number to string for consistency
    const stringTemplateId = typeof templateId === 'number' ? templateId.toString() : templateId.trim();
    
    // Check cache first
    const cachedTemplate = await this.templateCache!.get(stringTemplateId);
    if (cachedTemplate) {
      logger.debug('Returning cached template', { 
        templateId: stringTemplateId 
      });
      return cachedTemplate;
    }

    try {
      // Fetch from API
      logger.debug('Fetching template from API', { templateId: stringTemplateId });
      const template = await novitaApiService.getTemplate(stringTemplateId);
      
      // Validate template data
      this.validateTemplate(template);
      
      // Cache the results
      await this.templateCache!.set(stringTemplateId, template);

      logger.info('Template fetched and cached', { 
        templateId: template.id,
        templateName: template.name,
        imageUrl: template.imageUrl,
        portsCount: template.ports?.length || 0,
        envsCount: template.envs?.length || 0
      });

      return template;
    } catch (error) {
      logger.error('Failed to fetch template', { 
        error: (error as Error).message, 
        templateId: stringTemplateId 
      });
      throw error;
    }
  }

  /**
   * Extract configuration from template for instance creation
   */
  async getTemplateConfiguration(templateId: string | number): Promise<{
    imageUrl: string;
    imageAuth?: string;
    ports: Template['ports'];
    envs: Template['envs'];
  }> {
    const template = await this.getTemplate(templateId);
    
    const config: {
      imageUrl: string;
      imageAuth?: string;
      ports: Template['ports'];
      envs: Template['envs'];
    } = {
      imageUrl: template.imageUrl,
      ports: template.ports || [],
      envs: template.envs || []
    };

    if (template.imageAuth !== undefined) {
      config.imageAuth = template.imageAuth;
    }

    return config;
  }

  /**
   * Validate template data structure
   */
  private validateTemplate(template: Template): void {
    if (!template) {
      throw new NovitaApiClientError(
        'Template data is null or undefined',
        500,
        'INVALID_TEMPLATE_DATA'
      );
    }

    if (!template.id || typeof template.id !== 'string') {
      throw new NovitaApiClientError(
        'Template must have a valid ID',
        500,
        'INVALID_TEMPLATE_ID'
      );
    }

    if (!template.imageUrl || typeof template.imageUrl !== 'string') {
      throw new NovitaApiClientError(
        'Template must have a valid imageUrl',
        500,
        'INVALID_TEMPLATE_IMAGE_URL'
      );
    }

    // Validate ports array if present
    if (template.ports && !Array.isArray(template.ports)) {
      throw new NovitaApiClientError(
        'Template ports must be an array',
        500,
        'INVALID_TEMPLATE_PORTS'
      );
    }

    // Validate each port if ports exist
    if (template.ports) {
      template.ports.forEach((port, index) => {
        if (!port || typeof port !== 'object') {
          throw new NovitaApiClientError(
            `Template port at index ${index} is invalid`,
            500,
            'INVALID_TEMPLATE_PORT'
          );
        }
        
        if (!port.port || typeof port.port !== 'number' || port.port <= 0 || port.port > 65535) {
          throw new NovitaApiClientError(
            `Template port at index ${index} has invalid port number`,
            500,
            'INVALID_TEMPLATE_PORT_NUMBER'
          );
        }
        
        if (!port.type || !['tcp', 'udp', 'http', 'https'].includes(port.type)) {
          throw new NovitaApiClientError(
            `Template port at index ${index} has invalid type`,
            500,
            'INVALID_TEMPLATE_PORT_TYPE'
          );
        }
      });
    }

    // Validate envs array if present
    if (template.envs && !Array.isArray(template.envs)) {
      throw new NovitaApiClientError(
        'Template envs must be an array',
        500,
        'INVALID_TEMPLATE_ENVS'
      );
    }

    // Validate each environment variable if envs exist
    if (template.envs) {
      template.envs.forEach((env, index) => {
        if (!env || typeof env !== 'object') {
          throw new NovitaApiClientError(
            `Template env at index ${index} is invalid`,
            500,
            'INVALID_TEMPLATE_ENV'
          );
        }
        
        if (!env.key || typeof env.key !== 'string' || env.key.trim() === '') {
          throw new NovitaApiClientError(
            `Template env at index ${index} has invalid name`,
            500,
            'INVALID_TEMPLATE_ENV_NAME'
          );
        }
        
        if (env.value === undefined || env.value === null || typeof env.value !== 'string') {
          throw new NovitaApiClientError(
            `Template env at index ${index} has invalid value`,
            500,
            'INVALID_TEMPLATE_ENV_VALUE'
          );
        }
      });
    }
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    await this.ensureInitialized();
    await this.templateCache!.clear();
    logger.info('Template cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<void> {
    await this.ensureInitialized();
    const clearedCount = await this.templateCache!.cleanupExpired();

    if (clearedCount > 0) {
      logger.debug('Cleared expired template cache entries', { count: clearedCount });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    size: number;
    hitRatio: number;
    metrics: any;
    cachedTemplateIds: string[];
  }> {
    await this.ensureInitialized();
    return {
      size: await this.templateCache!.size(),
      hitRatio: this.templateCache!.getHitRatio(),
      metrics: this.templateCache!.getMetrics(),
      cachedTemplateIds: await this.templateCache!.keys()
    };
  }

  /**
   * Check if template is cached
   */
  async isCached(templateId: string | number): Promise<boolean> {
    await this.ensureInitialized();
    const stringTemplateId = typeof templateId === 'number' ? templateId.toString() : templateId;
    return await this.templateCache!.has(stringTemplateId);
  }

  /**
   * Preload template into cache (useful for warming cache)
   */
  async preloadTemplate(templateId: string | number): Promise<void> {
    try {
      await this.getTemplate(templateId);
      logger.debug('Template preloaded into cache', { templateId });
    } catch (error) {
      logger.warn('Failed to preload template', { 
        templateId, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  /**
   * Invalidate specific template from cache
   */
  async invalidateTemplate(templateId: string | number): Promise<boolean> {
    await this.ensureInitialized();
    const stringTemplateId = typeof templateId === 'number' ? templateId.toString() : templateId;
    const deleted = await this.templateCache!.delete(stringTemplateId);
    if (deleted) {
      logger.debug('Template invalidated from cache', { templateId: stringTemplateId });
    }
    return deleted;
  }

  /**
   * Set custom TTL for specific template
   */
  async setTemplateTtl(templateId: string | number, ttlMs: number): Promise<boolean> {
    await this.ensureInitialized();
    const stringTemplateId = typeof templateId === 'number' ? templateId.toString() : templateId;
    const updated = await this.templateCache!.setTtl(stringTemplateId, ttlMs);
    if (updated) {
      logger.debug('Template TTL updated', { templateId: stringTemplateId, ttlMs });
    }
    return updated;
  }
}

// Export singleton instance
export const templateService = new TemplateService();