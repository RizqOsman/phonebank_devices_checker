const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor(configPath = './config.json') {
    this.configPath = configPath;
    this.config = null;
    this.watchers = [];
    this.loadConfig();
    this.setupWatcher();
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
      this.validateConfig();
      console.log(`Configuration loaded from ${this.configPath}`);
    } catch (error) {
      console.error(`Failed to load configuration: ${error.message}`);
      this.createDefaultConfig();
    }
  }

  validateConfig() {
    const required = ['environment', 'monitoring', 'locations', 'database', 'alerts'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration keys: ${missing.join(', ')}`);
    }

    // Validate monitoring settings
    const monitoring = this.config.monitoring;
    if (monitoring.timeout < 1000 || monitoring.timeout > 60000) {
      throw new Error('Timeout must be between 1000 and 60000 ms');
    }

    if (monitoring.concurrencyLimit < 1 || monitoring.concurrencyLimit > 20) {
      throw new Error('Concurrency limit must be between 1 and 20');
    }

    // Validate locations
    Object.entries(this.config.locations).forEach(([name, location]) => {
      if (!location.urls || !Array.isArray(location.urls)) {
        throw new Error(`Location ${name} must have a valid urls array`);
      }
      
      if (!['high', 'medium', 'low'].includes(location.priority)) {
        throw new Error(`Location ${name} priority must be 'high', 'medium', or 'low'`);
      }
    });

    console.log('Configuration validation passed');
  }

  createDefaultConfig() {
    const defaultConfig = {
      environment: 'development',
      monitoring: {
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 2000,
        concurrencyLimit: 5,
        intervalMinutes: 5,
        enableCache: true,
        cacheExpiration: 300000
      },
      locations: {},
      database: {
        path: './phonebank_monitor.db',
        enableWAL: true,
        backupInterval: 86400000,
        retentionDays: 30
      },
      alerts: {
        enabled: false,
        thresholds: {
          unauthorizedMax: 5,
          responseTimeMax: 30000,
          uptimeMin: 95.0
        }
      }
    };

    fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
    this.config = defaultConfig;
    console.log(`⚠️  Created default configuration at ${this.configPath}`);
  }

  setupWatcher() {
    if (fs.existsSync(this.configPath)) {
      fs.watchFile(this.configPath, (curr, prev) => {
        console.log('📝 Configuration file changed, reloading...');
        this.loadConfig();
        this.watchers.forEach(callback => callback(this.config));
      });
    }
  }

  get(key = null) {
    if (!key) return this.config;
    
    return key.split('.').reduce((obj, prop) => {
      return obj && obj[prop] !== undefined ? obj[prop] : null;
    }, this.config);
  }

  set(key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, prop) => {
      if (!obj[prop]) obj[prop] = {};
      return obj[prop];
    }, this.config);
    
    target[lastKey] = value;
    this.saveConfig();
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('Configuration saved successfully');
    } catch (error) {
      console.error(`Failed to save configuration: ${error.message}`);
    }
  }

  getEnabledLocations() {
    return Object.entries(this.config.locations)
      .filter(([name, location]) => location.enabled)
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a[1].priority] - priorityOrder[b[1].priority];
      });
  }

  getAllUrls() {
    const enabledLocations = this.getEnabledLocations();
    const urls = [];
    
    enabledLocations.forEach(([name, location]) => {
      location.urls.forEach(url => {
        urls.push({
          url,
          location: name,
          priority: location.priority
        });
      });
    });
    
    return urls;
  }

  onConfigChange(callback) {
    this.watchers.push(callback);
  }

  getEnvironment() {
    return this.config.environment || 'development';
  }

  isDevelopment() {
    return this.getEnvironment() === 'development';
  }

  isProduction() {
    return this.getEnvironment() === 'production';
  }
}

module.exports = ConfigManager;