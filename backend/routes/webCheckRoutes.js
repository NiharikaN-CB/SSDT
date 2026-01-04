const express = require('express');
const router = express.Router();
const webCheckService = require('../services/webCheckService');

// POST /api/webcheck/scan
// Body: { url: "example.com", type: "ssl" }
router.post('/scan', async (req, res) => {
    const { url, type } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    if (!type) {
        return res.status(400).json({
            error: 'Scan type is required',
            availableTypes: webCheckService.getAvailableScans()
        });
    }

    if (!webCheckService.ALLOWED_SCANS.includes(type)) {
        return res.status(400).json({
            error: `Invalid scan type: ${type}`,
            availableTypes: webCheckService.getAvailableScans()
        });
    }

    try {
        console.log(`⚡ WebCheck scan request: ${type} for ${url}`);
        const results = await webCheckService.runScan(type, url);

        res.json({
            success: true,
            scanType: type,
            targetUrl: url,
            data: results
        });
    } catch (error) {
        console.error('❌ WebCheck scan error:', error.message);
        res.status(500).json({
            error: 'WebCheck scan failed',
            details: error.message
        });
    }
});

// GET /api/webcheck/types
// Returns list of available scan types
router.get('/types', (req, res) => {
    res.json({
        scanTypes: webCheckService.getAvailableScans(),
        usage: 'POST /api/webcheck/scan with { url, type }'
    });
});

// GET /api/webcheck/health
// Check if WebCheck container is running
router.get('/health', async (req, res) => {
    const isHealthy = await webCheckService.checkHealth();

    if (isHealthy) {
        res.json({ status: 'healthy', message: 'WebCheck service is running' });
    } else {
        res.status(503).json({
            status: 'unhealthy',
            message: 'WebCheck service is not available. Start it with: docker-compose up webcheck'
        });
    }
});

module.exports = router;
