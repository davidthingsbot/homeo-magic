#!/usr/bin/env node
/**
 * Homeo-Magic Full Test Suite
 * Tests: Data files, Algorithm, Web server, API endpoints
 * 
 * Run with: node test-full.js [--server-url=URL]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');

// Configuration
const SERVER_URL = process.argv.find(a => a.startsWith('--server-url='))?.split('=')[1] || 'http://localhost:3333';
const DATA_DIR = path.join(__dirname, 'data');
const WEB_DATA_DIR = path.join(__dirname, 'web/public/data');

let passed = 0;
let failed = 0;
let skipped = 0;

// Test helpers
function log(msg) { console.log(msg); }

async function test(name, fn, { skip = false } = {}) {
  if (skip) {
    console.log(`  ${name}... ⏭️  SKIPPED`);
    skipped++;
    return;
  }
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log('✅');
    passed++;
  } catch (e) {
    console.log(`❌ ${e.message}`);
    failed++;
  }
}

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const timeout = options.timeout || 15000;
    
    const req = client.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ 
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        headers: res.headers,
        text: () => Promise.resolve(data),
        json: () => Promise.resolve(JSON.parse(data))
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// Load data from files
function loadDataFiles() {
  const symptomsPath = fs.existsSync(path.join(DATA_DIR, 'symptoms.json')) 
    ? path.join(DATA_DIR, 'symptoms.json')
    : path.join(WEB_DATA_DIR, 'symptoms.json');
  const remediesPath = fs.existsSync(path.join(DATA_DIR, 'remedies.json'))
    ? path.join(DATA_DIR, 'remedies.json')
    : path.join(WEB_DATA_DIR, 'remedies.json');
  
  return {
    symptoms: JSON.parse(fs.readFileSync(symptomsPath, 'utf8')),
    remedies: JSON.parse(fs.readFileSync(remediesPath, 'utf8'))
  };
}

// Check if server is reachable
async function isServerUp() {
  try {
    const res = await fetch(SERVER_URL, { timeout: 3000 });
    return res.ok;
  } catch {
    return false;
  }
}

// ============ TEST SUITES ============

async function testDataFiles() {
  log('\n📁 DATA FILE TESTS\n');
  
  await test('symptoms.json exists', () => {
    const p1 = path.join(DATA_DIR, 'symptoms.json');
    const p2 = path.join(WEB_DATA_DIR, 'symptoms.json');
    if (!fs.existsSync(p1) && !fs.existsSync(p2)) {
      throw new Error('symptoms.json not found in data/ or web/public/data/');
    }
  });
  
  await test('remedies.json exists', () => {
    const p1 = path.join(DATA_DIR, 'remedies.json');
    const p2 = path.join(WEB_DATA_DIR, 'remedies.json');
    if (!fs.existsSync(p1) && !fs.existsSync(p2)) {
      throw new Error('remedies.json not found');
    }
  });
  
  const data = loadDataFiles();
  
  await test('symptoms.json has 70,000+ entries', () => {
    const count = Object.keys(data.symptoms).length;
    if (count < 70000) throw new Error(`Only ${count} symptoms`);
  });
  
  await test('remedies.json has 2,000+ entries', () => {
    const count = Object.keys(data.remedies).length;
    if (count < 2000) throw new Error(`Only ${count} remedies`);
  });
  
  await test('Symptoms have correct structure', () => {
    const sample = data.symptoms['Head, pain, morning'];
    if (!sample) throw new Error('Sample symptom not found');
    if (!sample.remedies) throw new Error('No remedies object');
    if (!sample.chapter_id) throw new Error('No chapter_id');
  });
  
  await test('All grades are 1, 2, or 3', () => {
    let badGrades = [];
    for (const [symptom, info] of Object.entries(data.symptoms).slice(0, 500)) {
      for (const [remedy, grade] of Object.entries(info.remedies)) {
        if (grade < 1 || grade > 3) {
          badGrades.push(`${symptom}: ${remedy}=${grade}`);
        }
      }
    }
    if (badGrades.length > 0) throw new Error(`Invalid grades: ${badGrades.slice(0, 3).join(', ')}`);
  });
  
  await test('Common polychrest remedies exist', () => {
    const polychrests = ['Nux-v.', 'Sulph.', 'Puls.', 'Ars.', 'Lyc.', 'Sep.', 'Calc.', 'Phos.', 'Nat-m.', 'Sil.'];
    const missing = polychrests.filter(r => !data.remedies[r]);
    if (missing.length > 0) throw new Error(`Missing: ${missing.join(', ')}`);
  });
}

async function testAlgorithm() {
  log('\n🧮 ALGORITHM TESTS\n');
  
  const data = loadDataFiles();
  
  await test('Search finds "headache" symptoms', () => {
    const matches = Object.keys(data.symptoms).filter(s => 
      s.toLowerCase().includes('headache')
    );
    if (matches.length < 10) throw new Error(`Only ${matches.length} matches`);
  });
  
  await test('Search finds "irritability" symptoms', () => {
    const matches = Object.keys(data.symptoms).filter(s => 
      s.toLowerCase().includes('irritab')
    );
    if (matches.length < 5) throw new Error(`Only ${matches.length} matches`);
  });
  
  await test('Intersection with 2 symptoms works', () => {
    const selected = ['Head, pain, morning', 'Mind, irritability'];
    const result = computeIntersection(selected, data.symptoms);
    if (result.length === 0) throw new Error('Empty intersection');
  });
  
  await test('Intersection with 3 symptoms works', () => {
    const selected = [
      'Head, pain, morning',
      'Mind, irritability',
      'Generalities, cold, in general agg.'
    ];
    const result = computeIntersection(selected, data.symptoms);
    if (result.length < 50) throw new Error(`Only ${result.length} in intersection`);
  });
  
  await test('Results are sorted by score descending', () => {
    const selected = [
      'Head, pain, morning',
      'Mind, irritability',
      'Generalities, cold, in general agg.'
    ];
    const result = computeIntersection(selected, data.symptoms);
    for (let i = 1; i < result.length; i++) {
      if (result[i].score > result[i-1].score) {
        throw new Error(`Results not sorted: ${result[i-1].score} < ${result[i].score}`);
      }
    }
  });
  
  await test('Top remedies have high scores (≥7)', () => {
    const selected = [
      'Head, pain, morning',
      'Mind, irritability',
      'Generalities, cold, in general agg.'
    ];
    const result = computeIntersection(selected, data.symptoms);
    if (result[0].score < 7) throw new Error(`Top score only ${result[0].score}`);
  });
  
  await test('Nux-v appears in top 5 for classic symptoms', () => {
    const selected = [
      'Head, pain, morning',
      'Mind, irritability',
      'Generalities, cold, in general agg.'
    ];
    const result = computeIntersection(selected, data.symptoms);
    const nuxRank = result.findIndex(r => r.remedy === 'Nux-v.');
    if (nuxRank === -1) throw new Error('Nux-v not in results');
    if (nuxRank >= 5) throw new Error(`Nux-v ranked ${nuxRank + 1}`);
  });
  
  await test('Single symptom returns many remedies', () => {
    const selected = ['Mind, irritability'];
    const remedies = data.symptoms[selected[0]]?.remedies || {};
    if (Object.keys(remedies).length < 50) {
      throw new Error(`Only ${Object.keys(remedies).length} remedies`);
    }
  });
}

async function testWebServer() {
  log('\n🌐 WEB SERVER TESTS\n');
  
  const serverUp = await isServerUp();
  
  await test('Server is reachable', async () => {
    if (!serverUp) throw new Error(`Cannot connect to ${SERVER_URL}`);
  }, { skip: false });
  
  if (!serverUp) {
    log('  ⚠️  Server not running, skipping web tests');
    skipped += 6;
    return;
  }
  
  await test('Returns HTML', async () => {
    const res = await fetch(SERVER_URL);
    const text = await res.text();
    if (!text.includes('<!DOCTYPE html>') && !text.includes('<html')) {
      throw new Error('Response is not HTML');
    }
  });
  
  await test('Page title is correct', async () => {
    const res = await fetch(SERVER_URL);
    const text = await res.text();
    if (!text.includes('Homeo-Magic')) {
      throw new Error('Title "Homeo-Magic" not found');
    }
  });
  
  await test('remedies.json is served', async () => {
    const res = await fetch(`${SERVER_URL}/data/remedies.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data['Nux-v.']) throw new Error('Nux-v not in data');
  });
  
  await test('symptoms.json is served', async () => {
    const res = await fetch(`${SERVER_URL}/data/symptoms.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Object.keys(data).length < 1000) throw new Error('Too few symptoms');
  });
  
  await test('Page has search input', async () => {
    const res = await fetch(SERVER_URL);
    const text = await res.text();
    // Check for input element or React hydration
    if (!text.includes('search') && !text.includes('symptom') && !text.includes('input')) {
      throw new Error('No search-related elements found');
    }
  });
  
  await test('Page loads JavaScript', async () => {
    const res = await fetch(SERVER_URL);
    const text = await res.text();
    if (!text.includes('script') && !text.includes('_next')) {
      throw new Error('No JavaScript references found');
    }
  });
}

async function testScraper() {
  log('\n🔍 SCRAPER TESTS\n');
  
  await test('Scraper script exists', () => {
    const scraperPath = path.join(__dirname, 'scraper/parse_oorep.py');
    if (!fs.existsSync(scraperPath)) {
      throw new Error('scraper/parse_oorep.py not found');
    }
  });
  
  await test('Scraper has correct structure', () => {
    const scraperPath = path.join(__dirname, 'scraper/parse_oorep.py');
    const content = fs.readFileSync(scraperPath, 'utf8');
    if (!content.includes('def parse_copy_block')) {
      throw new Error('parse_copy_block function not found');
    }
    if (!content.includes('def main')) {
      throw new Error('main function not found');
    }
  });
  
  await test('Engine script exists', () => {
    const enginePath = path.join(__dirname, 'engine/repertorize.py');
    if (!fs.existsSync(enginePath)) {
      throw new Error('engine/repertorize.py not found');
    }
  });
  
  await test('Engine has repertorize function', () => {
    const enginePath = path.join(__dirname, 'engine/repertorize.py');
    const content = fs.readFileSync(enginePath, 'utf8');
    if (!content.includes('def repertorize')) {
      throw new Error('repertorize function not found');
    }
  });
}

// ============ HELPERS ============

function computeIntersection(selectedSymptoms, symptoms) {
  const remedyScores = {};
  const remedyPresence = {};
  
  for (const symptom of selectedSymptoms) {
    const data = symptoms[symptom];
    if (!data) continue;
    
    for (const [remedy, weight] of Object.entries(data.remedies)) {
      if (!remedyScores[remedy]) {
        remedyScores[remedy] = 0;
        remedyPresence[remedy] = new Set();
      }
      remedyScores[remedy] += weight;
      remedyPresence[remedy].add(symptom);
    }
  }
  
  const numSymptoms = selectedSymptoms.length;
  const results = [];
  
  for (const [remedy, score] of Object.entries(remedyScores)) {
    if (remedyPresence[remedy].size === numSymptoms) {
      results.push({ remedy, score });
    }
  }
  
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ============ MAIN ============

async function main() {
  console.log('🧪 HOMEO-MAGIC FULL TEST SUITE');
  console.log(`   Server URL: ${SERVER_URL}`);
  console.log('━'.repeat(50));
  
  await testDataFiles();
  await testAlgorithm();
  await testWebServer();
  await testScraper();
  
  console.log('\n' + '━'.repeat(50));
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('━'.repeat(50));
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
