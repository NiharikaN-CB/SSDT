const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { scanFile, scanUrl, getAnalysis, getFileReport } = require('../services/virustotalService');
const { getPageSpeedReport } = require('../services/pagespeedService');
const { scanHost } = require('../services/observatoryService');
const { refineReport } = require('../services/geminiService');
const { runZapScan, startAsyncZapScan, stopCombinedScan } = require('../services/zapService');
const { runUrlScan } = require('../services/urlscanService');
const { startAsyncWebCheckScan, stopWebCheckScan } = require('../services/webCheckService');
const ScanResult = require('../models/ScanResult');
const auth = require('../middleware/auth');
const { combinedScanLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Configure multer
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 32 * 1024 * 1024 // 32MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log(`📎 Receiving file: ${file.originalname} (${file.mimetype})`);
    cb(null, true);
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// URL validation helper
const isValidUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }
    // Prevent localhost/internal IPs for security
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      return { valid: false, error: 'Localhost and private IPs are not allowed' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
};

// 1️⃣ Scan a file (Protected route)
router.post('/file', auth, upload.single('file'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    filePath = req.file.path;
    console.log(`🔐 User ${req.user.id} uploaded file: ${req.file.originalname}`);

    // Call VirusTotal API
    const vtResp = await scanFile(filePath);

    // DEBUG: Log the entire response
    console.log('📋 VirusTotal Response:', JSON.stringify(vtResp, null, 2));

    // Extract analysis ID - try multiple possible locations
    let analysisId = null;

    if (vtResp?.data?.id) {
      analysisId = vtResp.data.id;
    } else if (vtResp?.id) {
      analysisId = vtResp.id;
    } else if (vtResp?.data?.attributes?.id) {
      analysisId = vtResp.data.attributes.id;
    }

    console.log(`🔑 Extracted Analysis ID: ${analysisId}`);

    if (!analysisId) {
      console.error('❌ No analysis ID found in response:', vtResp);
      return res.status(500).json({
        error: 'No analysis ID received from VirusTotal',
        vtResponse: vtResp
      });
    }

    // Save to database with user reference
    const scan = new ScanResult({
      target: req.file.originalname,
      analysisId: analysisId,
      status: 'queued',
      userId: req.user.id
    });
    await scan.save();

    res.json({
      success: true,
      message: 'File uploaded and sent for scanning',
      analysisId: analysisId,
      filename: req.file.originalname
    });
  } catch (err) {
    console.error('❌ File scan error:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({
      error: 'Failed to scan file',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    // Clean up uploaded file
    if (filePath) {
      try {
        await fs.unlink(filePath);
        console.log(`🗑️  Deleted temporary file: ${filePath}`);
      } catch (unlinkErr) {
        console.error('Failed to delete temp file:', unlinkErr.message);
      }
    }
  }
});

// 2️⃣ Scan a URL (Protected route)
router.post('/url', auth, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`🔐 User ${req.user.id} submitted URL: ${url}`);

    // Call VirusTotal API
    const vtResp = await scanUrl(url);

    // DEBUG: Log the entire response
    console.log('📋 VirusTotal Response:', JSON.stringify(vtResp, null, 2));

    // Extract analysis ID - try multiple possible locations
    let analysisId = null;

    if (vtResp?.data?.id) {
      analysisId = vtResp.data.id;
    } else if (vtResp?.id) {
      analysisId = vtResp.id;
    } else if (vtResp?.data?.attributes?.id) {
      analysisId = vtResp.data.attributes.id;
    }

    console.log(`🔑 Extracted Analysis ID: ${analysisId}`);

    if (!analysisId) {
      console.error('❌ No analysis ID found in response:', vtResp);
      return res.status(500).json({
        error: 'No analysis ID received from VirusTotal',
        vtResponse: vtResp
      });
    }

    // Save to database with user reference
    const scan = new ScanResult({
      target: url,
      analysisId: analysisId,
      status: 'queued',
      userId: req.user.id
    });
    await scan.save();

    res.json({
      success: true,
      message: 'URL submitted for analysis',
      analysisId: analysisId,
      url: url
    });
  } catch (err) {
    console.error('❌ URL scan error:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({
      error: 'Failed to scan URL',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// 3️⃣ Check analysis result (Protected route)
router.get('/analysis/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    console.log(`📊 Fetching analysis for ID: ${id}`);

    const vtResp = await getAnalysis(id);

    // DEBUG: Log response
    console.log('📋 Analysis Response:', JSON.stringify(vtResp, null, 2));

    // Update database record
    const scan = await ScanResult.findOneAndUpdate(
      { analysisId: id },
      {
        result: vtResp,
        status: vtResp?.data?.attributes?.status || 'unknown'
      },
      { new: true }
    );

    if (!scan) {
      return res.status(404).json({
        error: 'Analysis not found in database',
        vtData: vtResp
      });
    }

    res.json({
      success: true,
      ...scan.toObject(),
      stats: vtResp?.data?.attributes?.stats
    });
  } catch (err) {
    console.error('❌ Analysis retrieval error:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({
      error: 'Failed to retrieve analysis',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// 4️⃣ Get user's scan history (Protected route)
router.get('/history', auth, async (req, res) => {
  try {
    const scans = await ScanResult.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: scans.length,
      scans: scans
    });
  } catch (err) {
    console.error('❌ History retrieval error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve scan history',
      details: err.message
    });
  }
});

// 4.5️⃣ Get user's active/in-progress scan OR recently completed scan (Protected route)
// This is used to resume scans after page refresh or browser restart
// Also returns recently completed scans so user can see results after returning
router.get('/active-scan', auth, async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // First, check for in-progress scans (highest priority)
    let activeScan = await ScanResult.findOne({
      userId: req.user.id,
      status: { $in: ['queued', 'pending', 'combining'] },
      createdAt: { $gte: twentyFourHoursAgo }
    }).sort({ createdAt: -1 });

    // If no in-progress scan, check for recently completed scan (within last hour)
    // This handles the case where scan completed while user was away
    if (!activeScan) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      activeScan = await ScanResult.findOne({
        userId: req.user.id,
        status: 'completed',
        updatedAt: { $gte: oneHourAgo } // Completed within last hour
      }).sort({ updatedAt: -1 });

      // If we found a recently completed scan, mark it so frontend knows
      if (activeScan) {
        console.log(`🔄 Found recently completed scan for user ${req.user.id}: ${activeScan.analysisId}`);
      }
    }

    if (!activeScan) {
      return res.json({
        success: true,
        hasActiveScan: false,
        message: 'No active scan found'
      });
    }

    // Extract key metrics for the response (same as combined-analysis)
    const vtStats = activeScan.vtResult?.data?.attributes?.stats || null;
    const lighthouseResult = activeScan.pagespeedResult?.lighthouseResult || {};
    const categories = lighthouseResult.categories || {};

    const psiScores = activeScan.pagespeedResult && !activeScan.pagespeedResult.error ? {
      performance: categories.performance?.score ? Math.round(categories.performance.score * 100) : null,
      accessibility: categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : null,
      bestPractices: categories['best-practices']?.score ? Math.round(categories['best-practices'].score * 100) : null,
      seo: categories.seo?.score ? Math.round(categories.seo.score * 100) : null
    } : null;

    const observatoryData = activeScan.observatoryResult && !activeScan.observatoryResult.error ? {
      grade: activeScan.observatoryResult.grade,
      score: activeScan.observatoryResult.score,
      tests_passed: activeScan.observatoryResult.tests_passed,
      tests_failed: activeScan.observatoryResult.tests_failed,
      tests_quantity: activeScan.observatoryResult.tests_quantity
    } : null;

    // ZAP data handling - match structure with /combined-analysis endpoint
    let zapData = null;
    if (activeScan.zapResult) {
      const zapStatus = activeScan.zapResult.status;
      if (zapStatus === 'completed') {
        zapData = {
          status: 'completed',
          riskCounts: activeScan.zapResult.riskCounts || { High: 0, Medium: 0, Low: 0, Informational: 0 },
          alerts: activeScan.zapResult.alerts || [],
          totalAlerts: activeScan.zapResult.totalAlerts || activeScan.zapResult.alerts?.length || 0,
          totalOccurrences: activeScan.zapResult.totalOccurrences || 0,
          reportFiles: activeScan.zapResult.reportFiles || [],
          site: activeScan.zapResult.site || activeScan.target,
          urlsFound: activeScan.zapResult.urlsFound || 0
        };
      } else if (zapStatus === 'pending' || zapStatus === 'running') {
        zapData = {
          status: zapStatus,
          phase: activeScan.zapResult.phase || 'queued',
          progress: activeScan.zapResult.progress || 0,
          message: activeScan.zapResult.message || 'ZAP scan in progress...',
          urlsFound: activeScan.zapResult.urlsFound || 0,
          alertsFound: activeScan.zapResult.alertsFound || 0
        };
      } else if (zapStatus === 'failed') {
        zapData = {
          status: 'failed',
          error: activeScan.zapResult.error || 'ZAP scan failed',
          message: activeScan.zapResult.message || 'Vulnerability scan encountered an error'
        };
      }
    }

    const urlscanData = activeScan.urlscanResult && !activeScan.urlscanResult.error ? {
      uuid: activeScan.urlscanResult.uuid,
      verdicts: activeScan.urlscanResult.verdicts,
      screenshot: activeScan.urlscanResult.screenshot,
      page: activeScan.urlscanResult.page,
      stats: activeScan.urlscanResult.stats,
      reportUrl: activeScan.urlscanResult.reportUrl
    } : null;

    // WebCheck data handling - match structure expected by frontend
    let webCheckData = null;
    if (activeScan.webCheckResult) {
      const webCheckStatus = activeScan.webCheckResult.status;

      if (webCheckStatus === 'completed') {
        webCheckData = {
          status: 'completed',
          results: activeScan.webCheckResult.results || {},
          completedScans: activeScan.webCheckResult.completedScans || 0,
          totalScans: activeScan.webCheckResult.totalScans || 30,
          hasErrors: activeScan.webCheckResult.hasErrors || false,
          duration: activeScan.webCheckResult.duration || 0
        };
      } else if (webCheckStatus === 'running') {
        webCheckData = {
          status: 'running',
          progress: activeScan.webCheckResult.progress || 0,
          completedScans: activeScan.webCheckResult.completedScans || 0,
          totalScans: activeScan.webCheckResult.totalScans || 30,
          message: activeScan.webCheckResult.message || 'WebCheck scans in progress...',
          partialResults: activeScan.webCheckResult.partialResults || {}
        };
      } else if (webCheckStatus === 'failed') {
        webCheckData = {
          status: 'failed',
          error: activeScan.webCheckResult.error || 'WebCheck scan failed',
          message: activeScan.webCheckResult.message || 'WebCheck encountered an error'
        };
      }
    }

    console.log(`🔄 Active scan found for user ${req.user.id}: ${activeScan.analysisId}`);

    res.json({
      success: true,
      hasActiveScan: true,
      analysisId: activeScan.analysisId,
      target: activeScan.target,
      status: activeScan.status,
      // Progress indicators
      hasVtResult: !!activeScan.vtResult,
      hasPsiResult: !!activeScan.pagespeedResult,
      hasObservatoryResult: !!activeScan.observatoryResult,
      hasZapResult: !!activeScan.zapResult && activeScan.zapResult.status === 'completed',
      zapPending: !!activeScan.zapResult && (activeScan.zapResult.status === 'pending' || activeScan.zapResult.status === 'running'),
      hasUrlscanResult: !!activeScan.urlscanResult && !activeScan.urlscanResult.error,
      hasRefinedReport: !!activeScan.refinedReport,
      hasWebCheckResult: !!activeScan.webCheckResult && activeScan.webCheckResult.status === 'completed',
      webCheckPending: !!activeScan.webCheckResult && activeScan.webCheckResult.status === 'running',
      // Summary data (for quick display)
      vtStats,
      psiScores,
      observatoryData,
      zapData,
      urlscanData,
      webCheckData,
      // Full data (for complete display - especially for completed scans)
      vtResult: activeScan.vtResult || null,
      pagespeedResult: activeScan.pagespeedResult || null,
      observatoryResult: activeScan.observatoryResult || null,
      zapResult: activeScan.zapResult || null,
      urlscanResult: activeScan.urlscanResult || null,
      webCheckResult: activeScan.webCheckResult || null,
      refinedReport: activeScan.refinedReport || null,
      createdAt: activeScan.createdAt,
      updatedAt: activeScan.updatedAt
    });

  } catch (err) {
    console.error('❌ Active scan retrieval error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve active scan',
      details: err.message
    });
  }
});

// 5️⃣ Combined URL Scan (VirusTotal + PageSpeed + Gemini) (Protected route with strict rate limiting)
router.post('/combined-url-scan', auth, combinedScanLimiter, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format and security
    const validation = isValidUrl(url);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    console.log(`🔐 User ${req.user.id} submitted URL for combined scan: ${url}`);

    // Call VirusTotal API
    const vtResp = await scanUrl(url);

    // Extract analysis ID
    let analysisId = null;
    if (vtResp?.data?.id) {
      analysisId = vtResp.data.id;
    } else if (vtResp?.id) {
      analysisId = vtResp.id;
    } else if (vtResp?.data?.attributes?.id) {
      analysisId = vtResp.data.attributes.id;
    }

    if (!analysisId) {
      console.error('❌ No analysis ID found in response:', vtResp);
      return res.status(500).json({
        error: 'No analysis ID received from VirusTotal',
        vtResponse: vtResp
      });
    }

    console.log(`🔑 Analysis ID: ${analysisId}`);

    // 👇 FIXED: Check if scan already exists to prevent Duplicate Key Error
    let scan = await ScanResult.findOne({ analysisId: analysisId });

    if (scan) {
      console.log('📝 Existing scan found - initiating fresh scan...');

      // NO CACHING - Always run fresh scans for enterprise clients who pay for real-time data
      // Delete the old scan and create a new one to ensure fresh results
      console.log('🗑️  Deleting old scan data to ensure fresh results...');
      await ScanResult.deleteOne({ analysisId: analysisId });

      // Create new scan
      scan = new ScanResult({
        target: url,
        analysisId: analysisId,
        status: 'queued',
        userId: req.user.id
      });
      await scan.save();
      console.log('✅ Fresh scan record created');
    } else {
      console.log('📝 Creating new scan record...');
      scan = new ScanResult({
        target: url,
        analysisId: analysisId,
        status: 'queued',
        userId: req.user.id
      });
      await scan.save();
    }
    // 👆 END FIX

    res.json({
      success: true,
      message: 'URL submitted for combined analysis',
      analysisId: analysisId,
      url: url
    });
  } catch (err) {
    console.error('❌ Combined URL scan error:', err);
    // Graceful error handling for duplicates if race condition occurs
    if (err.code === 11000) {
      return res.status(409).json({ error: "Scan already in progress. Please wait a moment and try again." });
    }
    res.status(500).json({
      error: 'Failed to initiate combined scan',
      details: err.message
    });
  }
});

// 6️⃣ Combined Analysis Polling (Protected route)
router.get('/combined-analysis/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    console.log(`📊 Fetching combined analysis for ID: ${id}`);

    // Find the scan in database
    let scan = await ScanResult.findOne({ analysisId: id, userId: req.user.id });

    if (!scan) {
      return res.status(404).json({
        error: 'Analysis not found in database'
      });
    }

    // STEP A: Check VirusTotal status
    if (!scan.vtResult || scan.status === 'queued' || scan.status === 'pending') {
      console.log('⏳ Checking VirusTotal status...');

      const vtResp = await getAnalysis(id);
      const vtStatus = vtResp?.data?.attributes?.status;

      console.log(`📋 VT Status: ${vtStatus}`);

      if (vtStatus === 'completed') {
        // VT is complete, update the scan
        scan.vtResult = vtResp;
        scan.status = 'pending'; // Still need to get PSI and Gemini
        await scan.save();
      } else {
        // VT still pending
        scan.status = vtStatus || 'pending';
        await scan.save();

        return res.json({
          success: true,
          status: scan.status,
          message: 'VirusTotal analysis in progress...',
          analysisId: id
        });
      }
    }

    // STEP B: If VT is complete, check if we need PSI, Observatory, ZAP, urlscan and Gemini
    // ONLY trigger scans if they haven't been started yet (not just checking for results)
    const needsScanning = scan.vtResult && (
      !scan.pagespeedResult ||
      !scan.observatoryResult ||
      !scan.urlscanResult ||
      !scan.refinedReport
    );

    // Check if ZAP scan needs to be started (only start once)
    const zapNotStarted = !scan.zapResult || (!scan.zapResult.status && !scan.zapResult.error);

    // Check if WebCheck scan needs to be started (only start once)
    const webCheckNotStarted = !scan.webCheckResult || (!scan.webCheckResult.status && !scan.webCheckResult.error);

    if (needsScanning || zapNotStarted || webCheckNotStarted) {
      console.log('🔄 VT complete. Running PageSpeed, Observatory, ZAP, WebCheck, urlscan and Gemini analysis...');

      try {
        // Update status to combining
        scan.status = 'combining';
        await scan.save();

        // CRITICAL CHANGE: Run fast scans in parallel, ZAP and WebCheck run asynchronously
        // Both ZAP and WebCheck will update database independently when complete
        console.log('🚀 Fetching PageSpeed, Observatory and urlscan reports in parallel...');
        console.log('🚀 Starting ZAP and WebCheck scans asynchronously in background...');

        // Extract hostname for Observatory
        const hostname = new URL(scan.target).hostname;
        console.log(`🔍 Scanning hostname: ${hostname}`);

        // Execute fast scans in parallel, start ZAP and WebCheck asynchronously ONLY if needed
        // Both return immediately with "pending/running" status
        const scanPromises = [];

        if (!scan.pagespeedResult) {
          scanPromises.push(getPageSpeedReport(scan.target));
        } else {
          scanPromises.push(Promise.resolve(scan.pagespeedResult));
        }

        if (!scan.observatoryResult) {
          scanPromises.push(scanHost(hostname));
        } else {
          scanPromises.push(Promise.resolve(scan.observatoryResult));
        }

        if (!scan.urlscanResult) {
          scanPromises.push(runUrlScan(scan.target));
        } else {
          scanPromises.push(Promise.resolve(scan.urlscanResult));
        }

        // ONLY start ZAP if it hasn't been started yet
        if (zapNotStarted) {
          console.log('🚀 Starting ZAP scan for the FIRST time...');
          scanPromises.push(startAsyncZapScan(scan.target, scan.analysisId, req.user.id));
        } else {
          console.log('⏭️ ZAP scan already started, skipping initialization...');
          scanPromises.push(Promise.resolve(scan.zapResult));
        }

        // ONLY start WebCheck if it hasn't been started yet
        if (webCheckNotStarted) {
          console.log('🚀 Starting WebCheck scan for the FIRST time...');
          scanPromises.push(startAsyncWebCheckScan(scan.target, scan.analysisId, req.user.id));
        } else {
          console.log('⏭️ WebCheck scan already started, skipping initialization...');
          scanPromises.push(Promise.resolve(scan.webCheckResult));
        }

        const [psiResult, obsResult, urlscanResult, zapInitResult, webCheckInitResult] = await Promise.allSettled(scanPromises);

        // Handle PageSpeed result
        let psiReport = null;
        if (psiResult.status === 'fulfilled') {
          psiReport = psiResult.value;
          scan.pagespeedResult = psiReport;
          console.log('✅ PageSpeed report fetched successfully');
        } else {
          console.error('⚠️  PageSpeed scan failed:', psiResult.reason);
          console.error('⚠️  Error details:', psiResult.reason?.message);
          // Store error gracefully - don't fail entire scan
          scan.pagespeedResult = { error: psiResult.reason?.message || 'PageSpeed scan failed' };
        }

        // Handle Observatory result
        let observatoryReport = null;
        if (obsResult.status === 'fulfilled') {
          observatoryReport = obsResult.value;
          scan.observatoryResult = observatoryReport;
          console.log('✅ Observatory scan result:', observatoryReport);
        } else {
          console.error('⚠️  Observatory scan failed:', obsResult.reason);
          console.error('⚠️  Error details:', obsResult.reason?.message);
          // Continue even if Observatory fails - it's not critical
          scan.observatoryResult = { error: obsResult.reason?.message || 'Observatory scan failed' };
        }

        // Handle ZAP initialization result
        // ZAP scan is running in background, so we just store the initial "pending" status
        if (zapInitResult.status === 'fulfilled') {
          const zapInit = zapInitResult.value;
          scan.zapResult = zapInit; // Store pending status
          console.log('✅ ZAP scan started in background:', zapInit.status);
        } else {
          console.error('⚠️  ZAP scan failed to start:', zapInitResult.reason);
          console.error('⚠️  Error details:', zapInitResult.reason?.message);
          // Store error if ZAP failed to start
          scan.zapResult = {
            status: 'failed',
            error: zapInitResult.reason?.message || 'ZAP scan failed to start'
          };
        }

        // Handle urlscan result
        let urlscanReport = null;
        if (urlscanResult.status === 'fulfilled') {
          urlscanReport = urlscanResult.value;
          scan.urlscanResult = urlscanReport;
          console.log('✅ urlscan completed:', urlscanReport?.verdicts?.overall?.malicious ? 'MALICIOUS' : 'Clean');
        } else {
          console.error('⚠️  urlscan failed:', urlscanResult.reason);
          console.error('⚠️  Error details:', urlscanResult.reason?.message);
          // Continue even if urlscan fails - it's not critical
          scan.urlscanResult = { error: urlscanResult.reason?.message || 'urlscan failed or not available' };
        }

        // Handle WebCheck initialization result
        // WebCheck scans run in background, so we just store the initial "running" status
        if (webCheckInitResult.status === 'fulfilled') {
          const webCheckInit = webCheckInitResult.value;
          scan.webCheckResult = webCheckInit; // Store running status
          console.log('✅ WebCheck scan started in background:', webCheckInit.status);
        } else {
          console.error('⚠️  WebCheck scan failed to start:', webCheckInitResult.reason);
          console.error('⚠️  Error details:', webCheckInitResult.reason?.message);
          // Store error if WebCheck failed to start
          scan.webCheckResult = {
            status: 'failed',
            error: webCheckInitResult.reason?.message || 'WebCheck scan failed to start'
          };
        }

        // Save results so far (PSI, Observatory, urlscan complete, ZAP and WebCheck pending)
        await scan.save();
        console.log('✅ Fast scans complete (PSI, Observatory, urlscan). ZAP and WebCheck running in background.');

        // DON'T generate Gemini report yet - wait for ZAP to complete
        // Frontend will poll and we'll check ZAP status on next request
      } catch (combineError) {
        console.error('❌ Error in combining step:', combineError);
        scan.status = 'failed';
        await scan.save();

        return res.status(500).json({
          error: 'Failed to complete combined analysis',
          details: combineError.message
        });
      }
    }

    // STEP C: Check if ZAP is complete and generate Gemini report
    // This runs on EVERY poll request until Gemini report is generated
    const zapStatus = scan.zapResult?.status;
    const hasZapCompleted = zapStatus === 'completed';
    const hasZapFailed = zapStatus === 'failed';
    const zapIsDone = hasZapCompleted || hasZapFailed;

    // If ZAP is done AND we don't have Gemini report yet, generate it now
    if (zapIsDone && !scan.refinedReport && scan.pagespeedResult && scan.observatoryResult) {
      console.log('🤖 ZAP scan finished! Generating Gemini AI report with ALL scan data...');

      try {
        // Prepare data for Gemini (with or without ZAP results depending on success)
        const psiReport = scan.pagespeedResult?.error ? null : scan.pagespeedResult;
        const observatoryReport = scan.observatoryResult?.error ? null : scan.observatoryResult;
        const urlscanReport = scan.urlscanResult?.error ? null : scan.urlscanResult;

        // Only include ZAP data if scan succeeded
        const zapReport = hasZapCompleted ? {
          site: scan.target,
          riskCounts: scan.zapResult.riskCounts,
          alerts: scan.zapResult.alerts,
          totalAlerts: scan.zapResult.totalAlerts,
          totalOccurrences: scan.zapResult.totalOccurrences
        } : null;

        // Generate AI report with all available data
        const aiReport = await refineReport(
          scan.vtResult,
          psiReport,
          observatoryReport,
          scan.target,
          zapReport,
          urlscanReport
        );

        scan.refinedReport = aiReport;
        scan.status = 'completed'; // Mark entire scan as complete
        await scan.save();

        console.log('✅ Gemini AI report generated with all scan data!');
        console.log(`   Included ZAP data: ${zapReport ? 'Yes' : 'No (scan failed)'}`);
      } catch (geminiError) {
        console.error('⚠️  Gemini AI report generation failed:', geminiError.message);
        // Store fallback message
        scan.refinedReport = `AI analysis temporarily unavailable due to high demand. Please try again later.\n\nError: ${geminiError.message}`;
        scan.status = 'completed'; // Still mark as complete
        await scan.save();
      }
    }

    // STEP D: Return results (partial or complete)
    // Extract key metrics for easy access - even for partial results
    const vtStats = scan.vtResult?.data?.attributes?.stats || null;
    const lighthouseResult = scan.pagespeedResult?.lighthouseResult || {};
    const categories = lighthouseResult.categories || {};

    const psiScores = scan.pagespeedResult && !scan.pagespeedResult.error ? {
      performance: categories.performance?.score ? Math.round(categories.performance.score * 100) : null,
      accessibility: categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : null,
      bestPractices: categories['best-practices']?.score ? Math.round(categories['best-practices'].score * 100) : null,
      seo: categories.seo?.score ? Math.round(categories.seo.score * 100) : null
    } : null;

    const observatoryData = scan.observatoryResult && !scan.observatoryResult.error ? {
      grade: scan.observatoryResult.grade,
      score: scan.observatoryResult.score,
      tests_passed: scan.observatoryResult.tests_passed,
      tests_failed: scan.observatoryResult.tests_failed,
      tests_quantity: scan.observatoryResult.tests_quantity
    } : null;

    // ZAP data handling - support pending/running/completed/failed states
    let zapData = null;
    if (scan.zapResult) {
      const zapStatus = scan.zapResult.status;

      if (zapStatus === 'completed') {
        // ZAP scan completed successfully
        zapData = {
          status: 'completed',
          riskCounts: scan.zapResult.riskCounts || { High: 0, Medium: 0, Low: 0, Informational: 0 },
          alerts: scan.zapResult.alerts || [],
          totalAlerts: scan.zapResult.totalAlerts || scan.zapResult.alerts?.length || 0,
          totalOccurrences: scan.zapResult.totalOccurrences || 0,
          reportFiles: scan.zapResult.reportFiles || [],
          site: scan.zapResult.site || scan.target
        };
      } else if (zapStatus === 'pending' || zapStatus === 'running') {
        // ZAP scan in progress - show progress info
        zapData = {
          status: zapStatus,
          phase: scan.zapResult.phase || 'queued',
          progress: scan.zapResult.progress || 0,
          message: scan.zapResult.message || 'ZAP scan in progress...',
          urlsFound: scan.zapResult.urlsFound || 0,
          alertsFound: scan.zapResult.alertsFound || 0
        };
      } else if (zapStatus === 'failed') {
        // ZAP scan failed
        zapData = {
          status: 'failed',
          error: scan.zapResult.error || 'ZAP scan failed',
          message: scan.zapResult.message || 'Vulnerability scan encountered an error'
        };
      }
    }

    const urlscanData = scan.urlscanResult && !scan.urlscanResult.error ? {
      uuid: scan.urlscanResult.uuid,
      verdicts: scan.urlscanResult.verdicts,
      page: scan.urlscanResult.page,
      stats: scan.urlscanResult.stats,
      screenshot: scan.urlscanResult.screenshot,
      reportUrl: scan.urlscanResult.reportUrl
    } : null;

    // WebCheck data handling - support running/completed/failed states
    let webCheckData = null;
    if (scan.webCheckResult) {
      const webCheckStatus = scan.webCheckResult.status;

      if (webCheckStatus === 'completed') {
        // WebCheck scans completed successfully
        webCheckData = {
          status: 'completed',
          results: scan.webCheckResult.results || {},
          completedScans: scan.webCheckResult.completedScans || 0,
          totalScans: scan.webCheckResult.totalScans || 30,
          hasErrors: scan.webCheckResult.hasErrors || false,
          duration: scan.webCheckResult.duration || 0
        };
      } else if (webCheckStatus === 'running') {
        // WebCheck scan in progress - show progress info
        webCheckData = {
          status: 'running',
          progress: scan.webCheckResult.progress || 0,
          completedScans: scan.webCheckResult.completedScans || 0,
          totalScans: scan.webCheckResult.totalScans || 30,
          message: scan.webCheckResult.message || 'WebCheck scans in progress...',
          partialResults: scan.webCheckResult.partialResults || {}
        };
      } else if (webCheckStatus === 'failed') {
        // WebCheck scan failed
        webCheckData = {
          status: 'failed',
          error: scan.webCheckResult.error || 'WebCheck scan failed',
          message: scan.webCheckResult.message || 'WebCheck encountered an error'
        };
      }
    }

    // Always return all available data (progressive loading)
    return res.json({
      success: true,
      status: scan.status,
      analysisId: id,
      target: scan.target,
      // Partial data indicators
      hasVtResult: !!scan.vtResult,
      hasPsiResult: !!scan.pagespeedResult,
      hasObservatoryResult: !!scan.observatoryResult,
      hasZapResult: !!scan.zapResult && scan.zapResult.status === 'completed',
      zapPending: !!scan.zapResult && (scan.zapResult.status === 'pending' || scan.zapResult.status === 'running'),
      hasUrlscanResult: !!scan.urlscanResult && !scan.urlscanResult.error,
      hasWebCheckResult: !!scan.webCheckResult && scan.webCheckResult.status === 'completed',
      webCheckPending: !!scan.webCheckResult && scan.webCheckResult.status === 'running',
      hasRefinedReport: !!scan.refinedReport,
      // Actual data (null if not yet available)
      vtStats: vtStats,
      psiScores: psiScores,
      observatoryData: observatoryData,
      zapData: zapData,
      urlscanData: urlscanData,
      webCheckData: webCheckData,
      refinedReport: scan.refinedReport || null,
      vtResult: scan.vtResult || null,
      pagespeedResult: scan.pagespeedResult || null,
      observatoryResult: scan.observatoryResult || null,
      zapResult: scan.zapResult || null,
      urlscanResult: scan.urlscanResult || null,
      webCheckResult: scan.webCheckResult || null,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt
    });

  } catch (err) {
    console.error('❌ Combined analysis retrieval error:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({
      error: 'Failed to retrieve combined analysis',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// 7️⃣ Download Complete JSON Report (All scan data combined)
router.get('/download-complete-json/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    console.log(`📥 Downloading complete JSON report for ID: ${id}`);

    // Find the scan in database
    const scan = await ScanResult.findOne({ analysisId: id, userId: req.user.id });

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found or access denied'
      });
    }

    // Prepare complete JSON data package
    const completeData = {
      metadata: {
        scanId: scan.analysisId,
        target: scan.target,
        scannedAt: scan.createdAt,
        completedAt: scan.updatedAt,
        status: scan.status,
        generatedBy: 'SSDT Security Scanner',
        version: '2.0'
      },
      virusTotal: scan.vtResult || null,
      pageSpeed: scan.pagespeedResult || null,
      observatory: scan.observatoryResult || null,
      urlscan: scan.urlscanResult || null,
      webCheck: {
        status: scan.webCheckResult?.status || null,
        completedScans: scan.webCheckResult?.completedScans || null,
        totalScans: scan.webCheckResult?.totalScans || null,
        duration: scan.webCheckResult?.duration || null,
        hasErrors: scan.webCheckResult?.hasErrors || false,
        results: scan.webCheckResult?.results || null
      },
      zap: {
        summary: {
          riskCounts: scan.zapResult?.riskCounts || null,
          totalAlerts: scan.zapResult?.totalAlerts || null,
          totalOccurrences: scan.zapResult?.totalOccurrences || null,
          urlsFound: scan.zapResult?.urlsFound || null,
          status: scan.zapResult?.status || null,
          completedAt: scan.zapResult?.completedAt || null
        },
        alerts: scan.zapResult?.alerts || [],
        reportFiles: scan.zapResult?.reportFiles || []
      },
      aiAnalysis: {
        refinedReport: scan.refinedReport || null,
        generatedAt: scan.updatedAt
      }
    };

    // Set headers for JSON download
    const filename = `scan_report_${scan.target.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send JSON
    res.json(completeData);
    console.log(`✅ Complete JSON report downloaded: ${filename}`);

  } catch (err) {
    console.error('❌ Download complete JSON error:', err);
    res.status(500).json({
      error: 'Failed to download complete JSON report',
      details: err.message
    });
  }
});

// 8️⃣ Get file report by hash (Protected route)
router.get('/file-report/:hash', auth, async (req, res) => {
  try {
    const { hash } = req.params;

    if (!hash) {
      return res.status(400).json({ error: 'File hash is required' });
    }

    const report = await getFileReport(hash);

    res.json({
      success: true,
      report: report
    });
  } catch (err) {
    console.error('❌ File report error:', err.message);
    res.status(500).json({
      error: 'Failed to retrieve file report',
      details: err.message
    });
  }
});

// 9️⃣ Stop a combined scan and restart Docker containers (Protected route)
router.post('/stop-scan/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    console.log(`🛑 User ${req.user.id} requested to stop combined scan: ${id}`);

    // Stop WebCheck in-memory tracking first
    const webCheckStopped = stopWebCheckScan(id);
    if (webCheckStopped) {
      console.log(`🛑 WebCheck background scan stopped for: ${id}`);
    }

    // Stop the combined scan and restart containers
    const result = await stopCombinedScan(id, req.user.id);

    res.json({
      success: true,
      message: result.message || 'Scan stopped successfully',
      scanId: id,
      containersRestarted: result.containersRestarted || { zap: false, webCheck: false },
      webCheckBackgroundStopped: webCheckStopped,
      note: 'Both ZAP and WebCheck containers have been restarted for fresh scan environment'
    });

  } catch (err) {
    console.error('❌ Stop scan error:', err);

    if (err.message.includes('not found') || err.message.includes('access denied')) {
      return res.status(404).json({
        success: false,
        error: 'Scan not found or access denied'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to stop scan',
      details: err.message
    });
  }
});

module.exports = router;