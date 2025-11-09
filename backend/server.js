require('dotenv').config();
const express = require('express');
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
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ extended: false, limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

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

  // Log Gemini API key configuration
  const geminiKeys = [];
  if (process.env.GEMINI_API_KEY) geminiKeys.push('primary');
  let i = 2;
  while (process.env[`GEMINI_API_KEY_${i}`]) {
    geminiKeys.push(`fallback #${i-1}`);
    i++;
  }
  console.log(`🤖 Gemini AI: ${geminiKeys.length} API key(s) configured [${geminiKeys.join(', ')}]`);

  // Log PageSpeed API key configuration
  const psiKeys = [];
  if (process.env.PSI_API_KEY) psiKeys.push('primary');
  let j = 2;
  while (process.env[`PSI_API_KEY_${j}`]) {
    psiKeys.push(`fallback #${j-1}`);
    j++;
  }
  console.log(`⚡ PageSpeed: ${psiKeys.length} API key(s) configured [${psiKeys.join(', ')}]`);

  console.log('=================================\n');
});