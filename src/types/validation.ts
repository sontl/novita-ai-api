import Joi from 'joi';
import { CreateInstanceRequest } from './api';

// Validation schemas for API requests

export const createInstanceSchema = Joi.object<CreateInstanceRequest>({
  name: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9-_]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Name must contain only alphanumeric characters, hyphens, and underscores',
      'string.min': 'Name must be at least 1 character long',
      'string.max': 'Name must be at most 100 characters long'
    }),
  
  productName: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.min': 'Product name is required',
      'string.max': 'Product name must be at most 200 characters long'
    }),
  
  templateId: Joi.string()
    .min(1)
    .required()
    .messages({
      'string.min': 'Template ID is required'
    }),
  
  gpuNum: Joi.number()
    .integer()
    .min(1)
    .max(8)
    .default(1)
    .messages({
      'number.min': 'GPU number must be at least 1',
      'number.max': 'GPU number must be at most 8',
      'number.integer': 'GPU number must be an integer'
    }),
  
  rootfsSize: Joi.number()
    .integer()
    .min(20)
    .max(1000)
    .default(60)
    .messages({
      'number.min': 'Root filesystem size must be at least 20GB',
      'number.max': 'Root filesystem size must be at most 1000GB',
      'number.integer': 'Root filesystem size must be an integer'
    }),
  
  region: Joi.string()
    .valid('CN-HK-01', 'US-WEST-01', 'EU-WEST-01')
    .default('CN-HK-01')
    .messages({
      'any.only': 'Region must be one of: CN-HK-01, US-WEST-01, EU-WEST-01'
    }),
  
  webhookUrl: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .messages({
      'string.uri': 'Webhook URL must be a valid HTTP or HTTPS URL'
    })
});

// Instance ID validation for path parameters
export const instanceIdSchema = Joi.string()
  .pattern(/^[a-zA-Z0-9-_]+$/)
  .required()
  .messages({
    'string.pattern.base': 'Instance ID must contain only alphanumeric characters, hyphens, and underscores'
  });

// Query parameters validation for listing instances
export const listInstancesQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.min': 'Page must be at least 1',
      'number.integer': 'Page must be an integer'
    }),
  
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .messages({
      'number.min': 'Page size must be at least 1',
      'number.max': 'Page size must be at most 100',
      'number.integer': 'Page size must be an integer'
    }),
  
  status: Joi.string()
    .valid('creating', 'starting', 'running', 'failed', 'stopped')
    .optional()
    .messages({
      'any.only': 'Status must be one of: creating, starting, running, failed, stopped'
    })
});

// Environment variable validation
export const configSchema = Joi.object({
  NOVITA_API_KEY: Joi.string()
    .required()
    .messages({
      'any.required': 'NOVITA_API_KEY environment variable is required'
    }),
  
  PORT: Joi.number()
    .integer()
    .min(1)
    .max(65535)
    .default(3000)
    .messages({
      'number.min': 'PORT must be at least 1',
      'number.max': 'PORT must be at most 65535',
      'number.integer': 'PORT must be an integer'
    }),
  
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  
  WEBHOOK_SECRET: Joi.string()
    .optional(),
  
  DEFAULT_WEBHOOK_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .messages({
      'string.uri': 'DEFAULT_WEBHOOK_URL must be a valid HTTP or HTTPS URL'
    })
});

// Validation helper functions
export interface ValidationResult<T> {
  value: T;
  error?: {
    message: string;
    details: Array<{
      field: string;
      message: string;
      value?: any;
    }>;
  };
}

export function validateCreateInstance(data: unknown): ValidationResult<CreateInstanceRequest> {
  const { error, value } = createInstanceSchema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
  
  if (error) {
    return {
      value: value as CreateInstanceRequest,
      error: {
        message: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }))
      }
    };
  }
  
  return { value: value as CreateInstanceRequest };
}

export function validateInstanceId(id: unknown): ValidationResult<string> {
  const { error, value } = instanceIdSchema.validate(id);
  
  if (error) {
    return {
      value: value as string,
      error: {
        message: 'Invalid instance ID',
        details: [{
          field: 'instanceId',
          message: error.message,
          value: id
        }]
      }
    };
  }
  
  return { value: value as string };
}

export function validateConfig(config: unknown): ValidationResult<any> {
  const { error, value } = configSchema.validate(config, { 
    abortEarly: false,
    stripUnknown: true,
    allowUnknown: true
  });
  
  if (error) {
    return {
      value: value,
      error: {
        message: 'Configuration validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }))
      }
    };
  }
  
  return { value };
}