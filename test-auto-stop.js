/**
 * Simple test script to verify the auto-stop functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAutoStopFeature() {
  try {
    console.log('Testing Auto-Stop Feature...\n');

    // 1. Get auto-stop stats
    console.log('1. Getting auto-stop stats...');
    const statsResponse = await axios.get(`${BASE_URL}/api/instances/auto-stop/stats`);
    console.log('Auto-stop stats:', JSON.stringify(statsResponse.data, null, 2));

    // 2. Create a test instance (if you have the necessary configuration)
    console.log('\n2. Creating a test instance...');
    try {
      const createResponse = await axios.post(`${BASE_URL}/api/instances`, {
        name: 'test-auto-stop-instance',
        productName: 'RTX 4090',
        templateId: 'ubuntu-22.04'
      });
      console.log('Instance created:', JSON.stringify(createResponse.data, null, 2));
      
      const instanceId = createResponse.data.instanceId;

      // 3. Update last used time
      console.log('\n3. Updating last used time...');
      const updateResponse = await axios.put(`${BASE_URL}/api/instances/${instanceId}/last-used`, {
        lastUsedAt: new Date().toISOString()
      });
      console.log('Last used time updated:', JSON.stringify(updateResponse.data, null, 2));

      // 4. Get instance details to verify last used time
      console.log('\n4. Getting instance details...');
      const detailsResponse = await axios.get(`${BASE_URL}/api/instances/${instanceId}`);
      console.log('Instance details:', JSON.stringify(detailsResponse.data, null, 2));

    } catch (createError) {
      console.log('Instance creation failed (expected if no valid configuration):', createError.response?.data || createError.message);
    }

    // 5. Trigger manual auto-stop check (dry run)
    console.log('\n5. Triggering manual auto-stop check (dry run)...');
    const triggerResponse = await axios.post(`${BASE_URL}/api/instances/auto-stop/trigger`, {
      dryRun: true
    });
    console.log('Auto-stop check triggered:', JSON.stringify(triggerResponse.data, null, 2));

    console.log('\n✅ Auto-stop feature test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAutoStopFeature();