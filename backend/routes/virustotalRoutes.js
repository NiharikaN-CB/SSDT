// virustotalRoutes.js

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { scanFile, scanUrl, getAnalysis } = require('../services/virustotalservice');
const ScanResult = require('../models/ScanResult');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// 1️⃣ Scan a file
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    const vtResp = await scanFile(req.file.path);
    fs.unlink(req.file.path, () => {}); // delete temp file

    const scan = new ScanResult({
      target: req.file.originalname,
      analysisId: vtResp.data.id,
      status: 'pending'
    });
    await scan.save();

    res.json({ message: 'File uploaded and sent for scanning', analysisId: vtResp.data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2️⃣ Scan a URL -- FIXED: takes URL from JSON body, not path param
router.post('/url', async (req, res) => {
  try {
    const { url } = req.body;
    const vtResp = await scanUrl(url);

    const scan = new ScanResult({
      target: url,
      analysisId: vtResp.data.id,
      status: 'pending'
    });
    await scan.save();

    res.json({ message: 'URL submitted for analysis', analysisId: vtResp.data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3️⃣ Check analysis result
router.get('/analysis/:id', async (req, res) => {
  try {
    const vtResp = await getAnalysis(req.params.id);
    const scan = await ScanResult.findOneAndUpdate(
      { analysisId: req.params.id },
      { result: vtResp, status: vtResp.data.attributes.status },
      { new: true }
    );
    res.json(scan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
