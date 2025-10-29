require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./db');
const { apiLimiter, authLimiter, scanLimiter } = require('./middleware/rateLimiter');

// Validate required environment variables
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'VT_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\n💡 Create a .env file based on .env.example');
  process.exit(1);
}

const app = express();

// Connect to MongoDB
connectDB();

// Trust proxy - important for rate limiting behind reverse proxies
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || ['http://localhost:3000', 'https://*.ngrok.io', 'https://*.ngrok-free.app', 'https://*.ngrok-free.dev' ],
  credentials: true
}));
app.use(express.json({ extended: false, limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Apply rate limiters to routes
app.use('/auth', authLimiter, require('./routes/auth'));
app.use('/api/vt', apiLimiter, scanLimiter, require('./routes/virustotalRoutes'));
app.use('/api/translate', apiLimiter, require('./routes/translateRoutes'));
app.use('/api/profile', apiLimiter, require('./routes/profile'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Catch all handler: send back React's index.html file for any non-API routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/auth/') && req.path !== '/health') {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  } else {
    next();
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('\n=================================');
  console.log('🚀 Server started successfully!');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('=================================\n');
});