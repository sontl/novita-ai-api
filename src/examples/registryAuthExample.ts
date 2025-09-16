/**
 * Example demonstrating registry authentication functionality
 * 
 * This example shows how the system handles Docker registry authentication
 * when creating instances with private images.
 */

import { novitaApiService } from '../services/novitaApiService';
import { templateService } from '../services/templateService';
import { logger } from '../utils/logger';

async function demonstrateRegistryAuth() {
  try {
    // Example 1: Template with registry authentication
    const templateWithAuth = {
      id: 'custom-template',
      name: 'Private PyTorch Environment',
      imageUrl: 'registry.company.com/ai/pytorch:latest',
      imageAuth: 'registry_auth_123', // This ID will be used to fetch credentials
      ports: [
        { port: 8888, type: 'http' as const, name: 'jupyter' },
        { port: 22, type: 'tcp' as const, name: 'ssh' }
      ],
      envs: [
        { name: 'JUPYTER_TOKEN', value: 'secure_token' },
        { name: 'CUDA_VISIBLE_DEVICES', value: '0' }
      ],
      description: 'Custom PyTorch environment with private image'
    };

    console.log('Template configuration:');
    console.log(JSON.stringify(templateWithAuth, null, 2));
    console.log('');

    // Example 2: Fetching registry authentication credentials
    console.log('Fetching registry authentication credentials...');
    
    try {
      const registryAuth = await novitaApiService.getRegistryAuth('registry_auth_123');
      console.log('Registry authentication found:');
      console.log(`- Username: ${registryAuth.username}`);
      console.log(`- Password: ${'*'.repeat(registryAuth.password.length)}`);
      console.log(`- Combined format: ${registryAuth.username}:${'*'.repeat(registryAuth.password.length)}`);
      console.log('');
    } catch (error) {
      console.error('Failed to fetch registry authentication:', error);
      return;
    }

    // Example 3: Instance creation request with authentication
    const createInstanceRequest = {
      name: 'private-pytorch-instance',
      productId: 'rtx4090-hk',
      gpuNum: 1,
      rootfsSize: 100,
      imageUrl: templateWithAuth.imageUrl,
      imageAuth: 'dockeruser:dockerpass', // This would be set by the system
      kind: 'gpu' as const,
      billingMode: 'spot' as const,
      ports: '8888/http,22/tcp',
      envs: templateWithAuth.envs
    };

    console.log('Instance creation request with registry auth:');
    console.log(JSON.stringify({
      ...createInstanceRequest,
      imageAuth: 'username:****** (hidden for security)'
    }, null, 2));
    console.log('');

    // Example 4: Workflow explanation
    console.log('Registry Authentication Workflow:');
    console.log('1. Template specifies imageAuth ID (e.g., "registry_auth_123")');
    console.log('2. System calls GET /v1/repository/auths to fetch all credentials');
    console.log('3. Find credentials by matching the auth ID');
    console.log('4. Extract username and password from the response');
    console.log('5. Format as "username:password" for the imageAuth field');
    console.log('6. Include in instance creation request to Novita.ai');
    console.log('');

    console.log('Benefits:');
    console.log('- Supports private Docker registries');
    console.log('- Secure credential management via Novita.ai API');
    console.log('- No need to store credentials in templates');
    console.log('- Automatic credential resolution during instance creation');

  } catch (error) {
    logger.error('Registry auth example failed:', error);
    console.error('Example failed:', error);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  demonstrateRegistryAuth();
}

export { demonstrateRegistryAuth };