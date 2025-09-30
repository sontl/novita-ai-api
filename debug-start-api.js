#!/usr/bin/env node

/**
 * Debug script to test the Novita API start endpoint directly
 */

const axios = require('axios');

const API_KEY = 'sk_EO1VoTPj0Bwky5zP2XKRHYQTgeM8atcAlX67AMl06Is';
const BASE_URL = 'https://api.novita.ai/gpu-instance/openapi';
const INSTANCE_ID = '3560b7fec915bbf9'; // The actual Novita instance ID

async function testDirectApiCall() {
  try {
    console.log('Testing direct API call to Novita...');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Instance ID: ${INSTANCE_ID}`);
    
    // First, let's get the instance details to see its current state
    console.log('\n1. Getting instance details...');
    const getResponse = await axios.get(`${BASE_URL}/v1/gpu/instance`, {
      params: { instanceId: INSTANCE_ID },
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'novita-gpu-instance-api/1.0.0'
      }
    });
    
    console.log('Instance details:', JSON.stringify(getResponse.data, null, 2));
    
    // Now try to start the instance
    console.log('\n2. Attempting to start instance...');
    const startResponse = await axios.post(`${BASE_URL}/v1/gpu/instance/start`, {
      instanceId: INSTANCE_ID
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'novita-gpu-instance-api/1.0.0'
      }
    });
    
    console.log('✅ Start successful!');
    console.log('Response:', JSON.stringify(startResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ API call failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testDirectApiCall();