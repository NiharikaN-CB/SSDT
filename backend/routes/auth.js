const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { generateOTP, sendOTPEmail } = require('../services/emailService');

// Validate JWT_SECRET
if (!process.env.JWT_SECRET) {
  console.error(' ERROR: JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// @route   POST /auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    console.log('Registration attempt:', { name, email, passwordLength: password?.length });

    // Simple validation
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ 
        message: 'Name must be at least 3 characters long' 
      });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      console.log('User already exists:', email);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      name,
      email: email.toLowerCase(),
      password
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    console.log(`New user registered: ${email}`);

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(user.email, otp);
      res.status(201).json({
        message: 'User registered successfully. Please check your email for verification code.',
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(201).json({
        message: 'User registered successfully. However, there was an issue sending the verification email. Please try logging in to resend.',
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    }
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message 
    });
  }
});

// @route   POST /auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log(' Login attempt:', { email });

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Please provide email and password' 
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(' User not found:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Invalid password for user:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log(`User credentials verified: ${email}`);

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(user.email, otp);
      res.json({
        message: 'Credentials verified. Please check your email for the verification code.',
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({
        message: 'Credentials verified, but there was an issue sending the verification email. Please try again.',
      });
    }
  } catch (err) {
    console.error(' Login error:', err.message);
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message 
    });
  }
});

// @route   GET /auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(' Get user error:', err.message);
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message 
    });
  }
});

// @route   POST /auth/verify-otp
// @desc    Verify OTP and authenticate user
// @access  Public
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    console.log('OTP verification attempt:', { email });

    // Validate input
    if (!email || !otp) {
      return res.status(400).json({
        message: 'Please provide email and OTP'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Check if OTP matches and hasn't expired
    if (user.otp !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Clear OTP and mark as verified
    user.otp = undefined;
    user.otpExpires = undefined;
    user.isVerified = true;
    await user.save();

    console.log(`User verified: ${email}`);

    // Create and return JWT
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) {
          console.error(' JWT signing error:', err);
          throw err;
        }
        res.json({
          message: 'OTP verified successfully. Login successful.',
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            isVerified: user.isVerified
          }
        });
      }
    );
  } catch (err) {
    console.error('OTP verification error:', err.message);
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

// @route   POST /auth/resend-otp
// @desc    Resend OTP
// @access  Public
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  try {
    console.log('OTP resend attempt:', { email });

    // Validate input
    if (!email) {
      return res.status(400).json({
        message: 'Please provide email'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Check if OTP was recently sent (rate limiting: 1 per minute)
    if (user.otpExpires && user.otpExpires > new Date(Date.now() + 9 * 60 * 1000)) {
      return res.status(429).json({
        message: 'Please wait before requesting a new OTP'
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send OTP email
    try {
      await sendOTPEmail(user.email, otp);
      res.json({
        message: 'OTP sent successfully. Please check your email.'
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      res.status(500).json({
        message: 'There was an issue sending the verification email. Please try again later.',
      });
    }
  } catch (err) {
    console.error('OTP resend error:', err.message);
    res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});

module.exports = router;
