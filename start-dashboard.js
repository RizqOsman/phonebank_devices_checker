const DashboardServer = require('./src/dashboard/DashboardServer');
const ConfigManager = require('./src/config/ConfigManager');
const DatabaseManager = require('./src/database/DatabaseManager');

async function startDashboard() {
  try {
    console.log('🚀 Starting Dashboard Server...');
    
    // Load configuration
    const configManager = new ConfigManager();
    console.log('Configuration loaded');
    
    // Initialize database
    const dbManager = new DatabaseManager();
    await dbManager.init();
    console.log('Database connected');
    
    // Create a mock monitor object for the dashboard
    const mockMonitor = {
      db: dbManager, // DashboardServer expects 'db', not 'dbManager'
      config: {
        get: () => configManager.config,
        set: (key, value) => {
          // Simple config setter for dashboard
          const keys = key.split('.');
          let current = configManager.config;
          for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
          }
          current[keys[keys.length - 1]] = value;
        }
      },
      performanceMonitor: {
        getAllMetrics: () => ({
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          cpuUsage: process.cpuUsage(),
          timestamp: new Date().toISOString()
        })
      },
      getSystemStatus: async () => {
        try {
          // Get basic statistics from database
          const devices = await dbManager.getAllDevices();
          const recentChecks = await dbManager.getLatestChecks(100);
          const failedChecks = recentChecks.filter(check => check.status !== 'up');
          const memUsage = process.memoryUsage();
          
          return {
            uptime: process.uptime(),
            memoryUsage: memUsage,
            cpuUsage: process.cpuUsage(),
            activeConnections: 0,
            totalDevices: devices.length,
            totalChecks: recentChecks.length,
            failedChecks: failedChecks.length,
            timestamp: new Date().toISOString(),
            // Additional properties expected by overview endpoint
            isRunning: true,
            degradation: {
              level: 'none',
              reasons: []
            },
            memory: {
              usagePercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2)
            },
            cache: {
              hitRate: 95.5 // Mock cache hit rate
            }
          };
        } catch (error) {
          console.error('Error getting system status:', error);
          return {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            activeConnections: 0,
            totalDevices: 0,
            totalChecks: 0,
            failedChecks: 0,
            timestamp: new Date().toISOString(),
            isRunning: false,
            degradation: {
              level: 'severe',
              reasons: ['Database connection error']
            },
            memory: {
              usagePercent: 0
            },
            cache: {
              hitRate: 0
            }
          };
        }
      },
      checkDevice: async (url, location, priority) => {
        // Mock device check - return a basic success result
        return {
          url,
          location,
          priority,
          success: true,
          responseTime: Math.floor(Math.random() * 1000) + 100,
          timestamp: new Date().toISOString(),
          error: null
        };
      },
      saveDeviceCheck: async (result) => {
        // Mock save - in reality this would save to database
        console.log('Mock saving device check:', result.url, result.success);
      }
    };
    
    // Start dashboard server
    const dashboard = new DashboardServer(mockMonitor, configManager.config);
    const port = process.env.PORT || 3000;
    
    await dashboard.start(port);
    console.log(`🎯 Dashboard server started on http://localhost:${port}`);
    console.log('📊 Access your monitoring dashboard in the browser');
    
  } catch (error) {
    console.error('Failed to start dashboard:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down dashboard server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down dashboard server...');
  process.exit(0);
});

startDashboard();