import { templateService } from '../services/templateService';
import { logger } from '../utils/logger';

/**
 * Example demonstrating TemplateService usage
 */
async function demonstrateTemplateService(): Promise<void> {
  try {
    console.log('=== Template Service Example ===\n');

    // Example 1: Fetch a template
    console.log('1. Fetching template configuration...');
    const templateId = 'ubuntu-cuda-template';
    
    try {
      const template = await templateService.getTemplate(templateId);
      console.log('✓ Template fetched successfully:');
      console.log(`  - ID: ${template.id}`);
      console.log(`  - Name: ${template.name}`);
      console.log(`  - Image URL: ${template.imageUrl}`);
      console.log(`  - Image Auth: ${template.imageAuth ? 'Yes' : 'No'}`);
      console.log(`  - Ports: ${template.ports?.length || 0}`);
      console.log(`  - Environment Variables: ${template.envs?.length || 0}`);
      
      if (template.ports && template.ports.length > 0) {
        console.log('  - Port Details:');
        template.ports.forEach((port, index) => {
          console.log(`    ${index + 1}. Port ${port.port} (${port.type})${port.name ? ` - ${port.name}` : ''}`);
        });
      }
      
      if (template.envs && template.envs.length > 0) {
        console.log('  - Environment Variables:');
        template.envs.forEach((env, index) => {
          console.log(`    ${index + 1}. ${env.name}=${env.value}`);
        });
      }
    } catch (error) {
      console.log(`✗ Failed to fetch template: ${(error as Error).message}`);
    }

    console.log('\n2. Extracting template configuration...');
    try {
      const config = await templateService.getTemplateConfiguration(templateId);
      console.log('✓ Configuration extracted:');
      console.log(`  - Image URL: ${config.imageUrl}`);
      console.log(`  - Image Auth: ${config.imageAuth ? 'Present' : 'Not provided'}`);
      console.log(`  - Ports configured: ${config.ports.length}`);
      console.log(`  - Environment variables: ${config.envs.length}`);
    } catch (error) {
      console.log(`✗ Failed to extract configuration: ${(error as Error).message}`);
    }

    // Example 2: Demonstrate caching
    console.log('\n3. Demonstrating caching behavior...');
    const startTime = Date.now();
    
    // First call (will fetch from API)
    try {
      await templateService.getTemplate(templateId);
      const firstCallTime = Date.now() - startTime;
      console.log(`✓ First call completed in ${firstCallTime}ms`);
    } catch (error) {
      console.log(`✗ First call failed: ${(error as Error).message}`);
    }

    // Second call (should use cache)
    const secondCallStart = Date.now();
    try {
      await templateService.getTemplate(templateId);
      const secondCallTime = Date.now() - secondCallStart;
      console.log(`✓ Second call (cached) completed in ${secondCallTime}ms`);
    } catch (error) {
      console.log(`✗ Second call failed: ${(error as Error).message}`);
    }

    // Example 3: Cache management
    console.log('\n4. Cache management...');
    const cacheStats = templateService.getCacheStats();
    console.log(`✓ Cache statistics:`);
    console.log(`  - Templates cached: ${cacheStats.size}`);
    console.log(`  - Cached template IDs: ${cacheStats.cachedTemplateIds.join(', ')}`);

    // Check if template is cached
    const isCached = templateService.isCached(templateId);
    console.log(`  - Template ${templateId} is cached: ${isCached}`);

    // Example 4: Preload template
    console.log('\n5. Preloading template...');
    const preloadTemplateId = 'pytorch-template';
    try {
      await templateService.preloadTemplate(preloadTemplateId);
      console.log(`✓ Template ${preloadTemplateId} preloaded successfully`);
    } catch (error) {
      console.log(`✗ Failed to preload template: ${(error as Error).message}`);
    }

    // Example 5: Error handling
    console.log('\n6. Error handling examples...');
    
    // Invalid template ID
    try {
      await templateService.getTemplate('');
      console.log('✗ Should have failed with empty template ID');
    } catch (error) {
      console.log(`✓ Correctly handled empty template ID: ${(error as Error).message}`);
    }

    // Non-existent template
    try {
      await templateService.getTemplate('non-existent-template');
      console.log('✗ Should have failed with non-existent template');
    } catch (error) {
      console.log(`✓ Correctly handled non-existent template: ${(error as Error).message}`);
    }

    // Example 6: Cache cleanup
    console.log('\n7. Cache cleanup...');
    console.log(`Cache size before cleanup: ${templateService.getCacheStats().size}`);
    
    templateService.clearExpiredCache();
    console.log(`Cache size after expired cleanup: ${templateService.getCacheStats().size}`);
    
    templateService.clearCache();
    console.log(`Cache size after full clear: ${templateService.getCacheStats().size}`);

    console.log('\n=== Template Service Example Complete ===');

  } catch (error) {
    logger.error('Template service example failed:', error);
    console.error('Example failed:', (error as Error).message);
  }
}

// Export for use in other examples or testing
export { demonstrateTemplateService };

// Run example if this file is executed directly
if (require.main === module) {
  demonstrateTemplateService().catch(console.error);
}