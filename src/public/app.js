let refreshInterval;

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing dashboard'); // Debug log
    
    // Attach event listeners to buttons
    document.getElementById('refresh-data-btn').addEventListener('click', refreshData);
    document.getElementById('sync-instances-btn').addEventListener('click', syncInstances);
    document.getElementById('clear-cache-btn').addEventListener('click', clearCache);
    document.getElementById('stop-all-instances-btn').addEventListener('click', stopAllInstances);
    document.getElementById('hard-reset-btn').addEventListener('click', hardReset);
    
    refreshData();
    // Auto-refresh every 30 seconds
    refreshInterval = setInterval(refreshData, 30000);
});

async function refreshData() {
    const indicator = document.getElementById('refresh-indicator');
    indicator.classList.add('active', 'spinning');
    
    try {
        await Promise.all([
            loadHealthStats(),
            loadInstances()
        ]);
        showSuccess('Data refreshed successfully');
    } catch (error) {
        showError('Failed to refresh data: ' + error.message);
    } finally {
        indicator.classList.remove('active', 'spinning');
    }
}

async function loadHealthStats() {
    try {
        const response = await fetch('/health');
        const data = await response.json();
        
        document.getElementById('cache-status').textContent = 
            data.redis?.healthy ? 'Healthy' : 'Disconnected';
        
        if (data.sync) {
            document.getElementById('last-sync').textContent = 
                data.sync.lastSync ? new Date(data.sync.lastSync).toLocaleTimeString() : 'Never';
        }
    } catch (error) {
        console.error('Failed to load health stats:', error);
    }
}

async function loadInstances() {
    const loading = document.getElementById('loading');
    const table = document.getElementById('instances-table');
    
    loading.style.display = 'block';
    table.style.display = 'none';
    
    try {
        const response = await fetch('/api/instances');
        const data = await response.json();
        
        const instances = data.instances || [];
        
        // Update stats
        document.getElementById('total-instances').textContent = instances.length;
        document.getElementById('running-instances').textContent = 
            instances.filter(i => i.status === 'running').length;
        
        // Update table
        const tbody = document.getElementById('instances-tbody');
        tbody.innerHTML = '';
        
        instances.forEach(instance => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${instance.name}</td>
                <td><span class="status-badge status-${instance.status.toLowerCase()}">${instance.status}</span></td>
                <td>${instance.region}</td>
                <td>${instance.productName || 'Unknown'}</td>
                <td>${new Date(instance.createdAt).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-secondary" onclick="manageInstance('${instance.id}', '${instance.status}')">
                        ${instance.status === 'running' ? 'Stop' : 'Start'}
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        loading.style.display = 'none';
        table.style.display = 'table';
        
    } catch (error) {
        loading.style.display = 'none';
        showError('Failed to load instances: ' + error.message);
    }
}

async function syncInstances() {
    try {
        showSuccess('Synchronizing with Novita.ai...');
        const response = await fetch('/api/instances/sync', { method: 'POST' });
        const data = await response.json();
        
        if (response.ok) {
            showSuccess(`Sync completed: ${data.synchronized} synchronized, ${data.deleted} deleted`);
            await refreshData();
        } else {
            showError('Sync failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        showError('Sync failed: ' + error.message);
    }
}

async function clearCache() {
    if (!confirm('Are you sure you want to clear the cache?')) return;
    
    try {
        const response = await fetch('/api/cache/clear', { method: 'POST' });
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('Cache cleared successfully');
            await refreshData();
        } else {
            showError('Failed to clear cache: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        showError('Failed to clear cache: ' + error.message);
    }
}

async function stopAllInstances() {
    if (!confirm('Are you sure you want to stop ALL running instances?')) return;
    
    try {
        const response = await fetch('/api/instances/stop-all', { method: 'POST' });
        const data = await response.json();
        
        if (response.ok) {
            showSuccess(`Stop initiated for ${data.count} instances`);
            await refreshData();
        } else {
            showError('Failed to stop instances: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        showError('Failed to stop instances: ' + error.message);
    }
}

async function manageInstance(instanceId, currentStatus) {
    const action = currentStatus === 'running' ? 'stop' : 'start';
    
    try {
        const response = await fetch(`/api/instances/${instanceId}/${action}`, { method: 'POST' });
        const data = await response.json();
        
        if (response.ok) {
            showSuccess(`Instance ${action} initiated successfully`);
            await refreshData();
        } else {
            showError(`Failed to ${action} instance: ` + (data.message || 'Unknown error'));
        }
    } catch (error) {
        showError(`Failed to ${action} instance: ` + error.message);
    }
}

async function hardReset() {
    console.log('Hard Reset function called'); // Debug log
    if (!confirm('WARNING: This will delete ALL data from the Redis database. This action cannot be undone. Are you sure you want to proceed?')) {
        console.log('Hard Reset cancelled by user'); // Debug log
        return;
    }
    
    console.log('Hard Reset confirmed by user'); // Debug log
    try {
        const response = await fetch('/api/cache/hard-reset', { method: 'POST' });
        const data = await response.json();
        console.log('Hard Reset API response:', data); // Debug log
        
        if (response.ok) {
            showSuccess('Hard reset completed successfully. All Redis data has been deleted.');
            await refreshData();
        } else {
            showError('Hard reset failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Hard Reset error:', error); // Debug log
        showError('Hard reset failed: ' + error.message);
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    
    successDiv.style.display = 'none';
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    
    errorDiv.style.display = 'none';
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    
    setTimeout(() => {
        successDiv.style.display = 'none';
    }, 3000);
}