#!/usr/bin/env node

/**
 * Test script to verify the novitaApiService.startInstance fix
 */

const axios = require('axios');

const API_KEY = 'sk_EO1VoTPj0Bwky5zP2XKRHYQTgeM8atcAlX67AMl06Is';
const BASE_URL = 'https://api.novita.ai/gpu-instance/openapi';
const INSTANCE_ID = '3560b7fec915bbf9'; // The actual Novita instance ID

async function testStartApiResponse() {
  try {
    console.log('Testing the start API response format...');
    
    // Make the start API call to see the actual response format
    const response = await axios.post(`${BASE_URL}/v1/gpu/instance/start`, {
      instanceId: INSTANCE_ID
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'novita-gpu-instance-api/1.0.0'
      }
    });
    
    console.log('✅ Start API Response:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    // Test our expected response handling
    const startResponse = response.data;
    
    if (!startResponse || !startResponse.instanceId) {
      console.log('❌ Response validation would fail: missing instanceId');
      return;
    }
    
    console.log('✅ Response validation would pass');
    console.log('Instance ID:', startResponse.instanceId);
    console.log('State:', startResponse.state);
    
    // Now test getting the full instance details
    console.log('\nTesting getInstance call...');
    const getResponse = await axios.get(`${BASE_URL}/v1/gpu/instance`, {
      params: { instanceId: startResponse.instanceId },
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'novita-gpu-instance-api/1.0.0'
      }
    });
    
    console.log('✅ getInstance Response:');
    console.log('Status:', getResponse.status);
    console.log('Instance Status:', getResponse.data.status);
    console.log('Instance Name:', getResponse.data.name);
    
  } catch (error) {
    console.error('❌ API call failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      
      // Check if it's the expected "invalid state change" error
      if (error.response.status === 400 && 
          error.response.data.message === 'invalid state change') {
        console.log('\n✅ This is expected - instance is already starting/running');
        console.log('The fix should handle this by catching the error and returning appropriate response');
      }
    } else {
      console.error('Error:', error.message);
    }
  }
}

testStartApiResponse();