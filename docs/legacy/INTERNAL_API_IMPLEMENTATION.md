# Novita Internal API Implementation

## Overview

This document describes the implementation of the Novita internal API client to fix the `queryJobs` functionality. The issue was that the `queryJobs` method was using the wrong API endpoint and authorization.

## Problem

The original implementation had the following issues:

1. **Wrong Base URL**: Using `https://api.novita.ai` instead of `https://api-server.novita.ai`
2. **Wrong Authorization**: Using the standard API key instead of the internal API key
3. **Incorrect Endpoint**: The `/api/v1/jobs` endpoint is part of Novita's internal API, not their public API

## Solution

### 1. Created Separate Internal API Client

**File**: `src/clients/novitaInternalClient.ts`

- Dedicated client for Novita's internal API endpoints
- Uses `https://api-server.novita.ai` as base URL
- Uses separate internal API key for authorization
- Includes circuit breaker and rate limiting (more conservative for internal API)
- Comprehensive logging and error handling

### 2. Updated Configuration

**File**: `src/config/config.ts`

Added new configuration options:
```typescript
readonly novita: {
  readonly apiKey: string;              // Existing standard API key
  readonly baseUrl: string;             // Existing standard API URL
  readonly internalApiKey: string;      // New internal API key
  readonly internalBaseUrl: string;     // New internal API URL
}
```

**Environment Variables**:
```bash
# Standard API (existing)
NOVITA_API_KEY=your_standard_api_key
NOVITA_API_BASE_URL=https://api.novita.ai/gpu-instance/openapi

# Internal API (new)
NOVITA_INTERNAL_API_KEY=your_internal_api_key
NOVITA_INTERNAL_API_BASE_URL=https://api-server.novita.ai
```

### 3. Updated queryJobs Method

**File**: `src/services/novitaApiService.ts`

- Modified `queryJobs` method to use `novitaInternalClient`
- Updated logging to indicate internal API usage
- Maintained same interface and error handling

```typescript
async queryJobs(params: JobQueryParams = {}): Promise<NovitaJobsResponse> {
  // Uses novitaInternalClient instead of novitaClient
  const response = await novitaInternalClient.get<NovitaJobsResponse>(
    '/api/v1/jobs',
    { params: queryParams }
  );
  return response.data;
}
```

## Configuration Setup

### 1. Environment Variables

Update your `.env` file with the new internal API credentials:

```bash
# Add these new variables
NOVITA_INTERNAL_API_KEY=your_internal_api_key_here
NOVITA_INTERNAL_API_BASE_URL=https://api-server.novita.ai
```

### 2. API Key Requirements

You now need two API keys:

1. **Standard API Key**: For GPU instance operations (create, start, stop, delete)
   - Endpoint: `https://api.novita.ai/gpu-instance/openapi`
   - Used by: `novitaClient`

2. **Internal API Key**: For job queries and internal operations
   - Endpoint: `https://api-server.novita.ai`
   - Used by: `novitaInternalClient`

## Testing

### Manual Testing

Use the provided test script:

```bash
# Build the project first
npm run build

# Run the test
node test-internal-api.js
```

### Expected Behavior

The test will:
1. Verify configuration is loaded correctly
2. Test the `queryJobs` method with the internal API
3. Display results or error details

### Sample Output

```
🔧 Testing Novita Internal API Configuration...

📋 Configuration Check:
- Internal Base URL: https://api-server.novita.ai
- Has Internal API Key: true
- Regular Base URL: https://api.novita.ai/gpu-instance/openapi
- Has Regular API Key: true

🔍 Testing queryJobs with internal API...
✅ Success! Jobs query completed
- Total jobs: 25
- Returned jobs: 5
- Sample job: {
    id: "job_123456",
    type: "gpu_instance",
    state: "completed",
    createdAt: "2024-01-15T10:30:00.000Z"
  }

🏁 Test completed
```

## API Endpoints Affected

### Fixed Endpoints

- **Migration Check**: `POST /api/instances/migration/check-failed`
  - Now uses correct internal API for job queries
  - Properly handles failed migration job detection

### Unaffected Endpoints

All other endpoints continue to use the standard API:
- Instance creation, starting, stopping, deletion
- Instance status and listing
- Health checks and metrics

## Error Handling

The internal client includes comprehensive error handling:

- **Authentication Errors**: Clear messages for invalid internal API keys
- **Network Errors**: Retry logic with exponential backoff
- **Rate Limiting**: Conservative rate limits for internal API
- **Circuit Breaker**: Prevents cascading failures

## Monitoring

### Health Checks

The health endpoint now monitors both API clients:

```json
{
  "services": {
    "novitaApi": "up",           // Standard API status
    "novitaInternalApi": "up"    // Internal API status (future enhancement)
  }
}
```

### Logging

Enhanced logging distinguishes between API clients:

```
[INFO] Querying jobs from Novita internal API
[DEBUG] Internal API request: GET https://api-server.novita.ai/api/v1/jobs
[INFO] Jobs query response from internal API: 25 total jobs
```

## Security Considerations

1. **Separate Credentials**: Internal API key should be different from standard API key
2. **Access Control**: Internal API key may have different permissions
3. **Rate Limiting**: More conservative limits for internal API usage
4. **Logging**: Sensitive data (API keys) are redacted in logs

## Migration Guide

### For Existing Deployments

1. **Obtain Internal API Key**: Get the internal API key from Novita.ai
2. **Update Environment**: Add `NOVITA_INTERNAL_API_KEY` to your environment
3. **Deploy**: Deploy the updated code
4. **Test**: Verify job queries work correctly
5. **Monitor**: Check logs for any authentication issues

### Rollback Plan

If issues occur:
1. The standard API functionality remains unchanged
2. Only job query functionality is affected
3. Can temporarily disable migration features if needed

## Future Enhancements

1. **Health Monitoring**: Add internal API to health checks
2. **Metrics**: Separate metrics for internal API usage
3. **Caching**: Cache job query results to reduce API calls
4. **Fallback**: Implement fallback mechanisms for internal API failures

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify `NOVITA_INTERNAL_API_KEY` is correct
   - Check API key has proper permissions

2. **Network Errors**
   - Verify `NOVITA_INTERNAL_API_BASE_URL` is accessible
   - Check firewall/proxy settings

3. **Rate Limiting**
   - Internal API has lower rate limits
   - Monitor usage and adjust polling frequency

### Debug Steps

1. Check configuration loading:
   ```bash
   node -e "console.log(require('./dist/config/config').config.novita)"
   ```

2. Test internal API connectivity:
   ```bash
   node test-internal-api.js
   ```

3. Check application logs for internal API requests

## Conclusion

This implementation properly separates the standard and internal Novita.ai API usage, ensuring that job queries use the correct endpoint and authentication. The solution maintains backward compatibility while fixing the core issue with the `queryJobs` functionality.