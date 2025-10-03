/**
 * Example demonstrating the template API response transformation
 * 
 * This example shows how the actual Novita API response is transformed
 * into our standardized Template interface.
 */

import { novitaApiService } from '../services/novitaApiService';
import { templateService } from '../services/templateService';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('example');

async function demonstrateTemplateApiResponse() {
  try {
    logger.info('Template API Response Transformation Example');
    logger.info('==============================================');

    // Example of actual API response structure from Novita
    const exampleApiResponse = {
      template: {
        Id: "107672",
        user: "6ef17efc-78b0-4c6d-ad53-1ab4b93973df",
        name: "Wan2.2-14B-lightx2v-fix-slow-motion",
        readme: "",
        logo: "",
        type: "instance",
        channel: "private",
        image: "ghcr.io/sontl/wan2.2-14b-loras-v1:latest",
        imageAuth: "ff4b1884-4dbc-4ea0-9a90-9f5d191a3d11",
        startCommand: "",
        rootfsSize: 60,
        volumes: [],
        ports: [
          {
            type: "http",
            ports: [80, 8188, 8189]
          }
        ],
        envs: [
          {
            key: "TORCH_INDUCTOR_FORCE_DISABLE_FP8",
            value: "1"
          },
          {
            key: "CUDA_VISIBLE_DEVICES",
            value: "0"
          },
          {
            key: "ENABLE_FAST_DOWNLOAD",
            value: "true"
          }
        ],
        tools: [],
        createdAt: "1756959094",
        creator: "",
        uuid: "6ef17efc-78b0-4c6d-ad53-1ab4b93973df",
        isUsed: false,
        description: "",
        collectNum: "0",
        isCollected: false,
        complaintNum: "0",
        updatedAt: "1756959139",
        nickname: "tranlamson"
      }
    };

    logger.info('Original API Response Structure:');
    logger.info('- Response has "template" wrapper (not "success" + "data")');
    logger.info('- Template ID is in "Id" field (capital I)');
    logger.info('- Image URL is in "image" field');
    logger.info('- Ports are grouped by type with array of port numbers');
    logger.info('- Environment variables use "key" instead of "name"');

    // Our transformation converts this to:
    const transformedTemplate = {
      id: "107672",                                          // Id -> id
      name: "Wan2.2-14B-lightx2v-fix-slow-motion",
      imageUrl: "ghcr.io/sontl/wan2.2-14b-loras-v1:latest", // image -> imageUrl
      imageAuth: "ff4b1884-4dbc-4ea0-9a90-9f5d191a3d11",
      ports: [                                               // Flattened port structure
        { port: 80, type: "http" },
        { port: 8188, type: "http" },
        { port: 8189, type: "http" }
      ],
      envs: [                                                // key -> name
        { name: "TORCH_INDUCTOR_FORCE_DISABLE_FP8", value: "1" },
        { name: "CUDA_VISIBLE_DEVICES", value: "0" },
        { name: "ENABLE_FAST_DOWNLOAD", value: "true" }
      ],
      description: ""
    };

    logger.info('\nTransformed Template Structure:');
    logger.info('- Standardized "id" field');
    logger.info('- Consistent "imageUrl" field name');
    logger.info('- Flattened ports array with individual port objects');
    logger.info('- Standardized environment variable "name" field');

    // Example usage with both services
    logger.info('\nUsage Examples:');
    
    // Using novitaApiService directly (with transformation)
    logger.info('1. Direct API service usage:');
    logger.info('   const template = await novitaApiService.getTemplate("107672");');
    
    // Using templateService (with caching)
    logger.info('2. Template service usage (with caching):');
    logger.info('   const template = await templateService.getTemplate(107672);');
    logger.info('   const config = await templateService.getTemplateConfiguration(107672);');

    // Demonstrate numeric vs string ID support
    logger.info('\nID Format Support:');
    logger.info('- String IDs: "107672"');
    logger.info('- Numeric IDs: 107672');
    logger.info('- Both are converted to string for API calls');

    logger.info('\nExample completed successfully!');

  } catch (error) {
    logger.error('Example failed:', error);
    throw error;
  }
}

// Export for use in other examples or tests
export { demonstrateTemplateApiResponse };

// Run if called directly
if (require.main === module) {
  demonstrateTemplateApiResponse().catch(console.error);
}