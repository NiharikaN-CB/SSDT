const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Validate JWT_SECRET
if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR: JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// @route   POST /auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log('📝 Registration attempt:', { username, passwordLength: password?.length });

    // Simple validation
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ 
        message: 'Username must be at least 3 characters long' 
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    let user = await User.findOne({ username: username.toLowerCase() });
    if (user) {
      console.log('❌ User already exists:', username);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      username: username.toLowerCase(),
      password
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    console.log(`✅ New user registered: ${username}`);

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
          console.error('❌ JWT signing error:', err);
          throw err;
        }
        res.status(201).json({
          message: 'User registered successfully',
          token,
          user: {
            id: user.id,
            username: user.username
          }
        });
      }
    );
  } catch (err) {
    console.error('❌ Registration error:', err.message);
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
  const { username, password } = req.body;

  try {
    console.log('🔐 Login attempt:', { username });

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Please provide username and password' 
      });
    }

    // Find user
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Invalid password for user:', username);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log(`✅ User logged in: ${username}`);

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
          console.error('❌ JWT signing error:', err);
          throw err;
        }
        res.json({
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            username: user.username
          }
        });
      }
    );
  } catch (err) {
    console.error('❌ Login error:', err.message);
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
    console.error('❌ Get user error:', err.message);
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message 
    });
  }
});

module.exports = router;