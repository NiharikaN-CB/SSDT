const express = require('express');
const router = express.Router();
const { runZapScan } = require('../services/zapService');
const ScanResult = require('../models/ScanResult');

// POST /api/zap/scan
router.post('/scan', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Get User ID from auth middleware (req.user)
  // If auth middleware is not applied to this specific route in server.js, 
  // ensure you handle the missing user case or require auth.
  const userId = req.user ? req.user.id : null; 

  try {
    console.log(`⚡ Received ZAP scan request for: ${url}`);
    
    // 1. Run the scan
    const scanData = await runZapScan(url);

    // 2. Return results immediately (The frontend handles the display)
    res.json({
      success: true,
      data: scanData
    });

  } catch (error) {
    console.error('❌ ZAP Route Error:', error.message);
    res.status(500).json({ 
      error: 'ZAP Scan failed', 
      details: error.message 
    });
  }
});

module.exports = router;