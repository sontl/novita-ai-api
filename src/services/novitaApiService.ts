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
  TimeoutError
} from '../types/api';

export class NovitaApiService {
  
  /**
   * Get available products with optional filtering
   */
  async getProducts(filters?: {
    name?: string;
    region?: string;
    gpuType?: string;
  }): Promise<Product[]> {
    try {
      const params = new URLSearchParams();
      
      if (filters?.name) params.append('name', filters.name);
      if (filters?.region) params.append('region', filters.region);
      if (filters?.gpuType) params.append('gpu_type', filters.gpuType);

      const response = await novitaClient.get<NovitaApiResponse<ProductsResponse>>(
        `/v1/products?${params.toString()}`
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to fetch products',
          response.status,
          response.data.error?.code
        );
      }

      return response.data.data?.products || [];
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch products');
    }
  }

  /**
   * Get optimal product by name and region (lowest spot price)
   */
  async getOptimalProduct(productName: string, region: string): Promise<Product> {
    try {
      const products = await this.getProducts({ name: productName, region });
      
      if (products.length === 0) {
        throw new NovitaApiClientError(
          `No products found matching name "${productName}" in region "${region}"`,
          404,
          'PRODUCT_NOT_FOUND'
        );
      }

      // Sort by spot price ascending and return the cheapest available option
      const availableProducts = products.filter(p => p.availability === 'available');
      
      if (availableProducts.length === 0) {
        throw new NovitaApiClientError(
          `No available products found for "${productName}" in region "${region}"`,
          404,
          'NO_AVAILABLE_PRODUCTS'
        );
      }

      const sortedProducts = availableProducts.sort((a, b) => a.spotPrice - b.spotPrice);
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
        spotPrice: optimalProduct.spotPrice
      });

      return optimalProduct;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to get optimal product');
    }
  }

  /**
   * Get template configuration by ID
   */
  async getTemplate(templateId: string): Promise<Template> {
    try {
      const response = await novitaClient.get<NovitaApiResponse<Template>>(
        `/v1/templates/${templateId}`
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to fetch template',
          response.status,
          response.data.error?.code
        );
      }

      if (!response.data.data) {
        throw new NovitaApiClientError(
          `Template not found: ${templateId}`,
          404,
          'TEMPLATE_NOT_FOUND'
        );
      }

      return response.data.data;
    } catch (error) {
      throw this.handleApiError(error, 'Failed to fetch template');
    }
  }

  /**
   * Create a new GPU instance
   */
  async createInstance(request: NovitaCreateInstanceRequest): Promise<InstanceResponse> {
    try {
      const response = await novitaClient.post<NovitaApiResponse<InstanceResponse>>(
        '/v1/instances',
        request
      );

      if (!response.data.success) {
        throw new NovitaApiClientError(
          response.data.error?.message || 'Failed to create instance',
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

      logger.info('Instance created successfully', {
        instanceId: response.data.data.id,
        name: response.data.data.name,
        status: response.data.data.status
      });

      return response.data.data;
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
        `/v1/instances/${instanceId}/start`
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
        `/v1/instances/${instanceId}`
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
      const params = new URLSearchParams();
      
      if (options?.page) params.append('page', options.page.toString());
      if (options?.pageSize) params.append('page_size', options.pageSize.toString());
      if (options?.status) params.append('status', options.status);

      const response = await novitaClient.get<NovitaApiResponse<NovitaListInstancesResponse>>(
        `/v1/instances?${params.toString()}`
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
        `/v1/instances/${instanceId}/stop`
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
        `/v1/instances/${instanceId}`
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