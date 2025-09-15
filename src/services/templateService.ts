import { logger } from '../utils/logger';
import { novitaApiService } from './novitaApiService';
import { Template, NovitaApiClientError } from '../types/api';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface TemplateCache {
  [templateId: string]: CacheEntry<Template>;
}

export class TemplateService {
  private templateCache: TemplateCache = {};
  private readonly defaultCacheTtl = 10 * 60 * 1000; // 10 minutes (templates change less frequently)

  /**
   * Get template configuration by ID with caching support
   */
  async getTemplate(templateId: string): Promise<Template> {
    if (!templateId || typeof templateId !== 'string' || templateId.trim() === '') {
      throw new NovitaApiClientError(
        'Template ID is required and must be a non-empty string',
        400,
        'INVALID_TEMPLATE_ID'
      );
    }

    const normalizedTemplateId = templateId.trim();
    
    // Check cache first
    const cachedEntry = this.templateCache[normalizedTemplateId];
    if (cachedEntry && this.isCacheValid(cachedEntry)) {
      logger.debug('Returning cached template', { 
        templateId: normalizedTemplateId 
      });
      return cachedEntry.data;
    }

    try {
      // Fetch from API
      logger.debug('Fetching template from API', { templateId: normalizedTemplateId });
      const template = await novitaApiService.getTemplate(normalizedTemplateId);
      
      // Validate template data
      this.validateTemplate(template);
      
      // Cache the results
      this.templateCache[normalizedTemplateId] = {
        data: template,
        timestamp: Date.now(),
        ttl: this.defaultCacheTtl
      };

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
        templateId: normalizedTemplateId 
      });
      throw error;
    }
  }

  /**
   * Extract configuration from template for instance creation
   */
  async getTemplateConfiguration(templateId: string): Promise<{
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
        
        if (!env.name || typeof env.name !== 'string' || env.name.trim() === '') {
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
   * Check if cache entry is still valid
   */
  private isCacheValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.templateCache = {};
    logger.info('Template cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    let clearedCount = 0;

    for (const templateId in this.templateCache) {
      const entry = this.templateCache[templateId];
      if (entry && !this.isCacheValid(entry)) {
        delete this.templateCache[templateId];
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      logger.debug('Cleared expired template cache entries', { count: clearedCount });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    templateCacheSize: number;
    cachedTemplateIds: string[];
  } {
    return {
      templateCacheSize: Object.keys(this.templateCache).length,
      cachedTemplateIds: Object.keys(this.templateCache)
    };
  }

  /**
   * Set custom cache TTL (for testing or configuration)
   */
  setCacheTtl(ttlMs: number): void {
    if (ttlMs < 0) {
      throw new Error('Cache TTL must be non-negative');
    }
    (this as any).defaultCacheTtl = ttlMs;
    logger.debug('Template cache TTL updated', { ttlMs });
  }

  /**
   * Check if template is cached
   */
  isCached(templateId: string): boolean {
    const entry = this.templateCache[templateId];
    return entry ? this.isCacheValid(entry) : false;
  }

  /**
   * Preload template into cache (useful for warming cache)
   */
  async preloadTemplate(templateId: string): Promise<void> {
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
}

// Export singleton instance
export const templateService = new TemplateService();