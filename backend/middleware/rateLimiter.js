const rateLimit = require('express-rate-limit');

// General API rate limiter (100 requests per 15 minutes)
// Now uses user-based limiting for authenticated routes, falls back to IP for unauthenticated
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each user/IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use user ID if authenticated, otherwise fall back to IP
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    const identifier = req.user?.id ? `User ${req.user.id}` : `IP ${req.ip}`;
    console.log(`⚠️  Rate limit exceeded for ${identifier} on ${req.path}`);
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Strict rate limiter for authentication endpoints (20 requests per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login/register requests per windowMs
  message: {
    message: 'Too many authentication attempts from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful requests too
  handler: (req, res) => {
    console.log(`🚨 Auth rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      message: 'Too many authentication attempts. Please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Moderate rate limiter for file/URL scanning (20 requests per 10 minutes)
// Uses user-based limiting for better per-user tracking
const scanLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Limit each user to 20 scan requests per windowMs
  message: {
    error: 'Too many scan requests, please try again later.',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID for authenticated requests (scan routes are protected)
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    const identifier = req.user?.id ? `User ${req.user.id}` : `IP ${req.ip}`;
    console.log(`⚠️  Scan rate limit exceeded for ${identifier} on ${req.path}`);
    res.status(429).json({
      error: 'Too many scan requests. Please slow down and try again later.',
      retryAfter: '10 minutes'
    });
  }
});

// Strict rate limiter for combined scans (1 scan per minute per user)
// This respects external API limits: Mozilla Observatory (1/min), VirusTotal, PageSpeed, Gemini
const combinedScanLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1, // Limit each user to 1 combined scan per minute
  message: {
    error: 'Please wait before starting another scan.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID for authenticated requests
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    const identifier = req.user?.id ? `User ${req.user.id}` : `IP ${req.ip}`;
    console.log(`⚠️  Combined scan rate limit exceeded for ${identifier} on ${req.path}`);
    res.status(429).json({
      error: 'You can only perform one combined scan per minute. This helps us respect API limits from VirusTotal, Mozilla Observatory, PageSpeed, and Gemini.',
      retryAfter: '1 minute',
      retryAfterSeconds: 60
    });
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  scanLimiter,
  combinedScanLimiter
};
