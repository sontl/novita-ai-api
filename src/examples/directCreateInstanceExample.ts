/**
 * Example demonstrating the enhanced direct instance creation
 * This example shows how the new implementation provides immediate feedback
 * from the Novita API instead of just queuing a job.
 */

import { instanceService } from '../services/instanceService';
import { CreateInstanceRequest } from '../types/api';

async function demonstrateDirectInstanceCreation() {
  console.log('🚀 Enhanced Instance Creation Example');
  console.log('=====================================');

  const createRequest: CreateInstanceRequest = {
    name: 'direct-api-demo',
    productName: 'RTX 4090 24GB',
    templateId: 'pytorch-jupyter',
    gpuNum: 1,
    rootfsSize: 60,
    region: 'CN-HK-01',
    billingMode: 'spot',
    webhookUrl: 'https://your-app.com/webhook/instance-events'
  };

  try {
    console.log('📝 Creating instance with direct API call...');
    console.log('Request:', JSON.stringify(createRequest, null, 2));

    const startTime = Date.now();
    const result = await instanceService.createInstance(createRequest);
    const duration = Date.now() - startTime;

    console.log('\n✅ Instance created successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log(`⏱️  Total time: ${duration}ms`);

    console.log('\n🔍 Key improvements:');
    console.log('• ✅ Immediate response with actual Novita instance ID');
    console.log('• ✅ Real-time status from Novita API');
    console.log('• ✅ Actual product and pricing information');
    console.log('• ✅ Region fallback handling');
    console.log('• ✅ Direct error feedback (no job queue delays)');
    console.log('• ✅ Webhook notifications sent immediately');

    // Demonstrate getting the instance status
    console.log('\n📊 Getting instance status...');
    const instanceDetails = await instanceService.getInstanceStatus(result.instanceId);
    console.log('Instance details:', JSON.stringify(instanceDetails, null, 2));

  } catch (error) {
    console.error('❌ Instance creation failed:', error);
    
    if (error instanceof Error) {
      console.log('\n🔍 Error details:');
      console.log('• Message:', error.message);
      console.log('• Type:', error.constructor.name);
      
      // Show how errors are now immediately available
      console.log('\n💡 With direct API calls, you get immediate error feedback:');
      console.log('• No waiting for job processing');
      console.log('• Detailed error information from Novita API');
      console.log('• Ability to retry or adjust parameters immediately');
    }
  }
}

// Example of the old vs new flow comparison
function compareOldVsNewFlow() {
  console.log('\n📊 Old vs New Flow Comparison');
  console.log('==============================');

  console.log('\n🔴 OLD FLOW (Job Queue):');
  console.log('1. Validate request');
  console.log('2. Store instance state as "creating"');
  console.log('3. Queue job for background processing');
  console.log('4. Return success (even if job might fail later)');
  console.log('5. Job worker processes creation asynchronously');
  console.log('6. Client has to poll for actual status');
  console.log('7. Errors discovered later during job processing');

  console.log('\n🟢 NEW FLOW (Direct API):');
  console.log('1. Validate request');
  console.log('2. Get optimal product with region fallback');
  console.log('3. Get template configuration');
  console.log('4. Store initial instance state');
  console.log('5. Call Novita API directly');
  console.log('6. Update state with real Novita instance ID');
  console.log('7. Send webhook notification');
  console.log('8. Return complete response with actual data');
  console.log('9. Immediate error feedback if anything fails');

  console.log('\n✨ Benefits of Direct API Approach:');
  console.log('• Faster feedback loop');
  console.log('• Real-time error handling');
  console.log('• Actual instance data in response');
  console.log('• Simplified architecture (no job queue for creation)');
  console.log('• Better user experience');
}

// Run the example
if (require.main === module) {
  demonstrateDirectInstanceCreation()
    .then(() => {
      compareOldVsNewFlow();
      console.log('\n🎉 Example completed!');
    })
    .catch(console.error);
}

export { demonstrateDirectInstanceCreation, compareOldVsNewFlow };