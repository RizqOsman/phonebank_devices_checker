const ConfigManager = require('./config/ConfigManager');
const DatabaseManager = require('./database/DatabaseManager');
const { 
  BrowserManager, 
  RetryManager, 
  TimeoutManager, 
  CircuitBreaker, 
  GracefulDegradation 
} = require('./core/ResilienceManager');
const { 
  CacheManager, 
  ConcurrencyManager, 
  MemoryManager, 
  SelectiveMonitor, 
  PerformanceMonitor 
} = require('./core/PerformanceManager');
const { 
  NotificationManager, 
  AlertManager 
} = require('./alerts/AlertManager');
const { 
  AnalyticsEngine, 
  ReportGenerator 
} = require('./analytics/AnalyticsEngine');

class PhonebankMonitor {
  constructor(configPath = './config.json') {
    this.config = new ConfigManager(configPath);
    this.db = new DatabaseManager(this.config.get('database.path'));
    this.isRunning = false;
    this.monitoringInterval = null;
    
    // Initialize managers
    this.browserManager = new BrowserManager(this.config.get());
    this.retryManager = new RetryManager(this.config.get());
    this.timeoutManager = new TimeoutManager(this.config.get());
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000
    });
    this.gracefulDegradation = new GracefulDegradation(this.config.get());
    this.cacheManager = new CacheManager(this.config.get());
    this.concurrencyManager = new ConcurrencyManager(this.config.get());
    this.memoryManager = new MemoryManager(this.config.get());
    this.selectiveMonitor = new SelectiveMonitor(this.config.get());
    this.performanceMonitor = new PerformanceMonitor();
    
    // Initialize alert system
    this.notificationManager = new NotificationManager(this.config.get(), this.db);
    this.alertManager = new AlertManager(this.config.get(), this.db, this.notificationManager);
    
    // Initialize analytics
    const { AnalyticsEngine, ReportGenerator } = require('./analytics/AnalyticsEngine');
    this.analyticsEngine = new AnalyticsEngine(this.db, this.config.get());
    this.reportGenerator = new ReportGenerator(this.analyticsEngine, this.config.get());
    
    this.setupEventHandlers();
    this.initializeDevices();
  }

  setupEventHandlers() {
    // Memory management
    this.memoryManager.onMemoryEvent((event, data) => {
      if (event === 'high-memory') {
        console.warn('⚠️ High memory usage, triggering cache cleanup');
        this.cacheManager.clear();
        this.performanceMonitor.recordMetric('memory.high_usage', 1);
      }
    });

    // Cache events
    this.cacheManager.on('evict', ({ key }) => {
      this.performanceMonitor.recordMetric('cache.evictions', 1);
    });

    // Configuration changes
    this.config.onConfigChange((newConfig) => {
      console.log('📝 Configuration updated, reinitializing devices...');
      this.initializeDevices();
    });
  }

  async initializeDevices() {
    try {
      const urls = this.config.getAllUrls();
      
      for (const { url, location, priority } of urls) {
        try {
          let device = await this.db.getDevice(url);
          if (!device) {
            const deviceId = await this.db.addDevice(url, location, priority);
            console.log(`Added device: ${url} (${location})`);
          }
        } catch (error) {
          console.error(`Failed to initialize device ${url}:`, error.message);
        }
      }
      
      console.log(`Initialized ${urls.length} devices`);
    } catch (error) {
      console.error('Failed to initialize devices:', error);
    }
  }

  async checkDevice(url, location, priority) {
    const cacheKey = `device:${url}`;
    const cached = this.cacheManager.get(cacheKey);
    
    if (cached) {
      this.performanceMonitor.recordMetric('cache.hits', 1);
      return cached;
    }

    const startTime = Date.now();
    
    try {
      const result = await this.circuitBreaker.execute(async () => {
        return await this.retryManager.executeWithRetry(async () => {
          return await this.timeoutManager.withTimeout(
            this.performDeviceCheck(url),
            this.config.get('monitoring.timeout')
          );
        }, { url });
      });

      const responseTime = Date.now() - startTime;
      
      if (result.success) {
        const deviceData = {
          url,
          location,
          priority,
          status: 'online',
          authorized: result.result.authorized,
          unauthorized: result.result.unauthorized,
          phonebankIp: result.result.phonebankIp,
          responseTime,
          timestamp: new Date().toISOString(),
          error: null
        };

        // Cache successful result
        this.cacheManager.set(cacheKey, deviceData);
        
        // Update selective monitor
        this.selectiveMonitor.updateDeviceHealth(location, url, true, responseTime);
        
        // Record metrics
      this.performanceMonitor.recordMetric('device.response_time', responseTime, { location, priority });
      this.performanceMonitor.recordMetric('device.success', 1, { location });
      
      // Debug logging for data extraction
      console.log(`📊 Extracted data for ${url}:`, {
        authorized: deviceData.authorized,
        unauthorized: deviceData.unauthorized,
        phonebankIp: deviceData.phonebankIp,
        responseTime: deviceData.responseTime
      });
      
      return deviceData;
      } else {
        throw result.error;
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Update selective monitor
      this.selectiveMonitor.updateDeviceHealth(location, url, false, responseTime);
      
      // Record metrics
      this.performanceMonitor.recordMetric('device.failure', 1, { location, error: error.message });
      
      const deviceData = {
        url,
        location,
        priority,
        status: 'offline',
        authorized: 0,
        unauthorized: 0,
        phonebankIp: null,
        responseTime,
        timestamp: new Date().toISOString(),
        error: error.message
      };

      return deviceData;
    }
  }

  async performDeviceCheck(url) {
    const { browser, id: browserId } = await this.browserManager.getBrowser();
    
    try {
      const page = await browser.newPage();
      
      // Set page timeout and viewport
      await page.setDefaultTimeout(this.config.get('monitoring.timeout'));
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Block unnecessary resources for faster loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      console.log(`🔍 Checking: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Wait for the JavaScript to load and potentially update the values
      await page.waitForTimeout(2000);

      // Try to get fresh data from the cek.php endpoint first
      let freshData = null;
      try {
        const baseUrl = new URL(url);
        const cekUrl = `${baseUrl.protocol}//${baseUrl.host}/cek.php`;
        
        const response = await page.goto(cekUrl, { waitUntil: 'domcontentloaded' });
        if (response && response.ok()) {
          const cekContent = await page.content();
          const bodyText = await page.$eval('body', el => el.textContent.trim());
          
          // Parse the cek.php response (should be comma-separated values)
          if (bodyText && bodyText.includes(',')) {
            const [authorized, unauthorized] = bodyText.split(',');
            freshData = {
              authorized: authorized.trim(),
              unauthorized: unauthorized.trim()
            };
            console.log(`📊 Got fresh data from cek.php: ${bodyText}`);
          }
        }
      } catch (cekError) {
        console.log(`⚠️ Could not fetch from cek.php: ${cekError.message}`);
      }

      // Go back to main page to get IP and other data
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Extract data with error handling
      const result = await page.evaluate(() => {
        try {
          const authElement = document.querySelector('#auth');
          const unauthElement = document.querySelector('#unauth');
          const ipElement = document.querySelector('#ip');

          return {
            authorized: authElement ? authElement.textContent.trim() : 'N/A',
            unauthorized: unauthElement ? unauthElement.textContent.trim() : 'N/A',
            phonebankIp: ipElement ? ipElement.value.trim() : 'N/A'
          };
        } catch (error) {
          throw new Error(`Failed to extract data: ${error.message}`);
        }
      });

      // Use fresh data from cek.php if available, otherwise use scraped data
      if (freshData) {
        result.authorized = freshData.authorized;
        result.unauthorized = freshData.unauthorized;
      }

      // Parse the authorized/unauthorized values to extract numbers
      const parseCount = (text) => {
        if (!text || text === 'N/A') return 0;
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      };

      result.authorized = parseCount(result.authorized);
      result.unauthorized = parseCount(result.unauthorized);

      await page.close();
      return result;
    } finally {
      await this.browserManager.releaseBrowser(browserId);
    }
  }

  async runMonitoring() {
    if (this.isRunning) {
      console.log('⚠️ Monitoring is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting phonebank monitoring...');

    const intervalMs = this.config.get('monitoring.intervalMinutes') * 60 * 1000;
    
    // Run initial check
    await this.performMonitoringCycle();
    
    // Schedule recurring checks
    this.monitoringInterval = setInterval(async () => {
      await this.performMonitoringCycle();
    }, intervalMs);

    console.log(`Monitoring started with ${intervalMs / 1000}s interval`);
  }

  async performMonitoringCycle() {
    const cycleStart = Date.now();
    console.log(`\n🔄 Starting monitoring cycle at ${new Date().toISOString()}`);
    
    try {
      const urls = this.config.getAllUrls();
      const jobs = [];

      for (const { url, location, priority } of urls) {
        // Check if device should be monitored based on selective monitoring
        if (!this.selectiveMonitor.shouldMonitorDevice(location, url, priority)) {
          console.log(`⏭️ Skipping ${url} (${location}) - selective monitoring`);
          continue;
        }

        // Skip unhealthy locations during degradation
        if (this.gracefulDegradation.shouldSkipLocation(location, priority)) {
          console.log(`⏭️ Skipping ${url} (${location}) - graceful degradation`);
          continue;
        }

        const job = async () => {
          const deviceData = await this.checkDevice(url, location, priority);
          await this.saveDeviceCheck(deviceData);
          
          // Check for alerts
          await this.alertManager.checkAlerts(deviceData);
          
          // Check for auto-resolution
          await this.alertManager.checkAutoResolution(deviceData);
          
          return deviceData;
        };

        jobs.push(this.concurrencyManager.execute(job, priority));
      }

      // Wait for all jobs to complete
      const results = await Promise.allSettled(jobs);
      
      // Process results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      const cycleTime = Date.now() - cycleStart;
      
      // Record cycle metrics
      this.performanceMonitor.recordMetric('cycle.duration', cycleTime);
      this.performanceMonitor.recordMetric('cycle.successful_checks', successful);
      this.performanceMonitor.recordMetric('cycle.failed_checks', failed);
      
      // Log cycle summary
      console.log(`Monitoring cycle completed in ${cycleTime}ms`);
      console.log(`📊 Results: ${successful} successful, ${failed} failed`);
      
      // Update system health
      await this.updateSystemHealth();
      
    } catch (error) {
      console.error('Monitoring cycle failed:', error);
      this.performanceMonitor.recordMetric('cycle.errors', 1);
    }
  }

  async saveDeviceCheck(deviceData) {
    try {
      const device = await this.db.getDevice(deviceData.url);
      if (!device) {
        console.warn(`⚠️ Device not found in database: ${deviceData.url}`);
        return;
      }

      // Handle authorized/unauthorized counts (now they are already numbers)
      const authorizedCount = typeof deviceData.authorized === 'number' 
        ? deviceData.authorized 
        : (typeof deviceData.authorized === 'string' && deviceData.authorized.match(/(\d+)/)) 
          ? parseInt(deviceData.authorized.match(/(\d+)/)[1]) 
          : 0;
          
      const unauthorizedCount = typeof deviceData.unauthorized === 'number' 
        ? deviceData.unauthorized 
        : (typeof deviceData.unauthorized === 'string' && deviceData.unauthorized.match(/(\d+)/)) 
          ? parseInt(deviceData.unauthorized.match(/(\d+)/)[1]) 
          : 0;

      // Debug logging for database save
      console.log(`💾 Saving to DB for ${deviceData.url}: authorized=${authorizedCount}, unauthorized=${unauthorizedCount}`);

      // Save device check
      await this.db.addDeviceCheck(
        device.id,
        deviceData.responseTime,
        deviceData.status,
        authorizedCount,
        unauthorizedCount,
        deviceData.phonebankIp,
        deviceData.error,
        JSON.stringify(deviceData)
      );

      // Update device status
      await this.db.updateDeviceStatus(deviceData.url, deviceData.status, deviceData.phonebankIp);
      
    } catch (error) {
      console.error(`Failed to save device check for ${deviceData.url}:`, error);
    }
  }

  async updateSystemHealth() {
    try {
      const locations = this.config.getEnabledLocations();
      
      for (const [locationName, locationConfig] of locations) {
        const stats = await this.db.getLocationStats(locationName, 1); // Last 24 hours
        const healthStatus = stats.uptime_percentage > 90 ? 'healthy' : 'unhealthy';
        this.gracefulDegradation.updateHealth(locationName, healthStatus);
      }
      
    } catch (error) {
      console.error('Failed to update system health:', error);
    }
  }

  async getSystemStatus() {
    const memoryStats = this.memoryManager.getMemoryStats();
    const cacheStats = this.cacheManager.getStats();
    const concurrencyStats = this.concurrencyManager.getStats();
    const browserStats = this.browserManager.getBrowserStats();
    const circuitBreakerStats = this.circuitBreaker.getStats();
    const degradationStatus = this.gracefulDegradation.getDegradationStatus();
    const monitoringStrategy = this.selectiveMonitor.getMonitoringStrategy();
    const selectiveStats = this.selectiveMonitor.getStats();
    const systemMetrics = this.performanceMonitor.getSystemMetrics();
    
    return {
      timestamp: new Date().toISOString(),
      isRunning: this.isRunning,
      memory: memoryStats,
      cache: cacheStats,
      concurrency: concurrencyStats,
      browsers: browserStats,
      circuitBreaker: circuitBreakerStats,
      degradation: degradationStatus,
      monitoring: {
        strategy: monitoringStrategy,
        stats: selectiveStats
      },
      system: systemMetrics
    };
  }

  async stopMonitoring() {
    if (!this.isRunning) {
      console.log('⚠️ Monitoring is not running');
      return;
    }

    console.log('Stopping monitoring...');
    
    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Wait for active jobs to complete
    await this.concurrencyManager.waitForCompletion();
    
    console.log('Monitoring stopped');
  }

  async shutdown() {
    console.log('🔄 Shutting down PhonebankMonitor...');
    
    await this.stopMonitoring();
    
    // Cleanup managers
    await this.browserManager.gracefulShutdown();
    this.cacheManager.destroy();
    this.memoryManager.destroy();
    this.db.close();
    
    console.log('PhonebankMonitor shutdown completed');
  }
}

module.exports = PhonebankMonitor;