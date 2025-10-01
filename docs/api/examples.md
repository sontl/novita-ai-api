# API Usage Examples

Comprehensive examples and patterns for integrating with the Novita GPU Instance API.

## Basic Examples

### Create and Monitor Instance

```javascript
const API_BASE = 'http://localhost:3000';

async function createAndMonitorInstance() {
  try {
    // Create instance
    const createResponse = await fetch(`${API_BASE}/api/instances`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Request-ID': `req_${Date.now()}_${Math.random()}`
      },
      body: JSON.stringify({
        name: 'my-gpu-instance',
        productName: 'RTX 4090 24GB',
        templateId: 'pytorch-jupyter',
        gpuNum: 1,
        rootfsSize: 60,
        region: 'CN-HK-01',
        webhookUrl: 'https://your-app.com/webhook'
      })
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create instance: ${error.error.message}`);
    }

    const { instanceId } = await createResponse.json();
    console.log(`Instance created: ${instanceId}`);

    // Monitor until ready
    const instance = await waitForInstanceReady(instanceId);
    console.log('Instance ready:', instance.connectionDetails);
    
    return instance;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

async function waitForInstanceReady(instanceId, maxWaitTime = 600000) {
  const startTime = Date.now();
  let delay = 2000; // Start with 2 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`${API_BASE}/api/instances/${instanceId}`);
    const instance = await response.json();
    
    console.log(`Instance ${instanceId} status: ${instance.status}`);
    
    if (instance.status === 'ready') {
      return instance;
    }
    
    if (instance.status === 'failed') {
      throw new Error('Instance failed to start');
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 30000); // Max 30 seconds
  }
  
  throw new Error('Timeout waiting for instance to be ready');
}

// Usage
createAndMonitorInstance()
  .then(instance => console.log('Success:', instance))
  .catch(error => console.error('Failed:', error));
```

### Python Example

```python
import requests
import time
import json
from typing import Dict, Any

API_BASE = 'http://localhost:3000'

class NovitaAPIClient:
    def __init__(self, base_url: str = API_BASE):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
    
    def create_instance(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new GPU instance."""
        response = self.session.post(f'{self.base_url}/api/instances', json=config)
        response.raise_for_status()
        return response.json()
    
    def get_instance(self, instance_id: str) -> Dict[str, Any]:
        """Get instance details."""
        response = self.session.get(f'{self.base_url}/api/instances/{instance_id}')
        response.raise_for_status()
        return response.json()
    
    def list_instances(self) -> Dict[str, Any]:
        """List all instances."""
        response = self.session.get(f'{self.base_url}/api/instances')
        response.raise_for_status()
        return response.json()
    
    def start_instance(self, instance_id: str, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """Start an instance by ID."""
        response = self.session.post(
            f'{self.base_url}/api/instances/{instance_id}/start',
            json=config or {}
        )
        response.raise_for_status()
        return response.json()
    
    def stop_instance(self, instance_id: str) -> Dict[str, Any]:
        """Stop an instance by ID."""
        response = self.session.post(f'{self.base_url}/api/instances/{instance_id}/stop')
        response.raise_for_status()
        return response.json()
    
    def wait_for_ready(self, instance_id: str, max_wait_time: int = 600) -> Dict[str, Any]:
        """Wait for instance to be ready."""
        start_time = time.time()
        delay = 2  # Start with 2 seconds
        
        while time.time() - start_time < max_wait_time:
            instance = self.get_instance(instance_id)
            status = instance['status']
            
            print(f"Instance {instance_id} status: {status}")
            
            if status == 'ready':
                return instance
            
            if status == 'failed':
                raise Exception('Instance failed to start')
            
            time.sleep(delay)
            delay = min(delay * 1.5, 30)  # Max 30 seconds
        
        raise Exception('Timeout waiting for instance to be ready')

# Usage example
def main():
    client = NovitaAPIClient()
    
    # Create instance
    config = {
        'name': 'python-gpu-instance',
        'productName': 'RTX 4090 24GB',
        'templateId': 'pytorch-jupyter',
        'webhookUrl': 'https://your-app.com/webhook'
    }
    
    try:
        result = client.create_instance(config)
        instance_id = result['instanceId']
        print(f"Instance created: {instance_id}")
        
        # Wait for ready
        instance = client.wait_for_ready(instance_id)
        print(f"Instance ready: {instance['connectionDetails']}")
        
        return instance
    except Exception as e:
        print(f"Error: {e}")
        raise

if __name__ == '__main__':
    main()
```

## Advanced Examples

### Batch Instance Management

```javascript
class InstanceManager {
  constructor(apiBase = 'http://localhost:3000') {
    this.apiBase = apiBase;
  }

  async createInstances(configs) {
    const promises = configs.map(config => this.createInstance(config));
    const results = await Promise.allSettled(promises);
    
    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    const failed = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason);
    
    return { successful, failed };
  }

  async createInstance(config) {
    const response = await fetch(`${this.apiBase}/api/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create ${config.name}: ${error.error.message}`);
    }

    return await response.json();
  }

  async waitForAllReady(instanceIds, maxWaitTime = 600000) {
    const promises = instanceIds.map(id => this.waitForReady(id, maxWaitTime));
    return await Promise.allSettled(promises);
  }

  async waitForReady(instanceId, maxWaitTime = 600000) {
    const startTime = Date.now();
    let delay = 2000;
    
    while (Date.now() - startTime < maxWaitTime) {
      const response = await fetch(`${this.apiBase}/api/instances/${instanceId}`);
      const instance = await response.json();
      
      if (instance.status === 'ready') return instance;
      if (instance.status === 'failed') throw new Error(`Instance ${instanceId} failed`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 30000);
    }
    
    throw new Error(`Timeout waiting for instance ${instanceId}`);
  }
}

// Usage
async function batchExample() {
  const manager = new InstanceManager();
  
  const configs = [
    { name: 'worker-1', productName: 'RTX 4090 24GB', templateId: 'pytorch-jupyter' },
    { name: 'worker-2', productName: 'RTX 4090 24GB', templateId: 'pytorch-jupyter' },
    { name: 'worker-3', productName: 'RTX 4090 24GB', templateId: 'pytorch-jupyter' }
  ];

  try {
    // Create all instances
    const { successful, failed } = await manager.createInstances(configs);
    console.log(`Created ${successful.length} instances, ${failed.length} failed`);

    // Wait for all to be ready
    const instanceIds = successful.map(r => r.instanceId);
    const readyResults = await manager.waitForAllReady(instanceIds);
    
    const ready = readyResults.filter(r => r.status === 'fulfilled').map(r => r.value);
    console.log(`${ready.length} instances are ready`);
    
    return ready;
  } catch (error) {
    console.error('Batch operation failed:', error);
    throw error;
  }
}
```

### Error Handling with Retries

```javascript
class RobustAPIClient {
  constructor(apiBase = 'http://localhost:3000', maxRetries = 3) {
    this.apiBase = apiBase;
    this.maxRetries = maxRetries;
  }

  async makeRequest(url, options = {}, retries = 0) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': `req_${Date.now()}_${Math.random()}`,
          ...options.headers
        }
      });

      if (response.status === 429) {
        // Rate limited - wait and retry
        if (retries < this.maxRetries) {
          const delay = Math.pow(2, retries) * 1000; // Exponential backoff
          console.log(`Rate limited, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(url, options, retries + 1);
        }
        throw new Error('Rate limit exceeded, max retries reached');
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (retries < this.maxRetries && this.isRetryableError(error)) {
        const delay = Math.pow(2, retries) * 1000;
        console.log(`Request failed, retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(url, options, retries + 1);
      }
      throw error;
    }
  }

  isRetryableError(error) {
    return error.name === 'TypeError' || // Network errors
           error.message.includes('timeout') ||
           error.message.includes('ECONNRESET');
  }

  async createInstance(config) {
    return this.makeRequest(`${this.apiBase}/api/instances`, {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  async getInstance(instanceId) {
    return this.makeRequest(`${this.apiBase}/api/instances/${instanceId}`);
  }
}
```

### Webhook Handler Examples

#### Express.js Webhook Handler

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Webhook secret for signature verification
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function verifyWebhookSignature(payload, signature, secret) {
  if (!secret) return true; // Skip verification if no secret configured
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}

app.post('/webhook', (req, res) => {
  try {
    // Verify signature if secret is configured
    if (WEBHOOK_SECRET) {
      const signature = req.headers['x-signature-sha256'];
      const payload = JSON.stringify(req.body);
      
      if (!verifyWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { instanceId, status, timestamp, data } = req.body;
    
    console.log(`[${timestamp}] Instance ${instanceId} is now ${status}`);
    
    // Handle different status changes
    switch (status) {
      case 'ready':
        console.log('Instance ready! Connection details:', data.connectionDetails);
        // Notify your application that the instance is ready
        break;
      
      case 'failed':
        console.error('Instance failed:', data);
        // Handle failure - maybe retry or alert
        break;
      
      case 'stopped':
        console.log('Instance stopped');
        // Clean up any resources
        break;
      
      default:
        console.log(`Status update: ${status}`);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(3001, () => {
  console.log('Webhook server listening on port 3001');
});
```

#### Python Flask Webhook Handler

```python
from flask import Flask, request, jsonify
import hmac
import hashlib
import json
import os

app = Flask(__name__)
WEBHOOK_SECRET = os.getenv('WEBHOOK_SECRET')

def verify_signature(payload, signature, secret):
    if not secret:
        return True
    
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return f"sha256={expected_signature}" == signature

@app.route('/webhook', methods=['POST'])
def webhook():
    try:
        # Verify signature
        if WEBHOOK_SECRET:
            signature = request.headers.get('X-Signature-SHA256')
            payload = request.get_data(as_text=True)
            
            if not verify_signature(payload, signature, WEBHOOK_SECRET):
                return jsonify({'error': 'Invalid signature'}), 401
        
        data = request.json
        instance_id = data['instanceId']
        status = data['status']
        timestamp = data['timestamp']
        instance_data = data.get('data', {})
        
        print(f"[{timestamp}] Instance {instance_id} is now {status}")
        
        # Handle status changes
        if status == 'ready':
            connection_details = instance_data.get('connectionDetails', {})
            print(f"Instance ready! Connection: {connection_details}")
            
        elif status == 'failed':
            print(f"Instance failed: {instance_data}")
            
        elif status == 'stopped':
            print("Instance stopped")
        
        return jsonify({'received': True})
        
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001)
```

## Auto-Stop Integration Examples

### Prevent Auto-Stop During Active Use

```javascript
class InstanceUsageTracker {
  constructor(instanceId, apiBase = 'http://localhost:3000') {
    this.instanceId = instanceId;
    this.apiBase = apiBase;
    this.updateInterval = null;
  }

  startTracking(intervalMinutes = 10) {
    // Update immediately
    this.updateLastUsed();
    
    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.updateLastUsed();
    }, intervalMinutes * 60 * 1000);
    
    console.log(`Started usage tracking for instance ${this.instanceId}`);
  }

  stopTracking() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log(`Stopped usage tracking for instance ${this.instanceId}`);
    }
  }

  async updateLastUsed() {
    try {
      const response = await fetch(`${this.apiBase}/api/instances/${this.instanceId}/last-used`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Updated last used time: ${result.lastUsedAt}`);
      } else {
        console.error('Failed to update last used time:', response.statusText);
      }
    } catch (error) {
      console.error('Error updating last used time:', error);
    }
  }
}

// Usage
const tracker = new InstanceUsageTracker('inst_abc123def456');

// Start tracking when beginning work
tracker.startTracking(10); // Update every 10 minutes

// Stop tracking when done
// tracker.stopTracking();
```

### Monitor Auto-Stop Service

```javascript
async function monitorAutoStopService() {
  try {
    const response = await fetch('/api/instances/auto-stop/stats');
    const stats = await response.json();
    
    console.log('Auto-stop service status:', {
      running: stats.schedulerRunning,
      checkInterval: `${stats.checkIntervalMinutes} minutes`,
      inactivityThreshold: `${stats.defaultInactivityThresholdMinutes} minutes`
    });
    
    return stats;
  } catch (error) {
    console.error('Failed to get auto-stop stats:', error);
  }
}

// Check auto-stop service every hour
setInterval(monitorAutoStopService, 60 * 60 * 1000);
```

## Health Monitoring Examples

### Comprehensive Health Check

```javascript
async function performHealthCheck() {
  try {
    const response = await fetch('/health');
    const health = await response.json();
    
    console.log('=== Health Check Results ===');
    console.log(`Overall Status: ${health.status}`);
    console.log(`Uptime: ${Math.floor(health.uptime / 60)} minutes`);
    
    // Check individual services
    Object.entries(health.services).forEach(([service, status]) => {
      const icon = status === 'up' ? '✅' : '❌';
      console.log(`${icon} ${service}: ${status}`);
    });
    
    // Performance metrics
    if (health.performance) {
      console.log('\n=== Performance Metrics ===');
      console.log(`Requests/min: ${health.performance.requestsPerMinute}`);
      console.log(`Avg Response Time: ${health.performance.averageResponseTime}ms`);
      console.log(`Error Rate: ${(health.performance.errorRate * 100).toFixed(2)}%`);
    }
    
    // System metrics
    if (health.system) {
      console.log('\n=== System Metrics ===');
      console.log(`Memory: ${health.system.memory.usedMB}MB / ${health.system.memory.totalMB}MB`);
      console.log(`CPU Usage: ${health.system.cpu.usage}%`);
    }
    
    return health.status === 'healthy';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// Monitor health every 5 minutes
setInterval(async () => {
  const isHealthy = await performHealthCheck();
  if (!isHealthy) {
    console.error('⚠️  Service is unhealthy!');
    // Send alert, restart service, etc.
  }
}, 5 * 60 * 1000);
```

## Best Practices

### 1. Connection Pooling and Reuse

```javascript
class APIClient {
  constructor(apiBase = 'http://localhost:3000') {
    this.apiBase = apiBase;
    // Reuse fetch with keep-alive
    this.agent = new (require('https').Agent)({ keepAlive: true });
  }

  async request(endpoint, options = {}) {
    return fetch(`${this.apiBase}${endpoint}`, {
      ...options,
      agent: this.agent,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        ...options.headers
      }
    });
  }
}
```

### 2. Request Deduplication

```javascript
class DeduplicatedAPIClient {
  constructor() {
    this.pendingRequests = new Map();
  }

  async getInstance(instanceId) {
    const key = `getInstance:${instanceId}`;
    
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }

    const promise = fetch(`/api/instances/${instanceId}`)
      .then(r => r.json())
      .finally(() => {
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, promise);
    return promise;
  }
}
```

### 3. Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const breaker = new CircuitBreaker();

async function safeAPICall() {
  return breaker.call(async () => {
    const response = await fetch('/api/instances');
    if (!response.ok) throw new Error('API call failed');
    return response.json();
  });
}
```

These examples demonstrate robust patterns for integrating with the Novita GPU Instance API, including error handling, monitoring, and best practices for production use.