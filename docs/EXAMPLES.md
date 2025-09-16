rams=params
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to list instances: {e}")

    def wait_for_instance(self, instance_id: str, timeout: int = 600) -> Dict:
        """Wait for instance to reach running state."""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_instance_status(instance_id)
            
            if status['status'] == 'running':
                return status
            elif status['status'] == 'failed':
                error_msg = status.get('error', 'Unknown error')
                raise Exception(f"Instance failed to start: {error_msg}")
            
            # Wait 30 seconds before next check
            time.sleep(30)
        
        raise Exception(f"Instance startup timeout after {timeout} seconds")

    def health_check(self) -> Dict:
        """Check API health status."""
        try:
            response = self.session.get(f"{self.base_url}/health")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"Health check failed: {e}")

# Usage example
def main():
    client = NovitaInstanceClient()
    
    try:
        # Check API health
        health = client.health_check()
        print(f"API Status: {health['status']}")
        
        # Create instance
        print("Creating GPU instance...")
        create_result = client.create_instance({
            "name": "python-ml-job",
            "productName": "RTX 4090 24GB",
            "templateId": "tensorflow-jupyter",
            "gpuNum": 1,
            "rootfsSize": 80,
            "webhookUrl": "https://your-app.com/webhook"
        })
        
        print(f"Instance created: {create_result['instanceId']}")
        
        # Wait for instance to be ready
        print("Waiting for instance to be ready...")
        instance = client.wait_for_instance(create_result['instanceId'])
        
        print("Instance ready!")
        print(f"SSH: {instance['connectionDetails']['ssh']}")
        print(f"Jupyter: {instance['connectionDetails']['jupyter']}")
        
        # List all instances
        instances = client.list_instances()
        print(f"Total instances: {instances['total']}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
```

### Monitoring Instance Status

#### Polling Example

```javascript
// client-examples/nodejs/monitor-instances.js
const NovitaInstanceClient = require('./create-instance');

class InstanceMonitor {
  constructor(client) {
    this.client = client;
    this.monitoring = new Map();
  }

  startMonitoring(instanceId, callback) {
    if (this.monitoring.has(instanceId)) {
      return; // Already monitoring
    }

    const monitor = {
      intervalId: setInterval(async () => {
        try {
          const status = await this.client.getInstanceStatus(instanceId);
          callback(null, status);

          // Stop monitoring if instance is in final state
          if (['running', 'failed', 'stopped'].includes(status.status)) {
            this.stopMonitoring(instanceId);
          }
        } catch (error) {
          callback(error, null);
        }
      }, 30000), // Check every 30 seconds
      callback
    };

    this.monitoring.set(instanceId, monitor);
  }

  stopMonitoring(instanceId) {
    const monitor = this.monitoring.get(instanceId);
    if (monitor) {
      clearInterval(monitor.intervalId);
      this.monitoring.delete(instanceId);
    }
  }

  stopAll() {
    for (const instanceId of this.monitoring.keys()) {
      this.stopMonitoring(instanceId);
    }
  }
}

// Usage example
async function monitorExample() {
  const client = new NovitaInstanceClient();
  const monitor = new InstanceMonitor(client);

  // Create instance
  const result = await client.createInstance({
    name: 'monitored-instance',
    productName: 'RTX 4090 24GB',
    templateId: 'pytorch-jupyter'
  });

  console.log(`Monitoring instance: ${result.instanceId}`);

  // Start monitoring
  monitor.startMonitoring(result.instanceId, (error, status) => {
    if (error) {
      console.error('Monitoring error:', error.message);
      return;
    }

    console.log(`Instance ${status.id}: ${status.status}`);
    
    if (status.status === 'running') {
      console.log('Instance is ready!');
      console.log('Connection details:', status.connectionDetails);
    } else if (status.status === 'failed') {
      console.error('Instance failed to start');
    }
  });

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('Stopping monitoring...');
    monitor.stopAll();
    process.exit(0);
  });
}

if (require.main === module) {
  monitorExample().catch(console.error);
}
```

## Advanced Use Cases

### Batch Instance Creation

```javascript
// client-examples/nodejs/batch-creation.js
const NovitaInstanceClient = require('./create-instance');

class BatchInstanceManager {
  constructor(client, maxConcurrent = 3) {
    this.client = client;
    this.maxConcurrent = maxConcurrent;
  }

  async createBatch(instanceConfigs) {
    const results = [];
    const batches = this.chunkArray(instanceConfigs, this.maxConcurrent);

    for (const batch of batches) {
      const batchPromises = batch.map(async (config, index) => {
        try {
          console.log(`Creating instance ${config.name}...`);
          const result = await this.client.createInstance(config);
          console.log(`✓ Created ${config.name}: ${result.instanceId}`);
          return { success: true, config, result };
        } catch (error) {
          console.error(`✗ Failed to create ${config.name}: ${error.message}`);
          return { success: false, config, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Wait between batches to avoid rate limiting
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(5000);
      }
    }

    return results;
  }

  async waitForBatch(instanceIds, timeout = 900000) {
    const promises = instanceIds.map(id => 
      this.client.waitForInstance(id, timeout).catch(error => ({
        instanceId: id,
        error: error.message
      }))
    );

    return Promise.all(promises);
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage example
async function batchExample() {
  const client = new NovitaInstanceClient();
  const batchManager = new BatchInstanceManager(client);

  const instanceConfigs = [
    {
      name: 'training-job-1',
      productName: 'RTX 4090 24GB',
      templateId: 'pytorch-jupyter',
      gpuNum: 1
    },
    {
      name: 'training-job-2',
      productName: 'RTX 4090 24GB',
      templateId: 'tensorflow-jupyter',
      gpuNum: 2
    },
    {
      name: 'inference-job-1',
      productName: 'RTX 3080 12GB',
      templateId: 'pytorch-jupyter',
      gpuNum: 1
    }
  ];

  try {
    console.log('Creating batch of instances...');
    const results = await batchManager.createBatch(instanceConfigs);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\nBatch creation complete:`);
    console.log(`✓ Successful: ${successful.length}`);
    console.log(`✗ Failed: ${failed.length}`);

    if (successful.length > 0) {
      console.log('\nWaiting for instances to be ready...');
      const instanceIds = successful.map(r => r.result.instanceId);
      const readyResults = await batchManager.waitForBatch(instanceIds);
      
      readyResults.forEach(result => {
        if (result.error) {
          console.log(`✗ ${result.instanceId}: ${result.error}`);
        } else {
          console.log(`✓ ${result.id}: Ready`);
        }
      });
    }

  } catch (error) {
    console.error('Batch operation failed:', error.message);
  }
}

if (require.main === module) {
  batchExample();
}
```

### Webhook Handler Example

```javascript
// client-examples/nodejs/webhook-handler.js
const express = require('express');
const crypto = require('crypto');

class WebhookHandler {
  constructor(secret) {
    this.secret = secret;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Raw body parser for signature verification
    this.app.use('/webhook', express.raw({ type: 'application/json' }));
    this.app.use(express.json());
  }

  setupRoutes() {
    this.app.post('/webhook', (req, res) => {
      try {
        // Verify webhook signature
        if (this.secret && !this.verifySignature(req)) {
          return res.status(401).json({ error: 'Invalid signature' });
        }

        const payload = JSON.parse(req.body);
        this.handleWebhook(payload);
        
        res.status(200).json({ received: true });
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy' });
    });
  }

  verifySignature(req) {
    const signature = req.headers['x-signature'];
    if (!signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(req.body)
      .digest('hex');

    return signature === `sha256=${expectedSignature}`;
  }

  handleWebhook(payload) {
    console.log('Received webhook:', payload);

    switch (payload.event) {
      case 'instance.ready':
        this.handleInstanceReady(payload);
        break;
      case 'instance.failed':
        this.handleInstanceFailed(payload);
        break;
      default:
        console.log('Unknown webhook event:', payload.event);
    }
  }

  handleInstanceReady(payload) {
    console.log(`✓ Instance ${payload.instanceId} is ready!`);
    console.log('Connection details:', payload.instance.connectionDetails);
    
    // Add your custom logic here
    // e.g., start ML training job, notify users, update database
    this.notifyDownstreamSystems(payload);
  }

  handleInstanceFailed(payload) {
    console.error(`✗ Instance ${payload.instanceId} failed to start`);
    console.error('Error:', payload.error);
    
    // Add your error handling logic here
    // e.g., retry creation, alert administrators, update status
    this.handleFailure(payload);
  }

  notifyDownstreamSystems(payload) {
    // Example: Start ML training job
    console.log('Starting ML training job...');
    
    // Example: Update database
    console.log('Updating instance status in database...');
    
    // Example: Send notification
    console.log('Sending notification to user...');
  }

  handleFailure(payload) {
    // Example: Retry instance creation
    console.log('Scheduling retry for failed instance...');
    
    // Example: Alert administrators
    console.log('Sending alert to administrators...');
  }

  start(port = 8080) {
    this.app.listen(port, () => {
      console.log(`Webhook handler listening on port ${port}`);
    });
  }
}

// Usage example
const webhookHandler = new WebhookHandler(process.env.WEBHOOK_SECRET);
webhookHandler.start(8080);
```

### CI/CD Integration Example

```yaml
# .github/workflows/gpu-training.yml
name: GPU Model Training

on:
  push:
    branches: [main]
    paths: ['models/**', 'training/**']

jobs:
  train-model:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install axios
    
    - name: Create GPU Instance
      id: create-instance
      run: |
        node << 'EOF'
        const axios = require('axios');
        
        async function createInstance() {
          try {
            const response = await axios.post('${{ secrets.NOVITA_API_URL }}/api/instances', {
              name: 'ci-training-${{ github.run_id }}',
              productName: 'RTX 4090 24GB',
              templateId: 'pytorch-training',
              gpuNum: 2,
              rootfsSize: 200,
              webhookUrl: '${{ secrets.WEBHOOK_URL }}'
            });
            
            console.log(`::set-output name=instance-id::${response.data.instanceId}`);
            console.log('Instance created:', response.data.instanceId);
          } catch (error) {
            console.error('Failed to create instance:', error.response?.data || error.message);
            process.exit(1);
          }
        }
        
        createInstance();
        EOF
    
    - name: Wait for Instance
      run: |
        node << 'EOF'
        const axios = require('axios');
        
        async function waitForInstance() {
          const instanceId = '${{ steps.create-instance.outputs.instance-id }}';
          const timeout = 600000; // 10 minutes
          const startTime = Date.now();
          
          while (Date.now() - startTime < timeout) {
            try {
              const response = await axios.get(`${{ secrets.NOVITA_API_URL }}/api/instances/${instanceId}`);
              const status = response.data.status;
              
              console.log(`Instance status: ${status}`);
              
              if (status === 'running') {
                console.log('Instance is ready!');
                console.log('SSH:', response.data.connectionDetails.ssh);
                return;
              } else if (status === 'failed') {
                throw new Error('Instance failed to start');
              }
              
              await new Promise(resolve => setTimeout(resolve, 30000));
            } catch (error) {
              console.error('Error checking instance status:', error.message);
              process.exit(1);
            }
          }
          
          throw new Error('Instance startup timeout');
        }
        
        waitForInstance();
        EOF
    
    - name: Run Training Job
      run: |
        # SSH into instance and run training
        # This would typically involve:
        # 1. Uploading training code and data
        # 2. Installing dependencies
        # 3. Running the training script
        # 4. Downloading trained model artifacts
        echo "Training job would run here"
```

### Load Testing Example

```javascript
// client-examples/nodejs/load-test.js
const NovitaInstanceClient = require('./create-instance');

class LoadTester {
  constructor(client) {
    this.client = client;
    this.results = [];
  }

  async runLoadTest(config) {
    const {
      concurrent = 5,
      total = 20,
      instanceConfig = {
        name: 'load-test',
        productName: 'RTX 4090 24GB',
        templateId: 'pytorch-jupyter'
      }
    } = config;

    console.log(`Starting load test: ${total} instances, ${concurrent} concurrent`);
    
    const startTime = Date.now();
    const batches = Math.ceil(total / concurrent);
    
    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(concurrent, total - (batch * concurrent));
      const batchPromises = [];
      
      for (let i = 0; i < batchSize; i++) {
        const instanceName = `${instanceConfig.name}-${batch}-${i}`;
        batchPromises.push(this.testInstanceCreation({
          ...instanceConfig,
          name: instanceName
        }));
      }
      
      const batchResults = await Promise.all(batchPromises);
      this.results.push(...batchResults);
      
      console.log(`Batch ${batch + 1}/${batches} completed`);
      
      // Wait between batches
      if (batch < batches - 1) {
        await this.delay(2000);
      }
    }
    
    const totalTime = Date.now() - startTime;
    this.printResults(totalTime);
  }

  async testInstanceCreation(config) {
    const startTime = Date.now();
    
    try {
      const result = await this.client.createInstance(config);
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        instanceId: result.instanceId,
        responseTime,
        config
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        responseTime,
        config
      };
    }
  }

  printResults(totalTime) {
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length;
    
    console.log('\n=== Load Test Results ===');
    console.log(`Total requests: ${this.results.length}`);
    console.log(`Successful: ${successful.length} (${(successful.length / this.results.length * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failed.length} (${(failed.length / this.results.length * 100).toFixed(1)}%)`);
    console.log(`Average response time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`Total test time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`Requests per second: ${(this.results.length / (totalTime / 1000)).toFixed(2)}`);
    
    if (failed.length > 0) {
      console.log('\n=== Failures ===');
      failed.forEach(f => {
        console.log(`${f.config.name}: ${f.error}`);
      });
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage example
async function runLoadTest() {
  const client = new NovitaInstanceClient();
  const loadTester = new LoadTester(client);
  
  await loadTester.runLoadTest({
    concurrent: 3,
    total: 10,
    instanceConfig: {
      name: 'load-test',
      productName: 'RTX 4090 24GB',
      templateId: 'pytorch-jupyter',
      gpuNum: 1
    }
  });
}

if (require.main === module) {
  runLoadTest().catch(console.error);
}
```

## Integration Patterns

### Microservice Integration

```javascript
// client-examples/nodejs/microservice-integration.js
const express = require('express');
const NovitaInstanceClient = require('./create-instance');

class GPUOrchestrationService {
  constructor() {
    this.app = express();
    this.client = new NovitaInstanceClient();
    this.activeJobs = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      req.requestId = Math.random().toString(36).substring(7);
      console.log(`[${req.requestId}] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Submit training job
    this.app.post('/jobs', async (req, res) => {
      try {
        const job = await this.submitTrainingJob(req.body);
        res.status(201).json(job);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get job status
    this.app.get('/jobs/:jobId', async (req, res) => {
      try {
        const job = await this.getJobStatus(req.params.jobId);
        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }
        res.json(job);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // List all jobs
    this.app.get('/jobs', (req, res) => {
      const jobs = Array.from(this.activeJobs.values());
      res.json({ jobs, total: jobs.length });
    });

    // Cancel job
    this.app.delete('/jobs/:jobId', async (req, res) => {
      try {
        await this.cancelJob(req.params.jobId);
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  async submitTrainingJob(jobConfig) {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const job = {
      id: jobId,
      status: 'submitted',
      config: jobConfig,
      submittedAt: new Date().toISOString(),
      instanceId: null,
      progress: 0
    };

    this.activeJobs.set(jobId, job);

    // Create GPU instance for the job
    try {
      const instanceResult = await this.client.createInstance({
        name: `training-${jobId}`,
        productName: jobConfig.gpuType || 'RTX 4090 24GB',
        templateId: jobConfig.framework || 'pytorch-jupyter',
        gpuNum: jobConfig.gpuCount || 1,
        rootfsSize: jobConfig.storageSize || 100,
        webhookUrl: `${process.env.BASE_URL}/webhook/${jobId}`
      });

      job.instanceId = instanceResult.instanceId;
      job.status = 'provisioning';
      job.estimatedReadyTime = instanceResult.estimatedReadyTime;

    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
    }

    return job;
  }

  async getJobStatus(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    // Update instance status if available
    if (job.instanceId && job.status === 'provisioning') {
      try {
        const instance = await this.client.getInstanceStatus(job.instanceId);
        if (instance.status === 'running') {
          job.status = 'running';
          job.instanceDetails = instance;
        } else if (instance.status === 'failed') {
          job.status = 'failed';
          job.error = 'Instance failed to start';
        }
      } catch (error) {
        console.error(`Failed to get instance status for job ${jobId}:`, error.message);
      }
    }

    return job;
  }

  async cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    job.status = 'cancelled';
    job.cancelledAt = new Date().toISOString();

    // TODO: Stop instance if running
    // This would require additional Novita.ai API endpoints
  }

  start(port = 3001) {
    this.app.listen(port, () => {
      console.log(`GPU Orchestration Service listening on port ${port}`);
    });
  }
}

// Usage
const service = new GPUOrchestrationService();
service.start();
```

## Best Practices

### Error Handling

```javascript
// client-examples/nodejs/error-handling.js
class RobustNovitaClient extends NovitaInstanceClient {
  constructor(baseUrl, options = {}) {
    super(baseUrl);
    
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold || 5;
    
    this.failureCount = 0;
    this.circuitOpen = false;
    this.lastFailureTime = null;
  }

  async createInstanceWithRetry(config, retries = this.maxRetries) {
    if (this.circuitOpen) {
      throw new Error('Circuit breaker is open - service unavailable');
    }

    try {
      const result = await this.createInstance(config);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      if (retries > 0 && this.shouldRetry(error)) {
        console.log(`Retrying instance creation (${retries} attempts left)...`);
        await this.delay(this.retryDelay);
        return this.createInstanceWithRetry(config, retries - 1);
      }
      
      throw error;
    }
  }

  shouldRetry(error) {
    // Retry on network errors and 5xx responses
    return error.code === 'ECONNABORTED' || 
           error.code === 'ENOTFOUND' ||
           (error.response && error.response.status >= 500);
  }

  onSuccess() {
    this.failureCount = 0;
    this.circuitOpen = false;
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.circuitBreakerThreshold) {
      this.circuitOpen = true;
      console.warn('Circuit breaker opened due to repeated failures');
      
      // Auto-recovery after 60 seconds
      setTimeout(() => {
        this.circuitOpen = false;
        this.failureCount = 0;
        console.log('Circuit breaker reset');
      }, 60000);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Configuration Management

```javascript
// client-examples/nodejs/config-manager.js
class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  loadConfig() {
    return {
      // API Configuration
      apiUrl: process.env.NOVITA_API_URL || 'http://localhost:3000',
      timeout: parseInt(process.env.API_TIMEOUT) || 30000,
      
      // Instance Defaults
      defaultGpuType: process.env.DEFAULT_GPU_TYPE || 'RTX 4090 24GB',
      defaultTemplate: process.env.DEFAULT_TEMPLATE || 'pytorch-jupyter',
      defaultRegion: process.env.DEFAULT_REGION || 'CN-HK-01',
      
      // Retry Configuration
      maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
      
      // Webhook Configuration
      webhookUrl: process.env.WEBHOOK_URL,
      webhookSecret: process.env.WEBHOOK_SECRET,
      
      // Monitoring
      pollInterval: parseInt(process.env.POLL_INTERVAL) || 30000,
      startupTimeout: parseInt(process.env.STARTUP_TIMEOUT) || 600000
    };
  }

  validateConfig() {
    const required = ['apiUrl'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    // Validate ranges
    if (this.config.timeout < 1000 || this.config.timeout > 120000) {
      throw new Error('API timeout must be between 1000 and 120000ms');
    }

    if (this.config.maxRetries < 0 || this.config.maxRetries > 10) {
      throw new Error('Max retries must be between 0 and 10');
    }
  }

  get(key) {
    return this.config[key];
  }

  getInstanceDefaults() {
    return {
      productName: this.config.defaultGpuType,
      templateId: this.config.defaultTemplate,
      region: this.config.defaultRegion,
      webhookUrl: this.config.webhookUrl
    };
  }
}

module.exports = ConfigManager;
```

For more examples and integration patterns, see the complete [API Documentation](./API.md) and [Configuration Reference](./CONFIGURATION.md).