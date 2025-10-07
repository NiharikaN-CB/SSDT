const mongoose = require('mongoose');

const scanResultSchema = new mongoose.Schema({
  target: String, // file name or URL
  analysisId: String,
  result: Object,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ScanResult', scanResultSchema);
