const express = require('express');
const router = express.Router();
const { 
  startSpiderScan, 
  getSpiderStatus, 
  startActiveScan, 
  getActiveScanStatus, 
  getZapAlerts 
} = require('../services/zapService');

// POST: Start a new scan
router.post('/scan', async (req, res) => {
  const { url } = req.body;

  try {
    const scanId = await startSpiderScan(url);
    res.status(200).json({ 
      message: 'Scan started', 
      scanId: scanId 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to start scan' });
  }
});

// GET: Check the status of a specific scan
router.get('/status/:scanId', async (req, res) => {
  const { scanId } = req.params;
  
  try {
    const progress = await getSpiderStatus(scanId);
    res.json({ progress: progress });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// 👇 NEW: Start Active Scan
router.post('/ascan', async (req, res) => {
  const { url } = req.body;
  try {
    const scanId = await startActiveScan(url);
    res.json({ scanId: scanId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start active scan' });
  }
});

// 👇 NEW: Check Active Scan Status
router.get('/ascan/status/:scanId', async (req, res) => {
  try {
    const progress = await getActiveScanStatus(req.params.scanId);
    res.json({ progress: progress });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// 👇 NEW: Get Vulnerability Results (Alerts)
router.get('/alerts', async (req, res) => {
  try {
    const { url } = req.query;
    const alerts = await getZapAlerts(url);
    res.json({ alerts: alerts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

module.exports = router;