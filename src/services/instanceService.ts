import { logger } from '../utils/logger';
import { productService } from './productService';
import { templateService } from './templateService';
import { jobQueueService } from './jobQueueService';
import { novitaApiService } from './novitaApiService';
import { config } from '../config/config';
import {
  CreateInstanceRequest,
  CreateInstanceResponse,
  InstanceDetails,
  ListInstancesResponse,
  EnhancedInstanceDetails,
  EnhancedListInstancesResponse,
  InstanceState,
  InstanceStatus,
  NovitaCreateInstanceRequest,
  InstanceResponse,
  NovitaApiClientError,
  JobType
} from '../types/api';
import { JobPriority, CreateInstanceJobPayload } from '../types/job';
import { cacheManager } from './cacheService';

export class InstanceService {
  private instanceStates: Map<string, InstanceState> = new Map();
  
  private readonly instanceCache = cacheManager.getCache<InstanceDetails>('instance-details', {
    maxSize: 500,
    defaultTtl: 30 * 1000, // 30 seconds for instance status
    cleanupIntervalMs: 60 * 1000 // Cleanup every minute
  });
  
  private readonly instanceStateCache = cacheManager.getCache<InstanceState>('instance-states', {
    maxSize: 1000,
    defaultTtl: 60 * 1000, // 1 minute for instance states
    cleanupIntervalMs: 2 * 60 * 1000 // Cleanup every 2 minutes
  });
  
  // Merged results cache for comprehensive listings
  private readonly mergedInstancesCache = cacheManager.getCache<EnhancedInstanceDetails[]>('merged-instances', {
    maxSize: 100,
    defaultTtl: config.instanceListing.comprehensiveCacheTtl * 1000, // Convert seconds to milliseconds
    cleanupIntervalMs: 60 * 1000 // Cleanup every minute
  });
  
  // Novita API response cache
  private readonly novitaApiCache = cacheManager.getCache<InstanceResponse[]>('novita-api-instances', {
    maxSize: 100,
    defaultTtl: config.instanceListing.novitaApiCacheTtl * 1000, // Convert seconds to milliseconds
    cleanupIntervalMs: 2 * 60 * 1000 // Cleanup every 2 minutes
  });
  
  private readonly defaultRegion = 'CN-HK-01';

  /**
   * Create a new GPU instance with automated lifecycle management
   */
  async createInstance(request: CreateInstanceRequest): Promise<CreateInstanceResponse> {
    try {
      // Generate unique instance ID
      const instanceId = this.generateInstanceId();
      
      // Validate request parameters
      this.validateCreateInstanceRequest(request);

      // Set defaults
      const gpuNum = request.gpuNum || 1;
      const rootfsSize = request.rootfsSize || 60;
      const region = request.region || this.defaultRegion;

      logger.info('Starting instance creation workflow', {
        instanceId,
        name: request.name,
        productName: request.productName,
        templateId: request.templateId,
        gpuNum,
        rootfsSize,
        region
      });

      // Get optimal product and template configuration in parallel
      const [optimalProduct, templateConfig] = await Promise.all([
        productService.getOptimalProduct(request.productName, region),
        templateService.getTemplateConfiguration(request.templateId)
      ]);

      // Create instance state
      const instanceState: InstanceState = {
        id: instanceId,
        name: request.name,
        status: InstanceStatus.CREATING,
        productId: optimalProduct.id,
        templateId: request.templateId,
        configuration: {
          gpuNum,
          rootfsSize,
          region,
          imageUrl: templateConfig.imageUrl,
          ...(templateConfig.imageAuth && { imageAuth: templateConfig.imageAuth }),
          ports: templateConfig.ports,
          envs: templateConfig.envs
        },
        timestamps: {
          created: new Date()
        },
        ...(request.webhookUrl && { webhookUrl: request.webhookUrl })
      };

      // Store instance state
      this.instanceStates.set(instanceId, instanceState);

      // Queue instance creation job
      const jobPayload: CreateInstanceJobPayload = {
        instanceId,
        name: request.name,
        productName: request.productName,
        templateId: request.templateId,
        gpuNum,
        rootfsSize,
        region
      };
      
      if (request.webhookUrl) {
        jobPayload.webhookUrl = request.webhookUrl;
      }

      await jobQueueService.addJob(
        JobType.CREATE_INSTANCE,
        jobPayload,
        JobPriority.HIGH
      );

      logger.info('Instance creation job queued', {
        instanceId,
        productId: optimalProduct.id,
        templateId: request.templateId
      });

      return {
        instanceId,
        status: 'creating',
        message: 'Instance creation initiated successfully',
        estimatedReadyTime: this.calculateEstimatedReadyTime()
      };

    } catch (error) {
      logger.error('Failed to create instance', {
        error: (error as Error).message,
        request
      });
      throw error;
    }
  }

  /**
   * Get instance status and details with caching
   */
  async getInstanceStatus(instanceId: string): Promise<InstanceDetails> {
    try {
      // Check cache first
      const cachedDetails = this.instanceCache.get(instanceId);
      if (cachedDetails) {
        logger.debug('Returning cached instance status', { instanceId });
        return cachedDetails;
      }

      // Get instance state
      const instanceState = this.instanceStates.get(instanceId);
      if (!instanceState) {
        throw new NovitaApiClientError(
          `Instance not found: ${instanceId}`,
          404,
          'INSTANCE_NOT_FOUND'
        );
      }

      let instanceDetails: InstanceDetails;

      // If we have a Novita instance ID, fetch current status from API
      if (instanceState.novitaInstanceId) {
        try {
          const novitaInstance = await novitaApiService.getInstance(instanceState.novitaInstanceId);
          instanceDetails = this.mapNovitaInstanceToDetails(novitaInstance, instanceState);
          
          // Update our internal state with latest status
          instanceState.status = novitaInstance.status;
          if (novitaInstance.status === InstanceStatus.RUNNING && !instanceState.timestamps.ready) {
            instanceState.timestamps.ready = new Date();
          }
          
          // Update state cache
          this.instanceStateCache.set(instanceId, instanceState);
        } catch (error) {
          // If API is unavailable, return cached state
          logger.warn('Failed to fetch instance from Novita API, using cached state', {
            instanceId,
            novitaInstanceId: instanceState.novitaInstanceId,
            error: (error as Error).message
          });
          instanceDetails = this.mapInstanceStateToDetails(instanceState);
        }
      } else {
        // Instance not yet created in Novita, return our internal state
        instanceDetails = this.mapInstanceStateToDetails(instanceState);
      }

      // Cache the result
      this.instanceCache.set(instanceId, instanceDetails);

      return instanceDetails;

    } catch (error) {
      logger.error('Failed to get instance status', {
        instanceId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * List all managed instances
   */
  async listInstances(): Promise<ListInstancesResponse> {
    try {
      const instances: InstanceDetails[] = [];
      
      // Get all instance states
      for (const [instanceId, instanceState] of this.instanceStates.entries()) {
        try {
          const instanceDetails = await this.getInstanceStatus(instanceId);
          instances.push(instanceDetails);
        } catch (error) {
          logger.warn('Failed to get status for instance in list', {
            instanceId,
            error: (error as Error).message
          });
          // Include instance with error state
          instances.push(this.mapInstanceStateToDetails(instanceState));
        }
      }

      // Sort by creation time (newest first)
      instances.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      logger.info('Listed instances', { count: instances.length });

      return {
        instances,
        total: instances.length
      };

    } catch (error) {
      logger.error('Failed to list instances', {
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * List instances with data from both local state and Novita.ai API
   */
  async listInstancesComprehensive(options?: {
    includeNovitaOnly?: boolean;
    syncLocalState?: boolean;
  }): Promise<EnhancedListInstancesResponse> {
    try {
      const startTime = Date.now();
      
      // Check cache first
      const cacheKey = `comprehensive_${JSON.stringify(options || {})}`;
      const cachedResult = this.mergedInstancesCache.get(cacheKey);
      if (cachedResult) {
        logger.debug('Returning cached comprehensive instance list', { count: cachedResult.length });
        return {
          instances: cachedResult,
          total: cachedResult.length,
          sources: this.calculateSourceCounts(cachedResult),
          performance: {
            totalRequestTime: 0, // Cache hit
            novitaApiTime: 0,
            localDataTime: 0,
            mergeProcessingTime: 0,
            cacheHitRatio: this.mergedInstancesCache.getHitRatio()
          }
        };
      }
      
      // Fetch from both sources in parallel
      const localStartTime = Date.now();
      const localInstancesPromise = this.getLocalInstances();
      
      const novitaStartTime = Date.now();
      const novitaInstancesPromise = this.getNovitaInstances().catch((error: Error) => {
        logger.warn('Failed to fetch instances from Novita.ai, using local only', { error: error.message });
        return [];
      });

      const [localInstances, novitaInstances] = await Promise.all([
        localInstancesPromise,
        novitaInstancesPromise
      ]);
      
      const localDataTime = Date.now() - localStartTime;
      const novitaApiTime = Date.now() - novitaStartTime;

      // Merge and reconcile data
      const mergeStartTime = Date.now();
      const mergedInstances = this.mergeInstanceData(localInstances, novitaInstances, options?.includeNovitaOnly);
      const mergeProcessingTime = Date.now() - mergeStartTime;
      
      // Optionally sync local state with Novita data
      if (options?.syncLocalState) {
        await this.syncLocalStateWithNovita(novitaInstances);
      }

      // Cache the result
      this.mergedInstancesCache.set(cacheKey, mergedInstances);

      const totalRequestTime = Date.now() - startTime;
      
      logger.info('Listed instances comprehensively', {
        localCount: localInstances.length,
        novitaCount: novitaInstances.length,
        mergedCount: mergedInstances.length,
        processingTimeMs: totalRequestTime
      });

      return {
        instances: mergedInstances,
        total: mergedInstances.length,
        sources: this.calculateSourceCounts(mergedInstances),
        performance: {
          totalRequestTime,
          novitaApiTime,
          localDataTime,
          mergeProcessingTime,
          cacheHitRatio: this.mergedInstancesCache.getHitRatio()
        }
      };
    } catch (error) {
      logger.error('Failed to list instances comprehensively', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update instance state (used by job workers)
   */
  updateInstanceState(instanceId: string, updates: Partial<InstanceState>): void {
    const instanceState = this.instanceStates.get(instanceId);
    if (!instanceState) {
      throw new Error(`Instance state not found: ${instanceId}`);
    }

    // Merge updates
    Object.assign(instanceState, updates);

    // Update state cache
    this.instanceStateCache.set(instanceId, instanceState);

    // Clear instance details cache for this instance to force refresh
    this.instanceCache.delete(instanceId);

    logger.debug('Instance state updated', {
      instanceId,
      status: instanceState.status,
      novitaInstanceId: instanceState.novitaInstanceId
    });
  }

  /**
   * Get instance state (for job workers)
   */
  getInstanceState(instanceId: string): InstanceState | undefined {
    return this.instanceStates.get(instanceId);
  }

  /**
   * Merge local and Novita instance data with conflict resolution
   */
  private mergeInstanceData(
    localInstances: InstanceDetails[], 
    novitaInstances: InstanceResponse[],
    includeNovitaOnly: boolean = true
  ): EnhancedInstanceDetails[] {
    const mergedMap = new Map<string, EnhancedInstanceDetails>();
    
    // Add local instances first
    localInstances.forEach(localInstance => {
      const enhanced: EnhancedInstanceDetails = {
        ...localInstance,
        source: 'local',
        dataConsistency: 'consistent',
        lastSyncedAt: new Date().toISOString()
      };
      mergedMap.set(localInstance.id, enhanced);
    });

    // Process Novita instances
    novitaInstances.forEach(novitaInstance => {
      const localMatch = this.findLocalInstanceMatch(novitaInstance, localInstances);
      
      if (localMatch) {
        // Merge data for matched instances
        const existing = mergedMap.get(localMatch.id)!;
        const merged = this.mergeMatchedInstance(existing, novitaInstance);
        mergedMap.set(localMatch.id, merged);
      } else if (includeNovitaOnly) {
        // Add Novita-only instances if enabled
        const novitaOnly = this.transformNovitaToEnhanced(novitaInstance);
        mergedMap.set(novitaInstance.id, novitaOnly);
      }
    });

    // Convert to array and sort
    const mergedInstances = Array.from(mergedMap.values());
    return mergedInstances.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Find local instance that matches Novita instance
   */
  private findLocalInstanceMatch(
    novitaInstance: InstanceResponse, 
    localInstances: InstanceDetails[]
  ): InstanceDetails | null {
    // Try to match by Novita instance ID stored in local state
    const localState = Array.from(this.instanceStates.values());
    const stateMatch = localState.find(state => state.novitaInstanceId === novitaInstance.id);
    
    if (stateMatch) {
      return localInstances.find(local => local.id === stateMatch.id) || null;
    }

    // Fallback: match by name and creation time (approximate)
    return localInstances.find(local => 
      local.name === novitaInstance.name &&
      Math.abs(new Date(local.createdAt).getTime() - new Date(novitaInstance.createdAt).getTime()) < 60000 // 1 minute tolerance
    ) || null;
  }

  /**
   * Merge matched local and Novita instance data
   */
  private mergeMatchedInstance(
    localInstance: EnhancedInstanceDetails,
    novitaInstance: InstanceResponse
  ): EnhancedInstanceDetails {
    const localStateTime = new Date(localInstance.createdAt).getTime();
    const novitaStateTime = new Date(novitaInstance.createdAt).getTime();
    
    let dataConsistency: EnhancedInstanceDetails['dataConsistency'] = 'consistent';
    
    // Determine data consistency
    if (localInstance.status !== novitaInstance.status) {
      dataConsistency = localStateTime > novitaStateTime ? 'local-newer' : 'novita-newer';
    }

    // Build base merged instance
    const merged: EnhancedInstanceDetails = {
      ...localInstance,
      // Prefer Novita.ai data for most fields as it's authoritative
      status: novitaInstance.status,
      region: novitaInstance.region,
      portMappings: novitaInstance.portMappings || localInstance.portMappings,
      
      // Metadata
      source: 'merged',
      dataConsistency,
      lastSyncedAt: new Date().toISOString()
    };

    // Add optional Novita.ai fields only if they exist
    if (novitaInstance.clusterId) merged.clusterId = novitaInstance.clusterId;
    if (novitaInstance.clusterName) merged.clusterName = novitaInstance.clusterName;
    if (novitaInstance.productName) merged.productName = novitaInstance.productName;
    if (novitaInstance.cpuNum) merged.cpuNum = novitaInstance.cpuNum;
    if (novitaInstance.memory) merged.memory = novitaInstance.memory;
    if (novitaInstance.imageUrl) merged.imageUrl = novitaInstance.imageUrl;
    if (novitaInstance.imageAuthId) merged.imageAuthId = novitaInstance.imageAuthId;
    if (novitaInstance.command) merged.command = novitaInstance.command;
    if (novitaInstance.volumeMounts) merged.volumeMounts = novitaInstance.volumeMounts;
    if (novitaInstance.statusError) merged.statusError = novitaInstance.statusError;
    if (novitaInstance.envs) merged.envs = novitaInstance.envs;
    if (novitaInstance.kind) merged.kind = novitaInstance.kind;
    if (novitaInstance.endTime) merged.endTime = novitaInstance.endTime;
    if (novitaInstance.spotStatus) merged.spotStatus = novitaInstance.spotStatus;
    if (novitaInstance.spotReclaimTime) merged.spotReclaimTime = novitaInstance.spotReclaimTime;

    return merged;
  }

  /**
   * Transform Novita instance to enhanced format
   */
  private transformNovitaToEnhanced(novitaInstance: InstanceResponse): EnhancedInstanceDetails {
    // Build base instance with required fields
    const enhanced: EnhancedInstanceDetails = {
      id: novitaInstance.id,
      name: novitaInstance.name,
      status: novitaInstance.status,
      gpuNum: novitaInstance.gpuNum,
      region: novitaInstance.region,
      portMappings: novitaInstance.portMappings || [],
      createdAt: novitaInstance.createdAt,
      
      // Metadata
      source: 'novita',
      dataConsistency: 'consistent',
      lastSyncedAt: new Date().toISOString()
    };
    
    // Add optional fields from Novita only if they exist
    if (novitaInstance.clusterId) enhanced.clusterId = novitaInstance.clusterId;
    if (novitaInstance.clusterName) enhanced.clusterName = novitaInstance.clusterName;
    if (novitaInstance.productName) enhanced.productName = novitaInstance.productName;
    if (novitaInstance.cpuNum) enhanced.cpuNum = novitaInstance.cpuNum;
    if (novitaInstance.memory) enhanced.memory = novitaInstance.memory;
    if (novitaInstance.imageUrl) enhanced.imageUrl = novitaInstance.imageUrl;
    if (novitaInstance.imageAuthId) enhanced.imageAuthId = novitaInstance.imageAuthId;
    if (novitaInstance.command) enhanced.command = novitaInstance.command;
    if (novitaInstance.volumeMounts) enhanced.volumeMounts = novitaInstance.volumeMounts;
    if (novitaInstance.statusError) enhanced.statusError = novitaInstance.statusError;
    if (novitaInstance.envs) enhanced.envs = novitaInstance.envs;
    if (novitaInstance.kind) enhanced.kind = novitaInstance.kind;
    if (novitaInstance.endTime) enhanced.endTime = novitaInstance.endTime;
    if (novitaInstance.spotStatus) enhanced.spotStatus = novitaInstance.spotStatus;
    if (novitaInstance.spotReclaimTime) enhanced.spotReclaimTime = novitaInstance.spotReclaimTime;
    
    return enhanced;
  }

  /**
   * Sync local state with Novita instance data
   */
  private async syncLocalStateWithNovita(novitaInstances: InstanceResponse[]): Promise<void> {
    const syncPromises = novitaInstances.map(async (novitaInstance) => {
      const localState = Array.from(this.instanceStates.values())
        .find(state => state.novitaInstanceId === novitaInstance.id);
      
      if (localState && localState.status !== novitaInstance.status) {
        this.updateInstanceState(localState.id, {
          status: novitaInstance.status,
          timestamps: {
            ...localState.timestamps
          }
        });
        
        logger.debug('Synced local state with Novita', {
          instanceId: localState.id,
          novitaInstanceId: novitaInstance.id,
          oldStatus: localState.status,
          newStatus: novitaInstance.status
        });
      }
    });
    
    await Promise.allSettled(syncPromises);
  }

  /**
   * Get local instances only
   */
  private async getLocalInstances(): Promise<InstanceDetails[]> {
    const instances: InstanceDetails[] = [];
    
    for (const [instanceId, instanceState] of this.instanceStates.entries()) {
      try {
        const instanceDetails = this.mapInstanceStateToDetails(instanceState);
        instances.push(instanceDetails);
      } catch (error) {
        logger.warn('Failed to process local instance state', {
          instanceId,
          error: (error as Error).message
        });
      }
    }
    
    return instances;
  }

  /**
   * Get Novita instances only with caching
   */
  private async getNovitaInstances(): Promise<InstanceResponse[]> {
    try {
      // Check cache first
      const cachedInstances = this.novitaApiCache.get('all');
      if (cachedInstances) {
        logger.debug('Using cached Novita instances', { count: cachedInstances.length });
        return cachedInstances;
      }
      
      const response = await novitaApiService.listInstances();
      const instances = response.instances;
      
      // Cache the result
      this.novitaApiCache.set('all', instances);
      
      logger.info('Fetched instances from Novita.ai', { count: instances.length });
      return instances;
    } catch (error) {
      logger.error('Failed to fetch instances from Novita.ai', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Calculate source distribution counts
   */
  private calculateSourceCounts(instances: EnhancedInstanceDetails[]) {
    return {
      local: instances.filter(i => i.source === 'local').length,
      novita: instances.filter(i => i.source === 'novita').length,
      merged: instances.filter(i => i.source === 'merged').length
    };
  }

  /**
   * Validate create instance request
   */
  private validateCreateInstanceRequest(request: CreateInstanceRequest): void {
    if (!request.name || typeof request.name !== 'string' || request.name.trim() === '') {
      throw new NovitaApiClientError(
        'Instance name is required and must be a non-empty string',
        400,
        'INVALID_INSTANCE_NAME'
      );
    }

    if (!request.productName || typeof request.productName !== 'string' || request.productName.trim() === '') {
      throw new NovitaApiClientError(
        'Product name is required and must be a non-empty string',
        400,
        'INVALID_PRODUCT_NAME'
      );
    }

    if (!request.templateId || (typeof request.templateId !== 'string' && typeof request.templateId !== 'number') || 
        (typeof request.templateId === 'string' && request.templateId.trim() === '') ||
        (typeof request.templateId === 'number' && request.templateId <= 0)) {
      throw new NovitaApiClientError(
        'Template ID is required and must be a non-empty string or valid positive number',
        400,
        'INVALID_TEMPLATE_ID'
      );
    }

    if (request.gpuNum !== undefined && (typeof request.gpuNum !== 'number' || request.gpuNum < 1 || request.gpuNum > 8)) {
      throw new NovitaApiClientError(
        'GPU number must be between 1 and 8',
        400,
        'INVALID_GPU_NUM'
      );
    }

    if (request.rootfsSize !== undefined && (typeof request.rootfsSize !== 'number' || request.rootfsSize < 10 || request.rootfsSize > 1000)) {
      throw new NovitaApiClientError(
        'Root filesystem size must be between 10 and 1000 GB',
        400,
        'INVALID_ROOTFS_SIZE'
      );
    }

    if (request.webhookUrl !== undefined && (typeof request.webhookUrl !== 'string' || !this.isValidUrl(request.webhookUrl))) {
      throw new NovitaApiClientError(
        'Webhook URL must be a valid HTTP/HTTPS URL',
        400,
        'INVALID_WEBHOOK_URL'
      );
    }
  }

  /**
   * Generate unique instance ID
   */
  private generateInstanceId(): string {
    return `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Calculate estimated ready time (rough estimate)
   */
  private calculateEstimatedReadyTime(): string {
    // Estimate 3-5 minutes for instance creation and startup
    const estimatedMinutes = 4;
    const estimatedTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    return estimatedTime.toISOString();
  }

  /**
   * Map Novita instance response to our instance details format
   */
  private mapNovitaInstanceToDetails(novitaInstance: InstanceResponse, instanceState: InstanceState): InstanceDetails {
    const details: InstanceDetails = {
      id: instanceState.id,
      name: instanceState.name,
      status: novitaInstance.status,
      gpuNum: instanceState.configuration.gpuNum,
      region: instanceState.configuration.region,
      portMappings: novitaInstance.portMappings || [],
      createdAt: instanceState.timestamps.created.toISOString()
    };

    if (novitaInstance.connectionInfo) {
      details.connectionDetails = novitaInstance.connectionInfo;
    }

    if (instanceState.timestamps.ready) {
      details.readyAt = instanceState.timestamps.ready.toISOString();
    }

    return details;
  }

  /**
   * Map internal instance state to instance details format
   */
  private mapInstanceStateToDetails(instanceState: InstanceState): InstanceDetails {
    const details: InstanceDetails = {
      id: instanceState.id,
      name: instanceState.name,
      status: instanceState.status,
      gpuNum: instanceState.configuration.gpuNum,
      region: instanceState.configuration.region,
      portMappings: [],
      createdAt: instanceState.timestamps.created.toISOString()
    };

    if (instanceState.timestamps.ready) {
      details.readyAt = instanceState.timestamps.ready.toISOString();
    }

    return details;
  }



  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.instanceCache.clear();
    this.instanceStateCache.clear();
    logger.info('Instance cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const detailsCleaned = this.instanceCache.cleanupExpired();
    const statesCleaned = this.instanceStateCache.cleanupExpired();
    const totalCleaned = detailsCleaned + statesCleaned;

    if (totalCleaned > 0) {
      logger.debug('Cleared expired instance cache entries', { 
        detailsCleaned, 
        statesCleaned, 
        totalCleaned 
      });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    instanceDetailsCache: {
      size: number;
      hitRatio: number;
      metrics: any;
    };
    instanceStatesCache: {
      size: number;
      hitRatio: number;
      metrics: any;
    };
    instanceStatesSize: number;
    cachedInstanceIds: string[];
  } {
    return {
      instanceDetailsCache: {
        size: this.instanceCache.size(),
        hitRatio: this.instanceCache.getHitRatio(),
        metrics: this.instanceCache.getMetrics()
      },
      instanceStatesCache: {
        size: this.instanceStateCache.size(),
        hitRatio: this.instanceStateCache.getHitRatio(),
        metrics: this.instanceStateCache.getMetrics()
      },
      instanceStatesSize: this.instanceStates.size,
      cachedInstanceIds: this.instanceCache.keys()
    };
  }

  /**
   * Invalidate cache for specific instance
   */
  invalidateInstanceCache(instanceId: string): void {
    this.instanceCache.delete(instanceId);
    this.instanceStateCache.delete(instanceId);
    logger.debug('Instance cache invalidated', { instanceId });
  }

  /**
   * Preload instance into cache
   */
  async preloadInstance(instanceId: string): Promise<void> {
    try {
      await this.getInstanceStatus(instanceId);
      logger.debug('Instance preloaded into cache', { instanceId });
    } catch (error) {
      logger.warn('Failed to preload instance', { 
        instanceId, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  /**
   * Get all instance states (for monitoring/debugging)
   */
  getAllInstanceStates(): InstanceState[] {
    return Array.from(this.instanceStates.values());
  }

  /**
   * Remove instance state (cleanup)
   */
  removeInstanceState(instanceId: string): boolean {
    const removed = this.instanceStates.delete(instanceId);
    this.instanceCache.delete(instanceId);
    this.instanceStateCache.delete(instanceId);
    
    if (removed) {
      logger.info('Instance state removed', { instanceId });
    }
    
    return removed;
  }
}

// Export singleton instance
export const instanceService = new InstanceService();