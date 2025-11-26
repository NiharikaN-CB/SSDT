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
  result: {
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
  refinedReport: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['queued', 'pending', 'completed', 'failed'],
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

scanResultSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

scanResultSchema.methods.isComplete = function() {
  return this.status === 'completed';
};

scanResultSchema.statics.getRecentScans = function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('ScanResult', scanResultSchema);