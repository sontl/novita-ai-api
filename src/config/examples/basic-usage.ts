/**
 * Basic Configuration Usage Examples
 * 
 * This file demonstrates how to use the configuration management system
 * in different scenarios.
 */

import { 
  loadConfig, 
  getConfig, 
  validateEnvironment, 
  getConfigSummary,
  ConfigValidationError 
} from '../config';

/**
 * Example 1: Basic configuration loading
 */
export function basicConfigurationExample(): void {
  try {
    // Load configuration from environment variables
    const config = loadConfig();
    
    console.log('Configuration loaded successfully!');
    console.log(`Server will run on port: ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Log level: ${config.logLevel}`);
    
    // Access nested configuration
    console.log(`Novita API URL: ${config.novita.baseUrl}`);
    console.log(`Default region: ${config.defaults.region}`);
    
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error('Configuration validation failed:', error.message);
      console.error('Details:', error.details);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

/**
 * Example 2: Loading configuration from a specific file
 */
export function customConfigFileExample(): void {
  try {
    // Load configuration from a specific .env file
    const config = loadConfig('.env.production');
    
    console.log('Production configuration loaded');
    console.log(`Running in ${config.nodeEnv} mode`);
    
  } catch (error) {
    console.error('Failed to load production config:', error);
  }
}

/**
 * Example 3: Validating environment before loading
 */
export function validateBeforeLoadingExample(): void {
  // Validate current environment
  const validation = validateEnvironment();
  
  if (validation.isValid) {
    console.log('Environment validation passed');
    const config = loadConfig();
    console.log('Configuration loaded successfully');
  } else {
    console.error('Environment validation failed:');
    validation.errors?.forEach(error => {
      console.error(`  - ${error}`);
    });
  }
}

/**
 * Example 4: Validating custom environment variables
 */
export function validateCustomEnvironmentExample(): void {
  const customEnv = {
    NODE_ENV: 'production',
    PORT: '8080',
    NOVITA_API_KEY: 'nv-1234567890abcdef',
    LOG_LEVEL: 'info',
    WEBHOOK_URL: 'https://api.example.com/webhook',
    WEBHOOK_SECRET: 'my-secret-key',
  };
  
  const validation = validateEnvironment(customEnv);
  
  if (validation.isValid) {
    console.log('Custom environment is valid');
  } else {
    console.error('Custom environment validation failed:');
    validation.errors?.forEach(error => {
      console.error(`  - ${error}`);
    });
  }
}

/**
 * Example 5: Getting configuration summary for logging
 */
export function configurationSummaryExample(): void {
  try {
    const config = loadConfig();
    const summary = getConfigSummary();
    
    console.log('Configuration Summary:');
    console.log(JSON.stringify(summary, null, 2));
    
    // Note: Sensitive data like API keys are not included in the summary
    console.log('API key is configured:', summary.hasApiKey);
    console.log('Webhook URL is configured:', summary.hasWebhookUrl);
    
  } catch (error) {
    console.error('Failed to get configuration summary:', error);
  }
}

/**
 * Example 6: Using configuration in a service
 */
export class ExampleService {
  private config = getConfig();
  
  constructor() {
    console.log(`Service initialized with region: ${this.config.defaults.region}`);
  }
  
  public async makeApiCall(): Promise<void> {
    const timeout = this.config.defaults.requestTimeout;
    const maxRetries = this.config.defaults.maxRetryAttempts;
    
    console.log(`Making API call with ${timeout}ms timeout and ${maxRetries} max retries`);
    
    // Simulate API call logic here
    // fetch(this.config.novita.baseUrl, { 
    //   timeout,
    //   headers: { 'Authorization': `Bearer ${this.config.novita.apiKey}` }
    // });
  }
  
  public isWebhookConfigured(): boolean {
    return !!this.config.webhook.url;
  }
}

/**
 * Example 7: Error handling patterns
 */
export function errorHandlingExample(): void {
  try {
    // This will fail if NOVITA_API_KEY is not set
    const config = loadConfig();
    console.log('Configuration loaded successfully');
    
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      // Handle configuration validation errors
      console.error('Configuration Error:');
      console.error(`Message: ${error.message}`);
      
      // Log specific validation issues
      error.details.forEach((detail, index) => {
        console.error(`${index + 1}. ${detail.message}`);
        console.error(`   Path: ${detail.path?.join('.')}`);
        console.error(`   Value: ${detail.context?.value}`);
      });
      
      // Provide helpful suggestions
      console.log('\nSuggestions:');
      console.log('1. Check your .env file exists and contains required variables');
      console.log('2. Ensure NOVITA_API_KEY is set and valid');
      console.log('3. Verify all URLs are properly formatted');
      
    } else {
      // Handle other types of errors
      console.error('Unexpected error loading configuration:', error);
    }
  }
}

/**
 * Example 8: Testing configuration
 */
export function testingConfigurationExample(): void {
  // Example of how to test with different configurations
  const testEnv = {
    NODE_ENV: 'test',
    NOVITA_API_KEY: 'test-key-123',
    PORT: '3001',
    LOG_LEVEL: 'debug',
    WEBHOOK_URL: 'http://localhost:3002/webhook',
  };
  
  const validation = validateEnvironment(testEnv);
  
  if (validation.isValid) {
    console.log('Test environment configuration is valid');
    
    // In actual tests, you would set process.env and call loadConfig()
    // process.env = { ...process.env, ...testEnv };
    // const config = loadConfig();
    
  } else {
    console.error('Test environment configuration is invalid');
  }
}

// Example usage
if (require.main === module) {
  console.log('=== Configuration Management Examples ===\n');
  
  console.log('1. Basic Configuration:');
  basicConfigurationExample();
  
  console.log('\n2. Environment Validation:');
  validateBeforeLoadingExample();
  
  console.log('\n3. Configuration Summary:');
  configurationSummaryExample();
  
  console.log('\n4. Error Handling:');
  errorHandlingExample();
}