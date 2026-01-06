const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const ZapAlert = require('../models/ZapAlert');
const gridfsService = require('./gridfsService');

// Configuration
const ZAP_SCANNER_SCRIPT = path.join(__dirname, '../scripts/zap_ai_scanner.py');
const ZAP_API_URL = process.env.ZAP_API_URL || 'http://127.0.0.1:8080';

/**
 * Enhanced ZAP Service - Maximum Performance Scanner Integration
 * Uses the zap_ai_scanner.py Python script for comprehensive scanning
 */

/**
 * Check if ZAP container is running and accessible
 */
async function checkZapHealth() {
  try {
    const axios = require('axios');
    const response = await axios.get(`${ZAP_API_URL}/JSON/core/view/version/`, {
      timeout: 5000
    });
    return {
      healthy: true,
      version: response.data.version
    };
  } catch (error) {
    console.error('❌ ZAP health check failed:', error.message);
    return {
      healthy: false,
      error: error.message
    };
  }
}

/**
 * Run comprehensive ZAP scan using the Python automation script
 * @param {string} targetUrl - URL to scan
 * @param {object} options - Scan options
 * @param {boolean} options.quickMode - Use quick scan mode (default: false)
 * @param {function} options.onProgress - Progress callback function
 * @returns {Promise<object>} - Scan results
 */
async function runComprehensiveZapScan(targetUrl, options = {}) {
  const { quickMode = false, onProgress } = options;

  console.log(`🔍 Starting comprehensive ZAP scan for: ${targetUrl}`);
  console.log(`   Mode: ${quickMode ? 'Quick' : 'Full'}`);

  // Validate Python script exists
  try {
    await fs.access(ZAP_SCANNER_SCRIPT);
  } catch (error) {
    throw new Error(`ZAP scanner script not found at ${ZAP_SCANNER_SCRIPT}`);
  }

  return new Promise((resolve, reject) => {
    const args = [ZAP_SCANNER_SCRIPT, targetUrl, '--zap-api', ZAP_API_URL];

    if (quickMode) {
      args.push('--quick');
    }

    console.log(`🚀 Executing: python ${args.join(' ')}`);

    // Use 'python' on Windows, 'python3' on Linux/Mac
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const pythonProcess = spawn(pythonCmd, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let scanStats = {
      phase: 'starting',
      urlsFound: 0,
      alerts: 0,
      progress: 0
    };

    // Parse stdout for progress updates
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;

      // Parse progress logs
      const lines = output.split('\n');
      lines.forEach(line => {
        console.log(`[ZAP] ${line}`);

        // Extract phase information
        if (line.includes('PHASE 1: TRADITIONAL SPIDER')) {
          scanStats.phase = 'spider';
          if (onProgress) onProgress({ ...scanStats });
        } else if (line.includes('PHASE 2: AJAX SPIDER')) {
          scanStats.phase = 'ajax-spider';
          if (onProgress) onProgress({ ...scanStats });
        } else if (line.includes('PHASE 3: PASSIVE SCAN')) {
          scanStats.phase = 'passive-scan';
          if (onProgress) onProgress({ ...scanStats });
        } else if (line.includes('PHASE 4: ACTIVE SCAN')) {
          scanStats.phase = 'active-scan';
          if (onProgress) onProgress({ ...scanStats });
        } else if (line.includes('PHASE 5: GENERATING REPORTS')) {
          scanStats.phase = 'generating-reports';
          if (onProgress) onProgress({ ...scanStats });
        }

        // Extract URL count
        const urlMatch = line.match(/Total URLs discovered: (\d+)/);
        if (urlMatch) {
          scanStats.urlsFound = parseInt(urlMatch[1]);
          if (onProgress) onProgress({ ...scanStats });
        }

        // Extract alert count
        const alertMatch = line.match(/Total alerts: (\d+)/);
        if (alertMatch) {
          scanStats.alerts = parseInt(alertMatch[1]);
          if (onProgress) onProgress({ ...scanStats });
        }

        // Extract progress percentage
        const progressMatch = line.match(/(\d+)%/);
        if (progressMatch) {
          scanStats.progress = parseInt(progressMatch[1]);
          if (onProgress) onProgress({ ...scanStats });
        }
      });
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`[ZAP Error] ${data}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ ZAP scan completed successfully');

        // Parse final JSON output from last line of stdout
        const lines = stdout.trim().split('\n');
        let results = null;

        // Find the last JSON object in the output
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{')) {
            try {
              results = JSON.parse(line);
              break;
            } catch (e) {
              // Not valid JSON, continue searching
            }
          }
        }

        if (results) {
          resolve({
            success: true,
            target: targetUrl,
            stats: results,
            scanMode: quickMode ? 'quick' : 'full',
            timestamp: new Date().toISOString()
          });
        } else {
          // Fallback: parse from logs
          resolve({
            success: true,
            target: targetUrl,
            stats: scanStats,
            scanMode: quickMode ? 'quick' : 'full',
            timestamp: new Date().toISOString(),
            note: 'Results parsed from logs (JSON output not found)'
          });
        }
      } else {
        console.error(`❌ ZAP scan failed with exit code ${code}`);
        reject(new Error(`ZAP scan failed: ${stderr || 'Unknown error'}`));
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('❌ Failed to start ZAP scanner:', error);
      reject(new Error(`Failed to start ZAP scanner: ${error.message}`));
    });
  });
}

/**
 * Backward-compatible wrapper for runZapScan
 * Used by combined scan in virustotalRoutes.js
 * Returns format: { site, riskCounts, alerts }
 */
async function runZapScan(targetUrl) {
  console.log(`🔍 [ZAP] Starting scan for: ${targetUrl}`);

  try {
    // Check ZAP health first
    const health = await checkZapHealth();
    if (!health.healthy) {
      throw new Error('ZAP Container is not reachable or API Key is invalid.');
    }

    // Use the comprehensive Python scanner with FULL mode for industry-level scanning
    const result = await runComprehensiveZapScan(targetUrl, { quickMode: false });

    // Transform result to expected format for combined scan
    const stats = result.stats || {};
    const breakdown = stats.breakdown || {};

    // Build alerts array from the scan results
    // The Python script returns breakdown with risk counts
    const riskCounts = {
      High: breakdown.High || 0,
      Medium: breakdown.Medium || 0,
      Low: breakdown.Low || 0,
      Informational: breakdown.Informational || 0
    };

    // Fetch actual alerts from ZAP API for detailed info
    let alerts = [];
    try {
      const axios = require('axios');
      const alertsResp = await axios.get(`${ZAP_API_URL}/JSON/core/view/alerts/`, {
        params: { baseurl: targetUrl },
        timeout: 30000
      });
      alerts = (alertsResp.data.alerts || []).map(a => ({
        alert: a.alert,
        risk: a.risk,
        description: a.description,
        solution: a.solution
      }));
    } catch (alertErr) {
      console.warn('⚠️  Could not fetch detailed alerts:', alertErr.message);
      // Return empty alerts but keep risk counts from scan
    }

    console.log(`✅ [ZAP] Scan completed: ${stats.urls || 0} URLs, ${stats.alerts || 0} alerts`);

    return {
      site: targetUrl,
      riskCounts,
      alerts
    };

  } catch (error) {
    console.error('[ZAP] Service Error:', error.message);
    throw error;
  }
}

/**
 * Run ZAP scan and store results in database
 * @param {string} targetUrl - URL to scan
 * @param {string} userId - User ID from authentication
 * @param {object} options - Scan options
 * @returns {Promise<object>} - Scan result with database ID
 */
async function runZapScanWithDB(targetUrl, userId, options = {}) {
  const ScanResult = require('../models/ScanResult');

  try {
    // Create initial scan record
    const scanId = `zap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const scan = new ScanResult({
      target: targetUrl,
      analysisId: scanId,
      status: 'queued',
      userId: userId,
      zapResult: {
        status: 'queued',
        startedAt: new Date().toISOString()
      }
    });

    await scan.save();
    console.log(`📝 Created scan record: ${scanId}`);

    // Update scan status to 'pending'
    scan.status = 'pending';
    scan.zapResult.status = 'scanning';
    await scan.save();

    // Run the scan with progress tracking
    const results = await runComprehensiveZapScan(targetUrl, {
      ...options,
      onProgress: async (stats) => {
        // Update database with progress
        try {
          const currentScan = await ScanResult.findOne({ analysisId: scanId });
          if (currentScan) {
            currentScan.zapResult = {
              ...currentScan.zapResult,
              status: 'scanning',
              phase: stats.phase,
              urlsFound: stats.urlsFound,
              alerts: stats.alerts,
              progress: stats.progress,
              lastUpdate: new Date().toISOString()
            };
            await currentScan.save();
          }
        } catch (updateError) {
          console.error('⚠️  Failed to update progress:', updateError.message);
        }
      }
    });

    // Save scan completion using split storage to avoid 16MB limit
    await saveScanCompletion(scanId, results);

    console.log(`✅ Scan completed and saved: ${scanId}`);

    return {
      success: true,
      scanId: scanId,
      analysisId: scanId,
      results: results,
      _id: scan._id
    };

  } catch (error) {
    console.error('❌ ZAP scan with DB failed:', error);

    // Update scan status to failed if it exists
    try {
      const ScanResult = require('../models/ScanResult');
      await ScanResult.updateOne(
        { analysisId: scanId },
        {
          status: 'failed',
          zapResult: {
            status: 'failed',
            error: error.message,
            failedAt: new Date().toISOString()
          }
        }
      );
    } catch (updateError) {
      console.error('⚠️  Failed to update scan status:', updateError.message);
    }

    throw error;
  }
}

/**
 * Get ZAP scan status and results from database
 * @param {string} scanId - Scan ID (analysisId)
 * @param {string} userId - User ID for authorization
 * @returns {Promise<object>} - Scan status and results
 */
async function getZapScanStatus(scanId, userId) {
  const ScanResult = require('../models/ScanResult');

  try {
    const scan = await ScanResult.findOne({
      analysisId: scanId,
      userId: userId
    });

    if (!scan) {
      throw new Error('Scan not found or access denied');
    }

    return {
      success: true,
      scanId: scanId,
      status: scan.status,
      target: scan.target,
      zapResult: scan.zapResult || {},
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt
    };

  } catch (error) {
    console.error('❌ Failed to get scan status:', error);
    throw error;
  }
}

/**
 * Save scan completion using split storage architecture
 * Prevents MongoDB 16MB document limit errors
 * @param {string} scanId - Scan ID
 * @param {object} results - Scan results from Python script
 */
async function saveScanCompletion(scanId, results) {
  const ScanResult = require('../models/ScanResult');
  const axios = require('axios');

  try {
    const stats = results.stats || {};
    const breakdown = stats.breakdown || {};

    // 1. Update main scan document with summary only (< 1MB)
    await ScanResult.findOneAndUpdate(
      { analysisId: scanId },
      {
        $set: {
          status: 'completed',
          'zapResult.status': 'completed',
          'zapResult.urlsFound': stats.urls || 0,
          'zapResult.alertsTotal': stats.alerts || 0,
          'zapResult.breakdown': breakdown,
          'zapResult.completedAt': new Date().toISOString(),
          'zapResult.progress': 100
        }
      }
    );

    // 2. Fetch and save individual alerts to separate collection
    try {
      const alertsResp = await axios.get(`${ZAP_API_URL}/JSON/core/view/alerts/`, {
        timeout: 30000
      });

      const alerts = alertsResp.data.alerts || [];

      if (alerts.length > 0) {
        const alertDocs = alerts.map(alert => ({
          scanId: scanId,
          alertId: alert.pluginid || alert.id,
          name: alert.alert || alert.name,
          risk: alert.risk,
          confidence: alert.confidence,
          url: alert.url,
          description: alert.description || alert.desc,
          solution: alert.solution,
          reference: alert.reference,
          cweid: alert.cweid,
          wascid: alert.wascid,
          param: alert.param,
          attack: alert.attack,
          evidence: alert.evidence,
          otherinfo: alert.otherinfo
        }));

        // Batch insert alerts (MongoDB handles this efficiently)
        await ZapAlert.insertMany(alertDocs, { ordered: false });
        console.log(`[ZAP] Saved ${alertDocs.length} alerts for scan ${scanId}`);
      }
    } catch (alertErr) {
      console.error('[ZAP] Failed to save alerts:', alertErr.message);
      // Don't fail the entire scan if alerts can't be saved
    }

    // 3. Save reports to GridFS (handles >16MB automatically)
    const reportFiles = [];

    try {
      // Fetch HTML report
      const htmlResp = await axios.get(`${ZAP_API_URL}/OTHER/core/other/htmlreport/`, {
        timeout: 60000,
        responseType: 'text'
      });

      if (htmlResp.data) {
        const htmlFileId = await gridfsService.uploadFile(
          htmlResp.data,
          `${scanId}-report.html`,
          { scanId, format: 'html', type: 'full-report' }
        );
        reportFiles.push({ format: 'html', fileId: htmlFileId });
        console.log(`[ZAP] Saved HTML report to GridFS: ${htmlFileId}`);
      }
    } catch (htmlErr) {
      console.error('[ZAP] Failed to save HTML report:', htmlErr.message);
    }

    try {
      // Fetch JSON report
      const jsonResp = await axios.get(`${ZAP_API_URL}/JSON/core/view/alerts/`, {
        timeout: 60000
      });

      if (jsonResp.data) {
        const jsonFileId = await gridfsService.uploadFile(
          JSON.stringify(jsonResp.data, null, 2),
          `${scanId}-report.json`,
          { scanId, format: 'json', type: 'full-report' }
        );
        reportFiles.push({ format: 'json', fileId: jsonFileId });
        console.log(`[ZAP] Saved JSON report to GridFS: ${jsonFileId}`);
      }
    } catch (jsonErr) {
      console.error('[ZAP] Failed to save JSON report:', jsonErr.message);
    }

    try {
      // Fetch XML report
      const xmlResp = await axios.get(`${ZAP_API_URL}/OTHER/core/other/xmlreport/`, {
        timeout: 60000,
        responseType: 'text'
      });

      if (xmlResp.data) {
        const xmlFileId = await gridfsService.uploadFile(
          xmlResp.data,
          `${scanId}-report.xml`,
          { scanId, format: 'xml', type: 'full-report' }
        );
        reportFiles.push({ format: 'xml', fileId: xmlFileId });
        console.log(`[ZAP] Saved XML report to GridFS: ${xmlFileId}`);
      }
    } catch (xmlErr) {
      console.error('[ZAP] Failed to save XML report:', xmlErr.message);
    }

    // 4. Store GridFS file IDs in scan document (tiny, just references)
    if (reportFiles.length > 0) {
      await ScanResult.findOneAndUpdate(
        { analysisId: scanId },
        {
          $set: {
            'zapResult.reportFiles': reportFiles
          }
        }
      );
      console.log(`[ZAP] Stored ${reportFiles.length} report file references`);
    }

    return true;

  } catch (error) {
    console.error('[ZAP] Error saving scan completion:', error);

    // Mark scan as failed
    await ScanResult.findOneAndUpdate(
      { analysisId: scanId },
      {
        $set: {
          status: 'failed',
          'zapResult.status': 'failed',
          'zapResult.error': error.message
        }
      }
    );

    throw error;
  }
}

/**
 * Setup ZAP environment (ensure Python script is deployed)
 */
async function setupZapEnvironment() {
  try {
    const scriptsDir = path.join(__dirname, '../scripts');

    // Create scripts directory if it doesn't exist
    await fs.mkdir(scriptsDir, { recursive: true });

    // Check if Python script exists
    try {
      await fs.access(ZAP_SCANNER_SCRIPT);
      console.log('✅ ZAP scanner script found');
    } catch {
      console.log('⚠️  ZAP scanner script not found - will need to be deployed');
      console.log(`   Expected location: ${ZAP_SCANNER_SCRIPT}`);
      console.log('   Please copy zap_ai_scanner.py to backend/scripts/ directory');
    }

    // Check Python availability
    const { spawn } = require('child_process');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    return new Promise((resolve) => {
      const pythonCheck = spawn(pythonCmd, ['--version']);
      pythonCheck.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Python (${pythonCmd}) is available`);
          resolve(true);
        } else {
          console.log(`⚠️  Python (${pythonCmd}) not found - required for ZAP scanning`);
          resolve(false);
        }
      });
      pythonCheck.on('error', () => {
        console.log(`⚠️  Python (${pythonCmd}) not found - required for ZAP scanning`);
        resolve(false);
      });
    });

  } catch (error) {
    console.error('❌ Failed to setup ZAP environment:', error);
    return false;
  }
}

module.exports = {
  checkZapHealth,
  runComprehensiveZapScan,
  runZapScan,  // Backward-compatible wrapper for combined scan
  runZapScanWithDB,
  getZapScanStatus,
  setupZapEnvironment,
  saveScanCompletion  // For manual scan completion
};
