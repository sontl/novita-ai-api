import { AxiosError } from 'axios';
import { novitaClient } from '../clients/novitaClient';
import { novitaInternalClient } from '../clients/novitaInternalClient';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('novita-api');
import {
  NovitaApiResponse,
  Product,
  ProductsResponse,
  Template,
  NovitaCreateInstanceRequest,
  InstanceResponse,
  NovitaListInstancesResponse,
  InstanceStatus,
  NovitaApiClientError,
  RateLimitError,
  CircuitBreakerError,
  TimeoutError,
  RegistryAuth,
  RegistryAuthsResponse,
  NovitaInstanceResponse,
  MigrationResponse,
  JobQueryParams,
  NovitaJobsResponse
} from '../types/api';
import { log } from 'console';

export class NovitaApiService {

  /**
   * Get available products with optional filtering
   */
  async getProducts(filters?: {
    productName?: string;
    region?: string;
    gpuType?: string;
  }): Promise<Product[]> {
    try {
      const params: Record<string, string> = {};

      if (filters?.productName) params.productName = filters.productName;

      // Add billing method for spot pricing
      params.billingMethod = 'spot';

      const response = await novitaClient.get<{ data: any[] }>(
        '/v1/products',
        { params }
      );

      logger.debug('Raw API response:', response.data);

      // Handle the actual API response structure
      const rawProducts = response.data.data || [];

      // Filter products by region if specified
      const filteredProducts = filters?.region
        ? rawProducts.filter((product: any) =>
          product.regions && product.regions.includes(filters.region)
        )
        : rawProducts;

      // Transform API response to match our Product interface
      const products: Product[] = filteredProducts.map((rawProduct: any) => ({
        id: rawProduct.id,
        name: rawProduct.name,
        region: filters?.region || 'CN-HK-01', // Use filter region or default
        spotPrice: parseFloat(rawProduct.spotPrice || rawProduct.price || '0'),
        onDemandPrice: parseFloat(rawProduct.price || '0'),
        gpuType: this.extractGpuType(rawProduct.name),
        gpuMemory: rawProduct.memoryPerGpu || 24, // Default to 24GB if not specified
        availability: rawProduct.availableDeploy ? 'available' : 'unavailable'
      }));

      logger.info('Products fetched and transformed', {
        count: products.length,
        filteredCount: filteredProducts.length,
        filters
      });

      return products;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch products');
    }
  }

  /**
   * Get optimal product by name and region (lowest spot price)
   */
  async getOptimalProduct(productName: string, region: string): Promise<Product> {
    try {
      const products = await this.getProducts({ productName: productName, region });

      if (products.length === 0) {
        throw new NovitaApiClientError(
          `No products found matching name "${productName}" in region "${region}"`,
          404,
          'PRODUCT_NOT_FOUND'
        );
      }

      // Filter products: available + spot price > 0 + in specified region
      const validProducts = products.filter(p =>
        p.availability === 'available' &&
        p.spotPrice > 0 &&
        p.region === region
      );

      if (validProducts.length === 0) {
        throw new NovitaApiClientError(
          `No available products found for "${productName}" in region "${region}" with valid spot pricing`,
          404,
          'NO_AVAILABLE_PRODUCTS'
        );
      }

      // Sort by spot price ascending and return the cheapest option
      const sortedProducts = validProducts.sort((a, b) => a.spotPrice - b.spotPrice);
      const optimalProduct = sortedProducts[0];

      if (!optimalProduct) {
        throw new NovitaApiClientError(
          `No optimal product found for "${productName}" in region "${region}"`,
          404,
          'NO_OPTIMAL_PRODUCT'
        );
      }

      logger.info('Selected optimal product', {
        productId: optimalProduct.id,
        productName: optimalProduct.name,
        region: optimalProduct.region,
        spotPrice: optimalProduct.spotPrice,
        totalCandidates: products.length,
        validCandidates: validProducts.length
      });

      return optimalProduct;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to get optimal product');
    }
  }

  /**
   * Get template configuration by ID
   */
  async getTemplate(templateId: string | number): Promise<Template> {
    try {
      // Convert to string for API call
      const stringTemplateId = typeof templateId === 'number' ? templateId.toString() : templateId;
      logger.info('Fetching template', { templateId: stringTemplateId });
      const response = await novitaClient.get<{ template: any }>(
        `/v1/template?templateId=${stringTemplateId}`
      );
      logger.info('Request url:', { url: response.config.url });
      logger.debug('Raw API response for template:', response.data);

      if (!response.data.template) {
        throw new NovitaApiClientError(
          `Template not found: ${stringTemplateId}`,
          404,
          'TEMPLATE_NOT_FOUND'
        );
      }

      // Transform the API response to match our Template interface
      const rawTemplate = response.data.template;
      const template: Template = {
        id: rawTemplate.Id || rawTemplate.id,
        name: rawTemplate.name,
        imageUrl: rawTemplate.image,
        imageAuth: rawTemplate.imageAuth,
        ports: this.transformPorts(rawTemplate.ports || []),
        envs: rawTemplate.envs || [],
        description: rawTemplate.description
      };

      logger.info('Template fetched and transformed', {
        templateId: template.id,
        templateName: template.name,
        portsCount: template.ports?.length || 0,
        envsCount: template.envs?.length || 0
      });

      return template;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch template');
    }
  }

  /**
   * Get registry authentication credentials by ID
   */
  async getRegistryAuth(authId: string): Promise<{ username: string; password: string }> {
    try {
      logger.info('Fetching registry authentication credentials', { authId });

      const response = await novitaClient.get<RegistryAuthsResponse>(
        '/v1/repository/auths'
      );

      logger.debug('Registry auths API response', {
        authCount: response.data.data?.length || 0
      });

      if (!response.data.data || !Array.isArray(response.data.data)) {
        throw new NovitaApiClientError(
          'Invalid response format from registry auths API',
          500,
          'INVALID_RESPONSE'
        );
      }

      // Find the auth entry by ID
      const authEntry = response.data.data.find(auth => auth.id === authId);

      if (!authEntry) {
        throw new NovitaApiClientError(
          `Registry authentication not found for ID: ${authId}`,
          404,
          'REGISTRY_AUTH_NOT_FOUND'
        );
      }

      logger.info('Registry authentication credentials found', {
        authId,
        name: authEntry.name,
        username: authEntry.username
      });

      return {
        username: authEntry.username,
        password: authEntry.password
      };
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch registry authentication');
    }
  }

  /**
   * Create a new GPU instance
   */
  async createInstance(request: NovitaCreateInstanceRequest): Promise<InstanceResponse> {
    try {
      const response = await novitaClient.post<{ id: string }>(
        '/v1/gpu/instance/create',
        request
      );

      if (!response.data.id) {
        throw new NovitaApiClientError(
          'Invalid response: missing instance ID',
          500,
          'INVALID_RESPONSE'
        );
      }

      logger.info('Instance created successfully', {
        instanceId: response.data.id,
        name: request.name,
        productId: request.productId
      });

      // Return a standardized InstanceResponse
      const instanceResponse: InstanceResponse = {
        id: response.data.id,
        name: request.name,
        status: InstanceStatus.CREATING,
        productId: request.productId,
        region: 'Unknown', // Region is not returned by the create API
        gpuNum: request.gpuNum,
        rootfsSize: request.rootfsSize,
        billingMode: request.billingMode || 'spot',
        createdAt: new Date().toISOString(),
        portMappings: []
      };

      return instanceResponse;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to create instance');
    }
  }

  /**
   * Start an existing instance
   */
  async startInstance(instanceId: string): Promise<InstanceResponse> {
    console.log('🔧 DEBUG: startInstance called with instanceId:', instanceId);
    try {
      const response = await novitaClient.post<any>(
        '/v1/gpu/instance/start',
        { instanceId }
      );

      console.log('🔧 DEBUG: Start API response:', response.data);

      // The start API returns a minimal response: { instanceId, state }
      const startResponse = response.data;

      if (!startResponse || !startResponse.instanceId) {
        console.log('🔧 DEBUG: Response validation failed, startResponse:', startResponse);
        throw new NovitaApiClientError(
          'Invalid response: missing instance data',
          500,
          'INVALID_RESPONSE'
        );
      }

      logger.info('Instance start initiated successfully', {
        instanceId: startResponse.instanceId,
        state: startResponse.state
      });

      console.log('🔧 DEBUG: About to call getInstance with:', startResponse.instanceId);
      // After starting, fetch the full instance details to return complete data
      const fullInstanceData = await this.getInstance(startResponse.instanceId);

      console.log('🔧 DEBUG: getInstance returned:', fullInstanceData.id, fullInstanceData.status);
      return fullInstanceData;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to start instance');
    }
  }

  /**
   * Get instance status and details
   */
  async getInstance(instanceId: string): Promise<InstanceResponse> {
    try {
      const response = await novitaClient.get<any>(
        `/v1/gpu/instance?instanceId=${instanceId}`
      );

      // The API returns the instance data directly, not wrapped in a success/data structure
      const instanceData = response.data;

      if (!instanceData || !instanceData.id) {
        throw new NovitaApiClientError(
          `Instance not found: ${instanceId}`,
          404,
          'INSTANCE_NOT_FOUND'
        );
      }

      // Transform the raw API response to match our InstanceResponse interface
      const transformedInstance: InstanceResponse = {
        id: instanceData.id,
        name: instanceData.name,
        status: instanceData.status as InstanceStatus,
        productId: instanceData.productId,
        region: instanceData.clusterName || instanceData.clusterId || 'Unknown',
        gpuNum: parseInt(instanceData.gpuNum) || 1,
        rootfsSize: instanceData.rootfsSize || 0,
        billingMode: instanceData.billingMode || 'spot',
        createdAt: this.convertUnixTimestampToISO(instanceData.createdAt) || new Date().toISOString(),
        portMappings: instanceData.portMappings?.map((port: any) => ({
          port: port.port,
          endpoint: port.endpoint,
          type: port.type
        })) || []
      };

      // Add optional timestamp fields
      if (instanceData.lastStartedAt) {
        const lastStartedAt = this.convertUnixTimestampToISO(instanceData.lastStartedAt);
        if (lastStartedAt) transformedInstance.lastStartedAt = lastStartedAt;
      }
      if (instanceData.lastStoppedAt) {
        const lastStoppedAt = this.convertUnixTimestampToISO(instanceData.lastStoppedAt);
        if (lastStoppedAt) transformedInstance.lastStoppedAt = lastStoppedAt;
      }
      if (instanceData.startedAt) {
        const startedAt = this.convertUnixTimestampToISO(instanceData.startedAt);
        if (startedAt) transformedInstance.startedAt = startedAt;
      }
      if (instanceData.stoppedAt) {
        const stoppedAt = this.convertUnixTimestampToISO(instanceData.stoppedAt);
        if (stoppedAt) transformedInstance.stoppedAt = stoppedAt;
      }

      logger.info('Instance fetched successfully', {
        instanceId: transformedInstance.id,
        status: transformedInstance.status
      });

      return transformedInstance;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch instance', true);
    }
  }

  /**
   * Check if an instance exists in Novita.ai
   * Returns true if exists, false if 404, throws for other errors
   */
  async instanceExists(instanceId: string): Promise<boolean> {
    try {
      await this.getInstance(instanceId);
      return true;
    } catch (error) {
      if (error instanceof NovitaApiClientError && error.statusCode === 404) {
        return false;
      }
      // Re-throw other errors (network issues, auth problems, etc.)
      throw error;
    }
  }

  /**
   * List all instances with pagination using the correct Novita.ai API endpoint
   */
  async listInstances(options?: {
    page?: number;
    pageSize?: number;
    status?: InstanceStatus;
  }): Promise<NovitaListInstancesResponse> {
    try {
      const params: Record<string, string> = {};

      if (options?.page) params.page = options.page.toString();
      if (options?.pageSize) params.page_size = options.pageSize.toString();
      if (options?.status) params.status = options.status;

      // Use the correct Novita.ai API endpoint for listing instances
      const response = await novitaClient.get<{ instances: NovitaInstanceResponse[] }>(
        '/v1/gpu/instances',
        { params }
      );

      logger.debug('Raw Novita.ai instances API response:', {
        responseDataStructure: Object.keys(response.data),
        instancesCount: response.data.instances?.length || 0
      });

      // The API returns instances directly in the instances array
      const novitaInstances = response.data.instances || [];

      // Transform Novita response to our format
      const transformedInstances = this.transformNovitaInstances(novitaInstances);

      const result: NovitaListInstancesResponse = {
        instances: transformedInstances,
        total: novitaInstances.length,
        page: options?.page || 1,
        pageSize: options?.pageSize || 10
      };

      logger.info('Instances listed from Novita.ai successfully', {
        count: transformedInstances.length,
        total: result.total,
        page: result.page,
        endpoint: '/v1/gpu/instances'
      });

      return result;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to list instances from Novita.ai');
    }
  }

  /**
   * Stop an instance
   */
  async stopInstance(instanceId: string): Promise<InstanceResponse> {
    try {
      const response = await novitaClient.post<any>(
        '/v1/gpu/instance/stop',
        { instanceId }
      );

      // The API returns the instance data directly, not wrapped in a success/data structure
      const instanceData = response.data;

      if (!instanceData || !instanceData.id) {
        throw new NovitaApiClientError(
          'Invalid response: missing instance data',
          500,
          'INVALID_RESPONSE'
        );
      }

      // Transform the raw API response to match our InstanceResponse interface
      const transformedInstance: InstanceResponse = {
        id: instanceData.id,
        name: instanceData.name,
        status: instanceData.status as InstanceStatus,
        productId: instanceData.productId,
        region: instanceData.clusterName || instanceData.clusterId || 'Unknown',
        gpuNum: parseInt(instanceData.gpuNum) || 1,
        rootfsSize: instanceData.rootfsSize || 0,
        billingMode: instanceData.billingMode || 'spot',
        createdAt: this.convertUnixTimestampToISO(instanceData.createdAt) || new Date().toISOString(),
        portMappings: instanceData.portMappings?.map((port: any) => ({
          port: port.port,
          endpoint: port.endpoint || '',
          type: port.type
        })) || []
      };

      // Add optional timestamp fields
      if (instanceData.lastStartedAt) {
        const lastStartedAt = this.convertUnixTimestampToISO(instanceData.lastStartedAt);
        if (lastStartedAt) transformedInstance.lastStartedAt = lastStartedAt;
      }
      if (instanceData.lastStoppedAt) {
        const lastStoppedAt = this.convertUnixTimestampToISO(instanceData.lastStoppedAt);
        if (lastStoppedAt) transformedInstance.lastStoppedAt = lastStoppedAt;
      }
      if (instanceData.startedAt) {
        const startedAt = this.convertUnixTimestampToISO(instanceData.startedAt);
        if (startedAt) transformedInstance.startedAt = startedAt;
      }
      if (instanceData.stoppedAt) {
        const stoppedAt = this.convertUnixTimestampToISO(instanceData.stoppedAt);
        if (stoppedAt) transformedInstance.stoppedAt = stoppedAt;
      }

      logger.info('Instance stop initiated', {
        instanceId: transformedInstance.id,
        status: transformedInstance.status
      });

      return transformedInstance;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to stop instance');
    }
  }

  /**
   * Delete/terminate an instance
   */
  async deleteInstance(instanceId: string): Promise<void> {
    try {
      const response = await novitaClient.post<any>(
        '/v1/gpu/instance/delete',
        { instanceId }
      );

      // The API returns a direct response, not wrapped in a success/data structure
      // For delete operations, we mainly check if the request was successful (status 200/204)
      if (response.status < 200 || response.status >= 300) {
        throw new NovitaApiClientError(
          'Failed to delete instance - unexpected response status',
          response.status,
          'DELETE_FAILED'
        );
      }

      logger.info('Instance deleted successfully', { instanceId });
    } catch (error) {
      throw this.handleApiError(error, 'Failed to delete instance');
    }
  }

  /**
   * Migrate a spot instance that has been reclaimed
   */
  async migrateInstance(instanceId: string): Promise<MigrationResponse> {
    try {
      logger.info('Initiating instance migration', {
        instanceId,
        endpoint: '/v1/gpu/instance/migrate'
      });

      const requestPayload = { instanceId };

      logger.debug('Migration API request details', {
        instanceId
      });

      const response = await novitaClient.post<any>(
        '/v1/gpu/instance/migrate',
        requestPayload
      );

      // Transform the API response to our standardized format
      const migrationResponse: MigrationResponse = {
        success: true,
        instanceId: instanceId,
        message: response.data?.message || 'Migration initiated successfully',
        newInstanceId: response.data?.newInstanceId || response.data?.instanceId,
        migrationTime: new Date().toISOString()
      };

      // Add any additional response data if available
      if (response.data?.error) {
        migrationResponse.error = response.data.error;
        migrationResponse.success = false;
      }

      logger.info('Instance migration completed successfully', {
        instanceId,
        newInstanceId: migrationResponse.newInstanceId,
        success: migrationResponse.success,
        message: migrationResponse.message,
        responseStatus: response.status
      });

      return migrationResponse;
    } catch (error: any) {
      logger.error('Instance migration failed', {
        instanceId,
        error: error?.message || 'Unknown error',
        errorCode: error?.code,
        statusCode: error?.response?.status
      });

      // Still throw the error for proper error handling in the calling code
      throw this.handleApiError(error, 'Failed to migrate instance');
    }
  }

  /**
   * Query jobs from Novita internal API
   * Uses the internal API endpoint with different base URL and authentication
   */
  async queryJobs(params: JobQueryParams = {}): Promise<NovitaJobsResponse> {
    try {
      const queryParams: Record<string, string> = {
        pageNum: (params.pageNum || 1).toString(),
        pageSize: (params.pageSize || 10).toString()
      };

      if (params.jobId) queryParams.jobId = params.jobId;
      if (params.type) queryParams.type = params.type;
      if (params.state) queryParams.state = params.state;
      if (params.startTime) queryParams.startTime = params.startTime.toString();
      if (params.endTime) queryParams.endTime = params.endTime.toString();

      logger.debug('Querying jobs from Novita internal API', {
        params: queryParams,
        endpoint: '/api/v1/jobs',
        baseUrl: 'https://api-server.novita.ai'
      });

      // Use the internal client for jobs API
      const response = await novitaInternalClient.get<NovitaJobsResponse>(
        '/api/v1/jobs',
        { params: queryParams }
      );

      logger.debug('Jobs query response from internal API', {
        totalJobs: response.data.total,
        returnedJobs: response.data.jobs?.length || 0,
        endpoint: '/api/v1/jobs'
      });

      return response.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to query jobs from internal API');
    }
  }

  /**
   * Check API health
   */
  async healthCheck(): Promise<boolean> {
    return novitaClient.healthCheck();
  }

  /**
   * Get client status for monitoring
   */
  getClientStatus() {
    return {
      circuitBreakerState: novitaClient.getCircuitBreakerState(),
      queueStatus: novitaClient.getQueueStatus()
    };
  }

  /**
   * Convert Unix timestamp to ISO string
   */
  private convertUnixTimestampToISO(timestamp: string | number | undefined): string | undefined {
    if (!timestamp) return undefined;

    try {
      const timestampNum = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
      if (isNaN(timestampNum) || timestampNum <= 0) return undefined;

      return new Date(timestampNum * 1000).toISOString();
    } catch (error) {
      logger.warn('Failed to convert timestamp', { timestamp, error: (error as Error).message });
      return undefined;
    }
  }

  /**
   * Transform Novita instances from raw API response to our InstanceResponse format
   */
  private transformNovitaInstances(novitaInstances: NovitaInstanceResponse[]): InstanceResponse[] {
    return novitaInstances.map((novitaInstance) => {
      // Create base object with required fields
      const transformed: InstanceResponse = {
        id: novitaInstance.id,
        name: novitaInstance.name,
        status: novitaInstance.status as InstanceStatus,
        productId: novitaInstance.productId,
        region: novitaInstance.clusterName || novitaInstance.clusterId || 'Unknown',
        gpuNum: parseInt(novitaInstance.gpuNum) || 1,
        rootfsSize: novitaInstance.rootfsSize || 0,
        billingMode: novitaInstance.billingMode || 'spot',
        createdAt: this.convertUnixTimestampToISO(novitaInstance.createdAt) || new Date().toISOString(),
        portMappings: novitaInstance.portMappings?.map(port => ({
          port: port.port,
          endpoint: port.endpoint || '', // Use the actual endpoint from API response
          type: port.type
        })) || []
      };

      // Add optional fields using Object.assign to avoid exactOptionalPropertyTypes issues
      const optionalFields: Partial<InstanceResponse> = {};

      if (novitaInstance.clusterId) optionalFields.clusterId = novitaInstance.clusterId;
      if (novitaInstance.clusterName) optionalFields.clusterName = novitaInstance.clusterName;
      if (novitaInstance.productName) optionalFields.productName = novitaInstance.productName;
      if (novitaInstance.cpuNum) optionalFields.cpuNum = novitaInstance.cpuNum;
      if (novitaInstance.memory) optionalFields.memory = novitaInstance.memory;
      if (novitaInstance.imageUrl) optionalFields.imageUrl = novitaInstance.imageUrl;
      if (novitaInstance.imageAuthId) optionalFields.imageAuthId = novitaInstance.imageAuthId;
      if (novitaInstance.command) optionalFields.command = novitaInstance.command;
      if (novitaInstance.volumeMounts) optionalFields.volumeMounts = novitaInstance.volumeMounts;
      if (novitaInstance.statusError) optionalFields.statusError = novitaInstance.statusError;
      if (novitaInstance.envs) optionalFields.envs = novitaInstance.envs;
      if (novitaInstance.kind) optionalFields.kind = novitaInstance.kind;
      if (novitaInstance.endTime) optionalFields.endTime = novitaInstance.endTime;
      if (novitaInstance.spotStatus) optionalFields.spotStatus = novitaInstance.spotStatus;
      if (novitaInstance.spotReclaimTime) optionalFields.spotReclaimTime = novitaInstance.spotReclaimTime;

      // Handle additional timestamp fields with proper conversion
      if (novitaInstance.startedAt) {
        const startedAt = this.convertUnixTimestampToISO(novitaInstance.startedAt);
        if (startedAt) optionalFields.startedAt = startedAt;
      }
      if (novitaInstance.stoppedAt) {
        const stoppedAt = this.convertUnixTimestampToISO(novitaInstance.stoppedAt);
        if (stoppedAt) optionalFields.stoppedAt = stoppedAt;
      }
      if (novitaInstance.lastStartedAt) {
        const lastStartedAt = this.convertUnixTimestampToISO(novitaInstance.lastStartedAt);
        if (lastStartedAt) optionalFields.lastStartedAt = lastStartedAt;
      }
      if (novitaInstance.lastStoppedAt) {
        const lastStoppedAt = this.convertUnixTimestampToISO(novitaInstance.lastStoppedAt);
        if (lastStoppedAt) optionalFields.lastStoppedAt = lastStoppedAt;
      }

      // Handle other additional fields
      if (novitaInstance.gpuIds) optionalFields.gpuIds = novitaInstance.gpuIds;
      if (novitaInstance.templateId !== undefined) optionalFields.templateId = novitaInstance.templateId;

      return Object.assign(transformed, optionalFields);
    });
  }

  /**
   * Transform ports from API response format to our interface format
   */
  private transformPorts(apiPorts: any[]): Template['ports'] {
    if (!Array.isArray(apiPorts)) {
      return [];
    }

    const transformedPorts: Template['ports'] = [];

    apiPorts.forEach(portGroup => {
      if (portGroup.ports && Array.isArray(portGroup.ports)) {
        portGroup.ports.forEach((portNumber: number) => {
          transformedPorts.push({
            port: portNumber,
            type: portGroup.type || 'tcp'
          });
        });
      }
    });

    return transformedPorts;
  }

  /**
   * Extract GPU type from product name
   */
  private extractGpuType(productName: string): string {
    // Extract GPU type from names like "RTX 4090 24GB", "A100 80GB", etc.
    const match = productName.match(/(RTX\s*\d+|A\d+|H\d+|GTX\s*\d+|Tesla\s*\w+)/i);
    return match?.[1]?.trim() || 'Unknown';
  }

  /**
   * Handle and transform API errors into appropriate error types with enhanced startup context
   */
  private handleApiError(error: any, context: string, isStartupOperation: boolean = false): never {
    if (error instanceof NovitaApiClientError) {
      throw error;
    }

    // Check if it's an axios-like error object (including mocked errors)
    if (error && error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.message;
      const code = error.response.data?.code || error.code;

      // Enhanced logging for startup operations
      if (isStartupOperation) {
        logger.error('Novita.ai API error during startup operation', {
          context,
          status,
          message,
          code,
          responseData: error.response.data,
          headers: error.response.headers
        });
      }

      // Handle specific HTTP status codes
      switch (status) {
        case 429:
          const retryAfter = error.response.headers?.['retry-after'];
          const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;

          if (isStartupOperation) {
            logger.warn('Rate limit encountered during startup operation', {
              context,
              retryAfterMs,
              message
            });
          }

          throw new RateLimitError(
            message || 'Rate limit exceeded',
            retryAfterMs
          );

        case 401:
          throw new NovitaApiClientError(
            'Authentication failed - check API key',
            401,
            'AUTHENTICATION_FAILED'
          );

        case 400:
          // Handle specific 400 error cases
          if (code === 'INSUFFICIENT_RESOURCE' || (message && message.includes('INSUFFICIENT_RESOURCE'))) {
            throw new NovitaApiClientError(
              message || 'Insufficient resources available',
              400,
              'INSUFFICIENT_RESOURCE'
            );
          }
          throw new NovitaApiClientError(
            message || 'Bad request - invalid parameters',
            400,
            'BAD_REQUEST'
          );

        case 403:
          // Check if it's a resource constraint issue
          if (message && (message.includes('insufficient') || message.includes('quota') || message.includes('limit'))) {
            throw new NovitaApiClientError(
              `Resource constraints: ${message}`,
              403,
              'RESOURCE_CONSTRAINTS'
            );
          }
          throw new NovitaApiClientError(
            'Access forbidden - insufficient permissions',
            403,
            'ACCESS_FORBIDDEN'
          );

        case 404:
          throw new NovitaApiClientError(
            message || 'Resource not found',
            404,
            'NOT_FOUND'
          );

        case 409:
          // Conflict - instance might be in wrong state
          throw new NovitaApiClientError(
            message || 'Resource conflict - instance may be in wrong state',
            409,
            'RESOURCE_CONFLICT'
          );

        case 422:
          // Unprocessable entity - validation error from API
          throw new NovitaApiClientError(
            message || 'Invalid request parameters',
            422,
            'VALIDATION_ERROR'
          );

        case 500:
        case 502:
        case 503:
        case 504:
          const isRetryable = status === 503 || status === 502 || status === 504;

          if (isStartupOperation) {
            logger.error('Server error during startup operation', {
              context,
              status,
              message,
              isRetryable
            });
          }

          throw new NovitaApiClientError(
            message || 'Novita.ai API server error',
            status,
            'SERVER_ERROR'
          );
      }
    }

    // Handle specific error codes
    if (error && error.code) {
      if (error.code === 'ECONNABORTED') {
        if (isStartupOperation) {
          logger.error('Request timeout during startup operation', {
            context,
            code: error.code,
            timeout: error.timeout
          });
        }
        throw new TimeoutError('Request timeout');
      }

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
        if (isStartupOperation) {
          logger.error('Network error during startup operation', {
            context,
            code: error.code,
            message: error.message
          });
        }
        throw new NovitaApiClientError(
          'Network error - unable to connect to Novita.ai API',
          0,
          'NETWORK_ERROR'
        );
      }
    }

    // Handle circuit breaker errors
    if (error && error.message?.includes('Circuit breaker is OPEN')) {
      if (isStartupOperation) {
        logger.error('Circuit breaker open during startup operation', {
          context,
          message: error.message
        });
      }
      throw new CircuitBreakerError();
    }

    // Generic error fallback with enhanced logging for startup operations
    if (isStartupOperation) {
      logger.error('Unknown error during startup operation', {
        context,
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        errorCode: error.code
      });
    } else {
      logger.error(`${context}:`, error);
    }

    throw new NovitaApiClientError(
      `${context}: ${error.message || 'Unknown error'}`,
      500,
      'UNKNOWN_ERROR'
    );
  }

  /**
   * Enhanced start instance method with retry logic and detailed error handling
   */
  async startInstanceWithRetry(instanceId: string, maxRetries: number = 3): Promise<InstanceResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('Attempting to start instance', {
          instanceId,
          attempt,
          maxRetries
        });

        return await this.startInstance(instanceId);

      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error as Error);

        // Special handling for "invalid state change" errors
        if (error instanceof NovitaApiClientError &&
          error.statusCode === 400 &&
          error.message &&
          error.message.toLowerCase().includes('invalid state change')) {

          logger.debug('Checking if instance actually started despite error', {
            instanceId,
            attempt
          });

          // Wait a moment for the state to potentially update
          await new Promise(resolve => setTimeout(resolve, 2000));

          try {
            // Check if the instance is now in starting/running state
            const currentInstance = await this.getInstance(instanceId);
            if (currentInstance.status === InstanceStatus.STARTING ||
              currentInstance.status === InstanceStatus.RUNNING) {
              logger.info('Instance started successfully despite API error', {
                instanceId,
                currentStatus: currentInstance.status,
                attempt
              });
              return currentInstance;
            }
          } catch (checkError) {
            logger.debug('Failed to verify instance status after error', {
              instanceId,
              checkError: (checkError as Error).message
            });
          }
        }

        logger.warn('Instance start attempt failed', {
          instanceId,
          attempt,
          maxRetries,
          error: (error as Error).message,
          isRetryable,
          willRetry: isRetryable && attempt < maxRetries
        });

        // Don't retry if error is not retryable or we've exhausted attempts
        if (!isRetryable || attempt >= maxRetries) {
          break;
        }

        // Calculate exponential backoff delay
        const baseDelay = 1000; // 1 second
        const delay = baseDelay * Math.pow(2, attempt - 1);

        logger.debug('Waiting before retry', {
          instanceId,
          attempt,
          delayMs: delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted, throw the last error
    logger.error('All start instance attempts failed', {
      instanceId,
      maxRetries,
      lastError: lastError?.message
    });

    throw lastError;
  }

  /**
   * Check if an error is retryable for startup operations
   */
  private isRetryableError(error: Error): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof TimeoutError) return true;
    if (error instanceof CircuitBreakerError) return true;

    if (error instanceof NovitaApiClientError) {
      // Retry on server errors but not client errors
      if (error.statusCode) {
        // Special case: "invalid state change" errors are often transient
        // and the operation might still succeed despite the error response
        if (error.statusCode === 400 &&
          error.message &&
          error.message.toLowerCase().includes('invalid state change')) {
          logger.debug('Treating "invalid state change" error as retryable', {
            statusCode: error.statusCode,
            message: error.message,
            code: error.code
          });
          return true;
        }

        return error.statusCode >= 500 || error.statusCode === 429;
      }

      // Retry on network errors
      if (error.code === 'NETWORK_ERROR') return true;
    }

    return false;
  }
}


// Export singleton instance
export const novitaApiService = new NovitaApiService();