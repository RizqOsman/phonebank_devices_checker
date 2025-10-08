const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor(dbPath = './phonebank_monitor.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Connect to database
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Failed to connect to database:', err.message);
          return;
        }
        console.log('Connected to SQLite database');
        this.isConnected = true;
      });

      // Enable WAL mode for better performance
      this.db.run('PRAGMA journal_mode=WAL');
      this.db.run('PRAGMA synchronous=NORMAL');
      this.db.run('PRAGMA cache_size=10000');
      this.db.run('PRAGMA foreign_keys=ON');

      await this.createTables();
      await this.createIndexes();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
    }
  }

  createTables() {
    return new Promise((resolve, reject) => {
      const tables = [
        // Devices table
        `CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT UNIQUE NOT NULL,
          location TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'medium',
          ip_address TEXT,
          status TEXT DEFAULT 'unknown',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Device checks/monitoring history
        `CREATE TABLE IF NOT EXISTS device_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL,
          check_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          response_time INTEGER,
          status TEXT NOT NULL,
          authorized_count INTEGER DEFAULT 0,
          unauthorized_count INTEGER DEFAULT 0,
          phonebank_ip TEXT,
          error_message TEXT,
          raw_data TEXT,
          FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
        )`,

        // Alerts table
        `CREATE TABLE IF NOT EXISTS alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'medium',
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME,
          acknowledged_at DATETIME,
          acknowledged_by TEXT,
          FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
        )`,

        // Alert notifications tracking
        `CREATE TABLE IF NOT EXISTS alert_notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id INTEGER NOT NULL,
          notification_type TEXT NOT NULL,
          recipient TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          sent_at DATETIME,
          error_message TEXT,
          FOREIGN KEY (alert_id) REFERENCES alerts (id) ON DELETE CASCADE
        )`,

        // System events/logs
        `CREATE TABLE IF NOT EXISTS system_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          message TEXT NOT NULL,
          metadata TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Performance metrics
        `CREATE TABLE IF NOT EXISTS performance_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          metric_type TEXT NOT NULL,
          location TEXT,
          device_id INTEGER,
          value REAL NOT NULL,
          unit TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
        )`,

        // Configuration changes audit
        `CREATE TABLE IF NOT EXISTS config_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          config_key TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_by TEXT DEFAULT 'system',
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Maintenance windows
        `CREATE TABLE IF NOT EXISTS maintenance_windows (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          device_id INTEGER,
          start_time DATETIME NOT NULL,
          end_time DATETIME NOT NULL,
          status TEXT DEFAULT 'scheduled',
          created_by TEXT DEFAULT 'system',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
        )`
      ];

      let completed = 0;
      tables.forEach((sql, index) => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error(`Failed to create table ${index + 1}:`, err.message);
            reject(err);
            return;
          }
          completed++;
          if (completed === tables.length) {
            console.log('All database tables created successfully');
            resolve();
          }
        });
      });
    });
  }

  createIndexes() {
    return new Promise((resolve, reject) => {
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_devices_url ON devices(url)',
        'CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location)',
        'CREATE INDEX IF NOT EXISTS idx_device_checks_device_id ON device_checks(device_id)',
        'CREATE INDEX IF NOT EXISTS idx_device_checks_timestamp ON device_checks(check_timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_device_checks_status ON device_checks(status)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON alerts(device_id)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type)',
        'CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON performance_metrics(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_performance_metrics_device_id ON performance_metrics(device_id)',
        'CREATE INDEX IF NOT EXISTS idx_maintenance_windows_device_id ON maintenance_windows(device_id)',
        'CREATE INDEX IF NOT EXISTS idx_maintenance_windows_time ON maintenance_windows(start_time, end_time)'
      ];

      let completed = 0;
      indexes.forEach((sql, index) => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error(`Failed to create index ${index + 1}:`, err.message);
            reject(err);
            return;
          }
          completed++;
          if (completed === indexes.length) {
            console.log('All database indexes created successfully');
            resolve();
          }
        });
      });
    });
  }

  // Device management methods
  async addDevice(url, location, priority = 'medium') {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO devices (url, location, priority) VALUES (?, ?, ?)`;
      this.db.run(sql, [url, location, priority], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getDevice(url) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM devices WHERE url = ?`;
      this.db.get(sql, [url], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getAllDevices() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM devices ORDER BY location, priority`;
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updateDeviceStatus(url, status, ipAddress = null) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE devices SET status = ?, ip_address = ?, updated_at = CURRENT_TIMESTAMP WHERE url = ?`;
      this.db.run(sql, [status, ipAddress, url], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Device checks/monitoring methods
  async addDeviceCheck(deviceId, responseTime, status, authorizedCount, unauthorizedCount, phonebankIp, errorMessage = null, rawData = null) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO device_checks 
        (device_id, response_time, status, authorized_count, unauthorized_count, phonebank_ip, error_message, raw_data) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      
      this.db.run(sql, [deviceId, responseTime, status, authorizedCount, unauthorizedCount, phonebankIp, errorMessage, rawData], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getDeviceHistory(deviceId, limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM device_checks WHERE device_id = ? ORDER BY check_timestamp DESC LIMIT ?`;
      this.db.all(sql, [deviceId, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getLatestChecks(limit = 50) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT dc.*, d.url, d.location, d.priority 
        FROM device_checks dc 
        JOIN devices d ON dc.device_id = d.id 
        ORDER BY dc.check_timestamp DESC 
        LIMIT ?`;
      
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Analytics methods
  async getUptimeStats(deviceId, days = 7) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_checks,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as successful_checks,
          AVG(response_time) as avg_response_time,
          MIN(response_time) as min_response_time,
          MAX(response_time) as max_response_time
        FROM device_checks 
        WHERE device_id = ? 
        AND check_timestamp >= datetime('now', '-${days} days')`;
      
      this.db.get(sql, [deviceId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          const uptime = row.total_checks > 0 ? (row.successful_checks / row.total_checks * 100) : 0;
          resolve({
            ...row,
            uptime_percentage: uptime
          });
        }
      });
    });
  }

  async getLocationStats(location, days = 7) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          d.location,
          COUNT(dc.id) as total_checks,
          SUM(CASE WHEN dc.status = 'online' THEN 1 ELSE 0 END) as successful_checks,
          AVG(dc.response_time) as avg_response_time,
          COUNT(DISTINCT d.id) as device_count
        FROM devices d
        LEFT JOIN device_checks dc ON d.id = dc.device_id 
        WHERE d.location = ? 
        AND (dc.check_timestamp >= datetime('now', '-${days} days') OR dc.check_timestamp IS NULL)
        GROUP BY d.location`;
      
      this.db.get(sql, [location], (err, row) => {
        if (err) {
          reject(err);
        } else {
          const uptime = row.total_checks > 0 ? (row.successful_checks / row.total_checks * 100) : 0;
          resolve({
            ...row,
            uptime_percentage: uptime
          });
        }
      });
    });
  }

  // Alert methods
  async createAlert(deviceId, alertType, severity, title, message) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO alerts (device_id, alert_type, severity, title, message) VALUES (?, ?, ?, ?, ?)`;
      this.db.run(sql, [deviceId, alertType, severity, title, message], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  async getActiveAlerts() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT a.*, d.url, d.location 
        FROM alerts a 
        LEFT JOIN devices d ON a.device_id = d.id 
        WHERE a.status = 'active' 
        ORDER BY a.created_at DESC`;
      
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async resolveAlert(alertId, resolvedBy = 'system') {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?`;
      this.db.run(sql, [alertId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // System events
  async logEvent(eventType, severity, message, metadata = null) {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO system_events (event_type, severity, message, metadata) VALUES (?, ?, ?, ?)`;
      const metadataStr = metadata ? JSON.stringify(metadata) : null;
      
      this.db.run(sql, [eventType, severity, message, metadataStr], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // Data cleanup
  async cleanupOldData(retentionDays = 30) {
    return new Promise((resolve, reject) => {
      const queries = [
        `DELETE FROM device_checks WHERE check_timestamp < datetime('now', '-${retentionDays} days')`,
        `DELETE FROM system_events WHERE timestamp < datetime('now', '-${retentionDays} days')`,
        `DELETE FROM performance_metrics WHERE timestamp < datetime('now', '-${retentionDays} days')`,
        `DELETE FROM alerts WHERE status = 'resolved' AND resolved_at < datetime('now', '-${retentionDays} days')`
      ];

      let completed = 0;
      queries.forEach(sql => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error('Cleanup error:', err.message);
          }
          completed++;
          if (completed === queries.length) {
            console.log('Database cleanup completed');
            resolve();
          }
        });
      });
    });
  }

  // Database backup
  async backup(backupPath) {
    return new Promise((resolve, reject) => {
      const backup = this.db.backup(backupPath);
      backup.step(-1, (err) => {
        if (err) {
          reject(err);
        } else {
          backup.finish((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed');
          this.isConnected = false;
        }
      });
    }
  }
}

module.exports = DatabaseManager;