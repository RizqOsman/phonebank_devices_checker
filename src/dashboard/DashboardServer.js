const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

class DashboardServer {
  constructor(monitor, config) {
    this.monitor = monitor;
    this.config = config;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.connectedClients = new Set();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startRealTimeUpdates();
  }

  setupMiddleware() {
    // Security middleware with relaxed CSP for dashboard
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-hashes'",
            "https://cdn.socket.io",
            "https://cdn.jsdelivr.net"
          ],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);
    
    // CORS
    this.app.use(cors());
    
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Static files
    this.app.use(express.static(path.join(__dirname, '../../public')));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    const router = express.Router();

    // Health check
    router.get('/health', async (req, res) => {
      try {
        const status = await this.monitor.getSystemStatus();
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          system: status
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: error.message
        });
      }
    });

    // Get all devices
    router.get('/devices', async (req, res) => {
      try {
        const devices = await this.monitor.db.getAllDevices();
        res.json({
          success: true,
          data: devices,
          count: devices.length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get device details
    router.get('/devices/:url(*)', async (req, res) => {
      try {
        const deviceUrl = req.params.url;
        const device = await this.monitor.db.getDevice(deviceUrl);
        
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        const history = await this.monitor.db.getDeviceHistory(device.id, 50);
        const stats = await this.monitor.db.getUptimeStats(device.id, 7);
        
        res.json({
          success: true,
          data: {
            device,
            history,
            stats
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get location statistics
    router.get('/locations/:location/stats', async (req, res) => {
      try {
        const { location } = req.params;
        const { days = 7 } = req.query;
        
        const stats = await this.monitor.db.getLocationStats(location, parseInt(days));
        
        res.json({
          success: true,
          data: stats
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get recent checks
    router.get('/checks/recent', async (req, res) => {
      try {
        const { limit = 50 } = req.query;
        const checks = await this.monitor.db.getLatestChecks(parseInt(limit));
        
        res.json({
          success: true,
          data: checks,
          count: checks.length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get active alerts
    router.get('/alerts', async (req, res) => {
      try {
        const alerts = await this.monitor.db.getActiveAlerts();
        
        res.json({
          success: true,
          data: alerts,
          count: alerts.length
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Resolve alert
    router.post('/alerts/:id/resolve', async (req, res) => {
      try {
        const { id } = req.params;
        const { resolvedBy = 'dashboard' } = req.body;
        
        await this.monitor.db.resolveAlert(parseInt(id), resolvedBy);
        
        res.json({
          success: true,
          message: 'Alert resolved successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get system metrics
    router.get('/metrics', async (req, res) => {
      try {
        const systemStatus = await this.monitor.getSystemStatus();
        const performanceMetrics = this.monitor.performanceMonitor.getAllMetrics();
        
        res.json({
          success: true,
          data: {
            system: systemStatus,
            performance: performanceMetrics
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get dashboard overview
    router.get('/overview', async (req, res) => {
      try {
        const devices = await this.monitor.db.getAllDevices();
        const recentChecks = await this.monitor.db.getLatestChecks(10);
        const activeAlerts = await this.monitor.db.getActiveAlerts();
        const systemStatus = await this.monitor.getSystemStatus();
        
        // Calculate overview statistics
        const totalDevices = devices.length;
        const onlineDevices = devices.filter(d => d.status === 'online').length;
        const offlineDevices = totalDevices - onlineDevices;
        const uptimePercentage = totalDevices > 0 ? (onlineDevices / totalDevices * 100).toFixed(2) : 0;
        
        // Group devices by location
        const locationStats = {};
        devices.forEach(device => {
          if (!locationStats[device.location]) {
            locationStats[device.location] = {
              total: 0,
              online: 0,
              offline: 0,
              priority: device.priority
            };
          }
          locationStats[device.location].total++;
          if (device.status === 'online') {
            locationStats[device.location].online++;
          } else {
            locationStats[device.location].offline++;
          }
        });

        res.json({
          success: true,
          data: {
            summary: {
              totalDevices,
              onlineDevices,
              offlineDevices,
              uptimePercentage,
              activeAlerts: activeAlerts.length
            },
            locationStats,
            recentChecks: recentChecks.slice(0, 5),
            activeAlerts: activeAlerts.slice(0, 5),
            systemHealth: {
              isRunning: systemStatus.isRunning,
              degradationLevel: systemStatus.degradation.level,
              memoryUsage: systemStatus.memory.usagePercent,
              cacheHitRate: systemStatus.cache.hitRate
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Manual device check
    router.post('/devices/:url(*)/check', async (req, res) => {
      try {
        const deviceUrl = req.params.url;
        const device = await this.monitor.db.getDevice(deviceUrl);
        
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        // Trigger manual check
        const result = await this.monitor.checkDevice(deviceUrl, device.location, device.priority);
        await this.monitor.saveDeviceCheck(result);
        
        res.json({
          success: true,
          data: result,
          message: 'Device check completed'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get configuration
    router.get('/config', (req, res) => {
      try {
        const config = this.monitor.config.get();
        
        // Remove sensitive information
        const sanitizedConfig = { ...config };
        if (sanitizedConfig.alerts && sanitizedConfig.alerts.notifications) {
          if (sanitizedConfig.alerts.notifications.email) {
            delete sanitizedConfig.alerts.notifications.email.auth;
          }
        }
        
        res.json({
          success: true,
          data: sanitizedConfig
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Update configuration
    router.put('/config', (req, res) => {
      try {
        const updates = req.body;
        
        // Apply updates
        Object.keys(updates).forEach(key => {
          this.monitor.config.set(key, updates[key]);
        });
        
        res.json({
          success: true,
          message: 'Configuration updated successfully'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Analytics endpoints
    router.get('/analytics/uptime', async (req, res) => {
      try {
        const { days = 7 } = req.query;
        const devices = await this.monitor.db.getAllDevices();
        const uptimeData = [];
        
        for (const device of devices) {
          const stats = await this.monitor.db.getUptimeStats(device.id, parseInt(days));
          uptimeData.push({
            device: device.url,
            location: device.location,
            priority: device.priority,
            ...stats
          });
        }
        
        res.json({
          success: true,
          data: uptimeData
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // History endpoints for uptime/downtime analysis
    router.get('/history/uptime', async (req, res) => {
      try {
        const { range = '7d', location, device } = req.query;
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        
        switch (range) {
          case '24h':
            startDate.setHours(startDate.getHours() - 24);
            break;
          case '7d':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(startDate.getDate() - 30);
            break;
          default:
            startDate.setDate(startDate.getDate() - 7);
        }

        // Get historical data
        const devices = await this.monitor.db.getAllDevices();
        let filteredDevices = devices;
        
        if (location) {
          filteredDevices = devices.filter(d => d.location === location);
        }
        if (device) {
          filteredDevices = devices.filter(d => d.url === device);
        }

        // Calculate statistics
        const totalDevices = filteredDevices.length;
        let totalUptime = 0;
        let totalResponseTime = 0;
        let totalDowntime = 0;
        let checkCount = 0;

        const uptimeTrend = [];
        const responseTimeTrend = [];
        const labels = [];

        // Generate daily data points
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          labels.push(d.toLocaleDateString());
          // Mock data - in real implementation, query database for this date
          uptimeTrend.push(Math.random() * 20 + 80);
          responseTimeTrend.push(Math.random() * 1000 + 500);
        }

        // Calculate averages (mock data)
        const averageUptime = 94.2;
        const averageResponseTime = '1.2s';
        const totalDowntimeHours = '2.3h';

        res.json({
          success: true,
          data: {
            totalDevices,
            averageUptime,
            averageResponseTime,
            totalDowntime: totalDowntimeHours,
            uptimeTrend: {
              labels,
              data: uptimeTrend
            },
            responseTimeTrend: {
              labels,
              data: responseTimeTrend
            },
            period: {
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              range
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Device history endpoint
    router.get('/history/device/:deviceUrl', async (req, res) => {
      try {
        const { deviceUrl } = req.params;
        const { limit = 100 } = req.query;
        
        const device = await this.monitor.db.getDevice(decodeURIComponent(deviceUrl));
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        const history = await this.monitor.db.getDeviceHistory(device.id, parseInt(limit));
        const stats = await this.monitor.db.getUptimeStats(device.id, 30);

        res.json({
          success: true,
          data: {
            device,
            history,
            stats
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Events timeline endpoint
    router.get('/history/timeline', async (req, res) => {
      try {
        const { limit = 50, location, severity } = req.query;
        
        // Get recent checks for timeline
        const recentChecks = await this.monitor.db.getLatestChecks(parseInt(limit));
        
        // Convert checks to timeline events
        const events = recentChecks.map(check => ({
          id: check.id,
          timestamp: check.check_timestamp,
          type: check.status === 'up' || check.status === 'online' ? 'online' : 'offline',
          device: check.url,
          location: check.location,
          message: check.status === 'up' || check.status === 'online' ? 
                   'Device came online' : 'Device went offline',
          responseTime: check.response_time,
          error: check.error_message
        }));

        // Filter by location if specified
        let filteredEvents = events;
        if (location) {
          filteredEvents = events.filter(e => e.location === location);
        }

        res.json({
          success: true,
          data: filteredEvents
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Use the router
    this.app.use('/api', router);

    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // Serve specific pages
    this.app.get('/history', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/history.html'));
    });

    // Serve the dashboard frontend for other routes
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`📱 Client connected: ${socket.id}`);
      this.connectedClients.add(socket);

      socket.on('subscribe', (rooms) => {
        if (Array.isArray(rooms)) {
          rooms.forEach(room => socket.join(room));
          console.log(`📱 Client ${socket.id} subscribed to: ${rooms.join(', ')}`);
        }
      });

      socket.on('unsubscribe', (rooms) => {
        if (Array.isArray(rooms)) {
          rooms.forEach(room => socket.leave(room));
          console.log(`📱 Client ${socket.id} unsubscribed from: ${rooms.join(', ')}`);
        }
      });

      socket.on('disconnect', () => {
        console.log(`📱 Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket);
      });
    });
  }

  startRealTimeUpdates() {
    const updateInterval = this.config?.dashboard?.refreshInterval || 30000;
    
    setInterval(async () => {
      if (this.connectedClients.size === 0) return;
      
      try {
        // Send system status updates
        const systemStatus = await this.monitor.getSystemStatus();
        this.io.emit('system-status', systemStatus);
        
        // Send recent checks
        const recentChecks = await this.monitor.db.getLatestChecks(10);
        this.io.emit('recent-checks', recentChecks);
        
        // Send active alerts
        const activeAlerts = await this.monitor.db.getActiveAlerts();
        this.io.emit('active-alerts', activeAlerts);
        
        // Send overview data
        const overview = await this.getOverviewData();
        this.io.emit('overview-update', overview);
        
      } catch (error) {
        console.error('Failed to send real-time updates:', error);
      }
    }, updateInterval);
  }

  async getOverviewData() {
    const devices = await this.monitor.db.getAllDevices();
    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const uptimePercentage = totalDevices > 0 ? (onlineDevices / totalDevices * 100).toFixed(2) : 0;
    
    return {
      totalDevices,
      onlineDevices,
      offlineDevices: totalDevices - onlineDevices,
      uptimePercentage,
      timestamp: new Date().toISOString()
    };
  }

  broadcastDeviceUpdate(deviceData) {
    this.io.emit('device-update', deviceData);
  }

  broadcastAlert(alertData) {
    this.io.emit('new-alert', alertData);
  }

  start(portOverride) {
    const port = portOverride || this.config?.dashboard?.port || 3000;
    const host = this.config?.dashboard?.host || 'localhost';
    
    this.server.listen(port, host, () => {
      console.log(`🌐 Dashboard server running on http://${host}:${port}`);
      console.log(`📊 WebSocket server ready for real-time updates`);
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Dashboard server stopped');
        resolve();
      });
    });
  }
}

module.exports = DashboardServer;