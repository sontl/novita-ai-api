#!/usr/bin/env node

/**
 * Test script to stop the instance so we can test start functionality
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3003';
const instanceId = 'inst_1759251488312_sr9vnvu';

async function stopInstance() {
  try {
    console.log(`Stopping instance: ${instanceId}`);
    
    const response = await axios.post(`${API_BASE_URL}/api/instances/${instanceId}/stop`, {}, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `test-stop-${Date.now()}`,
        'x-correlation-id': `test-correlation-${Date.now()}`
      }
    });
    
    console.log('✅ Stop request successful!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Stop request failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

stopInstance();