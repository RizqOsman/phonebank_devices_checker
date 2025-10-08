#!/usr/bin/env node

// Startup script with optimized Node.js flags
const { spawn } = require('child_process');
const path = require('path');

const nodeFlags = [
  '--expose-gc',              // Enable manual garbage collection
  '--max-old-space-size=2048', // Limit memory to 2GB
  '--optimize-for-size',       // Optimize for memory usage
];

const appPath = path.join(__dirname, 'app.js');
const args = process.argv.slice(2);

console.log('🚀 Starting Phonebank Monitor with optimized memory settings...');

const child = spawn('node', [...nodeFlags, appPath, ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});