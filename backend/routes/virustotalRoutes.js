const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { scanFile, scanUrl, getAnalysis, getFileReport } = require('../services/virustotalService');
const { getPageSpeedReport } = require('../services/pagespeedService');
const { scanHost } = require('../services/observatoryService');
const { refineReport } = require('../services/geminiService');
const { runZapScan } = require('../services/zapService');
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
      console.log('📝 Existing scan found, checking status...');

      // 🚀 INSTANT CACHE: If scan completed recently (within 5 minutes), return cached results
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (scan.status === 'completed' && scan.updatedAt > fiveMinutesAgo && scan.refinedReport) {
        console.log('⚡ Returning cached scan results (completed within last 5 minutes)');
        return res.json({
          success: true,
          message: 'Returning cached results',
          analysisId: analysisId,
          url: url,
          cached: true
        });
      }

      scan.userId = req.user.id; // Update owner to current requester
      scan.updatedAt = Date.now();
      // Only reset status if it was failed, otherwise keep the history
      if (scan.status === 'failed') {
        scan.status = 'queued';
      }
      await scan.save();
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
    if (scan.vtResult && (!scan.pagespeedResult || !scan.observatoryResult || !scan.zapResult || !scan.urlscanResult || !scan.refinedReport)) {
      console.log('🔄 VT complete. Running PageSpeed, Observatory, ZAP, urlscan and Gemini analysis...');

      try {
        // Update status to combining
        scan.status = 'combining';
        await scan.save();

        // Run PageSpeed, Observatory, ZAP, and urlscan in parallel for faster execution
        console.log('🚀 Fetching PageSpeed, Observatory, ZAP and urlscan reports in parallel...');

        // Extract hostname for Observatory
        const hostname = new URL(scan.target).hostname;
        console.log(`🔍 Scanning hostname: ${hostname}`);

        // Execute all API calls in parallel using Promise.allSettled
        // This allows independent error handling for each service
        const [psiResult, obsResult, zapResult, urlscanResult] = await Promise.allSettled([
          getPageSpeedReport(scan.target),
          scanHost(hostname),
          runZapScan({ target: scan.target, scanId: scan.analysisId }),
          runUrlScan(scan.target)
        ]);

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

        // Handle ZAP result
        let zapReport = null;
        if (zapResult.status === 'fulfilled') {
          zapReport = zapResult.value;
          scan.zapResult = zapReport;
          console.log('✅ ZAP scan completed:', zapReport?.riskCounts);
        } else {
          console.error('⚠️  ZAP scan failed:', zapResult.reason);
          console.error('⚠️  Error details:', zapResult.reason?.message);
          // Continue even if ZAP fails - it's not critical
          scan.zapResult = { error: zapResult.reason?.message || 'ZAP scan failed or not available' };
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

        // Generate refined report with Gemini (now includes Observatory, ZAP, and urlscan data)
        console.log('🤖 Generating AI-refined report with all scan data...');
        try {
          const aiReport = await refineReport(scan.vtResult, psiReport, observatoryReport, scan.target, zapReport, urlscanReport);
          scan.refinedReport = aiReport;
        } catch (geminiError) {
          console.error('⚠️  Gemini AI report generation failed:', geminiError.message);
          // Don't fail the entire scan if only Gemini fails
          // Store a fallback message instead
          scan.refinedReport = `AI analysis temporarily unavailable due to high demand. Please try again later.\n\nError: ${geminiError.message}`;
        }

        // Mark as completed (even if Gemini failed, we have VT, PSI, Observatory, and ZAP data)
        scan.status = 'completed';
        await scan.save();

        console.log('✅ Combined analysis completed!');
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

    // STEP C: Return results (partial or complete)
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

    const zapData = scan.zapResult && !scan.zapResult.error ? {
      riskCounts: scan.zapResult.riskCounts,
      alerts: scan.zapResult.alerts,
      site: scan.zapResult.site
    } : null;

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
      hasZapResult: !!scan.zapResult && !scan.zapResult.error,
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

// 7️⃣ Get file report by hash (Protected route)
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