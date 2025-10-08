# 📊 Phonebank Devices Checker v2.0

Advanced phonebank monitoring system with real-time dashboard, analytics, and intelligent alerting.

## ✨ Features

### 🔍 **Advanced Monitoring**
- **Real-time device status monitoring** with configurable intervals
- **Smart selective monitoring** based on device health and priority
- **Graceful degradation** during system overload
- **Circuit breaker pattern** for resilient operations
- **Automatic retry mechanisms** with exponential backoff

### 📈 **Analytics & Reporting**
- **Comprehensive uptime analytics** with SLA tracking
- **Performance trend analysis** and prediction
- **Location-based statistics** and capacity planning
- **Automated daily/weekly/monthly reports**
- **Interactive charts and visualizations**

### 🚨 **Intelligent Alerting**
- **Multi-channel notifications** (Email, Slack, Webhooks)
- **Smart alert rules** with cooldown periods
- **Auto-resolution** for transient issues
- **Alert escalation** based on severity
- **Maintenance mode** support

### 🎯 **Performance Optimization**
- **Parallel processing** with concurrency limits
- **Intelligent caching** with TTL management
- **Memory management** with automatic cleanup
- **Browser connection pooling**
- **Database query optimization**

### 🌐 **Real-time Dashboard**
- **Live WebSocket updates** for instant feedback
- **Mobile-responsive design**
- **Interactive device management**
- **System health monitoring**
- **Alert management interface**

## 🚀 Quick Start

### Prerequisites
- **Node.js** v16.0.0 or higher
- **npm** or **yarn**
- **SQLite3** (automatically installed)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/RizqOsman/phonebank_devices_checker.git
   cd phonebank_devices_checker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure the system:**
   ```bash
   # Edit config.json to match your environment
   cp config.json config.local.json
   # Update URLs, alert settings, and notification preferences
   ```

4. **Start the system:**
   ```bash
   npm start
   ```

5. **Access the dashboard:**
   Open http://localhost:3000 in your browser

## 📋 Configuration

The system uses `config.json` for comprehensive configuration:

```json
{
  "environment": "production",
  "monitoring": {
    "timeout": 10000,
    "retryAttempts": 3,
    "concurrencyLimit": 5,
    "intervalMinutes": 5
  },
  "alerts": {
    "enabled": true,
    "thresholds": {
      "unauthorizedMax": 5,
      "responseTimeMax": 30000,
      "uptimeMin": 95.0
    },
    "notifications": {
      "email": {
        "enabled": true,
        "smtp": { /* SMTP settings */ },
        "recipients": ["admin@example.com"]
      },
      "slack": {
        "enabled": true,
        "webhookUrl": "https://hooks.slack.com/...",
        "channel": "#monitoring"
      }
    }
  }
}
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Dashboard │────│   API Server     │────│  Monitoring     │
│   (Frontend)    │    │   (Express.js)   │    │  Engine         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                       ┌────────┴────────┐      ┌────────┴────────┐
                       │  Alert System   │      │  Performance    │
                       │  - Email        │      │  Manager        │
                       │  - Slack        │      │  - Caching      │
                       │  - Webhooks     │      │  - Memory Mgmt  │
                       └─────────────────┘      └─────────────────┘
                                │
                       ┌────────┴────────┐
                       │  SQLite DB      │
                       │  - Device Data  │
                       │  - Analytics    │
                       │  - Alerts       │
                       └─────────────────┘
```

## 📊 Monitoring Locations

### Current Configured Locations:
- **STIN** (High Priority): 12 devices
- **Manggala** (High Priority): 6 devices  
- **Cipondoh** (Medium Priority): 6 devices
- **Depok** (Medium Priority): 6 devices
- **Posko0** (Low Priority): 4 devices
- **DEIMOS** (High Priority): 7 devices

## 🔧 API Endpoints

### Device Management
- `GET /api/devices` - List all devices
- `GET /api/devices/:url/stats` - Device statistics
- `POST /api/devices/:url/check` - Manual device check

### Analytics
- `GET /api/analytics/uptime` - Uptime metrics
- `GET /api/analytics/trends` - Trend analysis
- `GET /api/analytics/capacity` - Capacity reports

### Alerts
- `GET /api/alerts` - Active alerts
- `POST /api/alerts/:id/resolve` - Resolve alert
- `POST /api/alerts/:id/acknowledge` - Acknowledge alert

### System
- `GET /api/health` - System health check
- `GET /api/metrics` - Performance metrics
- `GET /api/overview` - Dashboard overview

## 🚨 Alert Types

| Alert Type | Severity | Trigger Condition |
|------------|----------|-------------------|
| **Device Offline** | High | Device status = offline |
| **High Unauthorized** | Medium | Unauthorized > threshold |
| **Slow Response** | Low | Response time > 30s |
| **Location Degradation** | High | Multiple devices offline |
| **High Memory Usage** | Medium | Memory usage > 85% |

## 📈 Analytics Features

### Uptime Metrics
- Device-level uptime percentages
- Location-based statistics  
- SLA compliance tracking
- Historical trend analysis

### Performance Analytics
- Response time monitoring
- Capacity planning reports
- Resource utilization tracking
- Predictive analysis

### Reporting
- Automated daily reports
- Weekly trend summaries
- Monthly executive reports
- Custom date range reports

## 🔄 Commands

```bash
# Start the system
npm start

# Development mode with auto-reload
npm run dev

# Run tests
npm test

# Check system status
node app.js status

# View help
node app.js help
```

## 🛠️ Advanced Features

### Browser Management
- **Connection pooling** for efficient resource usage
- **Automatic cleanup** of dead browser instances
- **Graceful shutdown** handling
- **Memory leak prevention**

### Database Features
- **SQLite with WAL mode** for better performance
- **Automatic data retention** policies
- **Backup and recovery** procedures
- **Query optimization** with indexes

### Resilience Features
- **Circuit breaker** pattern implementation
- **Exponential backoff** retry logic
- **Graceful degradation** under load
- **Selective monitoring** based on priority

## 📊 Performance Metrics

The system tracks comprehensive metrics:
- Response times and latencies
- Memory and CPU usage
- Cache hit rates
- Error rates and patterns
- Browser resource utilization

## 🔒 Security Features

- **Rate limiting** on API endpoints
- **CORS protection** for web requests
- **Input validation** and sanitization
- **Secure configuration** management
- **Audit logging** for all activities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Author

**Arrizque Osman**
- GitHub: [@RizqOsman](https://github.com/RizqOsman)

## 🔄 Version History

- **v2.0.0** - Complete rewrite with advanced features
- **v1.0.0** - Initial release (December 2023)

## 🆘 Support

For support and questions:
1. Check the [documentation](https://github.com/RizqOsman/phonebank_devices_checker/wiki)
2. Open an [issue](https://github.com/RizqOsman/phonebank_devices_checker/issues)
3. Contact the maintainer

---

# 🔧 Troubleshooting Guide

## Common Issues and Solutions

### 1. High Memory Usage

**Symptoms:**
- `⚠️ High memory usage detected: XX%`
- Application becomes slow or unresponsive

**Solutions:**

#### Option A: Use Optimized Startup (Recommended)
```bash
npm start  # Uses optimized Node.js flags automatically
```

#### Option B: Manual Optimization
```bash
npm run start:optimized
```

#### Option C: Direct Start with Custom Flags
```bash
node --expose-gc --max-old-space-size=2048 --optimize-for-size app.js
```

### 2. File Path Errors

**Symptoms:**
- `Error: ENOENT: no such file or directory`
- Dashboard not loading

**Solutions:**
1. Ensure all files are in correct locations:
   ```
   /public/index.html          Correct
   /src/public/index.html      Wrong
   ```

2. Check file permissions:
   ```bash
   chmod 644 public/index.html
   ```

### 3. Database Issues

**Symptoms:**
- `Failed to save device check`
- Database connection errors

**Solutions:**
1. Check database file permissions:
   ```bash
   ls -la phonebank_monitor.db*
   ```

2. Reset database if corrupted:
   ```bash
   rm phonebank_monitor.db*
   npm start  # Will recreate database
   ```

### 4. Port Already in Use

**Symptoms:**
- `Error: listen EADDRINUSE :::3000`

**Solutions:**
1. Kill existing process:
   ```bash
   lsof -ti:3000 | xargs kill
   ```

2. Use different port in config.json:
   ```json
   {
     "dashboard": {
       "port": 3001
     }
   }
   ```

### 5. Network Connectivity Issues

**Symptoms:**
- Multiple device timeout errors
- High failure rates

**Solutions:**
1. Check network connectivity:
   ```bash
   ping 192.168.98.3
   ```

2. Reduce concurrency in config.json:
   ```json
   {
     "monitoring": {
       "concurrencyLimit": 2,
       "timeout": 15000
     }
   }
   ```

### 6. Browser Issues

**Symptoms:**
- `Failed to create browser`
- Browser connection errors

**Solutions:**
1. Install required dependencies:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install -y chromium-browser
   
   # macOS
   brew install chromium
   ```

2. Use system Chrome:
   ```bash
   export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
   export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
   ```

## Performance Optimization

### Memory Optimization
```json
{
  "monitoring": {
    "concurrencyLimit": 3,
    "enableCache": true,
    "cacheExpiration": 600000
  }
}
```

### Monitoring Frequency
```json
{
  "monitoring": {
    "intervalMinutes": 10,
    "timeout": 10000
  }
}
```

### Selective Monitoring
Disable low-priority locations during high load:
```json
{
  "locations": {
    "Posko0": {
      "enabled": false
    }
  }
}
```

## Monitoring Health

### System Status
```bash
node app.js status
```

### Memory Usage
```bash
# Check current memory usage
ps aux | grep node

# Monitor continuously
top -p $(pgrep -f "node.*app.js")
```

### Database Size
```bash
du -h phonebank_monitor.db*
```

## Log Analysis

### Error Patterns
```bash
# Check for common errors
grep -E "(❌|Error)" logs/phonebank_monitor.log

# Monitor memory warnings
grep "High memory usage" logs/phonebank_monitor.log
```

### Performance Metrics
```bash
# Check response times
grep "response time" logs/phonebank_monitor.log

# Monitor successful checks
grep "✅.*completed" logs/phonebank_monitor.log
```

## Emergency Procedures

### Quick Restart
```bash
pkill -f "node.*app.js"
npm start
```

### Factory Reset
```bash
# Backup current config
cp config.json config.backup.json

# Reset to defaults
git checkout -- config.json
rm phonebank_monitor.db*
npm start
```

### Data Recovery
```bash
# Backup database
cp phonebank_monitor.db phonebank_monitor.backup.db

# Export data
sqlite3 phonebank_monitor.db ".dump" > backup.sql
```

## Contact Support

If issues persist:
1. Check [GitHub Issues](https://github.com/RizqOsman/phonebank_devices_checker/issues)
2. Create new issue with:
   - Error messages
   - System information (`node --version`, `npm --version`)
   - Configuration (without sensitive data)
   - Steps to reproduce

**Built with ❤️**


