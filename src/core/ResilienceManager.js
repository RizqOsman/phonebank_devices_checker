const puppeteer = require('puppeteer');

class BrowserManager {
  constructor(config) {
    this.config = config;
    this.browsers = new Map();
    this.maxBrowsers = config.monitoring.concurrencyLimit || 5;
    this.browserQueue = [];
    this.isShuttingDown = false;
    
    // Setup cleanup on process exit
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
  }

  async getBrowser() {
    // Check if we have available browser
    for (const [id, browser] of this.browsers.entries()) {
      try {
        const pages = await browser.pages();
        if (pages.length <= 1) { // Only default about:blank page
          return { browser, id };
        }
      } catch (error) {
        // Browser is dead, remove it
        this.browsers.delete(id);
        console.warn(`🔄 Removed dead browser ${id}`);
      }
    }

    // Create new browser if under limit
    if (this.browsers.size < this.maxBrowsers) {
      return await this.createBrowser();
    }

    // Wait for available browser
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for available browser'));
      }, 30000);

      this.browserQueue.push({ resolve, reject, timeout });
    });
  }

  async createBrowser() {
    try {
      const browserId = `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images',
          '--disable-javascript', // We don't need JS for our monitoring
        ],
        timeout: this.config.monitoring.timeout || 10000,
      });

      // Handle browser disconnection
      browser.on('disconnected', () => {
        console.warn(`🔄 Browser ${browserId} disconnected`);
        this.browsers.delete(browserId);
        this.processQueue();
      });

      this.browsers.set(browserId, browser);
      console.log(`Created browser ${browserId} (${this.browsers.size}/${this.maxBrowsers})`);
      
      return { browser, id: browserId };
    } catch (error) {
      console.error('Failed to create browser:', error.message);
      throw error;
    }
  }

  async releaseBrowser(browserId) {
    const browser = this.browsers.get(browserId);
    if (browser) {
      try {
        const pages = await browser.pages();
        // Close all pages except the first one (about:blank)
        for (let i = 1; i < pages.length; i++) {
          await pages[i].close();
        }
      } catch (error) {
        console.warn(`⚠️ Error closing pages for browser ${browserId}:`, error.message);
      }
    }
    
    this.processQueue();
  }

  processQueue() {
    if (this.browserQueue.length > 0 && this.browsers.size > 0) {
      const { resolve, reject, timeout } = this.browserQueue.shift();
      clearTimeout(timeout);
      
      this.getBrowser()
        .then(resolve)
        .catch(reject);
    }
  }

  async gracefulShutdown() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('🔄 Shutting down browser manager...');
    
    // Clear queue
    this.browserQueue.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Browser manager shutting down'));
    });
    this.browserQueue = [];

    // Close all browsers
    const closePromises = Array.from(this.browsers.values()).map(async (browser) => {
      try {
        await browser.close();
      } catch (error) {
        console.warn('⚠️ Error closing browser:', error.message);
      }
    });

    await Promise.allSettled(closePromises);
    this.browsers.clear();
    console.log('Browser manager shutdown completed');
  }

  getBrowserStats() {
    return {
      activeBrowsers: this.browsers.size,
      maxBrowsers: this.maxBrowsers,
      queueLength: this.browserQueue.length
    };
  }
}

class RetryManager {
  constructor(config) {
    this.maxRetries = config.monitoring.retryAttempts || 3;
    this.retryDelay = config.monitoring.retryDelay || 2000;
    this.backoffMultiplier = 1.5;
  }

  async executeWithRetry(operation, context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        const endTime = Date.now();
        
        return {
          success: true,
          result,
          attempt: attempt + 1,
          responseTime: endTime - startTime,
          error: null
        };
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(this.backoffMultiplier, attempt);
          console.warn(`⚠️ Attempt ${attempt + 1} failed for ${context.url || 'operation'}: ${error.message}. Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    return {
      success: false,
      result: null,
      attempt: this.maxRetries + 1,
      responseTime: 0,
      error: lastError
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class TimeoutManager {
  constructor(config) {
    this.defaultTimeout = config.monitoring.timeout || 10000;
  }

  async withTimeout(promise, timeout = this.defaultTimeout, errorMessage = 'Operation timed out') {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(errorMessage));
        }, timeout);
      })
    ]);
  }
}

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 120000;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.requestCount = 0;
    
    // Reset failure count periodically
    setInterval(() => {
      if (this.state === 'CLOSED') {
        this.failureCount = Math.max(0, this.failureCount - 1);
      }
    }, this.monitoringPeriod);
  }

  async execute(operation, fallback = null) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log('🔄 Circuit breaker entering HALF_OPEN state');
      } else {
        console.warn('⚠️ Circuit breaker is OPEN, using fallback');
        return fallback ? await fallback() : { success: false, error: new Error('Circuit breaker is OPEN') };
      }
    }

    this.requestCount++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      console.log('Circuit breaker reset to CLOSED state');
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`🚨 Circuit breaker OPENED due to ${this.failureCount} failures`);
    }
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      failureRate: this.requestCount > 0 ? (this.failureCount / this.requestCount * 100) : 0
    };
  }
}

class GracefulDegradation {
  constructor(config) {
    this.config = config;
    this.healthStatus = new Map();
    this.degradationLevel = 'NORMAL'; // NORMAL, PARTIAL, CRITICAL
  }

  updateHealth(location, status) {
    this.healthStatus.set(location, {
      status,
      lastUpdate: Date.now()
    });
    
    this.calculateDegradationLevel();
  }

  calculateDegradationLevel() {
    const locations = Array.from(this.healthStatus.values());
    const total = locations.length;
    
    if (total === 0) {
      this.degradationLevel = 'NORMAL';
      return;
    }

    const healthy = locations.filter(loc => loc.status === 'healthy').length;
    const healthPercentage = (healthy / total) * 100;

    if (healthPercentage >= 80) {
      this.degradationLevel = 'NORMAL';
    } else if (healthPercentage >= 50) {
      this.degradationLevel = 'PARTIAL';
    } else {
      this.degradationLevel = 'CRITICAL';
    }
  }

  shouldSkipLocation(location, priority) {
    const health = this.healthStatus.get(location);
    
    // Skip unhealthy low priority locations during degradation
    if (this.degradationLevel === 'PARTIAL' && priority === 'low' && 
        health && health.status !== 'healthy') {
      return true;
    }
    
    // During critical degradation, only monitor high priority
    if (this.degradationLevel === 'CRITICAL' && priority !== 'high') {
      return true;
    }
    
    return false;
  }

  getDegradationStatus() {
    return {
      level: this.degradationLevel,
      locations: Object.fromEntries(this.healthStatus),
      recommendations: this.getRecommendations()
    };
  }

  getRecommendations() {
    switch (this.degradationLevel) {
      case 'PARTIAL':
        return [
          'Some locations are experiencing issues',
          'Low priority monitoring may be reduced',
          'Consider checking network connectivity'
        ];
      case 'CRITICAL':
        return [
          'Critical system degradation detected',
          'Only high priority locations are being monitored',
          'Immediate attention required'
        ];
      default:
        return ['All systems operating normally'];
    }
  }
}

module.exports = {
  BrowserManager,
  RetryManager,
  TimeoutManager,
  CircuitBreaker,
  GracefulDegradation
};