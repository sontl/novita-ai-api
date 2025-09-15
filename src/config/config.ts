import dotenv from 'dotenv';
import Joi from 'joi';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

// Configuration schema for validation
const configSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number()
    .port()
    .default(3000),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  NOVITA_API_KEY: Joi.string()
    .required()
    .description('Novita.ai API key is required'),
  NOVITA_API_BASE_URL: Joi.string()
    .uri()
    .default('https://api.novita.ai'),
  WEBHOOK_URL: Joi.string()
    .uri()
    .optional()
    .description('Optional webhook URL for notifications'),
  WEBHOOK_SECRET: Joi.string()
    .optional()
    .description('Optional webhook signing secret'),
  DEFAULT_REGION: Joi.string()
    .default('CN-HK-01'),
  INSTANCE_POLL_INTERVAL: Joi.number()
    .integer()
    .min(10)
    .max(300)
    .default(30)
    .description('Instance status polling interval in seconds'),
  MAX_RETRY_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3),
  REQUEST_TIMEOUT: Joi.number()
    .integer()
    .min(5000)
    .max(60000)
    .default(30000)
    .description('HTTP request timeout in milliseconds'),
}).unknown();

// Validate environment variables
const { error, value: envVars } = configSchema.validate(process.env);

if (error) {
  logger.error('Configuration validation failed:', error.details);
  throw new Error(`Config validation error: ${error.message}`);
}

// Export validated configuration
export const config = {
  nodeEnv: envVars.NODE_ENV as string,
  port: envVars.PORT as number,
  logLevel: envVars.LOG_LEVEL as string,
  novita: {
    apiKey: envVars.NOVITA_API_KEY as string,
    baseUrl: envVars.NOVITA_API_BASE_URL as string,
  },
  webhook: {
    url: envVars.WEBHOOK_URL as string | undefined,
    secret: envVars.WEBHOOK_SECRET as string | undefined,
  },
  defaults: {
    region: envVars.DEFAULT_REGION as string,
    pollInterval: envVars.INSTANCE_POLL_INTERVAL as number,
    maxRetryAttempts: envVars.MAX_RETRY_ATTEMPTS as number,
    requestTimeout: envVars.REQUEST_TIMEOUT as number,
  },
} as const;