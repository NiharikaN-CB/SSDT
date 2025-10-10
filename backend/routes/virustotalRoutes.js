const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { scanFile, scanUrl, getAnalysis, getFileReport } = require('../services/virustotalService');
const ScanResult = require('../models/ScanResult');
const auth = require('../middleware/auth');

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

// 5️⃣ Get file report by hash (Protected route)
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