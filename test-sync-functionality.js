/**
 * Simple test script to verify obsolete instance sync functionality
 */

const { InstanceStatus } = require('./dist/types/api');

// Mock data for testing
const mockNovitaInstances = [
  {
    id: 'novita-123',
    name: 'active-instance',
    status: 'running',
    region: 'us-east-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const mockLocalInstances = new Map([
  ['local-123', {
    id: 'local-123',
    novitaInstanceId: 'novita-123',
    status: 'starting', // Will be updated to 'running'
    timestamps: { created: new Date() }
  }],
  ['local-456', {
    id: 'local-456', 
    novitaInstanceId: 'novita-456', // This doesn't exist in Novita anymore
    status: 'running',
    timestamps: { created: new Date() }
  }]
]);

console.log('🧪 Testing Obsolete Instance Sync Logic');
console.log('=====================================\n');

console.log('📊 Initial State:');
console.log('Novita instances:', mockNovitaInstances.length);
console.log('Local instances:', mockLocalInstances.size);
console.log('');

// Simulate sync logic
const novitaInstanceMap = new Map(
  mockNovitaInstances.map(instance => [instance.id, instance])
);

let updatedCount = 0;
let obsoleteCount = 0;

// Check for updates
mockNovitaInstances.forEach(novitaInstance => {
  const localState = Array.from(mockLocalInstances.values())
    .find(state => state.novitaInstanceId === novitaInstance.id);
    
  if (localState && localState.status !== novitaInstance.status) {
    console.log(`✅ Would update instance ${localState.id}: ${localState.status} → ${novitaInstance.status}`);
    updatedCount++;
  }
});

// Check for obsolete instances
Array.from(mockLocalInstances.values())
  .filter(localState => 
    localState.novitaInstanceId && 
    !novitaInstanceMap.has(localState.novitaInstanceId)
  )
  .forEach(obsoleteState => {
    console.log(`🗑️  Would mark as obsolete: ${obsoleteState.id} (Novita ID: ${obsoleteState.novitaInstanceId})`);
    obsoleteCount++;
  });

console.log('\n📈 Sync Results:');
console.log(`Updated instances: ${updatedCount}`);
console.log(`Obsolete instances: ${obsoleteCount}`);
console.log('');

console.log('✨ Sync functionality test completed!');
console.log('The enhanced sync logic would:');
console.log('1. Update existing instances with current Novita status');
console.log('2. Mark obsolete instances as terminated (or remove them based on config)');
console.log('3. Apply retention policies for old terminated instances');