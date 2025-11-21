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
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }
    if (!url.hostname || url.hostname.length < 3) {
      return { valid: false, error: 'Invalid hostname in URL' };
    }
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
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log(`📎 Receiving file: ${file.originalname} (${file.mimetype})`);
    cb(null, true);
  }
});

const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// 1️⃣ Scan a file (Protected route) - FIXED DUPLICATE KEY ERROR
router.post('/file', auth, upload.single('file'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    filePath = req.file.path;
    console.log(`🔐 User ${req.user.id} uploaded file: ${req.file.originalname}`);

    const vtResp = await scanFile(filePath);
    console.log('📋 VirusTotal Response:', JSON.stringify(vtResp, null, 2));

    let analysisId = vtResp?.data?.id || vtResp?.id || vtResp?.data?.attributes?.id;
    console.log(`🔑 Extracted Analysis ID: ${analysisId}`);

    if (!analysisId) {
      console.error('❌ No analysis ID found in response:', vtResp);
      return res.status(500).json({ error: 'No analysis ID received', vtResponse: vtResp });
    }

    // ✅ FIX: Use findOneAndUpdate with upsert instead of .save()
    const scan = await ScanResult.findOneAndUpdate(
      { analysisId: analysisId },
      {
        $set: {
          target: req.file.originalname,
          status: 'queued',
          userId: req.user.id,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: 'File uploaded and sent for scanning',
      analysisId: analysisId,
      filename: req.file.originalname
    });
  } catch (err) {
    console.error('❌ File scan error:', err);
    res.status(500).json({ error: 'Failed to scan file', details: err.message });
  } finally {
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

// 2️⃣ Scan a URL (Protected route) - FIXED DUPLICATE KEY ERROR
router.post('/url', auth, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });

    const validation = isValidUrl(url);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    console.log(`🔐 User ${req.user.id} submitted URL: ${url}`);

    const vtResp = await scanUrl(url);
    console.log('📋 VirusTotal Response:', JSON.stringify(vtResp, null, 2));

    let analysisId = vtResp?.data?.id || vtResp?.id || vtResp?.data?.attributes?.id;
    console.log(`🔑 Extracted Analysis ID: ${analysisId}`);

    if (!analysisId) {
      console.error('❌ No analysis ID found in response:', vtResp);
      return res.status(500).json({ error: 'No analysis ID received', vtResponse: vtResp });
    }

    // ✅ FIX: Use findOneAndUpdate with upsert
    const scan = await ScanResult.findOneAndUpdate(
      { analysisId: analysisId },
      {
        $set: {
          target: url,
          status: 'queued',
          userId: req.user.id,
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: 'URL submitted for analysis',
      analysisId: analysisId,
      url: url
    });
  } catch (err) {
    console.error('❌ URL scan error:', err);
    res.status(500).json({ error: 'Failed to scan URL', details: err.message });
  }
});

// 3️⃣ Check analysis result (Protected route)
router.get('/analysis/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Analysis ID is required' });

    console.log(`📊 Fetching analysis for ID: ${id}`);
    const vtResp = await getAnalysis(id);
    console.log('📋 Analysis Response:', JSON.stringify(vtResp, null, 2));

    const scan = await ScanResult.findOneAndUpdate(
      { analysisId: id },
      {
        result: vtResp,
        status: vtResp?.data?.attributes?.status || 'unknown'
      },
      { new: true }
    );

    if (!scan) {
      return res.status(404).json({ error: 'Analysis not found in database', vtData: vtResp });
    }

    res.json({
      success: true,
      ...scan.toObject(),
      stats: vtResp?.data?.attributes?.stats
    });
  } catch (err) {
    console.error('❌ Analysis retrieval error:', err);
    res.status(500).json({ error: 'Failed to retrieve analysis', details: err.message });
  }
});

// 4️⃣ Get user's scan history
router.get('/history', auth, async (req, res) => {
  try {
    const scans = await ScanResult.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, count: scans.length, scans: scans });
  } catch (err) {
    console.error('❌ History retrieval error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve scan history', details: err.message });
  }
});

// 5️⃣ Combined URL Scan (VirusTotal + PageSpeed + Gemini) - FIXED DUPLICATE KEY ERROR
router.post('/combined-url-scan', auth, combinedScanLimiter, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });

    const validation = isValidUrl(url);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    console.log(`🔐 User ${req.user.id} submitted URL for combined scan: ${url}`);

    const vtResp = await scanUrl(url);
    console.log('📋 VirusTotal Response:', JSON.stringify(vtResp, null, 2));

    let analysisId = vtResp?.data?.id || vtResp?.id || vtResp?.data?.attributes?.id;
    console.log(`🔑 Extracted Analysis ID: ${analysisId}`);

    if (!analysisId) {
      console.error('❌ No analysis ID found in response:', vtResp);
      return res.status(500).json({ error: 'No analysis ID received', vtResponse: vtResp });
    }

    // ✅ FIX: Use findOneAndUpdate with upsert instead of .save()
    // This prevents E11000 duplicate key errors when scanning the same URL multiple times
    const scan = await ScanResult.findOneAndUpdate(
      { analysisId: analysisId },
      {
        $set: {
          target: url,
          status: 'queued',
          userId: req.user.id,
          updatedAt: new Date() // Force update timestamp
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: 'URL submitted for combined analysis (VirusTotal + PageSpeed + AI)',
      analysisId: analysisId,
      url: url
    });
  } catch (err) {
    console.error('❌ Combined URL scan error:', err);
    res.status(500).json({ error: 'Failed to initiate combined scan', details: err.message });
  }
});

// 6️⃣ Combined Analysis Polling (Protected route)
router.get('/combined-analysis/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Analysis ID is required' });

    console.log(`📊 Fetching combined analysis for ID: ${id}`);
    let scan = await ScanResult.findOne({ analysisId: id, userId: req.user.id });

    if (!scan) return res.status(404).json({ error: 'Analysis not found in database' });

    // STEP A: Check VirusTotal status
    if (!scan.vtResult || scan.status === 'queued' || scan.status === 'pending') {
      console.log('⏳ Checking VirusTotal status...');
      const vtResp = await getAnalysis(id);
      const vtStatus = vtResp?.data?.attributes?.status;
      console.log(`📋 VT Status: ${vtStatus}`);

      if (vtStatus === 'completed') {
        scan.vtResult = vtResp;
        scan.status = 'pending';
        await scan.save();
      } else {
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

    // STEP B: If VT is complete, run others
    if (scan.vtResult && (!scan.pagespeedResult || !scan.observatoryResult || !scan.refinedReport)) {
      console.log('🔄 VT complete. Running PageSpeed, Observatory and Gemini analysis...');
      try {
        scan.status = 'combining';
        await scan.save();

        const hostname = new URL(scan.target).hostname;
        const [psiResult, obsResult] = await Promise.allSettled([
          getPageSpeedReport(scan.target),
          scanHost(hostname)
        ]);

        let psiReport = psiResult.status === 'fulfilled' ? psiResult.value : { error: psiResult.reason?.message || 'PageSpeed failed' };
        scan.pagespeedResult = psiReport;

        let obsReport = obsResult.status === 'fulfilled' ? obsResult.value : { error: obsResult.reason?.message || 'Observatory failed' };
        scan.observatoryResult = obsReport;

        console.log('🤖 Generating AI-refined report...');
        try {
          const aiReport = await refineReport(scan.vtResult, psiReport, obsReport, scan.target);
          scan.refinedReport = aiReport;
        } catch (geminiError) {
          console.error('⚠️ Gemini AI failed:', geminiError.message);
          scan.refinedReport = `AI analysis unavailable: ${geminiError.message}`;
        }

        scan.status = 'completed';
        await scan.save();
      } catch (combineError) {
        console.error('❌ Error in combining step:', combineError);
        scan.status = 'failed';
        await scan.save();
        return res.status(500).json({ error: 'Failed to complete combined analysis' });
      }
    }

    // STEP C: Return results
    if (scan.status === 'completed') {
      const vtStats = scan.vtResult?.data?.attributes?.stats || {};
      const lhResult = scan.pagespeedResult?.lighthouseResult || {};
      const cats = lhResult.categories || {};

      const psiScores = {
        performance: cats.performance?.score ? Math.round(cats.performance.score * 100) : null,
        accessibility: cats.accessibility?.score ? Math.round(cats.accessibility.score * 100) : null,
        bestPractices: cats['best-practices']?.score ? Math.round(cats['best-practices'].score * 100) : null,
        seo: cats.seo?.score ? Math.round(cats.seo.score * 100) : null
      };

      const observatoryData = scan.observatoryResult && !scan.observatoryResult.error ? {
        grade: scan.observatoryResult.grade,
        score: scan.observatoryResult.score,
        tests_passed: scan.observatoryResult.tests_passed,
        tests_failed: scan.observatoryResult.tests_failed,
        tests_quantity: scan.observatoryResult.tests_quantity
      } : null;

      return res.json({
        success: true,
        status: 'completed',
        analysisId: id,
        target: scan.target,
        vtStats,
        psiScores,
        observatoryData,
        refinedReport: scan.refinedReport,
        vtResult: scan.vtResult,
        pagespeedResult: scan.pagespeedResult,
        observatoryResult: scan.observatoryResult,
        createdAt: scan.createdAt,
        updatedAt: scan.updatedAt
      });
    }

    res.json({
      success: true,
      status: scan.status,
      message: `Analysis status: ${scan.status}`,
      analysisId: id
    });

  } catch (err) {
    console.error('❌ Combined analysis retrieval error:', err);
    res.status(500).json({ error: 'Failed to retrieve combined analysis', details: err.message });
  }
});

// 7️⃣ Get file report by hash
router.get('/file-report/:hash', auth, async (req, res) => {
  try {
    const { hash } = req.params;
    if (!hash) return res.status(400).json({ error: 'File hash is required' });
    const report = await getFileReport(hash);
    res.json({ success: true, report: report });
  } catch (err) {
    console.error('❌ File report error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve file report', details: err.message });
  }
});

module.exports = router;