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

    // Call VirusTotal API
    const vtResp = await scanUrl(url);

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

    // STEP B: If VT is complete, check if we need PSI, Observatory and Gemini
    if (scan.vtResult && (!scan.pagespeedResult || !scan.observatoryResult || !scan.refinedReport)) {
      console.log('🔄 VT complete. Running PageSpeed, Observatory and Gemini analysis...');

      try {
        // Update status to combining
        scan.status = 'combining';
        await scan.save();

        // Run PageSpeed and Observatory in parallel for faster execution
        console.log('🚀 Fetching PageSpeed and Observatory reports in parallel...');

        // Extract hostname for Observatory
        const hostname = new URL(scan.target).hostname;
        console.log(`🔍 Scanning hostname: ${hostname}`);

        // Execute both API calls in parallel using Promise.allSettled
        // This allows independent error handling for each service
        const [psiResult, obsResult] = await Promise.allSettled([
          getPageSpeedReport(scan.target),
          scanHost(hostname)
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