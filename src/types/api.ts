// Novita.ai API response types and interfaces

export interface NovitaApiError {
  code: string;
  message: string;
  details?: any;
}

// API Request/Response interfaces for our service
export interface CreateInstanceRequest {
  name: string;
  productName: string;
  templateId: string | number; // Support both string and number for template IDs
  gpuNum?: number;
  rootfsSize?: number;
  region?: string;
  webhookUrl?: string;
}

export interface CreateInstanceResponse {
  instanceId: string;
  status: 'creating' | 'starting' | 'running' | 'failed';
  message: string;
  estimatedReadyTime?: string;
}

export interface StartInstanceRequest {
  instanceName?: string; // For name-based starting
  healthCheckConfig?: HealthCheckConfig;
  targetPort?: number;
  webhookUrl?: string;
}

export interface StartInstanceResponse {
  instanceId: string;
  novitaInstanceId: string;
  status: InstanceStatus;
  message: string;
  operationId: string;
  estimatedReadyTime?: string;
}

export interface StopInstanceRequest {
  instanceName?: string; // For name-based stopping
  webhookUrl?: string;
}

export interface StopInstanceResponse {
  instanceId: string;
  novitaInstanceId: string;
  status: InstanceStatus;
  message: string;
  operationId: string;
}

export interface UpdateLastUsedTimeRequest {
  lastUsedAt?: string; // ISO string, defaults to current time if not provided
}

export interface UpdateLastUsedTimeResponse {
  instanceId: string;
  lastUsedAt: string;
  message: string;
}

export interface DeleteInstanceRequest {
  instanceName?: string; // For name-based deletion
  webhookUrl?: string;
}

export interface DeleteInstanceResponse {
  instanceId: string;
  novitaInstanceId?: string;
  status: 'deleted';
  message: string;
  operationId: string;
}

export interface InstanceDetails {
  id: string;
  name: string;
  status: string;
  gpuNum: number;
  region: string;
  portMappings: Array<{
    port: number;
    endpoint: string;
    type: string;
  }>;
  connectionDetails?: {
    ssh?: string;
    jupyter?: string;
    webTerminal?: string;
  };
  createdAt: string;
  readyAt?: string;
  lastUsedAt?: string;
  startedAt?: string;
  stoppedAt?: string;
  lastStartedAt?: string;
  lastStoppedAt?: string;
}

// Enhanced instance details with comprehensive data
export interface EnhancedInstanceDetails extends InstanceDetails {
  // Source indicators
  source: 'local' | 'novita' | 'merged';
  dataConsistency: 'consistent' | 'local-newer' | 'novita-newer' | 'conflicted';

  // Additional Novita.ai fields
  clusterId?: string;
  clusterName?: string;
  productName?: string;
  cpuNum?: string;
  memory?: string;
  imageUrl?: string;
  imageAuthId?: string;
  command?: string;
  volumeMounts?: Array<{
    type: string;
    size: string;
    id: string;
    mountPath: string;
  }>;
  statusError?: {
    state: string;
    message: string;
  };
  envs?: Array<{
    key: string;
    value: string;
  }>;
  kind?: string;
  endTime?: string;
  spotStatus?: string;
  spotReclaimTime?: string;

  // Metadata
  lastSyncedAt?: string;
  syncErrors?: string[];
}

export interface ListInstancesResponse {
  instances: InstanceDetails[];
  total: number;
}

// Enhanced response for comprehensive listing
export interface EnhancedListInstancesResponse {
  instances: EnhancedInstanceDetails[];
  total: number;
  sources: {
    local: number;
    novita: number;
    merged: number;
  };
  performance?: {
    totalRequestTime: number;
    novitaApiTime: number;
    localDataTime: number;
    mergeProcessingTime: number;
    cacheHitRatio: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    novitaApi: 'up' | 'down';
    jobQueue: 'up' | 'down';
    cache: 'up' | 'down';
    migrationService: 'up' | 'down';
    failedMigrationService: 'up' | 'down';
    redis: 'up' | 'down';
  };
  uptime: number;
}

export interface EnhancedHealthCheckResponse extends HealthCheckResponse {
  performance: {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    jobProcessingRate: number;
  };
  system: {
    memory: {
      usedMB: number;
      totalMB: number;
      externalMB: number;
      rss: number;
    };
    cpu: {
      usage: number;
      loadAverage: number[];
    };
  };
  dependencies: Record<string, any>;
  migrationService: {
    enabled: boolean;
    lastExecution?: string;
    nextExecution?: string;
    status: 'healthy' | 'unhealthy' | 'disabled';
    recentErrors: number;
    totalExecutions: number;
    uptime: number;
  };
  failedMigrationService: {
    enabled: boolean;
    lastExecution?: string;
    nextExecution?: string;
    status: 'healthy' | 'unhealthy' | 'disabled';
    recentErrors: number;
    totalExecutions: number;
    uptime: number;
  };
  redis: {
    available: boolean;
    healthy: boolean;
    cacheManager?: any;
    cacheManagerConfig?: any;
    redisHealthStatus?: any;
  };
  sync?: {
    available: boolean;
    lastSync: string | null;
    isLocked: boolean;
    cacheSize: number;
    error?: string;
  };
  logging?: {
    axiom: {
      enabled: boolean;
      configured: boolean;
      error?: string;
    };
  };
}

export interface NovitaApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: NovitaApiError;
  requestId?: string;
}

// Product-related types
export interface Product {
  id: string;
  name: string;
  region: string;
  spotPrice: number;
  onDemandPrice: number;
  gpuType: string;
  gpuMemory: number;
  availability: 'available' | 'limited' | 'unavailable';
}

export interface ProductsResponse {
  products: Product[];
  total: number;
}

// Template-related types
export interface Port {
  port: number;
  type: 'tcp' | 'udp' | 'http' | 'https';
  name?: string;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface Template {
  id: string;
  name: string;
  imageUrl: string;
  imageAuth?: string;
  ports: Port[];
  envs: EnvVar[];
  description?: string;
}

// Novita.ai API Instance-related types (for internal API calls)
export interface NovitaCreateInstanceRequest {
  name: string;
  productId: string;
  gpuNum: number;
  rootfsSize: number;
  imageUrl: string;
  imageAuth?: string;
  imageAuthId?: string;
  ports?: string;
  envs?: EnvVar[];
  tools?: Tool[];
  command?: string;
  clusterId?: string;
  networkStorages?: NetworkStorage[];
  networkId?: string;
  kind: 'gpu' | 'cpu';
  month?: number;
  billingMode?: 'onDemand' | 'monthly' | 'spot';
}

// Novita.ai raw API response structure for instances
export interface NovitaInstanceResponse {
  id: string;
  name: string;
  clusterId: string;
  clusterName: string;
  status: string;
  imageUrl: string;
  imageAuthId?: string;
  command?: string;
  cpuNum: string;
  memory: string;
  gpuNum: string;
  portMappings: Array<{
    port: number;
    endpoint: string;
    type: string;
  }>;
  productId: string;
  productName: string;
  rootfsSize: number;
  volumeMounts?: Array<{
    type: string;
    size: string;
    id: string;
    mountPath: string;
  }>;
  statusError?: {
    state: string;
    message: string;
  };
  envs: Array<{
    key: string;
    value: string;
  }>;
  kind: string;
  billingMode: string;
  endTime?: string;
  spotStatus?: string;
  spotReclaimTime?: string;
  createdAt: string;
  // Additional timestamp fields from Novita API
  lastStartedAt?: string;
  lastStoppedAt?: string;
  startedAt?: string;
  stoppedAt?: string;
  gpuIds?: number[];
  templateId?: string | number;
}

export interface Tool {
  name: string;
  port: string;
  type: string;
}

export interface NetworkStorage {
  Id: string;
  mountPoint: string;
}

export interface InstanceResponse {
  id: string;
  name: string;
  status: InstanceStatus;
  productId: string;
  region: string;
  gpuNum: number;
  rootfsSize: number;
  billingMode: string;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  connectionInfo?: {
    ssh?: string;
    jupyter?: string;
    webTerminal?: string;
  };
  portMappings?: Array<{
    port: number;
    endpoint: string;
    type: string;
  }>;
  // Extended Novita.ai API fields
  clusterId?: string;
  clusterName?: string;
  productName?: string;
  cpuNum?: string;
  memory?: string;
  imageUrl?: string;
  imageAuthId?: string;
  command?: string;
  volumeMounts?: Array<{
    type: string;
    size: string;
    id: string;
    mountPath: string;
  }>;
  statusError?: {
    state: string;
    message: string;
  };
  envs?: Array<{
    key: string;
    value: string;
  }>;
  kind?: string;
  endTime?: string;
  spotStatus?: string;
  spotReclaimTime?: string;
  gpuIds?: number[];
  templateId?: string | number;
}

export enum InstanceStatus {
  CREATING = 'creating',
  CREATED = 'created',
  STARTING = 'starting',
  RUNNING = 'running',
  HEALTH_CHECKING = 'health_checking',
  READY = 'ready',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  FAILED = 'failed',
  TERMINATED = 'terminated',
  EXITED = 'exited',
  MIGRATING = 'migrating'
}

export interface NovitaListInstancesResponse {
  instances: InstanceResponse[];
  total: number;
  page: number;
  pageSize: number;
}

// Health Check Types
export interface HealthCheckConfig {
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  maxWaitTimeMs: number;
  targetPort?: number; // If specified, only check this port
}

export interface EndpointHealthCheck {
  port: number;
  endpoint: string;
  type: string;
  status: 'pending' | 'healthy' | 'unhealthy';
  lastChecked?: Date;
  error?: string;
  responseTime?: number;
}

export interface HealthCheckResult {
  overallStatus: 'healthy' | 'unhealthy' | 'partial';
  endpoints: EndpointHealthCheck[];
  checkedAt: Date;
  totalResponseTime: number;
}

// Internal Instance State Model
export interface InstanceState {
  id: string;
  name: string;
  status: InstanceStatus;
  novitaInstanceId?: string;
  productId: string;
  templateId: string | number;
  configuration: {
    gpuNum: number;
    rootfsSize: number;
    region: string;
    imageUrl: string;
    imageAuth?: string;
    ports: Port[];
    envs: EnvVar[];
  };
  timestamps: {
    created: Date;
    started?: Date;
    ready?: Date;
    failed?: Date;
    stopping?: Date;
    stopped?: Date;
    terminated?: Date;
    lastUsed?: Date;
  };
  webhookUrl?: string;
  lastError?: string;
  healthCheck?: {
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    config: HealthCheckConfig;
    results: HealthCheckResult[];
    startedAt?: Date;
    completedAt?: Date;
  };
}

export interface StartupOperation {
  operationId: string;
  instanceId: string;
  novitaInstanceId: string;
  status: 'initiated' | 'monitoring' | 'health_checking' | 'completed' | 'failed';
  startedAt: Date;
  phases: {
    startRequested: Date;
    instanceStarting?: Date;
    instanceRunning?: Date;
    healthCheckStarted?: Date;
    healthCheckCompleted?: Date;
    ready?: Date;
  };
  error?: string;
}

// Job Queue Models
export enum JobType {
  CREATE_INSTANCE = 'create_instance',
  MONITOR_INSTANCE = 'monitor_instance',
  SEND_WEBHOOK = 'send_webhook'
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Job {
  id: string;
  type: JobType;
  payload: any;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface StartInstanceJobPayload {
  instanceId: string;
  novitaInstanceId: string;
  webhookUrl?: string;
  healthCheckConfig: HealthCheckConfig;
  targetPort?: number;
  startTime: Date;
  maxWaitTime: number;
}

// Webhook payload types
export interface WebhookPayload {
  instanceId: string;
  status: InstanceStatus;
  timestamp: string;
  data?: InstanceResponse;
  error?: string;
}

// Error Response Models
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
  };
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationErrorResponse extends ErrorResponse {
  error: ErrorResponse['error'] & {
    validationErrors: ValidationErrorDetail[];
  };
}

// API client error types
export class NovitaApiClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'NovitaApiClientError';
  }
}

export class RateLimitError extends NovitaApiClientError {
  constructor(
    message: string = 'Rate limit exceeded',
    public retryAfter?: number
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class CircuitBreakerError extends NovitaApiClientError {
  constructor(message: string = 'Circuit breaker is open') {
    super(message, 503, 'CIRCUIT_BREAKER_OPEN');
    this.name = 'CircuitBreakerError';
  }
}

export class TimeoutError extends NovitaApiClientError {
  constructor(message: string = 'Request timeout') {
    super(message, 408, 'REQUEST_TIMEOUT');
    this.name = 'TimeoutError';
  }
}

// Region configuration types
export interface RegionConfig {
  id: string;
  name: string;
  priority: number;
}

// Registry authentication types
export interface RegistryAuth {
  id: string;
  name: string;
  username: string;
  password: string;
}

export interface RegistryAuthsResponse {
  data: RegistryAuth[];
}

// Migration configuration types
export interface MigrationConfig {
  enabled: boolean;
  scheduleIntervalMs: number;
  jobTimeoutMs: number;
  maxConcurrentMigrations: number;
  dryRunMode: boolean;
  retryFailedMigrations: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// Migration API types
export interface MigrationRequest {
  instanceId: string;
}

export interface MigrationResponse {
  success: boolean;
  instanceId: string;
  message?: string;
  error?: string;
  newInstanceId?: string;
  migrationTime?: string;
}

// Job-related types for Novita API
export interface NovitaJob {
  Id: string;
  user: string;
  type: string;
  envs: string[];
  maxRetry: number;
  timeout: string;
  state: {
    state: 'success' | 'fail' | 'running' | 'pending';
    error: string;
    errorMessage: string;
  };
  logAddress: string;
  createdAt: string;
  creator: string;
  uuid: string;
  deletedTime: string;
  updateAt: string;
  instanceId: string;
}

export interface NovitaJobsResponse {
  jobs: NovitaJob[];
  total: number;
}

export interface JobQueryParams {
  pageNum?: number;
  pageSize?: number;
  jobId?: string;
  type?: string;
  state?: string;
  startTime?: number;
  endTime?: number;
}