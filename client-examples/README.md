# Client Examples

This directory contains client code examples for integrating with the Novita GPU Instance API in various programming languages.

## Available Examples

### Node.js Examples
- **create-instance.js** - Basic instance creation and status checking
- **monitor-instances.js** - Real-time instance monitoring
- **batch-creation.js** - Batch instance creation with concurrency control
- **webhook-handler.js** - Express.js webhook handler for notifications
- **load-test.js** - Load testing and performance analysis

### Python Examples
- **novita_client.py** - Python client class with full API coverage
- **batch_manager.py** - Batch operations and job management
- **monitoring.py** - Instance monitoring and alerting

### Shell Scripts
- **create-instance.sh** - Simple cURL-based instance creation
- **monitor-status.sh** - Bash script for status monitoring

## Getting Started

### Node.js Setup
```bash
cd nodejs
npm install
```

### Python Setup
```bash
cd python
pip install -r requirements.txt
# or
pip install -e .
```

## Configuration

All examples use environment variables for configuration:

```bash
# Required
NOVITA_API_URL=http://localhost:3000
NOVITA_API_KEY=your_api_key_here

# Optional
WEBHOOK_URL=https://your-app.com/webhook
WEBHOOK_SECRET=your_webhook_secret
DEFAULT_GPU_TYPE="RTX 4090 24GB"
DEFAULT_TEMPLATE=pytorch-jupyter
```

Create a `.env` file in the example directory:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Usage Examples

### Basic Instance Creation

#### Node.js
```bash
cd nodejs
node create-instance.js
```

#### Python
```bash
cd python
python novita_client.py
```

#### Shell
```bash
cd shell
./create-instance.sh "my-instance" "RTX 4090 24GB" "pytorch-jupyter"
```

### Batch Operations

#### Node.js
```bash
cd nodejs
node batch-creation.js
```

#### Python
```bash
cd python
python batch_manager.py
```

### Monitoring

#### Node.js
```bash
cd nodejs
node monitor-instances.js
```

#### Python
```bash
cd python
python monitoring.py
```

### Webhook Handler

#### Node.js
```bash
cd nodejs
node webhook-handler.js
```

### Load Testing

#### Node.js
```bash
cd nodejs
node load-test.js
```

## Integration Patterns

### CI/CD Integration

See `ci-cd/` directory for examples of integrating with:
- GitHub Actions
- GitLab CI
- Jenkins
- Azure DevOps

### Microservice Integration

See `microservices/` directory for examples of:
- Express.js service integration
- FastAPI service integration
- Spring Boot integration
- Docker Compose multi-service setup

### Monitoring Integration

See `monitoring/` directory for examples of:
- Prometheus metrics collection
- Grafana dashboard configuration
- AlertManager integration
- Custom monitoring solutions

## Error Handling

All examples include comprehensive error handling:

```javascript
// Node.js example
try {
  const instance = await client.createInstance(config);
  console.log('Instance created:', instance.instanceId);
} catch (error) {
  if (error.response?.status === 401) {
    console.error('Authentication failed - check API key');
  } else if (error.response?.status === 429) {
    console.error('Rate limit exceeded - retry later');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

```python
# Python example
try:
    instance = client.create_instance(config)
    print(f"Instance created: {instance['instanceId']}")
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 401:
        print("Authentication failed - check API key")
    elif e.response.status_code == 429:
        print("Rate limit exceeded - retry later")
    else:
        print(f"HTTP error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Best Practices

### 1. Configuration Management
- Use environment variables for sensitive data
- Validate configuration on startup
- Provide sensible defaults

### 2. Error Handling
- Implement retry logic with exponential backoff
- Handle rate limiting gracefully
- Log errors with context information

### 3. Resource Management
- Clean up resources on exit
- Implement proper timeout handling
- Monitor resource usage

### 4. Security
- Never hardcode API keys
- Use HTTPS in production
- Validate webhook signatures

### 5. Performance
- Implement connection pooling
- Use caching where appropriate
- Monitor response times

## Testing

Each example includes test files:

### Node.js
```bash
cd nodejs
npm test
```

### Python
```bash
cd python
python -m pytest tests/
```

## Contributing

When adding new examples:

1. Follow the existing code structure
2. Include comprehensive error handling
3. Add configuration validation
4. Include usage documentation
5. Add test cases
6. Update this README

## Support

For questions about these examples:

1. Check the main [API Documentation](../docs/api/client-reference.md)
2. Review the [Troubleshooting Guide](../docs/TROUBLESHOOTING.md)
3. Open an issue on GitHub
4. Contact the development team

## License

These examples are provided under the MIT License. See the main project LICENSE file for details.