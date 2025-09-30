#!/usr/bin/env node

/**
 * Test script for the start instance API
 * Usage: node test-start-api.js [instanceId]
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3003';
const instanceId = process.argv[2] || '931a88075c4392b9'; // Default to the first instance from the list

async function checkInstanceStatus() {
  try {
    console.log(`Checking status of instance: ${instanceId}`);
    console.log(`API Base URL: ${API_BASE_URL}`);
    
    const response = await axios.get(`${API_BASE_URL}/api/instances/${instanceId}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `test-status-${Date.now()}`,
        'x-correlation-id': `test-correlation-${Date.now()}`
      }
    });
    
    console.log('✅ Instance status retrieved successfully!');
    console.log('Status:', response.status);
    console.log('Instance Details:', JSON.stringify(response.data, null, 2));
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Failed to get instance status:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    
    return null;
  }
}

async function testStartInstance() {
  try {
    console.log(`\nTesting start instance API for instance: ${instanceId}`);
    
    // Test POST /api/instances/:instanceId/start
    console.log('\n1. Testing POST /api/instances/:instanceId/start');
    
    const response = await axios.post(`${API_BASE_URL}/api/instances/${instanceId}/start`, {
      healthCheckConfig: {
        timeoutMs: 30000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 600000
      },
      webhookUrl: 'https://example.com/webhook' // Optional
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `test-start-${Date.now()}`,
        'x-correlation-id': `test-correlation-${Date.now()}`
      }
    });
    
    console.log('✅ Start request successful!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Start request failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    
    return null;
  }
}

async function testStartInstanceByName() {
  try {
    const instanceName = 'test-instance'; // You can change this to your actual instance name
    
    console.log('\n2. Testing POST /api/instances/start (by name)');
    
    const response = await axios.post(`${API_BASE_URL}/api/instances/start`, {
      instanceName: instanceName,
      healthCheckConfig: {
        timeoutMs: 30000,
        retryAttempts: 3,
        retryDelayMs: 2000,
        maxWaitTimeMs: 600000
      },
      webhookUrl: 'https://example.com/webhook' // Optional
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `test-start-name-${Date.now()}`,
        'x-correlation-id': `test-correlation-name-${Date.now()}`
      }
    });
    
    console.log('✅ Start by name request successful!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Start by name request failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the tests
async function runTests() {
  console.log('🧪 Testing Start Instance API');
  console.log('==============================\n');
  
  // First check the current status
  const instanceDetails = await checkInstanceStatus();
  
  if (instanceDetails) {
    console.log(`\n📊 Current instance status: ${instanceDetails.status}`);
    
    // Check if the instance is in a startable state
    const startableStates = ['stopped', 'exited', 'failed'];
    if (startableStates.includes(instanceDetails.status)) {
      console.log('✅ Instance is in a startable state, proceeding with start test...');
      await testStartInstance();
    } else {
      console.log(`⚠️  Instance is in '${instanceDetails.status}' state, which may not be startable.`);
      console.log('Attempting to start anyway to test the validation...');
      await testStartInstance();
    }
  } else {
    console.log('⚠️  Could not retrieve instance status, attempting start anyway...');
    await testStartInstance();
  }
  
  // Uncomment the line below to test start by name as well
  // await testStartInstanceByName();
  
  console.log('\n✅ Start API endpoint tests completed!');
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { checkInstanceStatus, testStartInstance };