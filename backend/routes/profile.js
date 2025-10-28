const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const ScanResult = require('../models/ScanResult');

// @route   GET /profile
// @desc    Get user profile with statistics
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp -otpExpires');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get scan statistics
    const totalScans = await ScanResult.countDocuments({ userId: req.user.id });
    const recentScans = await ScanResult.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('target status createdAt');

    // Calculate scans this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const scansThisMonth = await ScanResult.countDocuments({
      userId: req.user.id,
      createdAt: { $gte: startOfMonth }
    });

    // Update totalScans in user model if needed
    if (user.totalScans !== totalScans) {
      user.totalScans = totalScans;
      await user.save();
    }

    // Get account limits
    const limits = user.getAccountLimits();

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        accountType: user.accountType,
        isVerified: user.isVerified,
        totalScans: totalScans,
        scansThisMonth: scansThisMonth,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        isPro: user.isPro(),
        proExpiresAt: user.proExpiresAt
      },
      limits: limits,
      recentScans: recentScans
    });
  } catch (err) {
    console.error('Profile retrieval error:', err.message);
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

// @route   PUT /profile
// @desc    Update user profile
// @access  Private
router.put('/', auth, async (req, res) => {
  try {
    const { name, bio } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate inputs
    if (name && name.trim().length < 3) {
      return res.status(400).json({ message: 'Name must be at least 3 characters long' });
    }

    if (bio && bio.length > 500) {
      return res.status(400).json({ message: 'Bio must not exceed 500 characters' });
    }

    // Update fields
    if (name) user.name = name.trim();
    if (bio !== undefined) user.bio = bio.trim();

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        accountType: user.accountType
      }
    });
  } catch (err) {
    console.error('Profile update error:', err.message);
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

// @route   GET /profile/stats
// @desc    Get detailed user statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all scans
    const allScans = await ScanResult.find({ userId }).select('status createdAt');

    // Calculate statistics
    const totalScans = allScans.length;
    const completedScans = allScans.filter(scan => scan.status === 'completed').length;
    const failedScans = allScans.filter(scan => scan.status === 'failed').length;
    const pendingScans = allScans.filter(scan => ['queued', 'pending', 'combining'].includes(scan.status)).length;

    // Calculate scans per month (last 6 months)
    const monthlyStats = {};
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    allScans.forEach(scan => {
      const monthKey = `${scan.createdAt.getFullYear()}-${String(scan.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (scan.createdAt >= sixMonthsAgo) {
        monthlyStats[monthKey] = (monthlyStats[monthKey] || 0) + 1;
      }
    });

    res.json({
      success: true,
      stats: {
        totalScans,
        completedScans,
        failedScans,
        pendingScans,
        successRate: totalScans > 0 ? ((completedScans / totalScans) * 100).toFixed(1) : 0,
        monthlyStats
      }
    });
  } catch (err) {
    console.error('Stats retrieval error:', err.message);
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

// @route   POST /profile/upgrade-to-pro
// @desc    Upgrade to Pro account (placeholder for payment integration)
// @access  Private
router.post('/upgrade-to-pro', auth, async (req, res) => {
  try {
    // TODO: Implement payment processing here
    // For now, this is just a placeholder that returns information

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isPro()) {
      return res.status(400).json({ message: 'You already have an active Pro account' });
    }

    // Return information about Pro features
    res.json({
      success: false,
      message: 'Pro upgrade endpoint - Payment integration coming soon',
      proFeatures: {
        scansPerDay: 'Unlimited',
        maxFileSize: '100MB',
        priorityQueue: true,
        advancedReports: true,
        apiAccess: true,
        price: '$9.99/month' // Placeholder price
      },
      note: 'This feature will be implemented with payment gateway integration'
    });
  } catch (err) {
    console.error('Pro upgrade error:', err.message);
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

module.exports = router;
