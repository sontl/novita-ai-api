import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('metrics');

export interface RequestMetrics {
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  statusCodes: Record<number, number>;
  lastRequest?: Date;
}

export interface JobMetrics {
  processed: number;
  failed: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
  minProcessingTime: number;
  maxProcessingTime: number;
  queueSize: number;
  lastProcessed?: Date;
}

export interface SystemMetrics {
  memory: NodeJS.MemoryUsage;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  uptime: number;
  timestamp: Date;
}

export interface ApplicationMetrics {
  requests: {
    total: RequestMetrics;
    byEndpoint: Record<string, RequestMetrics>;
    byMethod: Record<string, RequestMetrics>;
  };
  jobs: {
    total: JobMetrics;
    byType: Record<string, JobMetrics>;
  };
  system: SystemMetrics;
  cache: {
    hits: number;
    misses: number;
    hitRatio: number;
    totalSize: number;
  };
}

class MetricsService {
  private requestMetrics: Map<string, RequestMetrics> = new Map();
  private jobMetrics: Map<string, JobMetrics> = new Map();
  private globalRequestMetrics: RequestMetrics = this.createEmptyRequestMetrics();
  private globalJobMetrics: JobMetrics = this.createEmptyJobMetrics();
  private cacheMetrics = {
    hits: 0,
    misses: 0,
    totalSize: 0
  };

  private cpuUsage = process.cpuUsage();
  private lastCpuCheck = Date.now();

  constructor() {
    // Initialize periodic system metrics collection
    this.startSystemMetricsCollection();
  }

  /**
   * Record a request metric
   */
  recordRequest(
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number
  ): void {
    const endpointKey = `${method} ${endpoint}`;
    
    // Update global metrics
    this.updateRequestMetrics(this.globalRequestMetrics, statusCode, duration);
    
    // Update endpoint-specific metrics
    if (!this.requestMetrics.has(endpointKey)) {
      this.requestMetrics.set(endpointKey, this.createEmptyRequestMetrics());
    }
    const endpointMetrics = this.requestMetrics.get(endpointKey)!;
    this.updateRequestMetrics(endpointMetrics, statusCode, duration);

    // Update method-specific metrics
    const methodKey = `method:${method}`;
    if (!this.requestMetrics.has(methodKey)) {
      this.requestMetrics.set(methodKey, this.createEmptyRequestMetrics());
    }
    const methodMetrics = this.requestMetrics.get(methodKey)!;
    this.updateRequestMetrics(methodMetrics, statusCode, duration);

    logger.debug('Request metric recorded', {
      method,
      endpoint,
      statusCode,
      duration,
      category: 'metrics'
    });
  }

  /**
   * Record a job processing metric
   */
  recordJob(
    jobType: string,
    processingTime: number,
    success: boolean,
    queueSize: number
  ): void {
    // Update global job metrics
    this.updateJobMetrics(this.globalJobMetrics, processingTime, success, queueSize);

    // Update job type-specific metrics
    if (!this.jobMetrics.has(jobType)) {
      this.jobMetrics.set(jobType, this.createEmptyJobMetrics());
    }
    const typeMetrics = this.jobMetrics.get(jobType)!;
    this.updateJobMetrics(typeMetrics, processingTime, success, queueSize);

    logger.debug('Job metric recorded', {
      jobType,
      processingTime,
      success,
      queueSize,
      category: 'metrics'
    });
  }

  /**
   * Record cache metrics
   */
  recordCacheHit(): void {
    this.cacheMetrics.hits++;
  }

  recordCacheMiss(): void {
    this.cacheMetrics.misses++;
  }

  updateCacheSize(size: number): void {
    this.cacheMetrics.totalSize = size;
  }

  /**
   * Get comprehensive application metrics
   */
  getMetrics(): ApplicationMetrics {
    const systemMetrics = this.getSystemMetrics();
    
    return {
      requests: {
        total: { ...this.globalRequestMetrics },
        byEndpoint: this.getEndpointMetrics(),
        byMethod: this.getMethodMetrics()
      },
      jobs: {
        total: { ...this.globalJobMetrics },
        byType: this.getJobTypeMetrics()
      },
      system: systemMetrics,
      cache: {
        ...this.cacheMetrics,
        hitRatio: this.calculateHitRatio()
      }
    };
  }

  /**
   * Get system metrics (memory, CPU, uptime)
   */
  getSystemMetrics(): SystemMetrics {
    const memory = process.memoryUsage();
    const uptime = process.uptime();
    const loadAverage = process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0];
    
    // Calculate CPU usage
    const currentCpuUsage = process.cpuUsage(this.cpuUsage);
    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastCpuCheck;
    
    // CPU usage as percentage
    const cpuPercent = (currentCpuUsage.user + currentCpuUsage.system) / (timeDiff * 1000);
    
    // Update for next calculation
    this.cpuUsage = process.cpuUsage();
    this.lastCpuCheck = currentTime;

    return {
      memory,
      cpu: {
        usage: Math.min(cpuPercent * 100, 100), // Cap at 100%
        loadAverage
      },
      uptime,
      timestamp: new Date()
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.requestMetrics.clear();
    this.jobMetrics.clear();
    this.globalRequestMetrics = this.createEmptyRequestMetrics();
    this.globalJobMetrics = this.createEmptyJobMetrics();
    this.cacheMetrics = {
      hits: 0,
      misses: 0,
      totalSize: 0
    };

    logger.info('Metrics reset', { category: 'metrics' });
  }

  /**
   * Get metrics summary for health checks
   */
  getHealthMetrics(): {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    jobProcessingRate: number;
    memoryUsageMB: number;
    cpuUsagePercent: number;
  } {
    const systemMetrics = this.getSystemMetrics();
    const totalRequests = this.globalRequestMetrics.count;
    const errorRequests = Object.entries(this.globalRequestMetrics.statusCodes)
      .filter(([code]) => parseInt(code) >= 400)
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      requestsPerMinute: this.calculateRequestsPerMinute(),
      averageResponseTime: this.globalRequestMetrics.averageDuration,
      errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0,
      jobProcessingRate: this.calculateJobProcessingRate(),
      memoryUsageMB: Math.round(systemMetrics.memory.heapUsed / 1024 / 1024),
      cpuUsagePercent: systemMetrics.cpu.usage
    };
  }

  private createEmptyRequestMetrics(): RequestMetrics {
    return {
      count: 0,
      totalDuration: 0,
      averageDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      statusCodes: {}
    };
  }

  private createEmptyJobMetrics(): JobMetrics {
    return {
      processed: 0,
      failed: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      minProcessingTime: Infinity,
      maxProcessingTime: 0,
      queueSize: 0
    };
  }

  private updateRequestMetrics(
    metrics: RequestMetrics,
    statusCode: number,
    duration: number
  ): void {
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.averageDuration = metrics.totalDuration / metrics.count;
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.statusCodes[statusCode] = (metrics.statusCodes[statusCode] || 0) + 1;
    metrics.lastRequest = new Date();
  }

  private updateJobMetrics(
    metrics: JobMetrics,
    processingTime: number,
    success: boolean,
    queueSize: number
  ): void {
    metrics.processed++;
    if (!success) {
      metrics.failed++;
    }
    metrics.totalProcessingTime += processingTime;
    metrics.averageProcessingTime = metrics.totalProcessingTime / metrics.processed;
    metrics.minProcessingTime = Math.min(metrics.minProcessingTime, processingTime);
    metrics.maxProcessingTime = Math.max(metrics.maxProcessingTime, processingTime);
    metrics.queueSize = queueSize;
    metrics.lastProcessed = new Date();
  }

  private getEndpointMetrics(): Record<string, RequestMetrics> {
    const result: Record<string, RequestMetrics> = {};
    for (const [key, metrics] of this.requestMetrics.entries()) {
      if (!key.startsWith('method:')) {
        result[key] = { ...metrics };
      }
    }
    return result;
  }

  private getMethodMetrics(): Record<string, RequestMetrics> {
    const result: Record<string, RequestMetrics> = {};
    for (const [key, metrics] of this.requestMetrics.entries()) {
      if (key.startsWith('method:')) {
        const method = key.replace('method:', '');
        result[method] = { ...metrics };
      }
    }
    return result;
  }

  private getJobTypeMetrics(): Record<string, JobMetrics> {
    const result: Record<string, JobMetrics> = {};
    for (const [key, metrics] of this.jobMetrics.entries()) {
      result[key] = { ...metrics };
    }
    return result;
  }

  private calculateHitRatio(): number {
    const total = this.cacheMetrics.hits + this.cacheMetrics.misses;
    return total > 0 ? (this.cacheMetrics.hits / total) * 100 : 0;
  }

  private calculateRequestsPerMinute(): number {
    if (!this.globalRequestMetrics.lastRequest) {
      return 0;
    }
    
    const now = new Date();
    const timeDiff = now.getTime() - this.globalRequestMetrics.lastRequest.getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff > 0 ? this.globalRequestMetrics.count / minutesDiff : 0;
  }

  private calculateJobProcessingRate(): number {
    if (!this.globalJobMetrics.lastProcessed) {
      return 0;
    }
    
    const now = new Date();
    const timeDiff = now.getTime() - this.globalJobMetrics.lastProcessed.getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff > 0 ? this.globalJobMetrics.processed / minutesDiff : 0;
  }

  private systemMetricsInterval?: NodeJS.Timeout | undefined;

  private startSystemMetricsCollection(): void {
    // Collect system metrics every 30 seconds
    this.systemMetricsInterval = setInterval(() => {
      const metrics = this.getSystemMetrics();
      logger.debug('System metrics collected', {
        memoryMB: Math.round(metrics.memory.heapUsed / 1024 / 1024),
        cpuUsage: metrics.cpu.usage,
        uptime: metrics.uptime,
        category: 'system-metrics'
      });
    }, 30000);
  }

  /**
   * Stop system metrics collection (for testing)
   */
  stopSystemMetricsCollection(): void {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      delete this.systemMetricsInterval;
    }
  }
}

// Export singleton instance
export const metricsService = new MetricsService();