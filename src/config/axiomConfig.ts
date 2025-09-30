import Joi from 'joi';

/**
 * Axiom configuration interface
 */
export interface AxiomConfig {
  enabled: boolean;
  dataset: string;
  token: string;
  orgId?: string;
  flushInterval?: number;
  maxBatchSize?: number;
}

/**
 * Axiom configuration validation schema
 */
const axiomConfigSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  dataset: Joi.string().allow('').when('enabled', {
    is: true,
    then: Joi.string().required().min(1),
    otherwise: Joi.optional()
  }),
  token: Joi.string().allow('').when('enabled', {
    is: true,
    then: Joi.string().required().min(1),
    otherwise: Joi.optional()
  }),
  orgId: Joi.string().optional(),
  flushInterval: Joi.number().min(1000).max(60000).default(5000),
  maxBatchSize: Joi.number().min(1).max(1000).default(100)
});

/**
 * Load and validate Axiom configuration
 */
export const loadAxiomConfig = (): AxiomConfig => {
  const dataset = (process.env.AXIOM_DATASET || '').trim();
  const token = (process.env.AXIOM_TOKEN || '').trim();
  
  const rawConfig = {
    enabled: !!(dataset && token),
    dataset,
    token,
    orgId: process.env.AXIOM_ORG_ID,
    flushInterval: process.env.AXIOM_FLUSH_INTERVAL ? 
      parseInt(process.env.AXIOM_FLUSH_INTERVAL, 10) : undefined,
    maxBatchSize: process.env.AXIOM_MAX_BATCH_SIZE ? 
      parseInt(process.env.AXIOM_MAX_BATCH_SIZE, 10) : undefined
  };

  const { error, value } = axiomConfigSchema.validate(rawConfig, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw new Error(`Axiom configuration validation failed: ${error.message}`);
  }

  return value as AxiomConfig;
};

/**
 * Get Axiom configuration status
 */
export const getAxiomStatus = (): { enabled: boolean; configured: boolean; error?: string } => {
  try {
    const config = loadAxiomConfig();
    return {
      enabled: config.enabled,
      configured: !!(config.dataset && config.token)
    };
  } catch (error) {
    return {
      enabled: false,
      configured: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};