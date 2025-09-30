#!/usr/bin/env node

/**
 * Test script to test the stop API directly
 */

const axios = require('axios');

const API_KEY = 'sk_EO1VoTPj0Bwky5zP2XKRHYQTgeM8atcAlX67AMl06Is';
const BASE_URL = 'https://api.novita.ai/gpu-instance/openapi';
const INSTANCE_ID = '3560b7fec915bbf9'; // The actual Novita instance ID

async function testStopApiResponse() {
  try {
    console.log('Testing the stop API response format...');
    
    // Make the stop API call to see the actual response format
    const response = await axios.post(`${BASE_URL}/v1/gpu/instance/stop`, {
      instanceId: INSTANCE_ID
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'novita-gpu-instance-api/1.0.0'
      }
    });
    
    console.log('✅ Stop API Response:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ API call failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

testStopApiResponse();