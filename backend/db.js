const mongoose = require('mongoose');
require('dotenv').config();

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000; // 5 seconds

const connectDB = async (retryCount = 0) => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    console.log('✅ MongoDB connected successfully');

    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
      setTimeout(() => connectDB(0), RETRY_DELAY_MS);
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

  } catch (err) {
    console.error(`❌ MongoDB connection error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, err.message);

    if (retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1;
      const delay = RETRY_DELAY_MS * nextRetry; // Exponential backoff
      console.log(`🔄 Retrying connection in ${delay / 1000} seconds...`);

      setTimeout(() => connectDB(nextRetry), delay);
    } else {
      console.error('💥 Max retries reached. Could not connect to MongoDB.');
      console.error('Please check:');
      console.error('  1. MongoDB is running');
      console.error('  2. MONGO_URI in .env is correct');
      console.error('  3. Network connectivity');
      process.exit(1);
    }
  }
};

module.exports = connectDB;