#!/usr/bin/env node

/**
 * Script to update all logger imports to use axiomSafeLogger
 */

const fs = require('fs');
const path = require('path');

// Files to update with their component names
const filesToUpdate = [
  { file: 'src/services/redisBulkOperationsService.ts', component: 'redis-bulk-operations' },
  { file: 'src/services/productService.ts', component: 'product' },
  { file: 'src/services/migrationScheduler.ts', component: 'migration-scheduler' },
  { file: 'src/services/failedMigrationScheduler.ts', component: 'failed-migration-scheduler' },
  { file: 'src/services/serviceInitializer.ts', component: 'service-initializer' },
  { file: 'src/services/instanceMigrationService.ts', component: 'instance-migration' },
  { file: 'src/services/novitaApiService.ts', component: 'novita-api' },
  { file: 'src/services/redisCacheManager.ts', component: 'redis-cache-manager' },
  { file: 'src/services/startupSyncService.ts', component: 'startup-sync' },
  { file: 'src/services/healthCheckerService.ts', component: 'health-checker' },
  { file: 'src/services/jobWorkerService.ts', component: 'job-worker' },
  { file: 'src/services/optimizedRedisCacheService.ts', component: 'optimized-redis-cache' },
  { file: 'src/routes/health.ts', component: 'health-route' },
  { file: 'src/routes/cache.ts', component: 'cache-route' },
  { file: 'src/routes/instances.ts', component: 'instances-route' },
  { file: 'src/middleware/requestLogger.ts', component: 'request-logger' },
  { file: 'src/middleware/errorHandler.ts', component: 'error-handler' },
  { file: 'src/clients/novitaClient.ts', component: 'novita-client' },
  { file: 'src/clients/novitaInternalClient.ts', component: 'novita-internal-client' },
  { file: 'src/clients/webhookClient.ts', component: 'webhook-client' },
  { file: 'src/index.ts', component: 'app' }
];

function updateFile(filePath, componentName) {
  try {
    const fullPath = path.join(__dirname, '..', filePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return false;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let updated = false;

    // Replace direct logger import
    const oldImport = /import\s*{\s*logger\s*}\s*from\s*['"`][^'"`]*utils\/logger['"`];?/g;
    if (oldImport.test(content)) {
      content = content.replace(
        oldImport,
        `import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';\n\nconst logger = createAxiomSafeLogger('${componentName}');`
      );
      updated = true;
    }

    // Replace logger with other imports
    const mixedImport = /import\s*{\s*([^}]*logger[^}]*)\s*}\s*from\s*['"`][^'"`]*utils\/logger['"`];?/g;
    const mixedMatch = mixedImport.exec(content);
    if (mixedMatch) {
      const imports = mixedMatch[1];
      const otherImports = imports.split(',')
        .map(imp => imp.trim())
        .filter(imp => !imp.includes('logger'))
        .join(', ');

      if (otherImports) {
        content = content.replace(
          mixedImport,
          `import { ${otherImports} } from '../utils/logger';\nimport { createAxiomSafeLogger } from '../utils/axiomSafeLogger';\n\nconst logger = createAxiomSafeLogger('${componentName}');`
        );
      } else {
        content = content.replace(
          mixedImport,
          `import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';\n\nconst logger = createAxiomSafeLogger('${componentName}');`
        );
      }
      updated = true;
    }

    if (updated) {
      fs.writeFileSync(fullPath, content);
      console.log(`✅ Updated: ${filePath}`);
      return true;
    } else {
      console.log(`ℹ️  No changes needed: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return false;
  }
}

console.log('🔄 Updating logger imports to use axiomSafeLogger...\n');

let totalUpdated = 0;
let totalProcessed = 0;

for (const { file, component } of filesToUpdate) {
  totalProcessed++;
  if (updateFile(file, component)) {
    totalUpdated++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files processed: ${totalProcessed}`);
console.log(`   Files updated: ${totalUpdated}`);
console.log(`   Files unchanged: ${totalProcessed - totalUpdated}`);

if (totalUpdated > 0) {
  console.log('\n✨ Logger migration completed! The Axiom column limit errors should be resolved.');
  console.log('   All dynamic fields will now be automatically moved to the metadata JSON field.');
} else {
  console.log('\n🤔 No files were updated. They may already be using the safe logger.');
}