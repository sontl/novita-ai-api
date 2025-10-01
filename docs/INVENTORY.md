# Documentation Inventory

This document provides a comprehensive inventory of all documentation files before and after reorganization.

## Root Directory Documentation Files

### API Documentation
- `docs/api/client-reference.md` - Client integration reference
- `docs/api/endpoints.md` - API endpoints summary
- `docs/api/quick-start.md` - Quick start guide

### Feature Documentation
- `docs/features/auto-stop.md` - Auto-stop feature documentation
- `docs/features/instance-management.md` - Instance management feature documentation

### Integration Documentation
- `docs/integrations/axiom.md` - Axiom logging integration guide
- `docs/integrations/redis.md` - Redis integration guide

### Implementation Summaries
- `docs/legacy/IMPLEMENTATION_SUMMARY.md` - General implementation summary
- `docs/legacy/IMPLEMENTATION_SUMMARY_OBSOLETE_SYNC.md` - Obsolete sync implementation
- `docs/legacy/IMPLEMENTATION_SUMMARY_SYNC_UI.md` - Sync UI implementation
- `docs/legacy/STARTUP_ERROR_HANDLING_SUMMARY.md` - Startup error handling
- `docs/legacy/TIMESTAMP_FIX_SUMMARY.md` - Timestamp fix summary

### Migration Documentation
- `docs/features/migration.md` - Migration feature documentation
- `OBSOLETE_INSTANCE_SYNC.md` - Obsolete instance sync

### Deployment Documentation
- `docs/deployment/docker.md` - Docker deployment guide

### Other Documentation
- `DOCUMENTATION_INDEX.md` - Documentation index
- `REGION_FALLBACK_IMPLEMENTATION.md` - Region fallback implementation
- `INTERNAL_API_IMPLEMENTATION.md` - Internal API implementation

## Existing Docs Folder Files

### Current Structure
- `docs/API.md` - API documentation
- `docs/deployment/configuration.md` - Configuration guide
- `docs/deployment/docker.md` - Main Docker deployment guide
- `docs/deployment/guide.md` - General deployment documentation
- `docs/deployment/examples.md` - Deployment examples
- `docs/EXAMPLES.md` - Usage examples
- `docs/MIGRATION.md` - Migration documentation
- `docs/deployment/operations.md` - Operations guide
- `docs/README.md` - Documentation overview
- `docs/integrations/redis.md` - Redis integration guide
- `docs/TROUBLESHOOTING.md` - General troubleshooting

## Identified Duplicates and Overlaps

### Deployment Documentation
- **Root `DEPLOYMENT.md`** vs **`docs/DEPLOYMENT.md`** - Need to compare and merge
- **`DOCKER_DEPLOYMENT_SUMMARY.md`** - Overlaps with deployment documentation

### API Documentation
- **`docs/API.md`** vs **Root API files** - Multiple API documentation sources
- **`docs/EXAMPLES.md`** vs **API examples** - Potential overlap in examples

### Redis Documentation
- **Integration guide overlap** - Now consolidated in `docs/integrations/redis.md`

### Migration Documentation
- **`docs/MIGRATION.md`** vs **Multiple migration files** - Migration documentation scattered

## Consolidation Plan

### Target Structure
```
docs/
├── README.md (updated documentation index)
├── api/
│   ├── README.md
│   ├── client-reference.md (consolidated API docs)
│   ├── endpoints.md
│   ├── quick-start.md
│   └── examples.md
├── features/
│   ├── README.md
│   ├── auto-stop.md
│   ├── instance-management.md
│   ├── migration.md
│   └── webhooks.md
├── deployment/
│   ├── README.md
│   ├── docker.md (merged deployment docs)
│   ├── configuration.md
│   └── operations.md
├── integrations/
│   ├── README.md
│   ├── axiom.md (consolidated Axiom docs)
│   ├── redis.md (consolidated Redis docs)
│   └── novita-api.md
├── implementation/
│   ├── README.md
│   ├── architecture.md
│   ├── changelog.md (consolidated implementation summaries)
│   └── troubleshooting.md
└── legacy/
    └── [archived implementation summaries]
```

## Actions Required

1. **Consolidate API Documentation** - Merge root API files into `docs/api/`
2. **Merge Deployment Documentation** - Compare and merge deployment files
3. **Consolidate Integration Documentation** - Merge Axiom and Redis files
4. **Archive Implementation Summaries** - Move to `docs/legacy/`
5. **Update References** - Update all internal links to new locations
6. **Create Consolidated Changelog** - Extract key information from implementation summaries