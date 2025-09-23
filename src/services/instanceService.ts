import { logger } from '../utils/logger';
import { productService } from './productService';
import { templateService } from './templateService';
import { serviceRegistry } from './serviceRegistry';
import { novitaApiService } from './novitaApiService';
import { webhookClient } from '../clients/webhookClient';
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
  JobType,
  Port,
  HealthCheckConfig,
  HealthCheckResult,
  StartupOperation,
  StartInstanceRequest,
  StartInstanceResponse,
  StartInstanceJobPayload,
  StopInstanceRequest,
  StopInstanceResponse,
  DeleteInstanceRequest,
  DeleteInstanceResponse
} from '../types/api';
import { InstanceNotFoundError, InstanceNotStartableError } from '../utils/errorHandler';
import { JobPriority, CreateInstanceJobPayload, JobType as JobTypeEnum } from '../types/job';
import { cacheManager } from './cacheService';
import { log } from 'console';

export class InstanceService {
  private instanceStates: Map<string, InstanceState> = new Map();

  // Track active startup operations to prevent duplicates
  private activeStartupOperations: Map<string, StartupOperation> = new Map();

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

      const jobQueueService = serviceRegistry.getJobQueueService();
      if (!jobQueueService) {
        throw new Error('Job queue service not available');
      }

      await jobQueueService.addJob(
        JobTypeEnum.CREATE_INSTANCE,
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

    // Handle status transitions with timestamp updates
    if (updates.status && updates.status !== instanceState.status) {
      this.handleStatusTransition(instanceState, updates.status);
    }

    // Merge updates
    Object.assign(instanceState, updates);

    // Update state cache
    this.instanceStateCache.set(instanceId, instanceState);

    // Clear instance details cache for this instance to force refresh
    this.instanceCache.delete(instanceId);

    // Persist to Redis asynchronously (don't block the operation)
    this.persistInstanceStateToRedis(instanceState).catch(error => {
      logger.warn('Failed to persist instance state to Redis', {
        instanceId,
        error: (error as Error).message
      });
    });

    logger.debug('Instance state updated', {
      instanceId,
      status: instanceState.status,
      novitaInstanceId: instanceState.novitaInstanceId,
      healthCheckStatus: instanceState.healthCheck?.status
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

    if (instanceState.timestamps.lastUsed) {
      details.lastUsedAt = instanceState.timestamps.lastUsed.toISOString();
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
      portMappings: this.mapPortsToPortMappings(instanceState.configuration.ports),
      createdAt: instanceState.timestamps.created.toISOString()
    };

    if (instanceState.timestamps.ready) {
      details.readyAt = instanceState.timestamps.ready.toISOString();
    }

    if (instanceState.timestamps.lastUsed) {
      details.lastUsedAt = instanceState.timestamps.lastUsed.toISOString();
    }

    return details;
  }

  /**
   * Map Port[] to portMappings format
   */
  private mapPortsToPortMappings(ports: Port[]): Array<{ port: number; endpoint: string; type: string }> {
    return ports.map(port => ({
      port: port.port,
      endpoint: `http://localhost:${port.port}`, // Default endpoint format
      type: port.type
    }));
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

  /**
   * Update the last used time for an instance
   */
  async updateLastUsedTime(instanceId: string, lastUsedAt?: Date): Promise<{ instanceId: string; lastUsedAt: string; message: string }> {
    try {
      // Get instance state
      const instanceState = this.instanceStates.get(instanceId);
      if (!instanceState) {
        throw new NovitaApiClientError(
          `Instance not found: ${instanceId}`,
          404,
          'INSTANCE_NOT_FOUND'
        );
      }

      const timestamp = lastUsedAt || new Date();

      // Update instance state with last used time
      instanceService.updateInstanceState(instanceId, {
        timestamps: {
          ...instanceState.timestamps,
          lastUsed: timestamp
        }
      });

      logger.info('Instance last used time updated', {
        instanceId,
        lastUsedAt: timestamp.toISOString(),
        instanceName: instanceState.name,
        status: instanceState.status
      });

      return {
        instanceId,
        lastUsedAt: timestamp.toISOString(),
        message: 'Last used time updated successfully'
      };

    } catch (error) {
      logger.error('Failed to update instance last used time', {
        instanceId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Get instances that are eligible for auto-stop (running and inactive for over threshold)
   * Enhanced version that syncs with Redis and Novita API for data consistency
   */
  async getInstancesEligibleForAutoStop(inactivityThresholdMinutes: number = 2): Promise<InstanceState[]> {
    const thresholdMs = inactivityThresholdMinutes * 60 * 1000;
    const now = Date.now();
    const eligibleInstances: InstanceState[] = [];

    try {
      // Step 1: Sync instance states from Redis and Novita API
      const allInstanceStates = await this.syncInstanceStatesForAutoStop();

      logger.info('Synced instance states for auto-stop evaluation', {
        totalInstances: allInstanceStates.length,
        inMemoryInstances: this.instanceStates.size,
        thresholdMinutes: inactivityThresholdMinutes
      });

      // Step 2: Evaluate each instance for auto-stop eligibility
      for (const instanceState of allInstanceStates) {
        logger.debug( 
          'Evaluating instance for auto-stop eligibility',
          {
            instanceId: instanceState.id,
            name: instanceState.name,
            novitaInstanceId: instanceState.novitaInstanceId,
            status: instanceState.status,
            lastUsedTime: instanceState.timestamps.lastUsed?.toISOString(),
            timestamps: instanceState.timestamps
          }
        )
        // Only consider running instances
        if (instanceState.status !== InstanceStatus.RUNNING) {
          continue;
        }

        // Check if instance has a last used time
        const lastUsedTime = instanceState.timestamps.lastUsed || 
                            instanceState.timestamps.started || 
                            instanceState.timestamps.created;
        
        if (!lastUsedTime) {
          // If no lastUsedTime, always consider it eligible for auto-stop
          // This ensures instances without usage tracking are included
          eligibleInstances.push(instanceState);

          logger.debug('Instance eligible for auto-stop (no lastUsedTime)', {
            instanceId: instanceState.id,
            name: instanceState.name,
            novitaInstanceId: instanceState.novitaInstanceId
          });
        } else {
          // Check if last used time exceeds threshold
          if (now - lastUsedTime.getTime() > thresholdMs) {
            eligibleInstances.push(instanceState);

            logger.debug('Instance eligible for auto-stop (exceeded threshold)', {
              instanceId: instanceState.id,
              name: instanceState.name,
              novitaInstanceId: instanceState.novitaInstanceId,
              lastUsedTime: lastUsedTime.toISOString(),
              timeSinceLastUse: now - lastUsedTime.getTime(),
              thresholdMs
            });
          } else {
            logger.info('Instance not eligible for auto-stop (within threshold)', {
              instanceId: instanceState.id,
              name: instanceState.name,
              novitaInstanceId: instanceState.novitaInstanceId,
              lastUsedTime: lastUsedTime.toISOString(),
              timeSinceLastUse: now - lastUsedTime.getTime(),
              thresholdMs
            });
          }
        }
      }

      logger.info('Found instances eligible for auto-stop', {
        totalRunningInstances: allInstanceStates.filter(state => state.status === InstanceStatus.RUNNING).length,
        eligibleCount: eligibleInstances.length,
        thresholdMinutes: inactivityThresholdMinutes
      });

      return eligibleInstances;

    } catch (error) {
      logger.error('Failed to get instances eligible for auto-stop', {
        error: (error as Error).message,
        thresholdMinutes: inactivityThresholdMinutes
      });

      // Fallback to in-memory instances only
      logger.warn('Falling back to in-memory instance states only');
      return this.getInstancesEligibleForAutoStopFallback(inactivityThresholdMinutes);
    }
  }

  /**
   * Sync instance states from Redis and Novita API for comprehensive auto-stop evaluation
   */
  private async syncInstanceStatesForAutoStop(): Promise<InstanceState[]> {
    const allInstanceStates = new Map<string, InstanceState>();

    try {
      // Step 1: Load instance states from Redis
      const redisStates = await this.loadInstanceStatesFromRedis();
      logger.debug('Loaded instance states from Redis', { count: redisStates.length });

      // Add Redis states to the map
      redisStates.forEach(state => {
        allInstanceStates.set(state.id, state);
      });

      // Step 2: Add in-memory states (these might be newer or not yet persisted)
      for (const [instanceId, instanceState] of this.instanceStates.entries()) {
        const existingState = allInstanceStates.get(instanceId);
        
        // Use in-memory state if it's newer or doesn't exist in Redis
        if (!existingState || 
            instanceState.timestamps.created.getTime() > existingState.timestamps.created.getTime()) {
          allInstanceStates.set(instanceId, instanceState);
        }
      }

      // Step 3: Sync with Novita API to get current status of instances
      try {
        const novitaInstances = await this.getNovitaInstances();
        logger.debug('Fetched instances from Novita API', { count: novitaInstances.length });

        // Update states with current Novita status
        for (const novitaInstance of novitaInstances) {
          // Find matching local state by novitaInstanceId
          const matchingState = Array.from(allInstanceStates.values())
            .find(state => state.novitaInstanceId === novitaInstance.id);

          if (matchingState) {
            // Update status from Novita API (authoritative source)
            if (matchingState.status !== novitaInstance.status) {
              logger.debug('Updating instance status from Novita API', {
                instanceId: matchingState.id,
                oldStatus: matchingState.status,
                newStatus: novitaInstance.status,
                novitaInstanceId: novitaInstance.id
              });

              matchingState.status = novitaInstance.status;
              
              // Update timestamps based on status
              if (novitaInstance.status === InstanceStatus.RUNNING && !matchingState.timestamps.started) {
                matchingState.timestamps.started = new Date();
              }
            }
          } else {
            // This is a Novita instance we don't have locally - create a minimal state
            // This handles cases where instances were created outside our application
            const orphanedState = this.createStateFromNovitaInstance(novitaInstance);
            if (orphanedState) {
              allInstanceStates.set(orphanedState.id, orphanedState);
              logger.info('Found orphaned Novita instance, created local state', {
                instanceId: orphanedState.id,
                novitaInstanceId: novitaInstance.id,
                status: novitaInstance.status
              });
            }
          }
        }
      } catch (novitaError) {
        logger.warn('Failed to sync with Novita API, using cached states only', {
          error: (novitaError as Error).message
        });
      }

      // Step 4: Persist updated states back to Redis
      const statesToPersist = Array.from(allInstanceStates.values());
      await this.persistInstanceStatesToRedis(statesToPersist);

      // Step 5: Update in-memory states with synced data
      for (const state of statesToPersist) {
        this.instanceStates.set(state.id, state);
      }

      return statesToPersist;

    } catch (error) {
      logger.error('Failed to sync instance states', {
        error: (error as Error).message
      });
      
      // Return in-memory states as fallback
      return Array.from(this.instanceStates.values());
    }
  }

  /**
   * Load instance states from Redis
   */
  private async loadInstanceStatesFromRedis(): Promise<InstanceState[]> {
    try {
      const cacheManager = serviceRegistry.getCacheManager();
      if (!cacheManager) {
        logger.debug('No cache manager available, skipping Redis load');
        return [];
      }

      const instanceStatesCache = await cacheManager.getCache<InstanceState>('instance-states-persistent', {
        maxSize: 10000,
        defaultTtl: 24 * 60 * 60 * 1000, // 24 hours for persistent states
        cleanupIntervalMs: 60 * 60 * 1000 // Cleanup every hour
      });

      const keys = await instanceStatesCache.keys();
      const states: InstanceState[] = [];

      for (const key of keys) {
        const state = await instanceStatesCache.get(key);
        if (state) {
          // Convert timestamp strings back to Date objects
          state.timestamps.created = new Date(state.timestamps.created);
          if (state.timestamps.started) state.timestamps.started = new Date(state.timestamps.started);
          if (state.timestamps.ready) state.timestamps.ready = new Date(state.timestamps.ready);
          if (state.timestamps.failed) state.timestamps.failed = new Date(state.timestamps.failed);
          if (state.timestamps.stopping) state.timestamps.stopping = new Date(state.timestamps.stopping);
          if (state.timestamps.stopped) state.timestamps.stopped = new Date(state.timestamps.stopped);
          if (state.timestamps.lastUsed) state.timestamps.lastUsed = new Date(state.timestamps.lastUsed);

          states.push(state);
        }
      }

      return states;
    } catch (error) {
      logger.error('Failed to load instance states from Redis', {
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Persist instance states to Redis
   */
  private async persistInstanceStatesToRedis(states: InstanceState[]): Promise<void> {
    try {
      const cacheManager = serviceRegistry.getCacheManager();
      if (!cacheManager) {
        logger.debug('No cache manager available, skipping Redis persistence');
        return;
      }

      const instanceStatesCache = await cacheManager.getCache<InstanceState>('instance-states-persistent', {
        maxSize: 10000,
        defaultTtl: 24 * 60 * 60 * 1000, // 24 hours for persistent states
        cleanupIntervalMs: 60 * 60 * 1000 // Cleanup every hour
      });

      const persistPromises = states.map(async (state) => {
        try {
          await instanceStatesCache.set(state.id, state, 24 * 60 * 60 * 1000); // 24 hours TTL
        } catch (error) {
          logger.warn('Failed to persist instance state to Redis', {
            instanceId: state.id,
            error: (error as Error).message
          });
        }
      });

      await Promise.allSettled(persistPromises);
      
      logger.debug('Persisted instance states to Redis', { count: states.length });
    } catch (error) {
      logger.error('Failed to persist instance states to Redis', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Persist a single instance state to Redis
   */
  private async persistInstanceStateToRedis(state: InstanceState): Promise<void> {
    try {
      const cacheManager = serviceRegistry.getCacheManager();
      if (!cacheManager) {
        return;
      }

      const instanceStatesCache = await cacheManager.getCache<InstanceState>('instance-states-persistent', {
        maxSize: 10000,
        defaultTtl: 24 * 60 * 60 * 1000, // 24 hours for persistent states
        cleanupIntervalMs: 60 * 60 * 1000 // Cleanup every hour
      });

      await instanceStatesCache.set(state.id, state, 24 * 60 * 60 * 1000); // 24 hours TTL
    } catch (error) {
      logger.error('Failed to persist single instance state to Redis', {
        instanceId: state.id,
        error: (error as Error).message
      });
    }
  }



  /**
   * Update last used time by instance name (useful for external integrations)
   */
  async updateLastUsedTimeByName(instanceName: string, lastUsedTime?: Date): Promise<{ instanceId: string; lastUsedAt: string; message: string }> {
    try {
      // First try to find in memory
      for (const [instanceId, instanceState] of this.instanceStates.entries()) {
        if (instanceState.name === instanceName) {
          return await this.updateLastUsedTime(instanceId, lastUsedTime);
        }
      }

      // If not found in memory, try Redis
      const redisStates = await this.loadInstanceStatesFromRedis();
      const matchingState = redisStates.find(state => state.name === instanceName);
      
      if (matchingState) {
        // Load the state into memory first
        this.instanceStates.set(matchingState.id, matchingState);
        return await this.updateLastUsedTime(matchingState.id, lastUsedTime);
      }

      throw new NovitaApiClientError(
        `Instance not found by name: ${instanceName}`,
        404,
        'INSTANCE_NOT_FOUND'
      );

    } catch (error) {
      logger.error('Failed to update last used time by name', {
        instanceName,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Create a minimal instance state from a Novita instance (for orphaned instances)
   */
  private createStateFromNovitaInstance(novitaInstance: InstanceResponse): InstanceState | null {
    try {
      // Generate a local instance ID for the orphaned instance
      const localInstanceId = `orphaned_${novitaInstance.id}_${Date.now()}`;

      const state: InstanceState = {
        id: localInstanceId,
        name: novitaInstance.name,
        status: novitaInstance.status,
        novitaInstanceId: novitaInstance.id,
        productId: novitaInstance.productId || 'unknown',
        templateId: 'unknown',
        configuration: {
          gpuNum: novitaInstance.gpuNum,
          rootfsSize: 60, // Default value
          region: novitaInstance.region,
          imageUrl: novitaInstance.imageUrl || 'unknown',
          ports: [],
          envs: []
        },
        timestamps: {
          created: new Date(novitaInstance.createdAt),
          // Add started time if instance is running
          ...(novitaInstance.status === InstanceStatus.RUNNING && {
            started: new Date(novitaInstance.startedAt || novitaInstance.createdAt)
          })
        }
      };

      return state;
    } catch (error) {
      logger.error('Failed to create state from Novita instance', {
        novitaInstanceId: novitaInstance.id,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Fallback method using only in-memory instance states
   */
  private getInstancesEligibleForAutoStopFallback(inactivityThresholdMinutes: number): InstanceState[] {
    const thresholdMs = inactivityThresholdMinutes * 60 * 1000;
    const now = Date.now();
    const eligibleInstances: InstanceState[] = [];

    for (const [instanceId, instanceState] of this.instanceStates.entries()) {
      if (instanceState.status !== InstanceStatus.RUNNING) {
        continue;
      }

      const lastUsedTime = instanceState.timestamps.lastUsed || 
                          instanceState.timestamps.started || 
                          instanceState.timestamps.created;
      
      if (!lastUsedTime || (now - lastUsedTime.getTime() > thresholdMs)) {
        eligibleInstances.push(instanceState);
      }
    }

    return eligibleInstances;
  }

  /**
   * Find instance by name - searches both local state and Novita.ai API
   * Requirements: 1.2, 1.3, 1.4
   */
  async findInstanceByName(name: string): Promise<InstanceDetails> {
    try {
      logger.debug('Searching for instance by name', { name });

      // First, search in local instance states
      for (const [instanceId, instanceState] of this.instanceStates.entries()) {
        if (instanceState.name === name) {
          logger.debug('Found instance in local state', { instanceId, name });
          return await this.getInstanceStatus(instanceId);
        }
      }

      // If not found locally and name-based lookup is enabled, search Novita.ai API
      if (config.instanceStartup.enableNameBasedLookup) {
        logger.debug('Searching Novita.ai API for instance by name', { name });

        try {
          const novitaInstances = await this.getNovitaInstances();
          const matchingInstance = novitaInstances.find(instance => instance.name === name);

          if (matchingInstance) {
            logger.debug('Found instance in Novita.ai API', {
              novitaInstanceId: matchingInstance.id,
              name
            });

            // Transform Novita instance to our format
            return this.transformNovitaInstanceToDetails(matchingInstance);
          }
        } catch (error) {
          logger.warn('Failed to search Novita.ai API for instance by name', {
            name,
            error: (error as Error).message
          });
          // Continue to throw InstanceNotFoundError below
        }
      }

      // Instance not found
      throw new InstanceNotFoundError(name, 'name');

    } catch (error) {
      if (error instanceof InstanceNotFoundError) {
        throw error;
      }

      logger.error('Failed to find instance by name', {
        name,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Validate if an instance can be started
   * Requirements: 2.1, 2.2, 2.3, 2.4
   */
  async validateInstanceStartable(instanceDetails: InstanceDetails): Promise<void> {
    const { id: instanceId, status } = instanceDetails;

    logger.debug('Validating instance startability', { instanceId, status });

    // Check if instance is in a startable state
    if (!this.isInstanceStatusStartable(status)) {
      const reason = this.getNotStartableReason(status);
      throw new InstanceNotStartableError(instanceId, status, reason);
    }

    // Check if startup operation is already in progress
    if (this.isStartupInProgress(instanceId)) {
      const existingOperation = this.getStartupOperation(instanceId);
      const { StartupOperationInProgressError } = await import('../utils/errorHandler');
      throw new StartupOperationInProgressError(
        instanceId,
        existingOperation?.operationId || 'unknown',
        existingOperation?.status || 'unknown'
      );
    }

    logger.debug('Instance validation passed', { instanceId, status });
  }

  /**
   * Check if a startup operation is currently in progress for an instance
   * Requirements: 6.1
   */
  isStartupInProgress(instanceId: string): boolean {
    const operation = this.activeStartupOperations.get(instanceId);

    if (!operation) {
      return false;
    }

    // Check if operation is in an active state
    const activeStates = ['initiated', 'monitoring', 'health_checking'];
    const isActive = activeStates.includes(operation.status);

    logger.debug('Checking startup progress', {
      instanceId,
      operationStatus: operation.status,
      isActive
    });

    return isActive;
  }

  /**
   * Create and track a startup operation
   * Requirements: 6.1
   */
  createStartupOperation(instanceId: string, novitaInstanceId: string): StartupOperation {
    const operationId = this.generateOperationId();
    const now = new Date();

    const operation: StartupOperation = {
      operationId,
      instanceId,
      novitaInstanceId,
      status: 'initiated',
      startedAt: now,
      phases: {
        startRequested: now
      }
    };

    this.activeStartupOperations.set(instanceId, operation);

    logger.info('Startup operation created', {
      operationId,
      instanceId,
      novitaInstanceId
    });

    return operation;
  }

  /**
   * Update startup operation status and phases
   * Requirements: 6.1
   */
  updateStartupOperation(
    instanceId: string,
    status: StartupOperation['status'],
    phase?: keyof StartupOperation['phases'],
    error?: string
  ): void {
    const operation = this.activeStartupOperations.get(instanceId);

    if (!operation) {
      logger.warn('Attempted to update non-existent startup operation', { instanceId });
      return;
    }

    operation.status = status;

    if (phase) {
      operation.phases[phase] = new Date();
    }

    if (error) {
      operation.error = error;
    }

    // Remove operation if completed or failed
    if (status === 'completed' || status === 'failed') {
      this.activeStartupOperations.delete(instanceId);
      logger.info('Startup operation completed', {
        operationId: operation.operationId,
        instanceId,
        status,
        error
      });
    } else {
      logger.debug('Startup operation updated', {
        operationId: operation.operationId,
        instanceId,
        status,
        phase
      });
    }
  }

  /**
   * Get active startup operation for an instance
   * Requirements: 6.1
   */
  getStartupOperation(instanceId: string): StartupOperation | undefined {
    return this.activeStartupOperations.get(instanceId);
  }

  /**
   * Handle status transitions with appropriate timestamp updates
   */
  private handleStatusTransition(instanceState: InstanceState, newStatus: InstanceStatus): void {
    const now = new Date();

    switch (newStatus) {
      case InstanceStatus.STARTING:
        if (!instanceState.timestamps.started) {
          instanceState.timestamps.started = now;
        }
        break;
      case InstanceStatus.HEALTH_CHECKING:
        if (instanceState.healthCheck) {
          instanceState.healthCheck.status = 'in_progress';
          instanceState.healthCheck.startedAt = now;
        }
        break;
      case InstanceStatus.READY:
        if (!instanceState.timestamps.ready) {
          instanceState.timestamps.ready = now;
        }
        if (instanceState.healthCheck) {
          instanceState.healthCheck.status = 'completed';
          instanceState.healthCheck.completedAt = now;
        }
        break;
      case InstanceStatus.FAILED:
        instanceState.timestamps.failed = now;
        if (instanceState.healthCheck && instanceState.healthCheck.status === 'in_progress') {
          instanceState.healthCheck.status = 'failed';
          instanceState.healthCheck.completedAt = now;
        }
        break;
    }

    logger.debug('Status transition handled', {
      instanceId: instanceState.id,
      oldStatus: instanceState.status,
      newStatus,
      timestamp: now.toISOString()
    });
  }

  /**
   * Initialize health check for an instance
   */
  initializeHealthCheck(instanceId: string, config: HealthCheckConfig): void {
    const instanceState = this.instanceStates.get(instanceId);
    if (!instanceState) {
      throw new Error(`Instance state not found: ${instanceId}`);
    }

    instanceState.healthCheck = {
      status: 'pending',
      config,
      results: []
    };

    // Update state cache
    this.instanceStateCache.set(instanceId, instanceState);

    logger.debug('Health check initialized', {
      instanceId,
      config: {
        timeoutMs: config.timeoutMs,
        retryAttempts: config.retryAttempts,
        maxWaitTimeMs: config.maxWaitTimeMs,
        targetPort: config.targetPort
      }
    });
  }

  /**
   * Update health check progress and results
   */
  updateHealthCheckProgress(instanceId: string, result: HealthCheckResult): void {
    const instanceState = this.instanceStates.get(instanceId);
    if (!instanceState || !instanceState.healthCheck) {
      throw new Error(`Instance state or health check not found: ${instanceId}`);
    }

    // Add the new result
    instanceState.healthCheck.results.push(result);

    // Keep only the last 10 results to prevent memory bloat
    if (instanceState.healthCheck.results.length > 10) {
      instanceState.healthCheck.results = instanceState.healthCheck.results.slice(-10);
    }

    // Update state cache
    this.instanceStateCache.set(instanceId, instanceState);

    logger.debug('Health check progress updated', {
      instanceId,
      overallStatus: result.overallStatus,
      endpointsChecked: result.endpoints.length,
      healthyEndpoints: result.endpoints.filter(e => e.status === 'healthy').length,
      totalResponseTime: result.totalResponseTime
    });
  }

  /**
   * Get health check status for an instance
   */
  getHealthCheckStatus(instanceId: string): {
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'not_configured';
    config?: HealthCheckConfig;
    latestResult?: HealthCheckResult;
    startedAt?: Date;
    completedAt?: Date;
    duration?: number;
  } {
    const instanceState = this.instanceStates.get(instanceId);
    if (!instanceState) {
      throw new Error(`Instance state not found: ${instanceId}`);
    }

    if (!instanceState.healthCheck) {
      return { status: 'not_configured' };
    }

    const healthCheck = instanceState.healthCheck;
    const latestResult = healthCheck.results.length > 0
      ? healthCheck.results[healthCheck.results.length - 1]
      : undefined;

    let duration: number | undefined;
    if (healthCheck.startedAt) {
      const endTime = healthCheck.completedAt || new Date();
      duration = endTime.getTime() - healthCheck.startedAt.getTime();
    }

    const result: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'not_configured';
      config?: HealthCheckConfig;
      latestResult?: HealthCheckResult;
      startedAt?: Date;
      completedAt?: Date;
      duration?: number;
    } = {
      status: healthCheck.status
    };

    if (healthCheck.config) result.config = healthCheck.config;
    if (latestResult) result.latestResult = latestResult;
    if (healthCheck.startedAt) result.startedAt = healthCheck.startedAt;
    if (healthCheck.completedAt) result.completedAt = healthCheck.completedAt;
    if (duration !== undefined) result.duration = duration;

    return result;
  }

  /**
   * Get detailed health check history for an instance
   */
  getHealthCheckHistory(instanceId: string): HealthCheckResult[] {
    const instanceState = this.instanceStates.get(instanceId);
    if (!instanceState || !instanceState.healthCheck) {
      return [];
    }

    return [...instanceState.healthCheck.results]; // Return a copy
  }

  /**
   * Check if instance is ready (has completed health checks successfully)
   */
  isInstanceReady(instanceId: string): boolean {
    const instanceState = this.instanceStates.get(instanceId);
    if (!instanceState) {
      return false;
    }

    return instanceState.status === InstanceStatus.READY;
  }

  /**
   * Check if instance is in health checking phase
   */
  isInstanceHealthChecking(instanceId: string): boolean {
    const instanceState = this.instanceStates.get(instanceId);
    if (!instanceState) {
      return false;
    }

    return instanceState.status === InstanceStatus.HEALTH_CHECKING;
  }

  /**
   * Get instances by status (useful for monitoring)
   */
  getInstancesByStatus(status: InstanceStatus): InstanceState[] {
    return Array.from(this.instanceStates.values())
      .filter(instance => instance.status === status);
  }

  /**
   * Get instances that are currently health checking
   */
  getHealthCheckingInstances(): InstanceState[] {
    return this.getInstancesByStatus(InstanceStatus.HEALTH_CHECKING);
  }

  /**
   * Get instances that have failed health checks
   */
  getFailedHealthCheckInstances(): InstanceState[] {
    return Array.from(this.instanceStates.values())
      .filter(instance =>
        instance.healthCheck?.status === 'failed' ||
        (instance.status === InstanceStatus.FAILED && instance.healthCheck)
      );
  }

  /**
   * Check if an instance status is startable
   * Requirements: 2.1, 2.2, 2.3, 2.4
   */
  private isInstanceStatusStartable(status: string): boolean {
    // Only instances in 'exited' status can be started
    return status === InstanceStatus.EXITED;
  }

  /**
   * Get reason why an instance cannot be started based on its status
   * Requirements: 2.1, 2.2, 2.3, 2.4
   */
  private getNotStartableReason(status: string): string {
    switch (status) {
      case InstanceStatus.CREATING:
        return 'instance is currently being created';
      case InstanceStatus.STARTING:
        return 'instance is already starting';
      case InstanceStatus.RUNNING:
        return 'instance is already running';
      case InstanceStatus.READY:
        return 'instance is already ready and running';
      case InstanceStatus.STOPPING:
        return 'instance is currently stopping';
      case InstanceStatus.FAILED:
        return 'instance is in failed state and cannot be started';
      case InstanceStatus.TERMINATED:
        return 'instance has been permanently terminated';
      default:
        return `instance status '${status}' does not allow starting`;
    }
  }

  /**
   * Transform Novita instance response to our InstanceDetails format
   * Requirements: 1.2, 1.3, 1.4
   */
  private transformNovitaInstanceToDetails(novitaInstance: InstanceResponse): InstanceDetails {
    const details: InstanceDetails = {
      id: novitaInstance.id,
      name: novitaInstance.name,
      status: novitaInstance.status,
      gpuNum: novitaInstance.gpuNum,
      region: novitaInstance.region,
      portMappings: novitaInstance.portMappings || [],
      createdAt: novitaInstance.createdAt
    };

    // Add optional properties only if they exist
    if (novitaInstance.connectionInfo) {
      details.connectionDetails = novitaInstance.connectionInfo;
    }

    if (novitaInstance.startedAt) {
      details.readyAt = novitaInstance.startedAt;
    }

    return details;
  }

  /**
   * Start an instance by ID or name
   * Requirements: 1.1, 1.5, 3.1, 5.1
   */
  async startInstance(
    identifier: string,
    startConfig: StartInstanceRequest = {},
    searchBy: 'id' | 'name' = 'id'
  ): Promise<StartInstanceResponse> {
    try {
      logger.info('Starting instance startup process', {
        identifier,
        searchBy,
        startConfig: {
          hasHealthCheckConfig: !!startConfig.healthCheckConfig,
          targetPort: startConfig.targetPort,
          hasWebhookUrl: !!startConfig.webhookUrl
        }
      });

      // Find the instance
      let instanceDetails: InstanceDetails;
      if (searchBy === 'name') {
        instanceDetails = await this.findInstanceByName(identifier);
      } else {
        instanceDetails = await this.getInstanceStatus(identifier);
      }

      // Validate that the instance can be started
      await this.validateInstanceStartable(instanceDetails);

      // Get the instance state to access novitaInstanceId
      const instanceState = this.instanceStates.get(instanceDetails.id);
      if (!instanceState || !instanceState.novitaInstanceId) {
        throw new InstanceNotFoundError(identifier, searchBy);
      }

      // Create startup operation for tracking
      const operation = this.createStartupOperation(instanceDetails.id, instanceState.novitaInstanceId);

      try {
        // Call Novita.ai API to start the instance
        logger.debug('Calling Novita.ai API to start instance', {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId
        });

        // Use enhanced start instance method with retry logic
        await novitaApiService.startInstanceWithRetry(
          instanceState.novitaInstanceId,
          config.defaults.maxRetryAttempts
        );

        // Update startup operation phase
        this.updateStartupOperation(instanceDetails.id, 'monitoring', 'instanceStarting');

        // Update instance status to starting
        this.updateInstanceState(instanceDetails.id, {
          status: InstanceStatus.STARTING
        });

        // Create monitoring job for startup process
        const jobPayload: StartInstanceJobPayload = {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId,
          healthCheckConfig: startConfig.healthCheckConfig || {
            timeoutMs: 10000,
            retryAttempts: 3,
            retryDelayMs: 2000,
            maxWaitTimeMs: 300000
          },
          startTime: new Date(),
          maxWaitTime: startConfig.healthCheckConfig?.maxWaitTimeMs || 300000 // 5 minutes default
        };

        // Add optional properties only if they exist
        const webhookUrl = startConfig.webhookUrl || instanceState.webhookUrl;
        if (webhookUrl) {
          jobPayload.webhookUrl = webhookUrl;
        }
        if (startConfig.targetPort) {
          jobPayload.targetPort = startConfig.targetPort;
        }

        const jobQueueService = serviceRegistry.getJobQueueService();
        if (!jobQueueService) {
          throw new Error('Job queue service not available');
        }

        await jobQueueService.addJob(
          JobTypeEnum.MONITOR_STARTUP,
          jobPayload,
          JobPriority.HIGH
        );

        // Send startup initiated webhook notification if configured
        if (webhookUrl) {
          try {
            await webhookClient.sendStartupInitiatedNotification(
              webhookUrl,
              instanceDetails.id,
              {
                novitaInstanceId: instanceState.novitaInstanceId,
                operationId: operation.operationId,
                startedAt: operation.startedAt,
                estimatedReadyTime: this.calculateEstimatedStartupTime()
              }
            );
          } catch (webhookError) {
            logger.error('Failed to send startup initiated webhook notification', {
              instanceId: instanceDetails.id,
              webhookUrl,
              error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
            });
            // Don't fail the startup operation due to webhook errors
          }
        }

        logger.info('Instance startup initiated successfully', {
          instanceId: instanceDetails.id,
          operationId: operation.operationId,
          novitaInstanceId: instanceState.novitaInstanceId
        });

        return {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId,
          status: InstanceStatus.STARTING,
          message: 'Instance startup initiated successfully',
          operationId: operation.operationId,
          estimatedReadyTime: this.calculateEstimatedStartupTime()
        };

      } catch (error) {
        const errorMessage = (error as Error).message;
        const errorName = (error as Error).name;

        // Enhanced error logging with context
        logger.error('Failed to start instance via Novita.ai API', {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId,
          error: errorMessage,
          errorType: errorName,
          operationId: operation.operationId,
          elapsedTime: Date.now() - operation.startedAt.getTime()
        });

        // Update startup operation with detailed error information
        this.updateStartupOperation(
          instanceDetails.id,
          'failed',
          undefined,
          errorMessage
        );

        // Transform API errors into more specific startup errors
        const {
          StartupFailedError,
          ResourceConstraintsError,
          NetworkError,
          isRetryableStartupError
        } = await import('../utils/errorHandler');

        // Check for specific error types and transform them
        if (error instanceof NovitaApiClientError) {
          if (error.code === 'RESOURCE_CONSTRAINTS') {
            throw new ResourceConstraintsError(
              instanceDetails.id,
              'GPU resources',
              'Try again later or select a different instance configuration'
            );
          }

          if (error.code === 'NETWORK_ERROR') {
            throw new NetworkError(
              `Network error during instance startup: ${errorMessage}`,
              error.code,
              true
            );
          }

          // Transform other API errors into startup failed errors
          throw new StartupFailedError(
            instanceDetails.id,
            errorMessage,
            'api_call',
            isRetryableStartupError(error)
          );
        }

        // For other error types, wrap them as startup failed errors
        throw new StartupFailedError(
          instanceDetails.id,
          errorMessage,
          'api_call',
          isRetryableStartupError(error as Error)
        );
      }

    } catch (error) {
      logger.error('Failed to start instance', {
        identifier,
        searchBy,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Stop an instance by ID or name
   */
  async stopInstance(
    identifier: string,
    request: StopInstanceRequest,
    searchBy: 'id' | 'name' = 'id'
  ): Promise<StopInstanceResponse> {
    try {
      logger.info('Stopping instance', { identifier, searchBy });

      // Find the instance
      let instanceDetails: InstanceDetails;
      if (searchBy === 'name') {
        instanceDetails = await this.findInstanceByName(identifier);
      } else {
        instanceDetails = await this.getInstanceStatus(identifier);
      }

      const instanceState = this.instanceStates.get(instanceDetails.id);
      if (!instanceState) {
        throw new InstanceNotFoundError(instanceDetails.id);
      }

      // Check if instance can be stopped
      if (!instanceState.novitaInstanceId) {
        throw new NovitaApiClientError(
          'Instance has not been created in Novita.ai yet and cannot be stopped',
          400,
          'INSTANCE_NOT_STOPPABLE'
        );
      }

      // Check current status
      if (instanceState.status === InstanceStatus.STOPPED) {
        logger.info('Instance is already stopped', {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId
        });

        return {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId,
          status: InstanceStatus.STOPPED,
          message: 'Instance is already stopped',
          operationId: this.generateOperationId()
        };
      }

      if (instanceState.status === InstanceStatus.STOPPING) {
        logger.info('Instance is already stopping', {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId
        });

        return {
          instanceId: instanceDetails.id,
          novitaInstanceId: instanceState.novitaInstanceId,
          status: InstanceStatus.STOPPING,
          message: 'Instance is already stopping',
          operationId: this.generateOperationId()
        };
      }

      // Generate operation ID for tracking
      const operationId = this.generateOperationId();

      // Update instance status to stopping
      this.updateInstanceState(instanceDetails.id, {
        status: InstanceStatus.STOPPING,
        timestamps: {
          ...instanceState.timestamps,
          stopping: new Date()
        }
      });

      logger.info('Calling Novita.ai API to stop instance', {
        instanceId: instanceDetails.id,
        novitaInstanceId: instanceState.novitaInstanceId,
        operationId
      });

      // Call Novita.ai API to stop the instance
      const novitaResponse = await novitaApiService.stopInstance(instanceState.novitaInstanceId);

      // Update instance state with stopped status
      this.updateInstanceState(instanceDetails.id, {
        status: InstanceStatus.STOPPED,
        timestamps: {
          ...instanceState.timestamps,
          stopped: new Date()
        }
      });

      logger.info('Instance stopped successfully', {
        instanceId: instanceDetails.id,
        novitaInstanceId: instanceState.novitaInstanceId,
        operationId,
        status: novitaResponse.status
      });

      // Send webhook notification if configured
      if (request.webhookUrl || instanceState.webhookUrl) {
        const webhookUrl = request.webhookUrl || instanceState.webhookUrl!;
        try {
          await webhookClient.sendStopNotification(webhookUrl, instanceDetails.id, {
            novitaInstanceId: instanceState.novitaInstanceId,
            operationId
          });

          logger.info('Webhook notification sent for instance stop', {
            instanceId: instanceDetails.id,
            operationId
          });
        } catch (webhookError) {
          logger.warn('Failed to send webhook notification for instance stop', {
            instanceId: instanceDetails.id,
            operationId,
            error: (webhookError as Error).message
          });
        }
      }

      return {
        instanceId: instanceDetails.id,
        novitaInstanceId: instanceState.novitaInstanceId,
        status: InstanceStatus.STOPPED,
        message: 'Instance stopped successfully',
        operationId
      };

    } catch (error) {
      logger.error('Failed to stop instance', {
        identifier,
        searchBy,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Delete an instance by ID or name
   */
  async deleteInstance(
    identifier: string,
    request: DeleteInstanceRequest,
    searchBy: 'id' | 'name' = 'id'
  ): Promise<DeleteInstanceResponse> {
    try {
      logger.info('Deleting instance', { identifier, searchBy });

      // Find the instance
      let instanceDetails: InstanceDetails;
      if (searchBy === 'name') {
        instanceDetails = await this.findInstanceByName(identifier);
      } else {
        instanceDetails = await this.getInstanceStatus(identifier);
      }

      const instanceState = this.instanceStates.get(instanceDetails.id);
      if (!instanceState) {
        throw new InstanceNotFoundError(instanceDetails.id);
      }

      // Check if instance can be deleted
      if (!instanceState.novitaInstanceId) {
        throw new NovitaApiClientError(
          'Instance has not been created in Novita.ai yet and cannot be deleted',
          400,
          'INSTANCE_NOT_DELETABLE'
        );
      }

      // Generate operation ID for tracking
      const operationId = this.generateOperationId();

      logger.info('Calling Novita.ai API to delete instance', {
        instanceId: instanceDetails.id,
        novitaInstanceId: instanceState.novitaInstanceId,
        operationId
      });

      // Call Novita.ai API to delete the instance
      await novitaApiService.deleteInstance(instanceState.novitaInstanceId);

      // Remove instance from our local state
      this.removeInstanceState(instanceDetails.id);

      logger.info('Instance deleted successfully', {
        instanceId: instanceDetails.id,
        novitaInstanceId: instanceState.novitaInstanceId,
        operationId
      });

      // Send webhook notification if configured
      if (request.webhookUrl || instanceState.webhookUrl) {
        const webhookUrl = request.webhookUrl || instanceState.webhookUrl!;
        try {
          await webhookClient.sendDeleteNotification(webhookUrl, instanceDetails.id, {
            novitaInstanceId: instanceState.novitaInstanceId,
            operationId
          });

          logger.info('Webhook notification sent for instance deletion', {
            instanceId: instanceDetails.id,
            operationId
          });
        } catch (webhookError) {
          logger.warn('Failed to send webhook notification for instance deletion', {
            instanceId: instanceDetails.id,
            operationId,
            error: (webhookError as Error).message
          });
        }
      }

      return {
        instanceId: instanceDetails.id,
        novitaInstanceId: instanceState.novitaInstanceId,
        status: 'deleted',
        message: 'Instance deleted successfully',
        operationId
      };

    } catch (error) {
      logger.error('Failed to delete instance', {
        identifier,
        searchBy,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Calculate estimated startup time (rough estimate)
   * Requirements: 5.1
   */
  private calculateEstimatedStartupTime(): string {
    // Estimate 2-4 minutes for instance startup and health checks
    const estimatedMinutes = 3;
    const estimatedTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    return estimatedTime.toISOString();
  }

  /**
   * Generate unique operation ID for startup operations
   * Requirements: 6.1
   */
  private generateOperationId(): string {
    return `startup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Export singleton instance
export const instanceService = new InstanceService();