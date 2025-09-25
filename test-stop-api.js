// Simple test script to verify the stop API endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:3003';

async function testStopAPI() {
  console.log('Testing Stop API endpoints...\n');

  // Test 1: Stop by ID (should fail with instance not found)
  try {
    console.log('1. Testing POST /api/instances/:instanceId/stop');
    const response = await axios.post(`${BASE_URL}/api/instances/test-instance-id/stop`, {
      webhookUrl: 'https://example.com/webhook'
    });
    console.log('✅ Response:', response.status, response.data);
  } catch (error) {
    console.log('❌ Expected error (instance not found):', error.response?.status, error.response?.data?.error?.message);
  }

  // Test 2: Stop by name (should fail with validation error - missing instanceName)
  try {
    console.log('\n2. Testing POST /api/instances/stop (missing instanceName)');
    const response = await axios.post(`${BASE_URL}/api/instances/stop`, {
      webhookUrl: 'https://example.com/webhook'
    });
    console.log('✅ Response:', response.status, response.data);
  } catch (error) {
    console.log('❌ Expected error (missing instanceName):', error.response?.status, error.response?.data?.error?.message);
  }

  // Test 3: Stop by name with instanceName
  try {
    console.log('\n3. Testing POST /api/instances/stop (with instanceName)');
    const response = await axios.post(`${BASE_URL}/api/instances/stop`, {
      instanceName: 'test-instance',
      webhookUrl: 'https://example.com/webhook'
    });
    console.log('✅ Response:', response.status, response.data);
  } catch (error) {
    console.log('❌ Expected error (instance not found):', error.response?.status, error.response?.data?.error?.message);
  }

  // Test 4: Invalid webhook URL
  try {
    console.log('\n4. Testing POST /api/instances/test-id/stop (invalid webhook URL)');
    const response = await axios.post(`${BASE_URL}/api/instances/test-id/stop`, {
      webhookUrl: 'invalid-url'
    });
    console.log('✅ Response:', response.status, response.data);
  } catch (error) {
    console.log('❌ Expected error (invalid webhook URL):', error.response?.status, error.response?.data?.error?.message);
  }

  console.log('\n✅ Stop API endpoint tests completed!');
}

// Run the test if this script is executed directly
if (require.main === module) {
  testStopAPI().catch(console.error);
}

module.exports = { testStopAPI };