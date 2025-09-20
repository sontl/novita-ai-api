# API Quick Start Guide

Get started with the Novita GPU Instance API in minutes.

## Base URL
```
http://localhost:3000  # Development
```

## Essential Endpoints

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Create Instance
```bash
curl -X POST http://localhost:3000/api/instances \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-instance",
    "productName": "RTX 4090 24GB",
    "templateId": "pytorch-jupyter"
  }'
```

### 3. Get Instance Status
```bash
curl http://localhost:3000/api/instances/{instanceId}
```

### 4. List All Instances
```bash
curl http://localhost:3000/api/instances
```

### 5. Start Instance
```bash
# By ID
curl -X POST http://localhost:3000/api/instances/{instanceId}/start

# By name
curl -X POST http://localhost:3000/api/instances/start \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "my-instance"}'
```

### 6. Stop Instance
```bash
# By ID
curl -X POST http://localhost:3000/api/instances/{instanceId}/stop

# By name
curl -X POST http://localhost:3000/api/instances/stop \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "my-instance"}'
```

## JavaScript Example

```javascript
const API_BASE = 'http://localhost:3000';

// Create instance
const createInstance = async () => {
  const response = await fetch(`${API_BASE}/api/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'my-gpu-instance',
      productName: 'RTX 4090 24GB',
      templateId: 'pytorch-jupyter',
      webhookUrl: 'https://your-app.com/webhook'
    })
  });
  
  const result = await response.json();
  console.log('Instance created:', result.instanceId);
  return result;
};

// Wait for instance to be ready
const waitForReady = async (instanceId) => {
  while (true) {
    const response = await fetch(`${API_BASE}/api/instances/${instanceId}`);
    const instance = await response.json();
    
    if (instance.status === 'ready') {
      console.log('Instance ready!', instance.connectionDetails);
      return instance;
    }
    
    if (instance.status === 'failed') {
      throw new Error('Instance failed');
    }
    
    console.log('Status:', instance.status);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
};

// Usage
createInstance()
  .then(result => waitForReady(result.instanceId))
  .then(instance => console.log('Ready:', instance))
  .catch(console.error);
```

## Python Example

```python
import requests
import time

API_BASE = 'http://localhost:3000'

def create_instance():
    response = requests.post(f'{API_BASE}/api/instances', json={
        'name': 'my-gpu-instance',
        'productName': 'RTX 4090 24GB',
        'templateId': 'pytorch-jupyter',
        'webhookUrl': 'https://your-app.com/webhook'
    })
    
    result = response.json()
    print(f"Instance created: {result['instanceId']}")
    return result

def wait_for_ready(instance_id):
    while True:
        response = requests.get(f'{API_BASE}/api/instances/{instance_id}')
        instance = response.json()
        
        if instance['status'] == 'ready':
            print(f"Instance ready! {instance['connectionDetails']}")
            return instance
        
        if instance['status'] == 'failed':
            raise Exception('Instance failed')
        
        print(f"Status: {instance['status']}")
        time.sleep(5)

# Usage
try:
    result = create_instance()
    instance = wait_for_ready(result['instanceId'])
    print(f"Ready: {instance}")
except Exception as e:
    print(f"Error: {e}")
```

## Common Patterns

### Error Handling
```javascript
try {
  const response = await fetch('/api/instances', { method: 'POST', ... });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error.error.message);
    return;
  }
  
  const result = await response.json();
  // Handle success
} catch (error) {
  console.error('Network Error:', error.message);
}
```

### Webhook Handler
```javascript
// Express.js webhook handler
app.post('/webhook', (req, res) => {
  const { instanceId, status, data } = req.body;
  
  console.log(`Instance ${instanceId} is now ${status}`);
  
  if (status === 'ready') {
    console.log('Connection details:', data.connectionDetails);
  }
  
  res.status(200).send('OK');
});
```

## Instance Status Flow

```
creating → starting → running → health_checking → ready
    ↓         ↓          ↓            ↓
  failed    failed    failed      failed
```

## Next Steps

1. **Full Documentation**: [API_CLIENT_REFERENCE.md](./API_CLIENT_REFERENCE.md)
2. **Client Examples**: [client-examples/](./client-examples/)
3. **Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)
4. **Troubleshooting**: Check `/health` endpoint and logs

## Support

- Health check: `GET /health`
- Metrics: `GET /api/metrics`
- Cache stats: `GET /api/cache/stats`