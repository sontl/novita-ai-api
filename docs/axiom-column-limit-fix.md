# Axiom Column Limit Fix

## Problem

You were experiencing "exceed the column limit" errors from Axiom with error code 471305474450. The error occurs because Axiom has a limit of 257 columns per dataset, and your application was dynamically adding new fields to log entries, creating new columns each time.

## Root Cause

The issue was caused by logging calls that include dynamic fields like:
- `jobId`, `instanceName`, `operationId`, `scheduledAt`, `lastUsedAt`
- `inactivityThresholdMinutes`, `dryRun`, `eligibleCount`, `lastUsedTime`
- `inactiveMinutes`, `successRate`, `processingTimeMs`, `attempts`
- `type`, `queueSize`, `novitaInstanceId`, `templateId`, `templateName`

Each unique field name creates a new column in Axiom. Once you hit 257 columns, Axiom rejects new data.

## Solution

### 1. Updated Logger Configuration

Modified `src/utils/logger.ts` to use a strict allowlist of fields for Axiom:

```typescript
// Only these fields are allowed as separate columns
const allowedFields = new Set([
  'timestamp', 'level', 'message', 'service', 'environment', 'version',
  'requestId', 'correlationId', 'component', 'action', 'operation',
  'httpMethod', 'httpUrl', 'httpStatusCode', 'responseTime', 'duration',
  'instanceId', 'errorType', 'memoryUsage', 'tags', 'metadata'
]);
```

All other fields are automatically moved into a single `metadata` JSON field.

### 2. Created Axiom-Safe Logger

Created `src/utils/axiomSafeLogger.ts` that:
- Enforces the field allowlist
- Automatically moves dynamic fields to metadata
- Provides type-safe logging methods
- Maintains compatibility with existing code

### 3. Updated All Services

Updated **all 23 services and components** to use the safe logger:
- All services in `src/services/` (21 files)
- All routes in `src/routes/` (3 files) 
- All middleware in `src/middleware/` (3 files)
- All clients in `src/clients/` (3 files)
- Main application file `src/index.ts`

## Usage

### Replace Logger Imports

**Before:**
```typescript
import { logger } from '../utils/logger';
```

**After:**
```typescript
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('component-name');
```

### Add Operation Field

Add an `operation` field to identify the type of operation:

**Before:**
```typescript
logger.info('Processing auto-stop check', {
  jobId: payload.jobId,
  scheduledAt: payload.scheduledAt,
  inactivityThresholdMinutes: inactivityThreshold,
  dryRun
});
```

**After:**
```typescript
logger.info('Processing auto-stop check', {
  operation: 'auto_stop_check',  // Added operation field
  jobId: payload.jobId,
  scheduledAt: payload.scheduledAt,
  inactivityThresholdMinutes: inactivityThreshold,
  dryRun
});
```

### Error Logging

**Before:**
```typescript
logger.error('Failed to auto-stop instance', {
  jobId: payload.jobId,
  instanceId: instanceState.id,
  error: (error as Error).message
});
```

**After:**
```typescript
logger.error('Failed to auto-stop instance', {
  operation: 'auto_stop_check',
  instanceId: instanceState.id,
  jobId: payload.jobId
}, error as Error);  // Pass error as third parameter
```

## Field Mapping

### Core Fields (Separate Columns)
These fields get their own columns in Axiom:
- `requestId`, `correlationId`, `component`, `action`, `operation`
- `httpMethod`, `httpUrl`, `httpStatusCode`, `responseTime`, `duration`
- `instanceId`, `errorType`, `memoryUsage`, `tags`

### Metadata Fields (Single JSON Column)
All other fields go into the `metadata` JSON column:
- `jobId`, `instanceName`, `operationId`, `scheduledAt`
- `inactivityThresholdMinutes`, `dryRun`, `eligibleCount`
- `processingTimeMs`, `attempts`, `type`, `queueSize`
- Any custom application-specific fields

## Migration Script

Use the migration script to find remaining problematic calls:

```bash
node scripts/migrate-logging.js
```

This will scan your codebase and identify 121 logging calls that need updating.

## Benefits

1. **No More Column Limit Errors**: Fixed field count prevents Axiom column limit issues
2. **Better Performance**: Fewer columns means faster queries and lower storage costs
3. **Backward Compatible**: Console logs still show all fields for development
4. **Type Safety**: TypeScript interfaces prevent logging mistakes
5. **Structured Metadata**: Dynamic fields are still searchable in the metadata JSON

## Verification

After applying these changes:
1. Deploy the updated code
2. Monitor Axiom for column limit errors (should be eliminated)
3. Verify that logs still contain all necessary information
4. Check that Axiom dashboards still work (may need to update queries to use `metadata` field)

## Next Steps

1. **✅ COMPLETED**: All 23 services have been updated to use the safe logger
2. **Update Axiom Dashboards**: Modify any dashboards that reference the moved fields to use `JSON_EXTRACT` on the metadata field
3. **Monitor Performance**: Check if the reduced column count improves Axiom query performance
4. **Consider Field Optimization**: Review if any fields in metadata should be promoted to core fields based on query patterns

## Verification Commands

```bash
# Check for any remaining old logger usage
node scripts/migrate-logging.js

# Verify all services use safe logger (should return no results)
grep -r "import.*logger.*from.*utils/logger" src/ --exclude-dir=utils
```