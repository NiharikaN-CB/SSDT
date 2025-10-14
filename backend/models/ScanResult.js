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
  vtResult: {
    type: Object,
    default: null
  },
  pagespeedResult: {
    type: Object,
    default: null
  },
  refinedReport: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['queued', 'pending', 'combining', 'completed', 'failed'],
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

// Update the updatedAt timestamp before saving
scanResultSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add method to check if scan is complete
scanResultSchema.methods.isComplete = function() {
  return this.status === 'completed';
};

// Add static method to get recent scans
scanResultSchema.statics.getRecentScans = function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('ScanResult', scanResultSchema);