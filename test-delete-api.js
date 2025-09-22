#!/usr/bin/env node

/**
 * Test script for the delete instance API
 * Usage: node test-delete-api.js [instanceId]
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const instanceId = process.argv[2];

if (!instanceId) {
  console.error('Usage: node test-delete-api.js <instanceId>');
  process.exit(1);
}

async function testDeleteInstance() {
  try {
    console.log(`Testing delete instance API for instance: ${instanceId}`);
    console.log(`API Base URL: ${API_BASE_URL}`);
    
    // Test DELETE /api/instances/:instanceId
    console.log('\n1. Testing DELETE /api/instances/:instanceId');
    
    const response = await axios.delete(`${API_BASE_URL}/api/instances/${instanceId}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `test-delete-${Date.now()}`,
        'x-correlation-id': `test-correlation-${Date.now()}`
      },
      data: {
        webhookUrl: 'https://example.com/webhook' // Optional
      }
    });
    
    console.log('✅ Delete request successful!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Delete request failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    
    process.exit(1);
  }
}

async function testDeleteInstanceByName() {
  try {
    const instanceName = instanceId; // Use the provided ID as name for this test
    
    console.log('\n2. Testing POST /api/instances/delete (by name)');
    
    const response = await axios.post(`${API_BASE_URL}/api/instances/delete`, {
      instanceName: instanceName,
      webhookUrl: 'https://example.com/webhook' // Optional
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `test-delete-name-${Date.now()}`,
        'x-correlation-id': `test-correlation-name-${Date.now()}`
      }
    });
    
    console.log('✅ Delete by name request successful!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Delete by name request failed:');
    
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
  await testDeleteInstance();
  // Uncomment the line below to test delete by name as well
  // await testDeleteInstanceByName();
}

runTests();