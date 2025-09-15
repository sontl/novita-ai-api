import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { config } from '../config/config';
import { logger } from '../utils/logger';

// Circuit breaker states
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

// Circuit breaker configuration
interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

// Rate limiter configuration
interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

// Request queue item
interface QueuedRequest {
  config: AxiosRequestConfig;
  resolve: (value: AxiosResponse) => void;
  reject: (reason: any) => void;
  timestamp: number;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN - requests are being rejected');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = CircuitState.CLOSED;
        logger.info('Circuit breaker transitioning to CLOSED state');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn(`Circuit breaker transitioning to OPEN state after ${this.failureCount} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

class RateLimiter {
  private requests: number[] = [];

  constructor(private config: RateLimiterConfig) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.config.windowMs
    );

    if (this.requests.length >= this.config.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.config.windowMs - (now - oldestRequest);
      
      if (waitTime > 0) {
        logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForSlot();
      }
    }

    this.requests.push(now);
  }
}

class NovitaClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;

  constructor() {
    this.client = this.createAxiosInstance();
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 10000  // 10 seconds
    });
    this.rateLimiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 60000 // 1 minute
    });

    this.setupInterceptors();
  }

  private createAxiosInstance(): AxiosInstance {
    return axios.create({
      baseURL: config.novita.baseUrl,
      timeout: config.defaults.requestTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.novita.apiKey}`,
        'User-Agent': 'novita-gpu-instance-api/1.0.0'
      }
    });
  }

  private setupInterceptors(): void {
    // Request interceptor for logging and correlation IDs
    this.client.interceptors.request.use(
      (config) => {
        const correlationId = this.generateCorrelationId();
        config.headers = config.headers || {};
        config.headers['X-Correlation-ID'] = correlationId;
        
        logger.debug('Outgoing request', {
          correlationId,
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL
        });

        return config;
      },
      (error) => {
        logger.error('Request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and retry logic
    this.client.interceptors.response.use(
      (response) => {
        const correlationId = response.config.headers?.['X-Correlation-ID'];
        
        logger.debug('Incoming response', {
          correlationId,
          status: response.status,
          statusText: response.statusText,
          url: response.config.url
        });

        return response;
      },
      async (error: AxiosError) => {
        const correlationId = error.config?.headers?.['X-Correlation-ID'];
        
        logger.error('Response error', {
          correlationId,
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          url: error.config?.url
        });

        // Check if we should retry
        if (this.shouldRetry(error)) {
          return this.retryRequest(error.config!);
        }

        return Promise.reject(error);
      }
    );
  }

  private generateCorrelationId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldRetry(error: AxiosError): boolean {
    // Don't retry if no config (shouldn't happen)
    if (!error.config) return false;

    // Don't retry if already retried max times
    const retryCount = (error.config as any).__retryCount || 0;
    if (retryCount >= config.defaults.maxRetryAttempts) return false;

    // Retry on network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return true;
    }

    // Retry on 5xx server errors
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Retry on 429 (rate limit) with exponential backoff
    if (error.response && error.response.status === 429) {
      return true;
    }

    return false;
  }

  private async retryRequest(requestConfig: AxiosRequestConfig): Promise<AxiosResponse> {
    const retryCount = ((requestConfig as any).__retryCount || 0) + 1;
    (requestConfig as any).__retryCount = retryCount;

    // Calculate delay with exponential backoff
    const baseDelay = 1000; // 1 second
    const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), 30000); // Max 30 seconds
    
    logger.info(`Retrying request (attempt ${retryCount}/${config.defaults.maxRetryAttempts}) after ${delay}ms`, {
      url: requestConfig.url,
      method: requestConfig.method
    });

    await new Promise(resolve => setTimeout(resolve, delay));
    
    return this.client.request(requestConfig);
  }

  // Public method to make requests with circuit breaker and rate limiting
  async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        config,
        resolve,
        reject,
        timestamp: Date.now()
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const queuedRequest = this.requestQueue.shift()!;
      
      try {
        // Apply rate limiting
        await this.rateLimiter.waitForSlot();

        // Execute request with circuit breaker
        const response = await this.circuitBreaker.execute(async () => {
          return this.client.request(queuedRequest.config);
        });

        queuedRequest.resolve(response);
      } catch (error) {
        queuedRequest.reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  // Convenience methods for different HTTP verbs
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.warn('Novita API health check failed', { error: (error as Error).message });
      return false;
    }
  }

  // Get circuit breaker status for monitoring
  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  // Get queue status for monitoring
  getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue
    };
  }
}

// Export singleton instance
export const novitaClient = new NovitaClient();
export { CircuitState };