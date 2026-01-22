const mongoose = require('mongoose');

const scanResultSchema = new mongoose.Schema({
  target: {
    type: String,
    required: true,
    trim: true
  },
  analysisId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Legacy field (kept for backwards compatibility)
  result: {
    type: Object,
    default: null
  },
  // VirusTotal scan result
  vtResult: {
    type: Object,
    default: null
  },
  pagespeedResult: {
    type: Object,
    default: null
  },
  observatoryResult: {
    type: Object,
    default: null
  },
  // 👇 ADD THIS FIELD
  zapResult: {
    type: Object,
    default: null
  },
  // urlscan.io result
  urlscanResult: {
    type: Object,
    default: null
  },
  // WebCheck 30 scan types result
  webCheckResult: {
    type: Object,
    default: null
  },
  refinedReport: {
    type: String,
    default: null
  },
  // Generated PDF report (legacy combined - deprecated)
  pdfReport: {
    type: Buffer,
    default: null
  },
  pdfGeneratedAt: {
    type: Date,
    default: null
  },
  // Separate language PDF caches
  pdfReportEn: {
    type: Buffer,
    default: null
  },
  pdfGeneratedAtEn: {
    type: Date,
    default: null
  },
  pdfReportJa: {
    type: Buffer,
    default: null
  },
  pdfGeneratedAtJa: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['queued', 'pending', 'combining', 'completed', 'failed', 'stopped'],
    default: 'queued'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

scanResultSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

scanResultSchema.methods.isComplete = function () {
  return this.status === 'completed';
};

scanResultSchema.statics.getRecentScans = function (userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('ScanResult', scanResultSchema);