# Region Filtering Fix for Novita API Changes

## Problem
The Novita API changed their response format for product regions. Previously, they returned region codes like:
```json
{
  "regions": ["US-CA-06", "CN-HK-01"]
}
```

Now they return descriptive names like:
```json
{
  "regions": ["US-CA-06 (California)", "CN-HK-01 (Hong Kong)"]
}
```

This broke the region filtering logic in `getProducts()` method, which used exact string matching with `includes()`.

## Solution
Updated the region filtering logic and related components to handle both formats:

### 1. Enhanced Region Filtering in novitaApiService.ts
```typescript
// Old logic (broken with new format)
product.regions.includes(filters.region)

// New logic (handles both formats)
product.regions.some((region: string) => {
  const regionCode = region.split(' ')[0]; // Extract "US-CA-06" from "US-CA-06 (California)"
  return regionCode === filters.region || region === filters.region;
});
```

### 2. Improved Product Transformation
Updated the product transformation to extract the correct region code:
```typescript
// Extract the actual region code from the regions array if filtering by region
let productRegion = filters?.region || 'CN-HK-01';
if (filters?.region && rawProduct.regions && Array.isArray(rawProduct.regions)) {
  const matchingRegion = rawProduct.regions.find((region: string) => {
    const regionCode = region.split(' ')[0];
    return regionCode === filters.region || region === filters.region;
  });
  if (matchingRegion) {
    productRegion = matchingRegion.split(' ')[0]; // Extract just the region code
  }
}
```

### 3. Enhanced Region Mapping in jobWorkerService.ts
Replaced hardcoded region mapping with a comprehensive mapping function:
```typescript
// Old logic (limited)
clusterId: regionUsed === 'CN-HK-01' ? 'cn-hongkong-1' : regionUsed.toLowerCase()

// New logic (comprehensive)
private mapRegionToClusterId(regionCode: string): string {
  const regionToClusterMap: Record<string, string> = {
    'CN-HK-01': 'cn-hongkong-1',
    'AS-SGP-02': 'as-sgp-2',
    'AS-IN-01': 'as-in-1',
    'US-CA-06': 'us-ca-06',
    'US-WEST-01': 'us-west-01',
    'EU-DE-01': 'eu-de-01',
    'EU-WEST-01': 'eu-west-01',
    'OC-AU-01': 'oc-au-01'
  };
  return regionToClusterMap[regionCode] || regionCode.toLowerCase();
}
```

### 4. Updated Region Validation in validation.ts
Expanded the list of valid regions:
```typescript
// Before: Limited regions
.valid('CN-HK-01', 'US-WEST-01', 'EU-WEST-01', 'AS-SGP-02', 'OC-AU-01')

// After: Comprehensive regions
.valid('CN-HK-01', 'AS-SGP-02', 'AS-IN-01', 'US-CA-06', 'US-WEST-01', 'EU-DE-01', 'EU-WEST-01', 'OC-AU-01')
```

### 5. Enhanced Region Configuration in productService.ts
Added more regions to the fallback configuration:
```typescript
private readonly defaultRegions: RegionConfig[] = [
  { id: 'as-sgp-2', name: 'AS-SGP-02', priority: 1 },
  { id: 'cn-hongkong-1', name: 'CN-HK-01', priority: 2 },
  { id: 'as-in-1', name: 'AS-IN-01', priority: 3 },
  { id: 'us-ca-06', name: 'US-CA-06', priority: 4 },
  { id: 'us-west-01', name: 'US-WEST-01', priority: 5 },
  { id: 'eu-de-01', name: 'EU-DE-01', priority: 6 },
  { id: 'eu-west-01', name: 'EU-WEST-01', priority: 7 },
  { id: 'oc-au-01', name: 'OC-AU-01', priority: 8 }
];
```

### 6. Improved Health Check in health.ts
Made health check more generic by removing hardcoded region filter:
```typescript
// Before: Hardcoded region
novitaApiService.getProducts({ productName: 'test', region: 'CN-HK-01' })

// After: Generic test
novitaApiService.getProducts({ productName: 'RTX 4090' })
```

### 7. Optimized getOptimalProduct
Removed redundant region filtering since `getProducts()` already filters by region:
```typescript
// Before: Double filtering (redundant)
const validProducts = products.filter(p =>
  p.availability === 'available' &&
  p.spotPrice > 0 &&
  p.region === region  // This was redundant
);

// After: Single filtering (efficient)
const validProducts = products.filter(p =>
  p.availability === 'available' &&
  p.spotPrice > 0
);
```

## Compatibility
The fix maintains backward compatibility with both formats:
- ✅ Old format: `"US-CA-06"` matches `["US-CA-06", "CN-HK-01"]`
- ✅ New format: `"US-CA-06"` matches `["US-CA-06 (California)", "CN-HK-01 (Hong Kong)"]`
- ✅ Mixed format: `"CN-HK-01"` matches `["US-CA-06", "CN-HK-01 (Hong Kong)"]`

## Testing
Added comprehensive tests to verify the fix works with all formats:
- `should filter products by region with old format (region codes only)`
- `should filter products by region with new format (region codes with descriptions)`
- `should handle mixed region formats`

## Files Modified
- `src/services/novitaApiService.ts` - Main region filtering fix and product transformation
- `src/services/jobWorkerService.ts` - Enhanced region to cluster ID mapping
- `src/types/validation.ts` - Expanded valid region list
- `src/services/productService.ts` - Added more regions to fallback configuration
- `src/routes/health.ts` - Made health check more generic
- `src/services/__tests__/novitaApiService.test.ts` - Added tests for new functionality
- `src/examples/regionFilteringExample.ts` - Example demonstrating the fix

## Impact
This comprehensive fix ensures that:
1. Region-based product filtering works correctly with both old and new API response formats
2. Region validation accepts all supported regions
3. Region mapping to cluster IDs is comprehensive and maintainable
4. Health checks are more robust and don't depend on specific regions
5. Fallback region configuration covers more geographic areas

The changes are backward compatible and don't break existing functionality while adding support for the new API response format.