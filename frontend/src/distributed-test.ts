import "./index.css";

// Cấu hình các node
const NODES = [
    { id: 1, name: "Node 1 (Primary)", url: "http://10.8.0.10:27017", type: "primary" },
    { id: 2, name: "Node 2", url: "http://10.8.0.14:27017", type: "secondary" },
    { id: 3, name: "Node 3", url: "http://10.8.0.15:27017", type: "secondary" },
];

interface TestResult {
    node: string;
    success: boolean;
    data?: any;
    error?: string;
    latency?: number;
    timestamp?: string;
}

// Utility functions
async function requestNode(nodeUrl: string, path: string, opts: RequestInit = {}): Promise<any> {
    const startTime = performance.now();
    try {
        const res = await fetch(nodeUrl + path, {
            headers: { "Content-Type": "application/json" },
            ...opts,
        });
        const data = await res.json();
        const latency = Math.round(performance.now() - startTime);
        return { success: true, data, latency, timestamp: new Date().toISOString() };
    } catch (error: any) {
        const latency = Math.round(performance.now() - startTime);
        return { success: false, error: error.message, latency, timestamp: new Date().toISOString() };
    }
}

function displayResults(containerId: string, results: TestResult[]) {
    const container = document.getElementById(containerId)!;
    container.innerHTML = results.map((r, i) => `
        <div class="border rounded p-3 ${r.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
            <div class="flex justify-between items-start mb-2">
                <span class="font-semibold">${r.node}</span>
                <span class="text-xs ${r.success ? 'text-green-600' : 'text-red-600'}">
                    ${r.success ? '✓ Success' : '✗ Failed'} - ${r.latency}ms
                </span>
            </div>
            ${r.success 
                ? `<pre class="text-xs bg-white p-2 rounded overflow-auto max-h-40">${JSON.stringify(r.data, null, 2)}</pre>`
                : `<div class="text-red-600 text-sm">${r.error}</div>`
            }
            <div class="text-xs text-gray-500 mt-1">${r.timestamp}</div>
        </div>
    `).join('');
}

function addLog(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    const logContainer = document.getElementById('activity-log')!;
    const colorClass = {
        info: 'text-gray-700',
        success: 'text-green-600',
        error: 'text-red-600',
        warning: 'text-amber-600'
    }[type];
    
    const entry = document.createElement('div');
    entry.className = `text-xs ${colorClass} py-1 border-b`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.insertBefore(entry, logContainer.firstChild);
    
    // Giữ tối đa 50 log entries
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild!);
    }
}

// Test functions
async function testHealthAllNodes() {
    addLog('Testing health check on all nodes...', 'info');
    const results: TestResult[] = [];
    
    for (const node of NODES) {
        addLog(`Checking ${node.name}...`, 'info');
        const result = await requestNode(node.url, '/health');
        results.push({
            node: node.name,
            ...result
        });
    }
    
    displayResults('health-results', results);
    const successCount = results.filter(r => r.success).length;
    addLog(`Health check complete: ${successCount}/${NODES.length} nodes online`, 
           successCount === NODES.length ? 'success' : 'warning');
}

async function testDistributedQuery() {
    addLog('Starting distributed query test...', 'info');
    const productId = Number((document.getElementById('test-pid') as HTMLInputElement).value || 101);
    const results: TestResult[] = [];
    
    // Query all nodes in parallel
    const promises = NODES.map(async (node) => {
        addLog(`Querying ${node.name} for product ${productId}...`, 'info');
        const result = await requestNode(node.url, `/products/${productId}/summary?read_from=secondary`);
        return {
            node: node.name,
            ...result
        };
    });
    
    const allResults = await Promise.all(promises);
    displayResults('distributed-query-results', allResults);
    
    // Compare results
    const successResults = allResults.filter(r => r.success);
    if (successResults.length > 1) {
        const dataMatch = successResults.every((r, i) => 
            i === 0 || JSON.stringify(r.data?.data) === JSON.stringify(successResults[0].data?.data)
        );
        addLog(`Data consistency: ${dataMatch ? 'CONSISTENT ✓' : 'INCONSISTENT ✗'}`, 
               dataMatch ? 'success' : 'error');
    }
    
    const avgLatency = Math.round(successResults.reduce((sum, r) => sum + (r.latency || 0), 0) / successResults.length);
    addLog(`Average latency: ${avgLatency}ms across ${successResults.length} nodes`, 'info');
}

async function testLocalVsDistributed() {
    addLog('Comparing local vs distributed queries...', 'info');
    const productId = Number((document.getElementById('test-pid') as HTMLInputElement).value || 101);
    
    // Local query (primary only)
    addLog('Running local query on primary node...', 'info');
    const localStart = performance.now();
    const localResult = await requestNode(NODES[0].url, `/products/${productId}/summary?read_from=primary`);
    const localTime = performance.now() - localStart;
    
    // Distributed query (all nodes)
    addLog('Running distributed query on all nodes...', 'info');
    const distStart = performance.now();
    const distPromises = NODES.map(node => 
        requestNode(node.url, `/products/${productId}/summary?read_from=secondary`)
    );
    const distResults = await Promise.all(distPromises);
    const distTime = performance.now() - distStart;
    
    const comparison = [
        {
            node: 'Local Query (Primary Node)',
            success: localResult.success,
            data: localResult.data,
            latency: Math.round(localTime),
            timestamp: localResult.timestamp
        },
        {
            node: `Distributed Query (${NODES.length} nodes)`,
            success: distResults.every(r => r.success),
            data: { nodes: distResults.map(r => ({ success: r.success, latency: r.latency })) },
            latency: Math.round(distTime),
            timestamp: new Date().toISOString()
        }
    ];
    
    displayResults('comparison-results', comparison);
    addLog(`Local: ${Math.round(localTime)}ms | Distributed: ${Math.round(distTime)}ms`, 'info');
}

async function testTransactionOnMultipleNodes() {
    addLog('Testing distributed transaction...', 'info');
    const userId = 1;
    const productId = Number((document.getElementById('test-pid') as HTMLInputElement).value || 101);
    
    const orderBody = {
        userId,
        items: [{ productId, quantity: 2, price: 15.99 }]
    };
    
    const results: TestResult[] = [];
    
    // Create order on primary
    addLog('Creating order on primary node...', 'info');
    const orderResult = await requestNode(NODES[0].url, '/orders', {
        method: 'POST',
        body: JSON.stringify(orderBody)
    });
    results.push({ node: 'Primary - Create Order', ...orderResult });
    
    if (orderResult.success) {
        const orderId = orderResult.data.data.orderId;
        addLog(`Order ${orderId} created successfully`, 'success');
        
        // Pay on secondary node (if available)
        if (NODES.length > 1) {
            addLog(`Attempting payment on ${NODES[1].name}...`, 'info');
            const payResult = await requestNode(NODES[1].url, `/orders/${orderId}/pay`, {
                method: 'POST',
                body: JSON.stringify({ amount: 31.98, provider: 'VNPAY' })
            });
            results.push({ node: 'Secondary - Payment', ...payResult });
        }
        
        // Verify on all nodes
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for replication
        
        for (const node of NODES) {
            const verifyResult = await requestNode(node.url, '/health');
            results.push({ node: `${node.name} - Verify`, ...verifyResult });
        }
    }
    
    displayResults('transaction-results', results);
    addLog('Distributed transaction test complete', 'info');
}

async function testReplicationSync() {
    addLog('Testing data replication and sync...', 'info');
    const productId = Number((document.getElementById('test-pid') as HTMLInputElement).value || 101);
    
    // Write data on primary
    addLog('Writing review on primary node...', 'info');
    const writeResult = await requestNode(NODES[0].url, '/reviews', {
        method: 'POST',
        body: JSON.stringify({
            productId,
            rating: 5.0,
            comment: `Replication test ${Date.now()}`,
            orderId: null
        })
    });
    
    const results: TestResult[] = [
        { node: 'Primary - Write Review', ...writeResult }
    ];
    
    if (writeResult.success) {
        addLog('Review written, waiting for replication...', 'info');
        
        // Wait for replication (configurable delay)
        const delays = [0, 1000, 2000, 5000];
        
        for (const delay of delays) {
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                addLog(`Checking after ${delay}ms...`, 'info');
            }
            
            // Read from secondary nodes
            for (let i = 1; i < NODES.length; i++) {
                const readResult = await requestNode(
                    NODES[i].url, 
                    `/products/${productId}/summary?read_from=secondary`
                );
                results.push({
                    node: `${NODES[i].name} - Read (after ${delay}ms)`,
                    ...readResult
                });
            }
        }
    }
    
    displayResults('replication-results', results);
    addLog('Replication sync test complete', 'info');
}

async function testNodeFailover() {
    addLog('Testing node failover...', 'info');
    
    // Step down primary
    addLog('Triggering primary node step down...', 'warning');
    const stepDownResult = await requestNode(NODES[0].url, '/admin/stepdown', {
        method: 'POST',
        body: JSON.stringify({ seconds: 10 })
    });
    
    const results: TestResult[] = [
        { node: 'Trigger Failover', ...stepDownResult }
    ];
    
    // Test connectivity during failover
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        addLog(`Testing connectivity (attempt ${i + 1}/5)...`, 'info');
        
        for (const node of NODES) {
            const healthResult = await requestNode(node.url, '/health');
            results.push({
                node: `${node.name} - Health Check #${i + 1}`,
                ...healthResult
            });
        }
    }
    
    displayResults('failover-results', results);
    addLog('Failover test complete', 'info');
}

async function stressTest() {
    addLog('Starting stress test...', 'warning');
    const iterations = Number((document.getElementById('stress-iterations') as HTMLInputElement).value || 10);
    const productId = Number((document.getElementById('test-pid') as HTMLInputElement).value || 101);
    
    const startTime = performance.now();
    const results: any[] = [];
    
    for (let i = 0; i < iterations; i++) {
        const nodeIndex = i % NODES.length;
        const node = NODES[nodeIndex];
        
        const result = await requestNode(node.url, `/products/${productId}/summary`);
        results.push(result);
        
        if ((i + 1) % 5 === 0) {
            addLog(`Completed ${i + 1}/${iterations} requests...`, 'info');
        }
    }
    
    const totalTime = performance.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const avgLatency = Math.round(results.reduce((sum, r) => sum + (r.latency || 0), 0) / results.length);
    
    const summary: TestResult[] = [
        {
            node: 'Stress Test Summary',
            success: true,
            data: {
                totalRequests: iterations,
                successfulRequests: successCount,
                failedRequests: iterations - successCount,
                totalTime: Math.round(totalTime) + 'ms',
                avgLatency: avgLatency + 'ms',
                requestsPerSecond: Math.round((iterations / totalTime) * 1000),
                successRate: Math.round((successCount / iterations) * 100) + '%'
            },
            latency: Math.round(totalTime),
            timestamp: new Date().toISOString()
        }
    ];
    
    displayResults('stress-results', summary);
    addLog(`Stress test complete: ${successCount}/${iterations} successful (${avgLatency}ms avg)`, 
           successCount === iterations ? 'success' : 'warning');
}

// Initialize UI
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-900">
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      
      <!-- Header -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <h1 class="text-3xl font-bold text-indigo-600 mb-2">🌐 Distributed System Testing Dashboard</h1>
        <p class="text-gray-600">Đánh giá và kiểm tra hệ thống phân tán với nhiều node</p>
        <div class="mt-4 grid grid-cols-3 gap-4">
          ${NODES.map(node => `
            <div class="border rounded p-3 ${node.type === 'primary' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}">
              <div class="font-semibold text-sm">${node.name}</div>
              <div class="text-xs text-gray-600">${node.url}</div>
              <div class="text-xs mt-1">
                <span class="px-2 py-1 rounded ${node.type === 'primary' ? 'bg-indigo-500 text-white' : 'bg-gray-200'}">${node.type}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Control Panel -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold mb-4">⚙️ Control Panel</h2>
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label class="text-sm font-medium">Product ID</label>
            <input id="test-pid" type="number" class="w-full border rounded p-2 mt-1" value="101" />
          </div>
          <div>
            <label class="text-sm font-medium">Stress Test Iterations</label>
            <input id="stress-iterations" type="number" class="w-full border rounded p-2 mt-1" value="10" />
          </div>
        </div>
      </div>

      <!-- Test Sections -->
      <div class="grid grid-cols-2 gap-6">
        
        <!-- Health Check -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-lg font-semibold mb-3">🏥 Health Check - All Nodes</h2>
          <button id="btn-health-all" class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 w-full mb-4">
            Test Health on All Nodes
          </button>
          <div id="health-results" class="space-y-2 max-h-96 overflow-auto"></div>
        </div>

        <!-- Distributed Query -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-lg font-semibold mb-3">🔄 Distributed Query</h2>
          <p class="text-sm text-gray-600 mb-3">Truy vấn song song trên nhiều node</p>
          <button id="btn-distributed-query" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full mb-4">
            Run Distributed Query
          </button>
          <div id="distributed-query-results" class="space-y-2 max-h-96 overflow-auto"></div>
        </div>

        <!-- Local vs Distributed -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-lg font-semibold mb-3">📊 Local vs Distributed Comparison</h2>
          <p class="text-sm text-gray-600 mb-3">So sánh truy vấn cục bộ và phân tán</p>
          <button id="btn-comparison" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 w-full mb-4">
            Compare Performance
          </button>
          <div id="comparison-results" class="space-y-2 max-h-96 overflow-auto"></div>
        </div>

        <!-- Distributed Transaction -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-lg font-semibold mb-3">💳 Distributed Transaction</h2>
          <p class="text-sm text-gray-600 mb-3">Giao dịch trên nhiều node</p>
          <button id="btn-transaction" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 w-full mb-4">
            Test Transaction
          </button>
          <div id="transaction-results" class="space-y-2 max-h-96 overflow-auto"></div>
        </div>

        <!-- Replication Sync -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-lg font-semibold mb-3">🔁 Replication & Sync</h2>
          <p class="text-sm text-gray-600 mb-3">Kiểm tra đồng bộ dữ liệu giữa các node</p>
          <button id="btn-replication" class="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 w-full mb-4">
            Test Replication
          </button>
          <div id="replication-results" class="space-y-2 max-h-96 overflow-auto"></div>
        </div>

        <!-- Failover Test -->
        <div class="bg-white rounded-lg shadow-md p-6">
          <h2 class="text-lg font-semibold mb-3">⚠️ Node Failover Test</h2>
          <p class="text-sm text-gray-600 mb-3">Xử lý lỗi khi node bị ngắt kết nối</p>
          <button id="btn-failover" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 w-full mb-4">
            Test Failover (Step Down Primary)
          </button>
          <div id="failover-results" class="space-y-2 max-h-96 overflow-auto"></div>
        </div>

      </div>

      <!-- Stress Test -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-lg font-semibold mb-3">⚡ Stress Test</h2>
        <p class="text-sm text-gray-600 mb-3">Load testing với nhiều request đồng thời</p>
        <button id="btn-stress" class="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 mb-4">
          Run Stress Test
        </button>
        <div id="stress-results" class="space-y-2"></div>
      </div>

      <!-- Activity Log -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-lg font-semibold mb-3">📝 Activity Log</h2>
        <div id="activity-log" class="bg-gray-50 rounded p-3 max-h-64 overflow-auto font-mono"></div>
      </div>

    </div>
  </div>
`;

// Bind events
document.getElementById('btn-health-all')!.onclick = testHealthAllNodes;
document.getElementById('btn-distributed-query')!.onclick = testDistributedQuery;
document.getElementById('btn-comparison')!.onclick = testLocalVsDistributed;
document.getElementById('btn-transaction')!.onclick = testTransactionOnMultipleNodes;
document.getElementById('btn-replication')!.onclick = testReplicationSync;
document.getElementById('btn-failover')!.onclick = testNodeFailover;
document.getElementById('btn-stress')!.onclick = stressTest;

// Initial log
addLog('Distributed System Testing Dashboard initialized', 'success');
addLog(`Configured with ${NODES.length} nodes`, 'info');
