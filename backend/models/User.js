const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  otp: {
    type: String,
  },
  otpExpires: {
    type: Date,
  },
  // Account type - defaults to 'free'
  accountType: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free'
  },
  // Profile information
  bio: {
    type: String,
    default: '',
    maxlength: 500
  },
  // Account statistics
  totalScans: {
    type: Number,
    default: 0
  },
  // Pro features (for future implementation)
  proExpiresAt: {
    type: Date,
    default: null
  },
  // Account creation date
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Last login tracking
  lastLoginAt: {
    type: Date,
    default: Date.now
  }
});

// Method to check if user is Pro
UserSchema.methods.isPro = function() {
  return this.accountType === 'pro' && (!this.proExpiresAt || this.proExpiresAt > new Date());
};

// Method to get account limits
UserSchema.methods.getAccountLimits = function() {
  if (this.isPro()) {
    return {
      scansPerDay: -1, // Unlimited for pro (implement later)
      maxFileSize: 100 * 1024 * 1024, // 100MB for pro
      priorityQueue: true
    };
  } else {
    return {
      scansPerDay: 20, // 20 scans per day for free
      maxFileSize: 32 * 1024 * 1024, // 32MB for free
      priorityQueue: false
    };
  }
};

module.exports = mongoose.model('User', UserSchema);