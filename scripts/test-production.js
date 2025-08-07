#!/usr/bin/env node

/**
 * ShareFlow Production Testing Script
 * Tests the deployed application to ensure everything is working correctly
 */

const https = require('https');
const WebSocket = require('ws');

// Configuration
const config = {
  backendUrl: process.env.BACKEND_URL || 'https://shareflow-server.up.railway.app',
  frontendUrl: process.env.FRONTEND_URL || 'https://shareflow.netlify.app',
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: [],
};

// Helper function to make HTTP requests
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    }).on('error', reject);
  });
}

// Test backend health endpoint
async function testBackendHealth() {
  console.log('\n📡 Testing Backend Health...');
  
  try {
    const response = await httpGet(`${config.backendUrl}/health`);
    
    if (response.statusCode === 200) {
      const health = JSON.parse(response.body);
      
      if (health.status === 'ok') {
        results.passed.push('Backend health check');
        console.log(`${colors.green}✓${colors.reset} Backend is healthy`);
        console.log(`  - Uptime: ${Math.floor(health.uptime / 60)} minutes`);
        console.log(`  - Active connections: ${health.connections}`);
        console.log(`  - Active rooms: ${health.rooms}`);
      } else {
        results.failed.push('Backend health status not ok');
      }
    } else {
      results.failed.push(`Backend returned status ${response.statusCode}`);
    }
  } catch (error) {
    results.failed.push(`Backend health check failed: ${error.message}`);
    console.log(`${colors.red}✗${colors.reset} Backend health check failed: ${error.message}`);
  }
}

// Test WebSocket connection
async function testWebSocketConnection() {
  console.log('\n🔌 Testing WebSocket Connection...');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(config.backendUrl.replace('https', 'wss'), {
      transports: ['websocket'],
    });
    
    const timeout = setTimeout(() => {
      results.failed.push('WebSocket connection timeout');
      console.log(`${colors.red}✗${colors.reset} WebSocket connection timeout`);
      ws.close();
      resolve();
    }, 5000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      results.passed.push('WebSocket connection');
      console.log(`${colors.green}✓${colors.reset} WebSocket connected successfully`);
      ws.close();
      resolve();
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      results.failed.push(`WebSocket error: ${error.message}`);
      console.log(`${colors.red}✗${colors.reset} WebSocket error: ${error.message}`);
      resolve();
    });
  });
}

// Test frontend availability
async function testFrontend() {
  console.log('\n🌐 Testing Frontend...');
  
  try {
    const response = await httpGet(config.frontendUrl);
    
    if (response.statusCode === 200) {
      results.passed.push('Frontend is accessible');
      console.log(`${colors.green}✓${colors.reset} Frontend is accessible`);
      
      // Check for required headers
      const headers = response.headers;
      
      if (headers['x-frame-options']) {
        console.log(`${colors.green}✓${colors.reset} Security headers present`);
      } else {
        results.warnings.push('Security headers might be missing');
        console.log(`${colors.yellow}⚠${colors.reset} Security headers might be missing`);
      }
      
      // Check if HTML contains expected content
      if (response.body.includes('ShareFlow')) {
        console.log(`${colors.green}✓${colors.reset} Frontend content loaded correctly`);
      } else {
        results.warnings.push('Frontend content might be incorrect');
      }
    } else {
      results.failed.push(`Frontend returned status ${response.statusCode}`);
    }
  } catch (error) {
    results.failed.push(`Frontend test failed: ${error.message}`);
    console.log(`${colors.red}✗${colors.reset} Frontend test failed: ${error.message}`);
  }
}

// Test CORS configuration
async function testCORS() {
  console.log('\n🔒 Testing CORS Configuration...');
  
  try {
    const response = await httpGet(`${config.backendUrl}/`);
    const headers = response.headers;
    
    if (headers['access-control-allow-origin']) {
      results.passed.push('CORS headers present');
      console.log(`${colors.green}✓${colors.reset} CORS headers configured`);
      console.log(`  - Allowed origins: ${headers['access-control-allow-origin']}`);
    } else {
      results.warnings.push('CORS headers might not be properly configured');
      console.log(`${colors.yellow}⚠${colors.reset} CORS headers not found in response`);
    }
  } catch (error) {
    results.failed.push(`CORS test failed: ${error.message}`);
  }
}

// Test stats endpoint
async function testStatsEndpoint() {
  console.log('\n📊 Testing Stats Endpoint...');
  
  try {
    const response = await httpGet(`${config.backendUrl}/stats`);
    
    if (response.statusCode === 200) {
      const stats = JSON.parse(response.body);
      results.passed.push('Stats endpoint working');
      console.log(`${colors.green}✓${colors.reset} Stats endpoint accessible`);
      console.log(`  - Total connections: ${stats.totalConnections}`);
      console.log(`  - Peak connections: ${stats.peakConnections}`);
      console.log(`  - Rooms created: ${stats.roomsCreated}`);
    } else {
      results.failed.push(`Stats endpoint returned status ${response.statusCode}`);
    }
  } catch (error) {
    results.failed.push(`Stats endpoint test failed: ${error.message}`);
  }
}

// Performance test
async function testPerformance() {
  console.log('\n⚡ Testing Performance...');
  
  const startTime = Date.now();
  
  try {
    // Test backend response time
    const backendStart = Date.now();
    await httpGet(`${config.backendUrl}/health`);
    const backendTime = Date.now() - backendStart;
    
    if (backendTime < 500) {
      results.passed.push('Backend response time acceptable');
      console.log(`${colors.green}✓${colors.reset} Backend response time: ${backendTime}ms`);
    } else if (backendTime < 1000) {
      results.warnings.push(`Backend response time slow: ${backendTime}ms`);
      console.log(`${colors.yellow}⚠${colors.reset} Backend response time slow: ${backendTime}ms`);
    } else {
      results.failed.push(`Backend response time too slow: ${backendTime}ms`);
      console.log(`${colors.red}✗${colors.reset} Backend response time too slow: ${backendTime}ms`);
    }
    
    // Test frontend response time
    const frontendStart = Date.now();
    await httpGet(config.frontendUrl);
    const frontendTime = Date.now() - frontendStart;
    
    if (frontendTime < 1000) {
      results.passed.push('Frontend response time acceptable');
      console.log(`${colors.green}✓${colors.reset} Frontend response time: ${frontendTime}ms`);
    } else if (frontendTime < 2000) {
      results.warnings.push(`Frontend response time slow: ${frontendTime}ms`);
      console.log(`${colors.yellow}⚠${colors.reset} Frontend response time slow: ${frontendTime}ms`);
    } else {
      results.failed.push(`Frontend response time too slow: ${frontendTime}ms`);
      console.log(`${colors.red}✗${colors.reset} Frontend response time too slow: ${frontendTime}ms`);
    }
  } catch (error) {
    results.failed.push(`Performance test failed: ${error.message}`);
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 ShareFlow Production Test Suite');
  console.log('===================================');
  console.log(`Backend URL: ${config.backendUrl}`);
  console.log(`Frontend URL: ${config.frontendUrl}`);
  
  // Run all tests
  await testBackendHealth();
  await testWebSocketConnection();
  await testFrontend();
  await testCORS();
  await testStatsEndpoint();
  await testPerformance();
  
  // Print summary
  console.log('\n📋 Test Summary');
  console.log('===============');
  console.log(`${colors.green}Passed: ${results.passed.length}${colors.reset}`);
  console.log(`${colors.yellow}Warnings: ${results.warnings.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);
  
  if (results.passed.length > 0) {
    console.log('\n✅ Passed Tests:');
    results.passed.forEach(test => console.log(`  - ${test}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    results.warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(test => console.log(`  - ${test}`));
  }
  
  // Exit with appropriate code
  if (results.failed.length > 0) {
    console.log('\n❌ Some tests failed. Please check your deployment.');
    process.exit(1);
  } else if (results.warnings.length > 0) {
    console.log('\n⚠️  All critical tests passed, but there are warnings to review.');
    process.exit(0);
  } else {
    console.log('\n✅ All tests passed! Your deployment is working correctly.');
    process.exit(0);
  }
}

// Handle command line arguments
if (process.argv.includes('--help')) {
  console.log('Usage: node test-production.js [options]');
  console.log('\nOptions:');
  console.log('  --help           Show this help message');
  console.log('  --backend URL    Specify backend URL');
  console.log('  --frontend URL   Specify frontend URL');
  console.log('\nEnvironment variables:');
  console.log('  BACKEND_URL      Backend URL (default: https://shareflow-server.up.railway.app)');
  console.log('  FRONTEND_URL     Frontend URL (default: https://shareflow.netlify.app)');
  process.exit(0);
}

// Parse command line arguments
const backendArg = process.argv.indexOf('--backend');
if (backendArg > -1 && process.argv[backendArg + 1]) {
  config.backendUrl = process.argv[backendArg + 1];
}

const frontendArg = process.argv.indexOf('--frontend');
if (frontendArg > -1 && process.argv[frontendArg + 1]) {
  config.frontendUrl = process.argv[frontendArg + 1];
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});