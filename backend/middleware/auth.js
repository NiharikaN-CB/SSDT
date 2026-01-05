// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from header
  const token = req.header('x-auth-token');

  // Check if no token
  if (!token) {
    console.log('⚠️ Auth: No token provided for', req.path);
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    console.log('✅ Auth: Token verified for user', decoded.user.id, 'on', req.path);
    next();
  } catch (err) {
    console.log('❌ Auth: Invalid token for', req.path, '-', err.message);
    res.status(401).json({ message: 'Token is not valid', error: err.message });
  }
};
