const EventEmitter = require('events');

class CacheManager extends EventEmitter {
  constructor(config) {
    super();
    this.enabled = config.monitoring.enableCache || true;
    this.maxSize = config.monitoring.cacheMaxSize || 1000;
    this.ttl = config.monitoring.cacheExpiration || 300000; // 5 minutes
    
    this.cache = new Map();
    this.accessTimes = new Map();
    this.hitCount = 0;
    this.missCount = 0;
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  get(key) {
    if (!this.enabled) return null;
    
    const item = this.cache.get(key);
    if (!item) {
      this.missCount++;
      return null;
    }

    // Check TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      this.accessTimes.delete(key);
      this.missCount++;
      return null;
    }

    this.accessTimes.set(key, Date.now());
    this.hitCount++;
    return item.data;
  }

  set(key, data) {
    if (!this.enabled) return;
    
    // Remove oldest items if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    this.accessTimes.set(key, Date.now());
    
    this.emit('set', { key, size: this.cache.size });
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, time] of this.accessTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessTimes.delete(oldestKey);
      this.emit('evict', { key: oldestKey });
    }
  }

  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.accessTimes.delete(key);
    });
    
    if (keysToDelete.length > 0) {
      this.emit('cleanup', { removed: keysToDelete.length });
    }
  }

  clear() {
    this.cache.clear();
    this.accessTimes.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.emit('clear');
  }

  getStats() {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? (this.hitCount / total * 100).toFixed(2) : 0,
      enabled: this.enabled
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
    this.removeAllListeners();
  }
}

class ConcurrencyManager {
  constructor(config) {
    this.maxConcurrency = config.monitoring.concurrencyLimit || 5;
    this.activeJobs = new Set();
    this.queue = [];
    this.stats = {
      completed: 0,
      failed: 0,
      queued: 0,
      active: 0
    };
  }

  async execute(job, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const jobWrapper = {
        job,
        priority,
        resolve,
        reject,
        createdAt: Date.now()
      };

      if (this.activeJobs.size < this.maxConcurrency) {
        this.runJob(jobWrapper);
      } else {
        this.queue.push(jobWrapper);
        this.stats.queued++;
        this.sortQueue();
      }
    });
  }

  async runJob(jobWrapper) {
    const { job, resolve, reject } = jobWrapper;
    const jobId = Symbol('job');
    
    this.activeJobs.add(jobId);
    this.stats.active++;
    
    try {
      const result = await job();
      this.stats.completed++;
      resolve(result);
    } catch (error) {
      this.stats.failed++;
      reject(error);
    } finally {
      this.activeJobs.delete(jobId);
      this.stats.active--;
      this.processQueue();
    }
  }

  processQueue() {
    while (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrency) {
      const jobWrapper = this.queue.shift();
      this.stats.queued--;
      this.runJob(jobWrapper);
    }
  }

  sortQueue() {
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      maxConcurrency: this.maxConcurrency
    };
  }

  async waitForCompletion() {
    while (this.activeJobs.size > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

class MemoryManager {
  constructor(config) {
    this.config = config;
    this.memoryThreshold = 0.95; // 95% of available memory
    this.checkInterval = 60000; // Check every 60 seconds
    this.listeners = [];
    
    this.startMonitoring();
  }

  startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);
  }

  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const total = usage.heapTotal;
    const used = usage.heapUsed;
    const external = usage.external;
    
    const usagePercent = used / total;
    
    if (usagePercent > this.memoryThreshold) {
      console.warn(`⚠️ High memory usage detected: ${(usagePercent * 100).toFixed(2)}%`);
      this.triggerGarbageCollection();
      this.notifyListeners('high-memory', { usage, usagePercent });
    }
    
    return {
      rss: this.formatBytes(usage.rss),
      heapTotal: this.formatBytes(total),
      heapUsed: this.formatBytes(used),
      external: this.formatBytes(external),
      usagePercent: (usagePercent * 100).toFixed(2)
    };
  }

  triggerGarbageCollection() {
    if (global.gc) {
      global.gc();
      console.log('🧹 Garbage collection triggered');
    } else {
      console.warn('⚠️ Garbage collection not available. Start with --expose-gc flag');
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  onMemoryEvent(callback) {
    this.listeners.push(callback);
  }

  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Memory event listener error:', error);
      }
    });
  }

  getMemoryStats() {
    return this.checkMemoryUsage();
  }

  destroy() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    this.listeners = [];
  }
}

class SelectiveMonitor {
  constructor(config) {
    this.config = config;
    this.locationPriorities = new Map();
    this.deviceHealth = new Map();
    this.monitoringMode = 'normal'; // normal, reduced, emergency
    
    this.initializePriorities();
  }

  initializePriorities() {
    const locations = this.config.locations || {};
    Object.entries(locations).forEach(([name, location]) => {
      this.locationPriorities.set(name, {
        priority: location.priority || 'medium',
        enabled: location.enabled !== false,
        deviceCount: location.urls ? location.urls.length : 0,
        healthScore: 100
      });
    });
  }

  updateDeviceHealth(location, deviceUrl, isHealthy, responseTime) {
    const deviceKey = `${location}:${deviceUrl}`;
    const health = this.deviceHealth.get(deviceKey) || {
      location,
      deviceUrl,
      healthHistory: [],
      avgResponseTime: 0,
      consecutiveFailures: 0
    };

    // Update health history (keep last 10 checks)
    health.healthHistory.push({
      timestamp: Date.now(),
      healthy: isHealthy,
      responseTime
    });
    
    if (health.healthHistory.length > 10) {
      health.healthHistory.shift();
    }

    // Update consecutive failures
    if (isHealthy) {
      health.consecutiveFailures = 0;
    } else {
      health.consecutiveFailures++;
    }

    // Calculate average response time
    const validResponses = health.healthHistory.filter(h => h.healthy && h.responseTime);
    health.avgResponseTime = validResponses.length > 0 
      ? validResponses.reduce((sum, h) => sum + h.responseTime, 0) / validResponses.length 
      : 0;

    this.deviceHealth.set(deviceKey, health);
    this.updateLocationHealth(location);
  }

  updateLocationHealth(location) {
    const locationDevices = Array.from(this.deviceHealth.values())
      .filter(device => device.location === location);
    
    if (locationDevices.length === 0) return;

    const healthyDevices = locationDevices.filter(device => 
      device.consecutiveFailures < 3 && 
      device.healthHistory.some(h => h.healthy)
    ).length;

    const healthScore = (healthyDevices / locationDevices.length) * 100;
    
    const locationInfo = this.locationPriorities.get(location);
    if (locationInfo) {
      locationInfo.healthScore = healthScore;
      this.locationPriorities.set(location, locationInfo);
    }

    this.adjustMonitoringMode();
  }

  adjustMonitoringMode() {
    const locations = Array.from(this.locationPriorities.values());
    const avgHealthScore = locations.reduce((sum, loc) => sum + loc.healthScore, 0) / locations.length;
    
    if (avgHealthScore < 50) {
      this.monitoringMode = 'emergency';
    } else if (avgHealthScore < 75) {
      this.monitoringMode = 'reduced';
    } else {
      this.monitoringMode = 'normal';
    }
  }

  shouldMonitorDevice(location, deviceUrl, priority) {
    const locationInfo = this.locationPriorities.get(location);
    if (!locationInfo || !locationInfo.enabled) {
      return false;
    }

    const deviceKey = `${location}:${deviceUrl}`;
    const deviceHealth = this.deviceHealth.get(deviceKey);

    switch (this.monitoringMode) {
      case 'emergency':
        // Only monitor high priority locations with recent failures
        return priority === 'high' || (deviceHealth && deviceHealth.consecutiveFailures > 0);
      
      case 'reduced':
        // Skip low priority devices that are consistently healthy
        if (priority === 'low' && deviceHealth && 
            deviceHealth.consecutiveFailures === 0 && 
            deviceHealth.healthHistory.length >= 5) {
          const recentlyHealthy = deviceHealth.healthHistory.slice(-5).every(h => h.healthy);
          return !recentlyHealthy;
        }
        return true;
      
      case 'normal':
      default:
        return true;
    }
  }

  getMonitoringStrategy() {
    const priorityOrder = ['high', 'medium', 'low'];
    const locations = Array.from(this.locationPriorities.entries())
      .filter(([name, info]) => info.enabled)
      .sort((a, b) => {
        const aPriority = priorityOrder.indexOf(a[1].priority);
        const bPriority = priorityOrder.indexOf(b[1].priority);
        return aPriority - bPriority;
      });

    return {
      mode: this.monitoringMode,
      locations: locations.map(([name, info]) => ({
        name,
        priority: info.priority,
        healthScore: info.healthScore,
        deviceCount: info.deviceCount
      }))
    };
  }

  getStats() {
    const locations = Array.from(this.locationPriorities.values());
    const devices = Array.from(this.deviceHealth.values());
    
    return {
      monitoringMode: this.monitoringMode,
      totalLocations: locations.length,
      enabledLocations: locations.filter(l => l.enabled).length,
      totalDevices: devices.length,
      healthyDevices: devices.filter(d => d.consecutiveFailures === 0).length,
      avgLocationHealth: locations.reduce((sum, l) => sum + l.healthScore, 0) / locations.length,
      avgResponseTime: devices.reduce((sum, d) => sum + d.avgResponseTime, 0) / devices.length
    };
  }
}

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTime = Date.now();
  }

  recordMetric(name, value, tags = {}) {
    const key = `${name}:${JSON.stringify(tags)}`;
    const metric = this.metrics.get(key) || {
      name,
      tags,
      values: [],
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity
    };

    metric.values.push({ value, timestamp: Date.now() });
    metric.count++;
    metric.sum += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);

    // Keep only last 100 values
    if (metric.values.length > 100) {
      metric.values.shift();
    }

    this.metrics.set(key, metric);
  }

  getMetric(name, tags = {}) {
    const key = `${name}:${JSON.stringify(tags)}`;
    return this.metrics.get(key);
  }

  getAllMetrics() {
    const results = {};
    for (const [key, metric] of this.metrics.entries()) {
      results[key] = {
        ...metric,
        avg: metric.count > 0 ? metric.sum / metric.count : 0
      };
    }
    return results;
  }

  getSystemMetrics() {
    const uptime = Date.now() - this.startTime;
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    return {
      uptime,
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external
      },
      cpu: {
        user: cpu.user,
        system: cpu.system
      }
    };
  }
}

module.exports = {
  CacheManager,
  ConcurrencyManager,
  MemoryManager,
  SelectiveMonitor,
  PerformanceMonitor
};