/**
 * ZAP Authenticated Scanning API Routes
 * Handles login detection, credential testing, and authenticated ZAP scans.
 *
 * Base path: /api/zap-auth
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { detectLoginFields } = require('../services/loginDetectionService');
const { testLogin } = require('../services/loginTestService');
const {
  checkZapAuthHealth,
  startAsyncAuthScan,
  getAuthScanStatus,
  stopAuthScan
} = require('../services/zapAuthService');
const ScanResult = require('../models/ScanResult');
const gridfsService = require('../services/gridfsService');

// ============================================================================
// IN-MEMORY AUTH SESSION STORE
// Stores session cookies from successful login tests, keyed by tempSessionId.
// Cookies are NEVER sent to the frontend — only the tempSessionId is returned.
// ============================================================================

const authSessions = new Map();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, session] of authSessions) {
    if (now - session.createdAt > 24 * 60 * 60 * 1000) { // 24 hour TTL
      authSessions.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[ZAP-AUTH] Cleaned up ${cleaned} expired auth sessions`);
  }
}, 5 * 60 * 1000);

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/zap-auth/health
 * Check if the zap-auth container is running and responsive.
 */
router.get('/health', async (req, res) => {
  try {
    const health = await checkZapAuthHealth();
    res.json(health);
  } catch (error) {
    res.status(503).json({ healthy: false, error: error.message });
  }
});

/**
 * POST /api/zap-auth/detect-login-fields
 * Detect login form fields on a given URL using Puppeteer.
 *
 * Body: { loginUrl: string }
 * Returns: { success, forms[], pageTitle, hasCaptcha, hasOAuth, warnings[] }
 */
router.post('/detect-login-fields', auth, async (req, res) => {
  try {
    const { loginUrl } = req.body;

    if (!loginUrl) {
      return res.status(400).json({ error: 'loginUrl is required' });
    }

    // Validate URL format
    try {
      new URL(loginUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`[ZAP-AUTH] Detecting login fields for: ${loginUrl}`);
    const result = await detectLoginFields(loginUrl);
    res.json(result);
  } catch (error) {
    console.error('[ZAP-AUTH] Login detection error:', error.message);
    res.status(500).json({ error: 'Failed to detect login fields', details: error.message });
  }
});

/**
 * POST /api/zap-auth/test-login
 * Test credentials against a login form.
 * On success, stores session cookies server-side and returns a tempSessionId.
 *
 * Body: { loginUrl, username, password, usernameField, passwordField, submitButton? }
 * Returns: { success, authenticated, evidence, tempSessionId?, errorMessage? }
 */
router.post('/test-login', auth, async (req, res) => {
  try {
    const { loginUrl, credentials, submitButton } = req.body;

    if (!loginUrl || !credentials || !Array.isArray(credentials) || credentials.length === 0) {
      return res.status(400).json({ error: 'loginUrl and credentials array are required' });
    }

    // Validate that each credential has selector and value
    for (const cred of credentials) {
      if (!cred.selector || !cred.value) {
        return res.status(400).json({ error: 'Each credential must have selector and value' });
      }
    }

    // Validate URL
    try {
      new URL(loginUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid loginUrl format' });
    }

    console.log(`[ZAP-AUTH] Testing login for: ${loginUrl} with ${credentials.length} credential fields`);

    const result = await testLogin({
      loginUrl,
      credentials,
      submitButton: submitButton || null
    });

    if (result.authenticated && result.cookies && result.cookies.length > 0) {
      // Store cookies server-side with a temporary session ID
      const tempSessionId = uuidv4();
      authSessions.set(tempSessionId, {
        cookies: result.cookies,
        loginUrl,
        createdAt: Date.now()
      });

      console.log(`[ZAP-AUTH] Login successful. Session stored: ${tempSessionId}`);

      // Return result WITHOUT cookies — only the tempSessionId
      res.json({
        success: true,
        authenticated: true,
        postLoginUrl: result.postLoginUrl,
        evidence: result.evidence,
        cookieCount: result.cookies.length,
        tempSessionId
      });
    } else {
      // Login failed — no cookies to store
      res.json({
        success: true,
        authenticated: false,
        postLoginUrl: result.postLoginUrl,
        evidence: result.evidence,
        errorMessage: result.errorMessage
      });
    }
  } catch (error) {
    console.error('[ZAP-AUTH] Login test error:', error.message);
    res.status(500).json({ error: 'Failed to test login', details: error.message });
  }
});

/**
 * POST /api/zap-auth/scan
 * Start an authenticated ZAP scan.
 * Retrieves session cookies from the in-memory store using tempSessionId.
 *
 * Body: { targetUrl, loginUrl, tempSessionId }
 * Returns: { success, scanId, message }
 */
router.post('/scan', auth, async (req, res) => {
  try {
    const { targetUrl, loginUrl, tempSessionId } = req.body;

    if (!targetUrl || !tempSessionId) {
      return res.status(400).json({ error: 'targetUrl and tempSessionId are required' });
    }

    // Validate target URL
    try {
      const parsed = new URL(targetUrl);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return res.status(400).json({ error: 'Cannot scan localhost addresses' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid targetUrl format' });
    }

    // Retrieve stored session cookies
    const session = authSessions.get(tempSessionId);
    if (!session) {
      return res.status(400).json({
        error: 'Session expired or invalid. Please test login again.',
        code: 'SESSION_EXPIRED'
      });
    }

    const cookies = session.cookies;
    const resolvedLoginUrl = loginUrl || session.loginUrl;

    // Check ZAP health before starting
    const health = await checkZapAuthHealth();
    if (!health.healthy) {
      return res.status(503).json({
        error: 'ZAP authenticated scanner is not available',
        details: health.error
      });
    }

    // Generate scan ID
    const scanId = `zap-auth-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    console.log(`[ZAP-AUTH] Starting authenticated scan: ${scanId} for ${targetUrl}`);

    // Start async scan
    const result = await startAsyncAuthScan(
      targetUrl,
      resolvedLoginUrl,
      cookies,
      scanId,
      req.user.id
    );

    // Delete the session after use (one-time use)
    authSessions.delete(tempSessionId);

    res.json({
      success: true,
      scanId: result.scanId,
      message: result.message
    });
  } catch (error) {
    console.error('[ZAP-AUTH] Scan start error:', error.message);
    res.status(500).json({ error: 'Failed to start authenticated scan', details: error.message });
  }
});

/**
 * GET /api/zap-auth/status/:scanId
 * Get the status and progress of an authenticated scan.
 */
router.get('/status/:scanId', auth, async (req, res) => {
  try {
    const { scanId } = req.params;
    const status = await getAuthScanStatus(scanId, req.user.id);
    res.json(status);
  } catch (error) {
    if (error.message === 'Scan not found or access denied') {
      return res.status(404).json({ error: error.message });
    }
    console.error('[ZAP-AUTH] Status error:', error.message);
    res.status(500).json({ error: 'Failed to get scan status' });
  }
});

/**
 * POST /api/zap-auth/stop/:scanId
 * Stop a running authenticated scan.
 */
router.post('/stop/:scanId', auth, async (req, res) => {
  try {
    const { scanId } = req.params;
    const result = await stopAuthScan(scanId, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Scan not found or access denied') {
      return res.status(404).json({ error: error.message });
    }
    console.error('[ZAP-AUTH] Stop error:', error.message);
    res.status(500).json({ error: 'Failed to stop scan' });
  }
});

/**
 * GET /api/zap-auth/scans
 * Get the authenticated scan history for the current user.
 */
router.get('/scans', auth, async (req, res) => {
  try {
    const scans = await ScanResult.find({
      userId: req.user.id,
      authScanResult: { $ne: null }
    })
      .select('analysisId target status authScanResult.status authScanResult.phase authScanResult.progress authScanResult.loginUrl authScanResult.riskCounts authScanResult.totalAlerts authScanResult.completedAt createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ scans });
  } catch (error) {
    console.error('[ZAP-AUTH] Scan history error:', error.message);
    res.status(500).json({ error: 'Failed to retrieve scan history' });
  }
});

/**
 * GET /api/zap-auth/detailed-report/:scanId
 * Download detailed vulnerability JSON report from GridFS.
 */
router.get('/detailed-report/:scanId', auth, async (req, res) => {
  try {
    const { scanId } = req.params;

    const scanResult = await ScanResult.findOne({
      analysisId: scanId,
      userId: req.user.id
    });

    if (!scanResult) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    if (!scanResult.authScanResult || !scanResult.authScanResult.reportFiles) {
      return res.status(404).json({
        error: 'Authenticated scan report not available',
        hint: 'This scan may not have completed yet'
      });
    }

    const detailedFile = scanResult.authScanResult.reportFiles.find(
      f => f.filename.includes('detailed_alerts')
    );

    if (!detailedFile) {
      return res.status(404).json({ error: 'Detailed report not found' });
    }

    const stream = gridfsService.downloadFileStream(detailedFile.fileId, 'zap_auth_reports');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${detailedFile.filename}"`);

    stream.on('error', (streamError) => {
      console.error('[ZAP-AUTH] GridFS stream error:', streamError);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream report file' });
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('[ZAP-AUTH] Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download report' });
    }
  }
});

/**
 * GET /api/zap-auth/detailed-report-pdf/:scanId?lang=en|ja
 * Download bilingual PDF vulnerability report.
 */
router.get('/detailed-report-pdf/:scanId', auth, async (req, res) => {
  try {
    const { scanId } = req.params;
    const lang = req.query.lang === 'ja' ? 'ja' : 'en';

    const { generateZapPdf } = require('../services/pdfService');

    const scanResult = await ScanResult.findOne({
      analysisId: scanId,
      userId: req.user.id
    });

    if (!scanResult) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    if (!scanResult.authScanResult) {
      return res.status(404).json({
        error: 'Authenticated scan report not available',
        hint: 'This scan may not have completed yet'
      });
    }

    // Map authScanResult to zapResult so the PDF generator can read it
    // The PDF generator expects scanResult.zapResult
    const scanResultForPdf = {
      ...scanResult.toObject(),
      zapResult: scanResult.authScanResult
    };

    console.log(`[ZAP-AUTH] Generating PDF (${lang.toUpperCase()}) for scan: ${scanId}`);

    const pdfBuffer = await generateZapPdf(scanResultForPdf, lang);

    const filename = `zap_auth_vulnerability_report_${scanId}_${lang}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`[ZAP-AUTH] PDF (${lang.toUpperCase()}) sent: ${filename}`);
  } catch (error) {
    console.error('[ZAP-AUTH] PDF generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to generate PDF report',
        details: error.message
      });
    }
  }
});

module.exports = router;
