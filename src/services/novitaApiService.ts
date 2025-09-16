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
  RegistryAuthsResponse
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
        envs: this.transformEnvs(rawTemplate.envs || []),
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
      const response = await novitaClient.post<NovitaApiResponse<InstanceResponse>>(
        `/v1/gpu/instance/${instanceId}/start`
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to start instance',
          response.status,
          response.data.error?.code
        );
      }

      if (!response.data.data) {
        throw new NovitaApiClientError(
          'Invalid response: missing instance data',
          500,
          'INVALID_RESPONSE'
        );
      }

      logger.info('Instance start initiated', {
        instanceId: response.data.data.id,
        status: response.data.data.status
      });

      return response.data.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to start instance');
    }
  }

  /**
   * Get instance status and details
   */
  async getInstance(instanceId: string): Promise<InstanceResponse> {
    try {
      const response = await novitaClient.get<NovitaApiResponse<InstanceResponse>>(
        `/v1/gpu/instance/${instanceId}`
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to fetch instance',
          response.status,
          response.data.error?.code
        );
      }

      if (!response.data.data) {
        throw new NovitaApiClientError(
          `Instance not found: ${instanceId}`,
          404,
          'INSTANCE_NOT_FOUND'
        );
      }

      return response.data.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch instance');
    }
  }

  /**
   * List all instances with pagination
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

      const response = await novitaClient.get<NovitaApiResponse<NovitaListInstancesResponse>>(
        '/v1/gpu/instances',
        { params }
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to list instances',
          response.status,
          response.data.error?.code
        );
      }

      return response.data.data || { instances: [], total: 0, page: 1, pageSize: 10 };
    } catch (error) {
      throw this.handleApiError(error, 'Failed to list instances');
    }
  }

  /**
   * Stop an instance
   */
  async stopInstance(instanceId: string): Promise<InstanceResponse> {
    try {
      const response = await novitaClient.post<NovitaApiResponse<InstanceResponse>>(
        `/v1/gpu/instance/${instanceId}/stop`
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to stop instance',
          response.status,
          response.data.error?.code
        );
      }

      if (!response.data.data) {
        throw new NovitaApiClientError(
          'Invalid response: missing instance data',
          500,
          'INVALID_RESPONSE'
        );
      }

      logger.info('Instance stop initiated', {
        instanceId: response.data.data.id,
        status: response.data.data.status
      });

      return response.data.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to stop instance');
    }
  }

  /**
   * Delete/terminate an instance
   */
  async deleteInstance(instanceId: string): Promise<void> {
    try {
      const response = await novitaClient.delete<NovitaApiResponse<void>>(
        `/v1/gpu/instance/${instanceId}`
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to delete instance',
          response.status,
          response.data.error?.code
        );
      }

      logger.info('Instance deleted successfully', { instanceId });
    } catch (error) {
      throw this.handleApiError(error, 'Failed to delete instance');
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
   * Transform environment variables from API response format to our interface format
   */
  private transformEnvs(apiEnvs: any[]): Template['envs'] {
    if (!Array.isArray(apiEnvs)) {
      return [];
    }

    return apiEnvs.map(env => ({
      name: env.key || env.name,
      value: env.value
    }));
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