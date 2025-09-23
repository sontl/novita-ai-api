import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { logger } from '../utils/logger';
import {
  HealthCheckConfig,
  EndpointHealthCheck,
  HealthCheckResult
} from '../types/api';

/**
 * Health check error types for categorization
 */
export enum HealthCheckErrorType {
  TIMEOUT = 'timeout',
  CONNECTION_REFUSED = 'connection_refused',
  CONNECTION_RESET = 'connection_reset',
  DNS_RESOLUTION_FAILED = 'dns_resolution_failed',
  NETWORK_UNREACHABLE = 'network_unreachable',
  BAD_GATEWAY = 'bad_gateway',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  SERVER_ERROR = 'server_error',
  CLIENT_ERROR = 'client_error',
  SSL_ERROR = 'ssl_error',
  INVALID_RESPONSE = 'invalid_response',
  UNKNOWN = 'unknown'
}

/**
 * Health check error class with comprehensive error details
 */
export class HealthCheckError extends Error {
  public readonly timestamp: Date;
  public readonly isRetryable: boolean;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';

  constructor(
    message: string,
    public readonly type: HealthCheckErrorType,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
    public readonly endpoint?: string,
    public readonly responseTime?: number,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'HealthCheckError';
    this.timestamp = new Date();
    this.isRetryable = this.determineRetryability();
    this.severity = this.determineSeverity();

    // Preserve stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HealthCheckError);
    }
  }

  /**
   * Determine if this error type is retryable
   */
  private determineRetryability(): boolean {
    const retryableTypes = [
      HealthCheckErrorType.TIMEOUT,
      HealthCheckErrorType.CONNECTION_REFUSED,
      HealthCheckErrorType.CONNECTION_RESET,
      HealthCheckErrorType.NETWORK_UNREACHABLE,
      HealthCheckErrorType.BAD_GATEWAY,
      HealthCheckErrorType.SERVICE_UNAVAILABLE,
      HealthCheckErrorType.SERVER_ERROR
    ];
    return retryableTypes.includes(this.type);
  }

  /**
   * Determine error severity level
   */
  private determineSeverity(): 'low' | 'medium' | 'high' | 'critical' {
    switch (this.type) {
      case HealthCheckErrorType.TIMEOUT:
      case HealthCheckErrorType.CONNECTION_REFUSED:
        return 'medium';
      case HealthCheckErrorType.CONNECTION_RESET:
      case HealthCheckErrorType.NETWORK_UNREACHABLE:
      case HealthCheckErrorType.DNS_RESOLUTION_FAILED:
        return 'high';
      case HealthCheckErrorType.SSL_ERROR:
      case HealthCheckErrorType.INVALID_RESPONSE:
        return 'critical';
      case HealthCheckErrorType.BAD_GATEWAY:
      case HealthCheckErrorType.SERVICE_UNAVAILABLE:
        return 'medium';
      case HealthCheckErrorType.SERVER_ERROR:
        return 'high';
      case HealthCheckErrorType.CLIENT_ERROR:
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Get a structured representation of the error for logging
   */
  toLogObject(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      statusCode: this.statusCode,
      endpoint: this.endpoint,
      responseTime: this.responseTime,
      timestamp: this.timestamp.toISOString(),
      isRetryable: this.isRetryable,
      severity: this.severity,
      context: this.context,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        code: (this.originalError as any).code
      } : undefined
    };
  }
}

/**
 * Service for performing health checks on application endpoints
 */
export class HealthCheckerService {
  private readonly defaultConfig: HealthCheckConfig = {
    timeoutMs: 10000,
    retryAttempts: 3,
    retryDelayMs: 2000,
    maxWaitTimeMs: 300000
  };

  /**
   * Perform health checks on multiple endpoints in parallel with comprehensive error handling
   */
  async performHealthChecks(
    portMappings: Array<{ port: number; endpoint: string; type: string }>,
    config: Partial<HealthCheckConfig> = {}
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const mergedConfig = { ...this.defaultConfig, ...config };
    const sessionId = `hc-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Starting health check session', {
      sessionId,
      endpointCount: portMappings.length,
      config: mergedConfig,
      targetPort: mergedConfig.targetPort,
      portMappings: portMappings.map(pm => ({ port: pm.port, type: pm.type , endpoint: pm.endpoint}))
    });

    // Validate input parameters
    if (!portMappings || !Array.isArray(portMappings)) {
      const error = new HealthCheckError(
        'Invalid port mappings provided',
        HealthCheckErrorType.INVALID_RESPONSE,
        undefined,
        undefined,
        undefined,
        undefined,
        { sessionId, inputValidation: 'port_mappings_invalid' }
      );

      logger.error('Health check session failed - invalid input', {
        sessionId,
        error: error.toLogObject()
      });

      throw error;
    }

    // Filter endpoints based on target port if specified
    const endpointsToCheck = mergedConfig.targetPort
      ? portMappings.filter(pm => pm.port === mergedConfig.targetPort)
      : portMappings;

    if (endpointsToCheck.length === 0) {
      logger.warn('No endpoints to check after filtering', {
        sessionId,
        originalPortMappings: portMappings.length,
        targetPort: mergedConfig.targetPort,
        filteredEndpoints: endpointsToCheck.length
      });

      return {
        overallStatus: 'unhealthy',
        endpoints: [],
        checkedAt: new Date(),
        totalResponseTime: 0
      };
    }

    logger.info('Performing parallel health checks', {
      sessionId,
      endpointsToCheck: endpointsToCheck.length,
      endpoints: endpointsToCheck.map(e => ({ port: e.port, endpoint: e.endpoint, type: e.type }))
    });

    // Perform health checks in parallel using Promise.allSettled
    const healthCheckPromises = endpointsToCheck.map((endpoint, index) => {
      logger.debug('Queuing health check', {
        sessionId,
        endpointIndex: index,
        port: endpoint.port,
        endpoint: endpoint.endpoint,
        type: endpoint.type
      });

      return this.checkEndpoint(endpoint, mergedConfig);
    });

    let results: PromiseSettledResult<EndpointHealthCheck>[];

    try {
      results = await Promise.allSettled(healthCheckPromises);

      logger.debug('All health check promises settled', {
        sessionId,
        totalPromises: healthCheckPromises.length,
        settledResults: results.length
      });
    } catch (error) {
      // This should not happen with Promise.allSettled, but handle it just in case
      logger.error('Unexpected error during parallel health checks', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        endpointsToCheck: endpointsToCheck.length
      });

      throw new HealthCheckError(
        'Failed to execute parallel health checks',
        HealthCheckErrorType.UNKNOWN,
        undefined,
        error instanceof Error ? error : undefined,
        undefined,
        undefined,
        { sessionId, parallelExecutionError: true }
      );
    }

    const endpoints: EndpointHealthCheck[] = [];
    let totalResponseTime = 0;
    let fulfilledCount = 0;
    let rejectedCount = 0;

    // Process results with detailed error handling
    results.forEach((result, index) => {
      const originalEndpoint = endpointsToCheck[index];

      if (result.status === 'fulfilled') {
        fulfilledCount++;
        endpoints.push(result.value);
        totalResponseTime += result.value.responseTime || 0;

        logger.debug('Health check promise fulfilled', {
          sessionId,
          endpointIndex: index,
          port: originalEndpoint?.port,
          status: result.value.status,
          responseTime: result.value.responseTime
        });
      } else {
        rejectedCount++;

        logger.error('Health check promise rejected', {
          sessionId,
          endpointIndex: index,
          port: originalEndpoint?.port,
          endpoint: originalEndpoint?.endpoint,
          rejectionReason: result.reason?.message || 'Unknown rejection reason',
          rejectionType: result.reason?.constructor?.name || 'Unknown'
        });

        // Handle rejected promises by creating an unhealthy endpoint result
        if (originalEndpoint) {
          const errorMessage = result.reason instanceof HealthCheckError
            ? result.reason.message
            : result.reason?.message || 'Health check promise was rejected';

          endpoints.push({
            port: originalEndpoint.port,
            endpoint: originalEndpoint.endpoint,
            type: originalEndpoint.type,
            status: 'unhealthy',
            lastChecked: new Date(),
            error: errorMessage,
            responseTime: 0
          });
        }
      }
    });

    // Determine overall status with detailed analysis
    const healthyCount = endpoints.filter(e => e.status === 'healthy').length;
    const unhealthyCount = endpoints.filter(e => e.status === 'unhealthy').length;
    const totalCount = endpoints.length;

    let overallStatus: 'healthy' | 'unhealthy' | 'partial';
    if (healthyCount === totalCount && totalCount > 0) {
      overallStatus = 'healthy';
    } else if (healthyCount > 0) {
      overallStatus = 'partial';
    } else {
      overallStatus = 'unhealthy';
    }

    const duration = Date.now() - startTime;
    const result: HealthCheckResult = {
      overallStatus,
      endpoints,
      checkedAt: new Date(),
      totalResponseTime
    };

    logger.info('Health check session completed', {
      sessionId,
      overallStatus,
      healthyEndpoints: healthyCount,
      unhealthyEndpoints: unhealthyCount,
      totalEndpoints: totalCount,
      fulfilledPromises: fulfilledCount,
      rejectedPromises: rejectedCount,
      totalResponseTime,
      averageResponseTime: healthyCount > 0 ? Math.round(totalResponseTime / healthyCount) : 0,
      sessionDuration: duration,
      endpointSummary: endpoints.map(e => ({
        port: e.port,
        status: e.status,
        responseTime: e.responseTime,
        hasError: !!e.error
      }))
    });

    return result;
  }

  /**
   * Check a single endpoint with retry mechanism and comprehensive error handling
   */
  private async checkEndpoint(
    endpointInfo: { port: number; endpoint: string; type: string },
    config: HealthCheckConfig
  ): Promise<EndpointHealthCheck> {
    const { port, endpoint, type } = endpointInfo;
    let lastError: HealthCheckError | undefined;
    let attempt = 0;
    const checkStartTime = Date.now();

    logger.info('Starting endpoint health check', {
      port,
      endpoint,
      type,
      config: {
        timeoutMs: config.timeoutMs,
        retryAttempts: config.retryAttempts,
        retryDelayMs: config.retryDelayMs
      }
    });

    while (attempt <= config.retryAttempts) {
      const attemptStartTime = Date.now();
      attempt++;

      try {
        logger.debug('Health check attempt starting', {
          port,
          endpoint,
          attempt,
          maxAttempts: config.retryAttempts + 1,
          timeoutMs: config.timeoutMs
        });

        const response = await this.makeHealthCheckRequest(endpoint, config);
        const responseTime = Date.now() - attemptStartTime;
        const totalTime = Date.now() - checkStartTime;

        logger.info('Health check successful', {
          port,
          endpoint,
          statusCode: response.status,
          statusText: response.statusText,
          responseTime,
          totalTime,
          attempt,
          headers: {
            contentType: response.headers['content-type'],
            contentLength: response.headers['content-length'],
            server: response.headers['server']
          }
        });

        return {
          port,
          endpoint,
          type,
          status: 'healthy',
          lastChecked: new Date(),
          responseTime
        };

      } catch (error) {
        const attemptTime = Date.now() - attemptStartTime;
        lastError = this.categorizeError(error, endpoint, attemptStartTime);

        logger.warn('Health check attempt failed', {
          port,
          endpoint,
          attempt,
          maxAttempts: config.retryAttempts + 1,
          attemptTime,
          error: lastError.toLogObject(),
          willRetry: attempt <= config.retryAttempts && lastError.isRetryable
        });

        // Check if we should retry based on error type and configuration
        if (attempt <= config.retryAttempts && lastError.isRetryable) {
          const delay = this.calculateRetryDelay(attempt, config.retryDelayMs);

          logger.debug('Scheduling retry for health check', {
            port,
            endpoint,
            attempt,
            nextAttempt: attempt + 1,
            delayMs: delay,
            errorType: lastError.type,
            errorSeverity: lastError.severity
          });

          await this.sleep(delay);
          continue;
        } else if (!lastError.isRetryable) {
          logger.error('Health check failed with non-retryable error', {
            port,
            endpoint,
            attempt,
            error: lastError.toLogObject(),
            totalTime: Date.now() - checkStartTime
          });
          break;
        }
      }
    }

    const totalTime = Date.now() - checkStartTime;

    logger.error('Health check failed after all attempts', {
      port,
      endpoint,
      totalAttempts: attempt,
      maxAttempts: config.retryAttempts + 1,
      totalTime,
      finalError: lastError?.toLogObject(),
      errorSeverity: lastError?.severity,
      isRetryable: lastError?.isRetryable
    });

    return {
      port,
      endpoint,
      type,
      status: 'unhealthy',
      lastChecked: new Date(),
      error: lastError?.message || 'Unknown error after all retry attempts',
      responseTime: 0
    };
  }

  /**
   * Make HTTP request for health check with comprehensive error handling
   * 
   * This method performs HTTP requests for health checks and includes advanced
   * response validation that goes beyond just checking HTTP status codes.
   * 
   * Key features:
   * - Validates response body content for error indicators even with 2xx status codes
   * - Detects "Bad Gateway", "Service Unavailable", and "Internal Server Error" 
   *   messages in response bodies that indicate upstream service issues
   * - Handles cases where reverse proxies return 200 OK but the response body
   *   contains error messages from failed upstream services
   * - Provides comprehensive request tracing with unique request IDs
   * - Includes detailed error context for debugging and monitoring
   */
  private async makeHealthCheckRequest(endpoint: string, config: HealthCheckConfig) {
    const requestId = `hc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const requestConfig: AxiosRequestConfig = {
      method: 'GET',
      url: endpoint,
      timeout: config.timeoutMs,
      validateStatus: (status) => {
        // Accept 2xx and 3xx status codes as healthy
        // Log the status for debugging
        logger.debug('HTTP response received', {
          requestId,
          endpoint,
          status,
          isHealthy: status >= 200 && status < 400
        });
        return status >= 200 && status < 400;
      },
      // Disable redirects to avoid following potentially problematic redirects
      maxRedirects: 0,
      // Add headers to identify the health check request
      headers: {
        'User-Agent': 'Novita-GPU-Instance-API-HealthChecker/1.0',
        'Accept': '*/*',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'X-Health-Check': 'true',
        'X-Request-ID': requestId
      },
      // Additional Axios configuration for better error handling
      decompress: true,
      responseType: 'text',
      // Disable automatic JSON parsing to handle various response types
      transformResponse: [(data) => data]
    };

    logger.debug('Making health check HTTP request', {
      requestId,
      endpoint,
      method: requestConfig.method,
      timeout: requestConfig.timeout,
      headers: requestConfig.headers
    });

    try {
      const response = await axios(requestConfig);

      // Validate response body for error indicators even with successful status codes
      if (response.data && typeof response.data === 'string') {
        const responseText = response.data.toLowerCase();

        // Check for Bad Gateway indicators
        if (responseText.includes('bad gateway') ||
          responseText.includes('502 bad gateway') ||
          responseText.includes('gateway error') ||
          responseText.includes('upstream error') ||
          responseText.includes('proxy error')) {

          logger.warn('Bad Gateway detected in response body despite successful status', {
            requestId,
            endpoint,
            status: response.status,
            responsePreview: response.data.substring(0, 200)
          });

          const syntheticError = new Error('Bad Gateway detected in response body');
          (syntheticError as any).response = {
            status: 502,
            statusText: 'Bad Gateway (detected in response body)',
            data: response.data,
            headers: response.headers
          };
          (syntheticError as any).isAxiosError = true;
          (syntheticError as any).code = 'BAD_GATEWAY_IN_BODY';

          throw syntheticError;
        }

        // Check for Service Unavailable indicators
        if (responseText.includes('service unavailable') ||
          responseText.includes('503 service unavailable') ||
          responseText.includes('temporarily unavailable') ||
          responseText.includes('maintenance mode')) {

          logger.warn('Service Unavailable detected in response body despite successful status', {
            requestId,
            endpoint,
            status: response.status,
            responsePreview: response.data.substring(0, 200)
          });

          const syntheticError = new Error('Service Unavailable detected in response body');
          (syntheticError as any).response = {
            status: 503,
            statusText: 'Service Unavailable (detected in response body)',
            data: response.data,
            headers: response.headers
          };
          (syntheticError as any).isAxiosError = true;
          (syntheticError as any).code = 'SERVICE_UNAVAILABLE_IN_BODY';

          throw syntheticError;
        }

        // Check for Internal Server Error indicators
        if (responseText.includes('internal server error') ||
          responseText.includes('500 internal server error') ||
          responseText.includes('application error') ||
          responseText.includes('server error occurred')) {

          logger.warn('Internal Server Error detected in response body despite successful status', {
            requestId,
            endpoint,
            status: response.status,
            responsePreview: response.data.substring(0, 200)
          });

          const syntheticError = new Error('Internal Server Error detected in response body');
          (syntheticError as any).response = {
            status: 500,
            statusText: 'Internal Server Error (detected in response body)',
            data: response.data,
            headers: response.headers
          };
          (syntheticError as any).isAxiosError = true;
          (syntheticError as any).code = 'SERVER_ERROR_IN_BODY';

          throw syntheticError;
        }
      }

      logger.debug('Health check HTTP request completed successfully', {
        requestId,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length'],
        responseSize: response.data?.length || 0
      });

      return response;
    } catch (error) {
      // Add request context to error for better debugging
      if (axios.isAxiosError(error)) {
        (error as any).requestId = requestId;
        (error as any).endpoint = endpoint;
        (error as any).requestConfig = {
          method: requestConfig.method,
          timeout: requestConfig.timeout,
          url: requestConfig.url
        };
      }

      logger.debug('Health check HTTP request failed', {
        requestId,
        endpoint,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: (error as any).code,
          status: axios.isAxiosError(error) ? error.response?.status : undefined
        }
      });

      throw error;
    }
  }

  /**
   * Categorize errors for better handling and reporting with comprehensive error analysis
   */
  private categorizeError(error: any, endpoint?: string, startTime?: number): HealthCheckError {
    const responseTime = startTime ? Date.now() - startTime : undefined;
    const context: Record<string, any> = {
      userAgent: 'Novita-GPU-Instance-API-HealthChecker/1.0',
      timestamp: new Date().toISOString()
    };

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // Network-level errors
      if (axiosError.code) {
        switch (axiosError.code) {
          case 'BAD_GATEWAY_IN_BODY':
            return new HealthCheckError(
              'Bad Gateway detected in response body - upstream service unavailable',
              HealthCheckErrorType.BAD_GATEWAY,
              502,
              error,
              endpoint,
              responseTime,
              { ...context, gatewayError: 'bad_gateway_in_response_body' }
            );

          case 'SERVICE_UNAVAILABLE_IN_BODY':
            return new HealthCheckError(
              'Service Unavailable detected in response body - service temporarily down',
              HealthCheckErrorType.SERVICE_UNAVAILABLE,
              503,
              error,
              endpoint,
              responseTime,
              { ...context, serviceError: 'service_unavailable_in_response_body' }
            );

          case 'SERVER_ERROR_IN_BODY':
            return new HealthCheckError(
              'Internal Server Error detected in response body - application error',
              HealthCheckErrorType.SERVER_ERROR,
              500,
              error,
              endpoint,
              responseTime,
              { ...context, serverError: 'server_error_in_response_body' }
            );
          case 'ECONNABORTED':
            return new HealthCheckError(
              `Request timeout after ${responseTime || 'unknown'}ms`,
              HealthCheckErrorType.TIMEOUT,
              undefined,
              error,
              endpoint,
              responseTime,
              { ...context, timeoutType: 'request_timeout' }
            );

          case 'ETIMEDOUT':
            return new HealthCheckError(
              'Connection timeout - server did not respond in time',
              HealthCheckErrorType.TIMEOUT,
              undefined,
              error,
              endpoint,
              responseTime,
              { ...context, timeoutType: 'connection_timeout' }
            );

          case 'ECONNREFUSED':
            return new HealthCheckError(
              'Connection refused - service is not accepting connections',
              HealthCheckErrorType.CONNECTION_REFUSED,
              undefined,
              error,
              endpoint,
              responseTime,
              { ...context, connectionIssue: 'port_closed_or_service_down' }
            );

          case 'ECONNRESET':
            return new HealthCheckError(
              'Connection reset by peer - service terminated connection',
              HealthCheckErrorType.CONNECTION_RESET,
              undefined,
              error,
              endpoint,
              responseTime,
              { ...context, connectionIssue: 'connection_terminated' }
            );

          case 'ENOTFOUND':
          case 'EAI_NONAME':
          case 'EAI_NODATA':
            return new HealthCheckError(
              'DNS resolution failed - hostname could not be resolved',
              HealthCheckErrorType.DNS_RESOLUTION_FAILED,
              undefined,
              error,
              endpoint,
              responseTime,
              { ...context, dnsIssue: 'hostname_resolution_failed' }
            );

          case 'ENETUNREACH':
            return new HealthCheckError(
              'Network unreachable - routing issue or network down',
              HealthCheckErrorType.NETWORK_UNREACHABLE,
              undefined,
              error,
              endpoint,
              responseTime,
              { ...context, networkIssue: 'routing_problem' }
            );

          case 'EHOSTUNREACH':
            return new HealthCheckError(
              'Host unreachable - target host is not reachable',
              HealthCheckErrorType.NETWORK_UNREACHABLE,
              undefined,
              error,
              endpoint,
              responseTime,
              { ...context, networkIssue: 'host_unreachable' }
            );
        }
      }

      // SSL/TLS errors
      if (axiosError.message.includes('certificate') ||
        axiosError.message.includes('SSL') ||
        axiosError.message.includes('TLS')) {
        return new HealthCheckError(
          `SSL/TLS error: ${axiosError.message}`,
          HealthCheckErrorType.SSL_ERROR,
          undefined,
          error,
          endpoint,
          responseTime,
          { ...context, sslIssue: 'certificate_or_handshake_error' }
        );
      }

      // HTTP status code errors
      if (axiosError.response) {
        const status = axiosError.response.status;
        const statusText = axiosError.response.statusText;
        const responseData = axiosError.response.data;

        context.httpResponse = {
          status,
          statusText,
          headers: axiosError.response.headers,
          dataPreview: typeof responseData === 'string' ?
            responseData.substring(0, 200) :
            JSON.stringify(responseData).substring(0, 200)
        };

        if (status === 400) {
          return new HealthCheckError(
            `Bad Request (400): ${statusText}`,
            HealthCheckErrorType.CLIENT_ERROR,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, clientError: 'bad_request' }
          );
        }

        if (status === 401) {
          return new HealthCheckError(
            `Unauthorized (401): Authentication required`,
            HealthCheckErrorType.CLIENT_ERROR,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, clientError: 'authentication_required' }
          );
        }

        if (status === 403) {
          return new HealthCheckError(
            `Forbidden (403): Access denied`,
            HealthCheckErrorType.CLIENT_ERROR,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, clientError: 'access_denied' }
          );
        }

        if (status === 404) {
          return new HealthCheckError(
            `Not Found (404): Endpoint does not exist`,
            HealthCheckErrorType.CLIENT_ERROR,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, clientError: 'endpoint_not_found' }
          );
        }

        if (status === 502) {
          return new HealthCheckError(
            `Bad Gateway (502): Upstream server error`,
            HealthCheckErrorType.BAD_GATEWAY,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, gatewayError: 'upstream_server_error' }
          );
        }

        if (status === 503) {
          return new HealthCheckError(
            `Service Unavailable (503): Service temporarily unavailable`,
            HealthCheckErrorType.SERVICE_UNAVAILABLE,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, serviceError: 'temporarily_unavailable' }
          );
        }

        if (status === 504) {
          return new HealthCheckError(
            `Gateway Timeout (504): Upstream server timeout`,
            HealthCheckErrorType.BAD_GATEWAY,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, gatewayError: 'upstream_timeout' }
          );
        }

        if (status >= 500) {
          return new HealthCheckError(
            `Server Error (${status}): ${statusText}`,
            HealthCheckErrorType.SERVER_ERROR,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, serverError: 'internal_server_error' }
          );
        }

        if (status >= 400) {
          return new HealthCheckError(
            `Client Error (${status}): ${statusText}`,
            HealthCheckErrorType.CLIENT_ERROR,
            status,
            error,
            endpoint,
            responseTime,
            { ...context, clientError: 'http_client_error' }
          );
        }
      }

      // Request configuration errors
      if (axiosError.config && !axiosError.response) {
        return new HealthCheckError(
          `Request configuration error: ${axiosError.message}`,
          HealthCheckErrorType.INVALID_RESPONSE,
          undefined,
          error,
          endpoint,
          responseTime,
          { ...context, configError: 'request_setup_failed' }
        );
      }
    }

    // Non-Axios errors
    if (error instanceof TypeError) {
      return new HealthCheckError(
        `Type error: ${error.message}`,
        HealthCheckErrorType.INVALID_RESPONSE,
        undefined,
        error,
        endpoint,
        responseTime,
        { ...context, typeError: 'invalid_data_type' }
      );
    }

    if (error instanceof SyntaxError) {
      return new HealthCheckError(
        `Syntax error: ${error.message}`,
        HealthCheckErrorType.INVALID_RESPONSE,
        undefined,
        error,
        endpoint,
        responseTime,
        { ...context, syntaxError: 'malformed_response' }
      );
    }

    // Unknown error with enhanced context
    return new HealthCheckError(
      `Unknown error: ${error?.message || 'Unspecified error occurred'}`,
      HealthCheckErrorType.UNKNOWN,
      undefined,
      error,
      endpoint,
      responseTime,
      {
        ...context,
        unknownError: true,
        errorType: error?.constructor?.name || 'Unknown',
        errorCode: (error as any)?.code,
        errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined
      }
    );
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, baseDelay: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

    // Add jitter (random factor between 0.5 and 1.5)
    const jitter = 0.5 + Math.random();

    return Math.floor(exponentialDelay * jitter);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get health check statistics for monitoring and debugging
   */
  public getHealthCheckStats(): {
    defaultConfig: HealthCheckConfig;
    errorTypes: typeof HealthCheckErrorType;
    version: string;
  } {
    return {
      defaultConfig: { ...this.defaultConfig },
      errorTypes: HealthCheckErrorType,
      version: '1.0.0'
    };
  }

  /**
   * Validate health check configuration
   */
  public validateConfig(config: Partial<HealthCheckConfig>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.timeoutMs !== undefined) {
      if (typeof config.timeoutMs !== 'number' || config.timeoutMs <= 0) {
        errors.push('timeoutMs must be a positive number');
      }
      if (config.timeoutMs > 300000) { // 5 minutes max
        errors.push('timeoutMs should not exceed 300000ms (5 minutes)');
      }
    }

    if (config.retryAttempts !== undefined) {
      if (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0) {
        errors.push('retryAttempts must be a non-negative number');
      }
      if (config.retryAttempts > 10) {
        errors.push('retryAttempts should not exceed 10 for reasonable performance');
      }
    }

    if (config.retryDelayMs !== undefined) {
      if (typeof config.retryDelayMs !== 'number' || config.retryDelayMs < 0) {
        errors.push('retryDelayMs must be a non-negative number');
      }
    }

    if (config.maxWaitTimeMs !== undefined) {
      if (typeof config.maxWaitTimeMs !== 'number' || config.maxWaitTimeMs <= 0) {
        errors.push('maxWaitTimeMs must be a positive number');
      }
    }

    if (config.targetPort !== undefined) {
      if (typeof config.targetPort !== 'number' || config.targetPort <= 0 || config.targetPort > 65535) {
        errors.push('targetPort must be a valid port number (1-65535)');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a summary of health check results for logging and monitoring
   */
  public summarizeResults(result: HealthCheckResult): {
    summary: string;
    metrics: Record<string, number>;
    issues: string[];
  } {
    const metrics = {
      totalEndpoints: result.endpoints.length,
      healthyEndpoints: result.endpoints.filter(e => e.status === 'healthy').length,
      unhealthyEndpoints: result.endpoints.filter(e => e.status === 'unhealthy').length,
      averageResponseTime: result.endpoints.length > 0
        ? Math.round(result.totalResponseTime / result.endpoints.filter(e => e.responseTime && e.responseTime > 0).length) || 0
        : 0,
      totalResponseTime: result.totalResponseTime
    };

    const issues: string[] = [];
    result.endpoints.forEach(endpoint => {
      if (endpoint.status === 'unhealthy' && endpoint.error) {
        issues.push(`Port ${endpoint.port}: ${endpoint.error}`);
      }
    });

    const summary = `Health check ${result.overallStatus}: ${metrics.healthyEndpoints}/${metrics.totalEndpoints} endpoints healthy` +
      (metrics.averageResponseTime > 0 ? ` (avg ${metrics.averageResponseTime}ms)` : '');

    return { summary, metrics, issues };
  }
}

// Export singleton instance
export const healthCheckerService = new HealthCheckerService();