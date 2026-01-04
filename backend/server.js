require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const { apiLimiter, authLimiter, scanLimiter } = require('./middleware/rateLimiter');

// 👇 IMPORT ZAP ROUTES
const zapRoutes = require('./routes/zapRoutes');
const webCheckRoutes = require('./routes/webCheckRoutes');

// Validate required environment variables
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'VT_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  process.exit(1);
}

const app = express();
connectDB();

app.set('trust proxy', 1);

app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3003'
  ],
  credentials: true
}));
app.use(express.json({ extended: false, limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

app.use('/auth', authLimiter, require('./routes/auth'));
app.use('/api/vt', apiLimiter, scanLimiter, require('./routes/virustotalRoutes'));
app.use('/api/pagespeed', apiLimiter, require('./routes/pageSpeedRoutes'));

// 👇 REGISTER ZAP ROUTE
app.use('/api/zap', apiLimiter, scanLimiter, zapRoutes);

// 👇 REGISTER WEBCHECK ROUTES
app.use('/api/webcheck', apiLimiter, scanLimiter, webCheckRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.path}` });
});

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
  console.log('=================================\n');
});