const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { scanFile, scanUrl, getAnalysis, getFileReport } = require('../services/virustotalService');
const { getPageSpeedReport } = require('../services/pagespeedService');
const { refineReport } = require('../services/geminiService');
const { scanHost } = require('../services/observatoryService');
const ScanResult = require('../models/ScanResult');
const auth = require('../middleware/auth');
const { combinedScanLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// URL validation helper function
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    // Check if protocol is http or https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }
    // Check if hostname is valid (not empty and contains at least one dot)
    if (!url.hostname || url.hostname.length < 3) {
      return { valid: false, error: 'Invalid hostname in URL' };
    }
    // Block localhost and private IP ranges for security
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    const privateRanges = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/;

    if (blockedHosts.includes(url.hostname) || privateRanges.test(url.hostname)) {
      return { valid: false, error: 'Cannot scan local or private network URLs' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

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

    // Validate URL format and security
    const validation = isValidUrl(url);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
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
    console.log('🚀 TRUE PARALLEL EXECUTION: Starting all three APIs simultaneously...');

    // Extract hostname for Observatory (before parallel execution)
    const hostname = new URL(url).hostname;

    // Execute all three API calls in parallel using Promise.allSettled
    const [vtResult, psiResult, obsResult] = await Promise.allSettled([
      scanUrl(url),
      getPageSpeedReport(url),
      scanHost(hostname)
    ]);

    console.log('📋 Parallel execution results:');
    console.log('  - VirusTotal:', vtResult.status);
    console.log('  - PageSpeed:', psiResult.status);
    console.log('  - Observatory:', obsResult.status);

    // Handle VirusTotal result (critical - need analysis ID)
    if (vtResult.status !== 'fulfilled') {
      throw new Error(`VirusTotal scan failed: ${vtResult.reason?.message || 'Unknown error'}`);
    }

    const vtResp = vtResult.value;
    console.log('📋 VirusTotal Response:', JSON.stringify(vtResp, null, 2));

    // Extract analysis ID
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

    // Check if this analysis ID already exists for this user
    let scan = await ScanResult.findOne({ analysisId: analysisId, userId: req.user.id });

    if (scan) {
      // Update existing scan with fresh data
      console.log('🔄 Updating existing scan with fresh data...');
      scan.status = 'processing';
      scan.vtResult = null; // Clear old VT result
      scan.refinedReport = null; // Clear old AI report
      scan.pagespeedResult = psiResult.status === 'fulfilled'
        ? psiResult.value
        : { error: psiResult.reason?.message || 'PageSpeed scan failed' };
      scan.observatoryResult = obsResult.status === 'fulfilled'
        ? obsResult.value
        : { error: obsResult.reason?.message || 'Observatory scan failed' };
      scan.updatedAt = Date.now();
      await scan.save();
      console.log('✅ Existing scan updated with fresh PageSpeed and Observatory data');
    } else {
      // Create new scan
      console.log('🆕 Creating new scan...');
      scan = new ScanResult({
        target: url,
        analysisId: analysisId,
        status: 'processing',
        userId: req.user.id,
        // Store PageSpeed result if successful
        pagespeedResult: psiResult.status === 'fulfilled'
          ? psiResult.value
          : { error: psiResult.reason?.message || 'PageSpeed scan failed' },
        // Store Observatory result if successful
        observatoryResult: obsResult.status === 'fulfilled'
          ? obsResult.value
          : { error: obsResult.reason?.message || 'Observatory scan failed' }
      });
      await scan.save();
      console.log('✅ New scan created');
    }

    console.log('✅ Parallel execution complete - PSI and Observatory results saved');
    console.log(`   PageSpeed: ${psiResult.status === 'fulfilled' ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Observatory: ${obsResult.status === 'fulfilled' ? 'SUCCESS' : 'FAILED'}`);

    res.json({
      success: true,
      message: 'URL submitted for combined analysis (VirusTotal + PageSpeed + AI)',
      analysisId: analysisId,
      url: url
    });
  } catch (err) {
    console.error('❌ Combined URL scan error:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({
      error: 'Failed to initiate combined scan',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
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

    // STEP A: Check VirusTotal status (PSI and Observatory already started in parallel)
    if (!scan.vtResult || scan.status === 'queued' || scan.status === 'processing') {
      console.log('⏳ Checking VirusTotal status...');

      const vtResp = await getAnalysis(id);
      const vtStatus = vtResp?.data?.attributes?.status;

      console.log(`📋 VT Status: ${vtStatus}`);

      if (vtStatus === 'completed') {
        // VT is complete, update the scan
        scan.vtResult = vtResp;
        scan.status = 'combining'; // Now combining all results with Gemini
        await scan.save();
        console.log('✅ VirusTotal complete! PSI and Observatory already fetched in parallel.');
      } else {
        // VT still pending
        scan.status = vtStatus || 'processing';
        await scan.save();

        return res.json({
          success: true,
          status: scan.status,
          message: 'VirusTotal analysis in progress... (PageSpeed and Observatory already running)',
          analysisId: id
        });
      }
    }

    // STEP B: If VT is complete, generate Gemini report
    if (scan.vtResult && !scan.refinedReport) {
      console.log('🔄 All APIs complete. Generating Gemini AI report...');

      try {
        // Update status to combining
        scan.status = 'combining';
        await scan.save();

        // Extract data for Gemini (PSI and Observatory were already fetched in parallel)
        const psiReport = scan.pagespeedResult?.error ? null : scan.pagespeedResult;
        const observatoryReport = scan.observatoryResult?.error ? null : scan.observatoryResult;

        console.log('📊 Using pre-fetched parallel results:');
        console.log(`   PageSpeed: ${psiReport ? 'Available' : 'Failed'}`);
        console.log(`   Observatory: ${observatoryReport ? 'Available' : 'Failed'}`);

        // Generate refined report with Gemini (now includes Observatory data)
        console.log('🤖 Generating AI-refined report...');
        try {
          const aiReport = await refineReport(scan.vtResult, psiReport, observatoryReport, scan.target);
          scan.refinedReport = aiReport;
        } catch (geminiError) {
          console.error('⚠️  Gemini AI report generation failed:', geminiError.message);
          // Don't fail the entire scan if only Gemini fails
          // Store a fallback message instead
          scan.refinedReport = `AI analysis temporarily unavailable due to high demand. Please try again later.\n\nError: ${geminiError.message}`;
        }

        // Mark as completed (even if Gemini failed, we have VT, PSI, and Observatory data)
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

    // STEP C: Return the complete results
    if (scan.status === 'completed') {
      // Extract key metrics for easy access
      const vtStats = scan.vtResult?.data?.attributes?.stats || {};
      const lighthouseResult = scan.pagespeedResult?.lighthouseResult || {};
      const categories = lighthouseResult.categories || {};

      const psiScores = {
        performance: categories.performance?.score ? Math.round(categories.performance.score * 100) : null,
        accessibility: categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : null,
        bestPractices: categories['best-practices']?.score ? Math.round(categories['best-practices'].score * 100) : null,
        seo: categories.seo?.score ? Math.round(categories.seo.score * 100) : null
      };

      // Extract Observatory metrics
      console.log('📊 Processing Observatory Result:', scan.observatoryResult);

      const observatoryData = scan.observatoryResult && !scan.observatoryResult.error ? {
        grade: scan.observatoryResult.grade,
        score: scan.observatoryResult.score,
        tests_passed: scan.observatoryResult.tests_passed,
        tests_failed: scan.observatoryResult.tests_failed,
        tests_quantity: scan.observatoryResult.tests_quantity
      } : null;

      console.log('📊 Extracted Observatory Data:', observatoryData);

      return res.json({
        success: true,
        status: 'completed',
        analysisId: id,
        target: scan.target,
        vtStats: vtStats,
        psiScores: psiScores,
        observatoryData: observatoryData,
        refinedReport: scan.refinedReport,
        vtResult: scan.vtResult,
        pagespeedResult: scan.pagespeedResult,
        observatoryResult: scan.observatoryResult,
        createdAt: scan.createdAt,
        updatedAt: scan.updatedAt
      });
    }

    // Return current status
    res.json({
      success: true,
      status: scan.status,
      message: `Analysis status: ${scan.status}`,
      analysisId: id
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