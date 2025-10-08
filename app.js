#!/usr/bin/env node

const PhonebankMonitor = require('./src/PhonebankMonitor');
const DashboardServer = require('./src/dashboard/DashboardServer');

class PhonebankApp {
  constructor() {
    this.monitor = null;
    this.dashboard = null;
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Phonebank Monitoring System...');
      console.log('='.repeat(50));
      
      // Initialize monitor
      this.monitor = new PhonebankMonitor('./config.json');
      
      // Wait for database initialization
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Initialize dashboard
      this.dashboard = new DashboardServer(this.monitor, this.monitor.config.get());
      
      console.log('Initialization completed successfully');
      
    } catch (error) {
      console.error('Initialization failed:', error);
      process.exit(1);
    }
  }

  async start() {
    try {
      console.log('\n🎯 Starting services...');
      
      // Start monitoring
      await this.monitor.runMonitoring();
      
      // Start dashboard server
      this.dashboard.start();
      
      console.log('\n' + '='.repeat(50));
      console.log('🎉 Phonebank Monitoring System is now running!');
      console.log('📊 Dashboard: http://localhost:3000');
      console.log('🔍 Monitoring: Active');
      console.log('='.repeat(50));
      
      this.setupShutdownHandlers();
      
    } catch (error) {
      console.error('Failed to start services:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  setupShutdownHandlers() {
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      console.log(`\nReceived ${signal}, initiating graceful shutdown...`);
      this.isShuttingDown = true;
      
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    console.log('\n🔄 Shutting down services...');
    
    try {
      // Stop dashboard
      if (this.dashboard) {
        await this.dashboard.stop();
      }
      
      // Stop monitor
      if (this.monitor) {
        await this.monitor.shutdown();
      }
      
      console.log('Graceful shutdown completed');
      
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  async status() {
    if (!this.monitor) {
      console.log('Monitor not initialized');
      return;
    }

    try {
      const status = await this.monitor.getSystemStatus();
      
      console.log('\n📊 System Status:');
      console.log('='.repeat(30));
      console.log(`Running: ${status.isRunning ? '✅' : '❌'}`);
      console.log(`Memory: ${status.memory.usagePercent}%`);
      console.log(`Cache Hit Rate: ${status.cache.hitRate}%`);
      console.log(`Active Browsers: ${status.browsers.activeBrowsers}/${status.browsers.maxBrowsers}`);
      console.log(`Degradation Level: ${status.degradation.level}`);
      console.log(`Monitoring Mode: ${status.monitoring.strategy.mode}`);
      console.log('='.repeat(30));
      
    } catch (error) {
      console.error('Failed to get status:', error);
    }
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0] || 'start';

async function main() {
  const app = new PhonebankApp();
  
  switch (command) {
    case 'start':
      await app.initialize();
      await app.start();
      break;
      
    case 'status':
      await app.initialize();
      await app.status();
      process.exit(0);
      break;
      
    case 'help':
    case '--help':
    case '-h':
      console.log(`
📋 Phonebank Monitoring System - Usage:

Commands:
  start     Start the monitoring system and dashboard (default)
  status    Show current system status
  help      Show this help message

Examples:
  node app.js start
  node app.js status
  npm start
  npm run dev

Environment:
  NODE_ENV=production    Run in production mode
  NODE_ENV=development   Run in development mode (default)

For more information, visit: https://github.com/RizqOsman/phonebank_devices_checker
      `);
      process.exit(0);
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "node app.js help" for usage information');
      process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Application failed to start:', error);
    process.exit(1);
  });
}

module.exports = PhonebankApp;