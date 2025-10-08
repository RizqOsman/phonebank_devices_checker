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