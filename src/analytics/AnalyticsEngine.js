class AnalyticsEngine {
  constructor(db, config) {
    this.db = db;
    this.config = config;
    this.metricsCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async calculateUptimeMetrics(deviceId = null, location = null, days = 7) {
    const cacheKey = `uptime:${deviceId || 'all'}:${location || 'all'}:${days}`;
    const cached = this.getCachedMetric(cacheKey);
    
    if (cached) return cached;

    try {
      let whereClause = `WHERE dc.check_timestamp >= datetime('now', '-${days} days')`;
      let params = [];

      if (deviceId) {
        whereClause += ` AND d.id = ?`;
        params.push(deviceId);
      }

      if (location) {
        whereClause += ` AND d.location = ?`;
        params.push(location);
      }

      const sql = `
        SELECT 
          d.id,
          d.url,
          d.location,
          d.priority,
          COUNT(dc.id) as total_checks,
          SUM(CASE WHEN dc.status = 'online' THEN 1 ELSE 0 END) as successful_checks,
          AVG(CASE WHEN dc.status = 'online' THEN dc.response_time END) as avg_response_time,
          MIN(CASE WHEN dc.status = 'online' THEN dc.response_time END) as min_response_time,
          MAX(CASE WHEN dc.status = 'online' THEN dc.response_time END) as max_response_time,
          COUNT(CASE WHEN dc.status = 'offline' THEN 1 END) as failure_count,
          MAX(dc.check_timestamp) as last_check
        FROM devices d
        LEFT JOIN device_checks dc ON d.id = dc.device_id
        ${whereClause}
        GROUP BY d.id, d.url, d.location, d.priority
        ORDER BY d.location, d.priority
      `;

      const result = await new Promise((resolve, reject) => {
        this.db.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const metrics = result.map(row => {
        const uptimePercentage = row.total_checks > 0 
          ? (row.successful_checks / row.total_checks * 100) 
          : 0;

        return {
          deviceId: row.id,
          url: row.url,
          location: row.location,
          priority: row.priority,
          totalChecks: row.total_checks,
          successfulChecks: row.successful_checks,
          failureCount: row.failure_count,
          uptimePercentage: parseFloat(uptimePercentage.toFixed(2)),
          avgResponseTime: row.avg_response_time ? parseFloat(row.avg_response_time.toFixed(2)) : null,
          minResponseTime: row.min_response_time,
          maxResponseTime: row.max_response_time,
          lastCheck: row.last_check,
          slaStatus: this.getSLAStatus(uptimePercentage)
        };
      });

      this.setCachedMetric(cacheKey, metrics);
      return metrics;

    } catch (error) {
      console.error('Failed to calculate uptime metrics:', error);
      throw error;
    }
  }

  async calculateLocationMetrics(days = 7) {
    const cacheKey = `location_metrics:${days}`;
    const cached = this.getCachedMetric(cacheKey);
    
    if (cached) return cached;

    try {
      const sql = `
        SELECT 
          d.location,
          d.priority,
          COUNT(DISTINCT d.id) as device_count,
          COUNT(dc.id) as total_checks,
          SUM(CASE WHEN dc.status = 'online' THEN 1 ELSE 0 END) as successful_checks,
          AVG(CASE WHEN dc.status = 'online' THEN dc.response_time END) as avg_response_time,
          COUNT(CASE WHEN dc.status = 'offline' THEN 1 END) as failure_count,
          AVG(dc.authorized_count) as avg_authorized,
          AVG(dc.unauthorized_count) as avg_unauthorized,
          MAX(dc.check_timestamp) as last_check
        FROM devices d
        LEFT JOIN device_checks dc ON d.id = dc.device_id
        WHERE dc.check_timestamp >= datetime('now', '-${days} days')
        GROUP BY d.location, d.priority
        ORDER BY d.priority, d.location
      `;

      const result = await new Promise((resolve, reject) => {
        this.db.db.all(sql, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const locationMetrics = {};
      
      result.forEach(row => {
        const location = row.location;
        const uptimePercentage = row.total_checks > 0 
          ? (row.successful_checks / row.total_checks * 100) 
          : 0;

        if (!locationMetrics[location]) {
          locationMetrics[location] = {
            location,
            priority: row.priority,
            deviceCount: 0,
            totalChecks: 0,
            successfulChecks: 0,
            failureCount: 0,
            avgResponseTime: 0,
            avgAuthorized: 0,
            avgUnauthorized: 0,
            uptimePercentage: 0,
            lastCheck: null,
            slaStatus: 'unknown'
          };
        }

        const loc = locationMetrics[location];
        loc.deviceCount += row.device_count;
        loc.totalChecks += row.total_checks;
        loc.successfulChecks += row.successful_checks;
        loc.failureCount += row.failure_count;
        
        // Calculate weighted averages
        if (row.avg_response_time) {
          loc.avgResponseTime = (loc.avgResponseTime + row.avg_response_time) / 2;
        }
        
        loc.avgAuthorized = (loc.avgAuthorized + (row.avg_authorized || 0)) / 2;
        loc.avgUnauthorized = (loc.avgUnauthorized + (row.avg_unauthorized || 0)) / 2;
        
        if (!loc.lastCheck || row.last_check > loc.lastCheck) {
          loc.lastCheck = row.last_check;
        }
      });

      // Calculate final uptime percentages and SLA status
      Object.values(locationMetrics).forEach(loc => {
        loc.uptimePercentage = loc.totalChecks > 0 
          ? parseFloat((loc.successfulChecks / loc.totalChecks * 100).toFixed(2))
          : 0;
        loc.avgResponseTime = parseFloat(loc.avgResponseTime.toFixed(2));
        loc.avgAuthorized = parseFloat(loc.avgAuthorized.toFixed(2));
        loc.avgUnauthorized = parseFloat(loc.avgUnauthorized.toFixed(2));
        loc.slaStatus = this.getSLAStatus(loc.uptimePercentage);
      });

      const metrics = Object.values(locationMetrics);
      this.setCachedMetric(cacheKey, metrics);
      return metrics;

    } catch (error) {
      console.error('Failed to calculate location metrics:', error);
      throw error;
    }
  }

  async calculateTrendAnalysis(deviceId = null, location = null, days = 30) {
    const cacheKey = `trends:${deviceId || 'all'}:${location || 'all'}:${days}`;
    const cached = this.getCachedMetric(cacheKey);
    
    if (cached) return cached;

    try {
      let whereClause = `WHERE dc.check_timestamp >= datetime('now', '-${days} days')`;
      let params = [];

      if (deviceId) {
        whereClause += ` AND d.id = ?`;
        params.push(deviceId);
      }

      if (location) {
        whereClause += ` AND d.location = ?`;
        params.push(location);
      }

      const sql = `
        SELECT 
          date(dc.check_timestamp) as check_date,
          d.location,
          COUNT(dc.id) as total_checks,
          SUM(CASE WHEN dc.status = 'online' THEN 1 ELSE 0 END) as successful_checks,
          AVG(CASE WHEN dc.status = 'online' THEN dc.response_time END) as avg_response_time,
          AVG(dc.authorized_count) as avg_authorized,
          AVG(dc.unauthorized_count) as avg_unauthorized,
          COUNT(CASE WHEN dc.status = 'offline' THEN 1 END) as failure_count
        FROM devices d
        JOIN device_checks dc ON d.id = dc.device_id
        ${whereClause}
        GROUP BY date(dc.check_timestamp), d.location
        ORDER BY check_date DESC, d.location
      `;

      const result = await new Promise((resolve, reject) => {
        this.db.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const trends = result.map(row => {
        const uptimePercentage = row.total_checks > 0 
          ? (row.successful_checks / row.total_checks * 100) 
          : 0;

        return {
          date: row.check_date,
          location: row.location,
          totalChecks: row.total_checks,
          successfulChecks: row.successful_checks,
          failureCount: row.failure_count,
          uptimePercentage: parseFloat(uptimePercentage.toFixed(2)),
          avgResponseTime: row.avg_response_time ? parseFloat(row.avg_response_time.toFixed(2)) : null,
          avgAuthorized: parseFloat((row.avg_authorized || 0).toFixed(2)),
          avgUnauthorized: parseFloat((row.avg_unauthorized || 0).toFixed(2))
        };
      });

      // Calculate trend indicators
      const trendAnalysis = this.calculateTrendIndicators(trends);
      
      this.setCachedMetric(cacheKey, trendAnalysis);
      return trendAnalysis;

    } catch (error) {
      console.error('Failed to calculate trend analysis:', error);
      throw error;
    }
  }

  calculateTrendIndicators(trends) {
    if (trends.length < 2) {
      return { trends, indicators: { trend: 'insufficient_data' } };
    }

    const recentPeriod = trends.slice(0, Math.floor(trends.length / 2));
    const olderPeriod = trends.slice(Math.floor(trends.length / 2));

    const recentAvgUptime = recentPeriod.reduce((sum, t) => sum + t.uptimePercentage, 0) / recentPeriod.length;
    const olderAvgUptime = olderPeriod.reduce((sum, t) => sum + t.uptimePercentage, 0) / olderPeriod.length;

    const recentAvgResponse = recentPeriod
      .filter(t => t.avgResponseTime)
      .reduce((sum, t) => sum + t.avgResponseTime, 0) / 
      recentPeriod.filter(t => t.avgResponseTime).length;

    const olderAvgResponse = olderPeriod
      .filter(t => t.avgResponseTime)
      .reduce((sum, t) => sum + t.avgResponseTime, 0) / 
      olderPeriod.filter(t => t.avgResponseTime).length;

    const uptimeTrend = recentAvgUptime - olderAvgUptime;
    const responseTrend = recentAvgResponse - olderAvgResponse;

    let trendDirection = 'stable';
    if (Math.abs(uptimeTrend) > 5) { // 5% threshold
      trendDirection = uptimeTrend > 0 ? 'improving' : 'degrading';
    }

    return {
      trends,
      indicators: {
        trend: trendDirection,
        uptimeChange: parseFloat(uptimeTrend.toFixed(2)),
        responseTimeChange: parseFloat(responseTrend.toFixed(2)),
        recentAvgUptime: parseFloat(recentAvgUptime.toFixed(2)),
        olderAvgUptime: parseFloat(olderAvgUptime.toFixed(2)),
        recentAvgResponse: parseFloat(recentAvgResponse.toFixed(2)),
        olderAvgResponse: parseFloat(olderAvgResponse.toFixed(2))
      }
    };
  }

  async generateCapacityReport(location = null, days = 7) {
    const cacheKey = `capacity:${location || 'all'}:${days}`;
    const cached = this.getCachedMetric(cacheKey);
    
    if (cached) return cached;

    try {
      let whereClause = `WHERE dc.check_timestamp >= datetime('now', '-${days} days')`;
      let params = [];

      if (location) {
        whereClause += ` AND d.location = ?`;
        params.push(location);
      }

      const sql = `
        SELECT 
          d.location,
          d.priority,
          COUNT(DISTINCT d.id) as device_count,
          AVG(dc.authorized_count) as avg_authorized,
          MAX(dc.authorized_count) as max_authorized,
          MIN(dc.authorized_count) as min_authorized,
          AVG(dc.unauthorized_count) as avg_unauthorized,
          MAX(dc.unauthorized_count) as max_unauthorized,
          COUNT(CASE WHEN dc.status = 'online' THEN 1 END) as online_readings,
          COUNT(dc.id) as total_readings,
          AVG(CASE WHEN dc.status = 'online' THEN dc.response_time END) as avg_response_time
        FROM devices d
        JOIN device_checks dc ON d.id = dc.device_id
        ${whereClause}
        GROUP BY d.location, d.priority
        ORDER BY d.priority, d.location
      `;

      const result = await new Promise((resolve, reject) => {
        this.db.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const capacityReport = result.map(row => {
        const utilizationRate = row.total_readings > 0 
          ? (row.online_readings / row.total_readings * 100)
          : 0;

        const capacityScore = this.calculateCapacityScore(
          row.avg_authorized,
          row.max_authorized,
          row.avg_unauthorized,
          utilizationRate,
          row.avg_response_time
        );

        return {
          location: row.location,
          priority: row.priority,
          deviceCount: row.device_count,
          avgAuthorized: parseFloat((row.avg_authorized || 0).toFixed(2)),
          maxAuthorized: row.max_authorized || 0,
          minAuthorized: row.min_authorized || 0,
          avgUnauthorized: parseFloat((row.avg_unauthorized || 0).toFixed(2)),
          maxUnauthorized: row.max_unauthorized || 0,
          utilizationRate: parseFloat(utilizationRate.toFixed(2)),
          avgResponseTime: row.avg_response_time ? parseFloat(row.avg_response_time.toFixed(2)) : null,
          capacityScore: capacityScore.score,
          capacityStatus: capacityScore.status,
          recommendations: capacityScore.recommendations
        };
      });

      this.setCachedMetric(cacheKey, capacityReport);
      return capacityReport;

    } catch (error) {
      console.error('Failed to generate capacity report:', error);
      throw error;
    }
  }

  calculateCapacityScore(avgAuthorized, maxAuthorized, avgUnauthorized, utilizationRate, avgResponseTime) {
    let score = 100;
    const recommendations = [];

    // Penalize high unauthorized connections
    if (avgUnauthorized > 5) {
      score -= Math.min(avgUnauthorized * 2, 30);
      recommendations.push('High unauthorized connections detected - review security');
    }

    // Penalize low utilization
    if (utilizationRate < 80) {
      score -= (80 - utilizationRate) * 0.5;
      recommendations.push('Low utilization rate - check device connectivity');
    }

    // Penalize slow response times
    if (avgResponseTime && avgResponseTime > 10000) {
      score -= Math.min((avgResponseTime - 10000) / 1000, 20);
      recommendations.push('Slow response times detected - check network performance');
    }

    // Bonus for consistent authorized connections
    if (avgAuthorized >= 25 && avgAuthorized <= 35) {
      score += 5;
    }

    score = Math.max(0, Math.min(100, score));

    let status = 'excellent';
    if (score < 60) status = 'poor';
    else if (score < 75) status = 'fair';
    else if (score < 90) status = 'good';

    if (recommendations.length === 0) {
      recommendations.push('System operating within normal parameters');
    }

    return {
      score: parseFloat(score.toFixed(2)),
      status,
      recommendations
    };
  }

  async generateAlertReport(days = 7) {
    const cacheKey = `alerts:${days}`;
    const cached = this.getCachedMetric(cacheKey);
    
    if (cached) return cached;

    try {
      const sql = `
        SELECT 
          a.alert_type,
          a.severity,
          COUNT(*) as alert_count,
          COUNT(CASE WHEN a.status = 'resolved' THEN 1 END) as resolved_count,
          AVG(
            CASE 
              WHEN a.resolved_at IS NOT NULL 
              THEN (julianday(a.resolved_at) - julianday(a.created_at)) * 24 * 60 
            END
          ) as avg_resolution_time_minutes,
          d.location,
          MAX(a.created_at) as last_occurrence
        FROM alerts a
        LEFT JOIN devices d ON a.device_id = d.id
        WHERE a.created_at >= datetime('now', '-${days} days')
        GROUP BY a.alert_type, a.severity, d.location
        ORDER BY alert_count DESC, a.severity
      `;

      const result = await new Promise((resolve, reject) => {
        this.db.db.all(sql, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const alertReport = {
        summary: {
          totalAlerts: result.reduce((sum, row) => sum + row.alert_count, 0),
          resolvedAlerts: result.reduce((sum, row) => sum + row.resolved_count, 0),
          avgResolutionTime: 0,
          topAlertTypes: [],
          severityBreakdown: { low: 0, medium: 0, high: 0 }
        },
        details: result.map(row => ({
          alertType: row.alert_type,
          severity: row.severity,
          location: row.location,
          alertCount: row.alert_count,
          resolvedCount: row.resolved_count,
          resolutionRate: row.alert_count > 0 
            ? parseFloat((row.resolved_count / row.alert_count * 100).toFixed(2))
            : 0,
          avgResolutionTime: row.avg_resolution_time_minutes 
            ? parseFloat(row.avg_resolution_time_minutes.toFixed(2))
            : null,
          lastOccurrence: row.last_occurrence
        }))
      };

      // Calculate summary statistics
      const resolutionTimes = result
        .filter(row => row.avg_resolution_time_minutes)
        .map(row => row.avg_resolution_time_minutes);
      
      if (resolutionTimes.length > 0) {
        alertReport.summary.avgResolutionTime = parseFloat(
          (resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length).toFixed(2)
        );
      }

      // Top alert types
      alertReport.summary.topAlertTypes = result
        .sort((a, b) => b.alert_count - a.alert_count)
        .slice(0, 5)
        .map(row => ({
          type: row.alert_type,
          count: row.alert_count
        }));

      // Severity breakdown
      result.forEach(row => {
        alertReport.summary.severityBreakdown[row.severity] += row.alert_count;
      });

      this.setCachedMetric(cacheKey, alertReport);
      return alertReport;

    } catch (error) {
      console.error('Failed to generate alert report:', error);
      throw error;
    }
  }

  getSLAStatus(uptimePercentage) {
    if (uptimePercentage >= 99.9) return 'excellent';
    if (uptimePercentage >= 99.5) return 'good';
    if (uptimePercentage >= 95) return 'acceptable';
    return 'poor';
  }

  getCachedMetric(key) {
    const cached = this.metricsCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  setCachedMetric(key, data) {
    this.metricsCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.metricsCache.clear();
  }

  getCacheStats() {
    return {
      size: this.metricsCache.size,
      keys: Array.from(this.metricsCache.keys())
    };
  }
}

class ReportGenerator {
  constructor(analyticsEngine, config) {
    this.analytics = analyticsEngine;
    this.config = config;
  }

  async generateDailyReport(date = null) {
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    try {
      const [
        uptimeMetrics,
        locationMetrics,
        capacityReport,
        alertReport
      ] = await Promise.all([
        this.analytics.calculateUptimeMetrics(null, null, 1),
        this.analytics.calculateLocationMetrics(1),
        this.analytics.generateCapacityReport(null, 1),
        this.analytics.generateAlertReport(1)
      ]);

      return {
        reportType: 'daily',
        date: reportDate,
        generatedAt: new Date().toISOString(),
        summary: {
          totalDevices: uptimeMetrics.length,
          avgUptime: uptimeMetrics.reduce((sum, m) => sum + m.uptimePercentage, 0) / uptimeMetrics.length,
          totalAlerts: alertReport.summary.totalAlerts,
          locationsMonitored: locationMetrics.length
        },
        uptimeMetrics,
        locationMetrics,
        capacityReport,
        alertReport
      };
    } catch (error) {
      console.error('Failed to generate daily report:', error);
      throw error;
    }
  }

  async generateWeeklyReport() {
    try {
      const [
        uptimeMetrics,
        locationMetrics,
        trendAnalysis,
        capacityReport,
        alertReport
      ] = await Promise.all([
        this.analytics.calculateUptimeMetrics(null, null, 7),
        this.analytics.calculateLocationMetrics(7),
        this.analytics.calculateTrendAnalysis(null, null, 7),
        this.analytics.generateCapacityReport(null, 7),
        this.analytics.generateAlertReport(7)
      ]);

      return {
        reportType: 'weekly',
        weekEnding: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        summary: {
          totalDevices: uptimeMetrics.length,
          avgUptime: uptimeMetrics.reduce((sum, m) => sum + m.uptimePercentage, 0) / uptimeMetrics.length,
          totalAlerts: alertReport.summary.totalAlerts,
          trend: trendAnalysis.indicators?.trend || 'unknown'
        },
        uptimeMetrics,
        locationMetrics,
        trendAnalysis,
        capacityReport,
        alertReport
      };
    } catch (error) {
      console.error('Failed to generate weekly report:', error);
      throw error;
    }
  }

  async generateMonthlyReport() {
    try {
      const [
        uptimeMetrics,
        locationMetrics,
        trendAnalysis,
        capacityReport,
        alertReport
      ] = await Promise.all([
        this.analytics.calculateUptimeMetrics(null, null, 30),
        this.analytics.calculateLocationMetrics(30),
        this.analytics.calculateTrendAnalysis(null, null, 30),
        this.analytics.generateCapacityReport(null, 30),
        this.analytics.generateAlertReport(30)
      ]);

      return {
        reportType: 'monthly',
        monthEnding: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        summary: {
          totalDevices: uptimeMetrics.length,
          avgUptime: uptimeMetrics.reduce((sum, m) => sum + m.uptimePercentage, 0) / uptimeMetrics.length,
          totalAlerts: alertReport.summary.totalAlerts,
          trend: trendAnalysis.indicators?.trend || 'unknown'
        },
        uptimeMetrics,
        locationMetrics,
        trendAnalysis,
        capacityReport,
        alertReport,
        recommendations: this.generateRecommendations(uptimeMetrics, locationMetrics, trendAnalysis, alertReport)
      };
    } catch (error) {
      console.error('Failed to generate monthly report:', error);
      throw error;
    }
  }

  generateRecommendations(uptimeMetrics, locationMetrics, trendAnalysis, alertReport) {
    const recommendations = [];

    // Uptime recommendations
    const poorUptimeDevices = uptimeMetrics.filter(m => m.uptimePercentage < 95);
    if (poorUptimeDevices.length > 0) {
      recommendations.push({
        category: 'uptime',
        priority: 'high',
        title: 'Poor Uptime Devices',
        description: `${poorUptimeDevices.length} devices have uptime below 95%`,
        devices: poorUptimeDevices.map(d => d.url),
        action: 'Investigate connectivity issues and consider infrastructure improvements'
      });
    }

    // Response time recommendations
    const slowDevices = uptimeMetrics.filter(m => m.avgResponseTime && m.avgResponseTime > 15000);
    if (slowDevices.length > 0) {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        title: 'Slow Response Times',
        description: `${slowDevices.length} devices have average response time above 15 seconds`,
        devices: slowDevices.map(d => d.url),
        action: 'Check network latency and consider optimizing connections'
      });
    }

    // Trend recommendations
    if (trendAnalysis.indicators && trendAnalysis.indicators.trend === 'degrading') {
      recommendations.push({
        category: 'trend',
        priority: 'high',
        title: 'Degrading Performance Trend',
        description: `System performance has degraded by ${Math.abs(trendAnalysis.indicators.uptimeChange)}% over the period`,
        action: 'Investigate root cause and implement corrective measures'
      });
    }

    // Alert recommendations
    if (alertReport.summary.totalAlerts > 50) {
      recommendations.push({
        category: 'alerts',
        priority: 'medium',
        title: 'High Alert Volume',
        description: `${alertReport.summary.totalAlerts} alerts generated this period`,
        action: 'Review alert thresholds and address recurring issues'
      });
    }

    return recommendations;
  }
}

module.exports = {
  AnalyticsEngine,
  ReportGenerator
};