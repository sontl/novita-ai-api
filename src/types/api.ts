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
  templateId: string;
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
}

export interface ListInstancesResponse {
  instances: InstanceDetails[];
  total: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    novitaApi: 'up' | 'down';
    jobQueue: 'up' | 'down';
    cache: 'up' | 'down';
  };
  uptime: number;
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
  name: string;
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
  templateId: string;
  gpuNum: number;
  rootfsSize: number;
  region: string;
  billingMode: 'spot' | 'on_demand';
  imageUrl: string;
  imageAuth?: string;
  ports: Port[];
  envs: EnvVar[];
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
}

export enum InstanceStatus {
  CREATING = 'creating',
  CREATED = 'created',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  FAILED = 'failed',
  TERMINATED = 'terminated'
}

export interface NovitaListInstancesResponse {
  instances: InstanceResponse[];
  total: number;
  page: number;
  pageSize: number;
}

// Internal Instance State Model
export interface InstanceState {
  id: string;
  name: string;
  status: InstanceStatus;
  novitaInstanceId?: string;
  productId: string;
  templateId: string;
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
  };
  webhookUrl?: string;
  lastError?: string;
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