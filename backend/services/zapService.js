// Enhanced ZAP Service with URL-Specific Vulnerability Tracking
// File: backend/services/zapService.js

const axios = require('axios');
const { parseZapReport } = require('../utils/zapUtils');
const ScanResult = require('../models/ScanResult');
const ZapAlert = require('../models/ZapAlert');
const gridfsService = require('./gridfsService');

// ============================================================================
// URL-SPECIFIC VULNERABILITY TRACKING
// ============================================================================

/**
 * Structure for URL-specific alerts:
 * {
 *   "Missing Anti-clickjacking Header": {
 *     risk: "Medium",
 *     description: "...",
 *     solution: "...",
 *     occurrences: [
 *       { url: "https://example.com/page1", instances: 1 },
 *       { url: "https://example.com/page2", instances: 1 }
 *     ],
 *     totalCount: 2
 *   }
 * }
 */

function groupAlertsByUrl(alerts) {
  const grouped = {};

  alerts.forEach(alert => {
    const key = alert.alert; // Use alert name as key

    if (!grouped[key]) {
      grouped[key] = {
        alert: alert.alert,
        risk: alert.risk,
        confidence: alert.confidence,
        description: alert.description,
        solution: alert.solution,
        reference: alert.reference,
        cweid: alert.cweid,
        wascid: alert.wascid,
        occurrences: [],
        totalCount: 0
      };
    }

    // Add URL-specific occurrence
    if (alert.instances && alert.instances.length > 0) {
      alert.instances.forEach(instance => {
        grouped[key].occurrences.push({
          url: instance.uri || alert.url,
          method: instance.method,
          param: instance.param,
          attack: instance.attack,
          evidence: instance.evidence
        });
        grouped[key].totalCount++;
      });
    } else {
      // Fallback: alert without detailed instances
      grouped[key].occurrences.push({
        url: alert.url,
        instances: 1
      });
      grouped[key].totalCount++;
    }
  });

  return Object.values(grouped);
}

/**
 * Create TWO versions of the alert data:
 * 1. Summary version (for MongoDB document) - compact, under 16MB
 * 2. Detailed version (for GridFS) - complete with all URLs
 */
function createDualVersionAlerts(alerts) {
  const grouped = groupAlertsByUrl(alerts);

  // SUMMARY VERSION: Top 5 URLs per alert type
  const summaryAlerts = grouped.map(alert => ({
    alert: alert.alert,
    risk: alert.risk,
    confidence: alert.confidence,
    description: alert.description ? alert.description.substring(0, 200) + '...' : '',
    solution: alert.solution ? alert.solution.substring(0, 150) + '...' : '',
    totalOccurrences: alert.totalCount,
    sampleUrls: alert.occurrences.slice(0, 5).map(occ => occ.url), // Top 5 URLs only
    hasMoreUrls: alert.occurrences.length > 5
  }));

  // DETAILED VERSION: All URLs, all data
  const detailedAlerts = grouped.map(alert => ({
    alert: alert.alert,
    risk: alert.risk,
    confidence: alert.confidence,
    description: alert.description,
    solution: alert.solution,
    reference: alert.reference,
    cweid: alert.cweid,
    wascid: alert.wascid,
    totalOccurrences: alert.totalCount,
    occurrences: alert.occurrences // ALL URLs with full details
  }));

  return { summaryAlerts, detailedAlerts };
}

// ============================================================================
// ENHANCED ZAP SCAN FUNCTION
// ============================================================================

async function runZapScanWithUrlTracking(options) {
  const {
    target,
    scanId,
    maxUrls = 1000,
    timeout = 600000, // 10 minutes
    onProgress = null
  } = options;

  console.log(`🔍 Starting ZAP scan with URL tracking: ${target}`);

  try {
    // Step 1: Spider the target
    if (onProgress) onProgress({ stage: 'spider', progress: 0 });

    const spiderResponse = await axios.get('http://localhost:8080/JSON/spider/action/scan/', {
      params: {
        url: target,
        maxChildren: maxUrls,
        recurse: true,
        contextName: '',
        subtreeOnly: false
      }
    });

    const spiderScanId = spiderResponse.data.scan;
    console.log(`🕷️ Spider scan started: ${spiderScanId}`);

    // Wait for spider to complete
    let spiderProgress = 0;
    while (spiderProgress < 100) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await axios.get('http://localhost:8080/JSON/spider/view/status/', {
        params: { scanId: spiderScanId }
      });

      spiderProgress = parseInt(statusResponse.data.status);
      if (onProgress) onProgress({ stage: 'spider', progress: spiderProgress });
      console.log(`🕷️ Spider progress: ${spiderProgress}%`);
    }

    // Step 2: Active scan
    if (onProgress) onProgress({ stage: 'scan', progress: 0 });

    const scanResponse = await axios.get('http://localhost:8080/JSON/ascan/action/scan/', {
      params: {
        url: target,
        recurse: true,
        inScopeOnly: false,
        scanPolicyName: '',
        method: '',
        postData: ''
      }
    });

    const activeScanId = scanResponse.data.scan;
    console.log(`⚡ Active scan started: ${activeScanId}`);

    // Wait for active scan to complete
    let scanProgress = 0;
    while (scanProgress < 100) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const statusResponse = await axios.get('http://localhost:8080/JSON/ascan/view/status/', {
        params: { scanId: activeScanId }
      });

      scanProgress = parseInt(statusResponse.data.status);
      if (onProgress) onProgress({ stage: 'scan', progress: scanProgress });
      console.log(`⚡ Scan progress: ${scanProgress}%`);
    }

    // Step 3: Retrieve alerts with URL details
    console.log('📊 Retrieving alerts...');

    const alertsResponse = await axios.get('http://localhost:8080/JSON/alert/view/alerts/', {
      params: {
        baseurl: target,
        start: 0,
        count: 10000 // Get all alerts
      }
    });

    const rawAlerts = alertsResponse.data.alerts || [];
    console.log(`📊 Retrieved ${rawAlerts.length} raw alerts`);

    // Step 4: Generate HTML report (for GridFS storage)
    const htmlReportResponse = await axios.get('http://localhost:8080/OTHER/core/other/htmlreport/', {
      responseType: 'arraybuffer'
    });

    // Step 5: Process alerts into dual versions
    const { summaryAlerts, detailedAlerts } = createDualVersionAlerts(rawAlerts);

    console.log(`📊 Grouped into ${summaryAlerts.length} unique alert types`);
    console.log(`📊 Summary version size: ${JSON.stringify(summaryAlerts).length} bytes`);
    console.log(`📊 Detailed version size: ${JSON.stringify(detailedAlerts).length} bytes`);

    // Step 6: Calculate risk counts
    const riskCounts = summaryAlerts.reduce((acc, alert) => {
      acc[alert.risk] = (acc[alert.risk] || 0) + 1;
      return acc;
    }, { High: 0, Medium: 0, Low: 0, Informational: 0 });

    // Step 7: Store detailed report in GridFS
    const htmlBuffer = Buffer.from(htmlReportResponse.data);
    const htmlFileId = await gridfsService.uploadBuffer(
      htmlBuffer,
      `zap_report_${scanId}.html`,
      'text/html'
    );

    // Store detailed alerts JSON in GridFS (for future download)
    const detailedAlertsBuffer = Buffer.from(JSON.stringify(detailedAlerts, null, 2), 'utf-8');
    const detailedAlertsFileId = await gridfsService.uploadBuffer(
      detailedAlertsBuffer,
      `zap_detailed_alerts_${scanId}.json`,
      'application/json'
    );

    console.log(`✅ HTML report stored in GridFS: ${htmlFileId}`);
    console.log(`✅ Detailed alerts stored in GridFS: ${detailedAlertsFileId}`);

    // Step 8: Return data for MongoDB (compact version)
    return {
      scanId,
      target,
      alerts: summaryAlerts, // COMPACT VERSION for MongoDB
      riskCounts,
      totalAlerts: summaryAlerts.length,
      totalOccurrences: summaryAlerts.reduce((sum, a) => sum + a.totalOccurrences, 0),
      reportFiles: [
        {
          fileId: htmlFileId,
          filename: `zap_report_${scanId}.html`,
          contentType: 'text/html',
          size: htmlBuffer.length
        },
        {
          fileId: detailedAlertsFileId,
          filename: `zap_detailed_alerts_${scanId}.json`,
          contentType: 'application/json',
          size: detailedAlertsBuffer.length,
          description: 'Full alert details with all affected URLs'
        }
      ],
      completedAt: new Date()
    };

  } catch (error) {
    console.error('❌ ZAP scan failed:', error.message);
    throw error;
  }
}

// ============================================================================
// FRONTEND API: Download Detailed Report
// ============================================================================

/**
 * Express route to download detailed alert report
 * Usage: GET /api/zap/detailed-report/:scanId
 */
async function downloadDetailedReport(req, res) {
  try {
    const { scanId } = req.params;

    // Find scan result
    const scanResult = await ScanResult.findOne({ scanId });
    if (!scanResult) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    // Find detailed alerts file
    const detailedFile = scanResult.zapResult.reportFiles.find(
      f => f.filename.includes('detailed_alerts')
    );

    if (!detailedFile) {
      return res.status(404).json({ error: 'Detailed report not found' });
    }

    // Stream from GridFS
    const stream = await gridfsService.downloadStream(detailedFile.fileId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${detailedFile.filename}"`);

    stream.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download report' });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  runZapScanWithUrlTracking,
  downloadDetailedReport,
  groupAlertsByUrl,
  createDualVersionAlerts
};
