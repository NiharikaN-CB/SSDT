const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { scanFile, scanUrl, getAnalysis, getFileReport } = require('../services/virustotalService');
const { getPageSpeedReport } = require('../services/pagespeedService');
const { scanHost } = require('../services/observatoryService');
const { refineReport } = require('../services/geminiService');
const { runZapScan, startAsyncZapScan } = require('../services/zapService');
const { runUrlScan } = require('../services/urlscanService');
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

    if (needsScanning || zapNotStarted) {
      console.log('🔄 VT complete. Running PageSpeed, Observatory, ZAP, urlscan and Gemini analysis...');

      try {
        // Update status to combining
        scan.status = 'combining';
        await scan.save();

        // CRITICAL CHANGE: Run fast scans in parallel, ZAP runs asynchronously
        // ZAP will update database independently when complete
        console.log('🚀 Fetching PageSpeed, Observatory and urlscan reports in parallel...');
        console.log('🚀 Starting ZAP scan asynchronously in background...');

        // Extract hostname for Observatory
        const hostname = new URL(scan.target).hostname;
        console.log(`🔍 Scanning hostname: ${hostname}`);

        // Execute fast scans in parallel, start ZAP asynchronously ONLY if needed
        // ZAP returns immediately with "pending" status
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

        const [psiResult, obsResult, urlscanResult, zapInitResult] = await Promise.allSettled(scanPromises);

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

        // Save results so far (PSI, Observatory, urlscan complete, ZAP pending)
        await scan.save();
        console.log('✅ Fast scans complete (PSI, Observatory, urlscan). ZAP running in background.');

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
      hasRefinedReport: !!scan.refinedReport,
      // Actual data (null if not yet available)
      vtStats: vtStats,
      psiScores: psiScores,
      observatoryData: observatoryData,
      zapData: zapData,
      urlscanData: urlscanData,
      refinedReport: scan.refinedReport || null,
      vtResult: scan.vtResult || null,
      pagespeedResult: scan.pagespeedResult || null,
      observatoryResult: scan.observatoryResult || null,
      zapResult: scan.zapResult || null,
      urlscanResult: scan.urlscanResult || null,
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

module.exports = router;