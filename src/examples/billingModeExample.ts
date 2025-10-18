/**
 * Example demonstrating different billing modes for instance creation
 */

import { CreateInstanceRequest } from '../types/api';
import { createAxiomSafeLogger } from '../utils/axiomSafeLogger';

const logger = createAxiomSafeLogger('billing-mode-example');

async function demonstrateBillingModes(): Promise<void> {
  logger.info('Starting billing mode demonstration');

  // Example 1: Spot instance (cost-optimized, may be interrupted)
  const spotInstanceRequest: CreateInstanceRequest = {
    name: 'spot-training-instance',
    productName: 'RTX 4090 24GB',
    templateId: 'pytorch-template',
    gpuNum: 1,
    rootfsSize: 60,
    region: 'CN-HK-01',
    billingMode: 'spot', // Lower cost, but may be interrupted
    webhookUrl: 'https://example.com/webhook'
  };

  logger.info('Spot instance configuration', {
    name: spotInstanceRequest.name,
    billingMode: spotInstanceRequest.billingMode,
    benefits: 'Lower cost, suitable for fault-tolerant workloads',
    considerations: 'May be interrupted when demand is high'
  });

  // Example 2: On-demand instance (guaranteed availability)
  const onDemandInstanceRequest: CreateInstanceRequest = {
    name: 'production-inference-instance',
    productName: 'RTX 4090 24GB',
    templateId: 'inference-template',
    gpuNum: 2,
    rootfsSize: 100,
    region: 'CN-HK-01',
    billingMode: 'onDemand', // Higher cost, but guaranteed availability
    webhookUrl: 'https://example.com/webhook'
  };

  logger.info('On-demand instance configuration', {
    name: onDemandInstanceRequest.name,
    billingMode: onDemandInstanceRequest.billingMode,
    benefits: 'Guaranteed availability, no interruptions',
    considerations: 'Higher cost than spot instances'
  });

  // Example 3: Default billing mode (spot if not specified)
  const defaultInstanceRequest: CreateInstanceRequest = {
    name: 'default-instance',
    productName: 'RTX 4090 24GB',
    templateId: 'general-template',
    gpuNum: 1,
    rootfsSize: 60,
    region: 'CN-HK-01'
    // billingMode not specified - defaults to 'spot'
  };

  logger.info('Default instance configuration', {
    name: defaultInstanceRequest.name,
    billingMode: 'spot (default)',
    note: 'When billingMode is not specified, it defaults to spot pricing'
  });

  // Example API request bodies
  logger.info('Example API request bodies:');
  
  console.log('\n1. Spot Instance Request:');
  console.log(JSON.stringify(spotInstanceRequest, null, 2));
  
  console.log('\n2. On-Demand Instance Request:');
  console.log(JSON.stringify(onDemandInstanceRequest, null, 2));
  
  console.log('\n3. Default Instance Request (spot):');
  console.log(JSON.stringify(defaultInstanceRequest, null, 2));

  // Usage recommendations
  logger.info('Billing mode recommendations', {
    spot: {
      useCases: ['Training jobs', 'Batch processing', 'Development/testing', 'Fault-tolerant workloads'],
      benefits: ['Cost savings up to 70%', 'Good for non-critical workloads'],
      considerations: ['May be interrupted', 'Need to handle interruptions gracefully']
    },
    onDemand: {
      useCases: ['Production inference', 'Critical workloads', 'Real-time applications', 'SLA-dependent services'],
      benefits: ['Guaranteed availability', 'Predictable performance', 'No interruptions'],
      considerations: ['Higher cost', 'Fixed pricing']
    }
  });

  logger.info('Billing mode demonstration completed');
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateBillingModes().catch(error => {
    logger.error('Billing mode demonstration failed', { error: error.message });
    process.exit(1);
  });
}

export { demonstrateBillingModes };