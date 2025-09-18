import { AxiosError } from 'axios';
import { novitaClient } from '../clients/novitaClient';
import { logger } from '../utils/logger';
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
  MigrationResponse
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
      logger.info('Request url:', response.config.url);
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
    try {
      const response = await novitaClient.post<any>(
        '/v1/gpu/instance/start',
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
        createdAt: instanceData.createdAt ? new Date(parseInt(instanceData.createdAt) * 1000).toISOString() : new Date().toISOString(),
        portMappings: instanceData.portMappings || []
      };

      logger.info('Instance start initiated', {
        instanceId: transformedInstance.id,
        status: transformedInstance.status
      });

      return transformedInstance;
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
        createdAt: instanceData.createdAt ? new Date(parseInt(instanceData.createdAt) * 1000).toISOString() : new Date().toISOString(),
        portMappings: instanceData.portMappings || []
      };

      logger.info('Instance fetched successfully', {
        instanceId: transformedInstance.id,
        name: transformedInstance.name,
        status: transformedInstance.status,
        region: transformedInstance.region
      });

      return transformedInstance;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch instance');
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
        endpoint: '/gpu-instance/openapi/v1/gpu/instances'
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
        createdAt: instanceData.createdAt ? new Date(parseInt(instanceData.createdAt) * 1000).toISOString() : new Date().toISOString(),
        portMappings: instanceData.portMappings || []
      };

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
        endpoint: '/gpu-instance/openapi/v1/gpu/instance/migrate'
      });

      const requestPayload = { instanceId };
      
      logger.debug('Migration API request details', {
        instanceId,
        payload: requestPayload,
        endpoint: '/gpu-instance/openapi/v1/gpu/instance/migrate'
      });

      const response = await novitaClient.post<any>(
        '/gpu-instance/openapi/v1/gpu/instance/migrate',
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
        createdAt: novitaInstance.createdAt || new Date().toISOString(),
        portMappings: novitaInstance.portMappings?.map(port => ({
          port: port.port,
          endpoint: '', // Will be filled by connection info if available
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
   * Handle and transform API errors into appropriate error types
   */
  private handleApiError(error: any, context: string): never {
    if (error instanceof NovitaApiClientError) {
      throw error;
    }

    // Check if it's an axios-like error object (including mocked errors)
    if (error && error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.message;
      const code = error.response.data?.code || error.code;

      // Handle specific HTTP status codes
      switch (status) {
        case 429:
          const retryAfter = error.response.headers?.['retry-after'];
          throw new RateLimitError(
            message || 'Rate limit exceeded',
            retryAfter ? parseInt(retryAfter) * 1000 : undefined
          );
        
        case 401:
          throw new NovitaApiClientError(
            'Authentication failed - check API key',
            401,
            'AUTHENTICATION_FAILED'
          );
        
        case 403:
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
        
        case 500:
        case 502:
        case 503:
        case 504:
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
        throw new TimeoutError('Request timeout');
      }
      
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
        throw new NovitaApiClientError(
          'Network error - unable to connect to Novita.ai API',
          0,
          'NETWORK_ERROR'
        );
      }
    }

    // Handle circuit breaker errors
    if (error && error.message?.includes('Circuit breaker is OPEN')) {
      throw new CircuitBreakerError();
    }

    // Generic error fallback
    logger.error(`${context}:`, error);
    throw new NovitaApiClientError(
      `${context}: ${error.message || 'Unknown error'}`,
      500,
      'UNKNOWN_ERROR'
    );
  }
}

// Export singleton instance
export const novitaApiService = new NovitaApiService();