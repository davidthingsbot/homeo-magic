#!/usr/bin/env node
/**
 * Test that web data files load correctly
 * This simulates what the browser does
 */

const http = require('http');
const https = require('https');

const SERVER_URL = process.argv[2] || 'http://localhost:3333';

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const timeout = options.timeout || 60000;
    
    console.log(`  Fetching: ${url}`);
    const startTime = Date.now();
    
    const req = client.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        console.log(`  Received: ${data.length} bytes in ${elapsed}ms`);
        resolve({ 
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data,
          elapsed
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function main() {
  console.log(`Testing data loading from: ${SERVER_URL}\n`);
  
  let failed = false;
  
  // Test 1: Page loads
  console.log('1. Testing page load...');
  try {
    const res = await fetch(`${SERVER_URL}/`);
    if (!res.ok) {
      console.log(`   ❌ FAIL: HTTP ${res.status}`);
      failed = true;
    } else if (!res.data.includes('Homeo-Magic')) {
      console.log(`   ❌ FAIL: Page doesn't contain "Homeo-Magic"`);
      failed = true;
    } else {
      console.log(`   ✅ PASS`);
    }
  } catch (e) {
    console.log(`   ❌ FAIL: ${e.message}`);
    failed = true;
  }
  
  // Test 2: remedies.json loads
  console.log('\n2. Testing /data/remedies.json...');
  try {
    const res = await fetch(`${SERVER_URL}/data/remedies.json`);
    if (!res.ok) {
      console.log(`   ❌ FAIL: HTTP ${res.status}`);
      failed = true;
    } else {
      const data = JSON.parse(res.data);
      const count = Object.keys(data).length;
      if (count < 2000) {
        console.log(`   ❌ FAIL: Only ${count} remedies`);
        failed = true;
      } else {
        console.log(`   ✅ PASS: ${count} remedies loaded`);
      }
    }
  } catch (e) {
    console.log(`   ❌ FAIL: ${e.message}`);
    failed = true;
  }
  
  // Test 3: symptoms.json loads (this is the big one - 20MB)
  console.log('\n3. Testing /data/symptoms.json (20MB file)...');
  try {
    const res = await fetch(`${SERVER_URL}/data/symptoms.json`, { timeout: 120000 });
    if (!res.ok) {
      console.log(`   ❌ FAIL: HTTP ${res.status}`);
      failed = true;
    } else {
      console.log(`   Parsing JSON...`);
      const parseStart = Date.now();
      const data = JSON.parse(res.data);
      const parseTime = Date.now() - parseStart;
      console.log(`   Parsed in ${parseTime}ms`);
      
      const count = Object.keys(data).length;
      if (count < 70000) {
        console.log(`   ❌ FAIL: Only ${count} symptoms`);
        failed = true;
      } else {
        console.log(`   ✅ PASS: ${count} symptoms loaded`);
      }
    }
  } catch (e) {
    console.log(`   ❌ FAIL: ${e.message}`);
    failed = true;
  }
  
  // Test 4: Page has required elements
  console.log('\n4. Testing page has search input...');
  try {
    const res = await fetch(`${SERVER_URL}/`);
    if (!res.data.includes('id="search"')) {
      console.log(`   ❌ FAIL: Search input not found`);
      failed = true;
    } else {
      console.log(`   ✅ PASS: Search input found`);
    }
  } catch (e) {
    console.log(`   ❌ FAIL: ${e.message}`);
    failed = true;
  }
  
  // Test 5: Page has CSS styles
  console.log('\n5. Testing page has styles...');
  try {
    const res = await fetch(`${SERVER_URL}/`);
    // Check for either Tailwind CDN or custom styles
    if (!res.data.includes('<style>') && !res.data.includes('tailwindcss')) {
      console.log(`   ❌ FAIL: No styles found`);
      failed = true;
    } else {
      console.log(`   ✅ PASS: CSS styles included`);
    }
  } catch (e) {
    console.log(`   ❌ FAIL: ${e.message}`);
    failed = true;
  }
  
  console.log('\n' + '='.repeat(50));
  if (failed) {
    console.log('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
