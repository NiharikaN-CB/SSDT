const mongoose = require('mongoose');
const User = require('./backend/models/User');
require('dotenv').config({ path: 'c:/Users/yashr/Desktop/SSDT/.env' });

const connectDB = async () => {
  try {
    await mongoose.connect(String(process.env.MONGO_URI), {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4,
      serverSelectionTimeoutMS: 30000, // 30 seconds


      socketTimeoutMS: 60000, // 60 seconds
      bufferCommands: false,
      maxPoolSize: 10,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (err) {

    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

const upgradeUserToPro = async (email) => {
  try {
    await connectDB();

    console.log(`🔍 Searching for user with email: ${email}`);
    const user = await User.findOne({ email }).maxTimeMS(30000); // 30 second timeout

    if (!user) {
      console.log(`❌ User with email ${email} not found. Creating new pro user.`);
      const newUser = new User({
        name: 'Unknown',
        email: email,
        password: 'temp_password', // This should be changed later
        accountType: 'pro',
        isVerified: true
      });
      await newUser.save();
      console.log(`✅ New pro user created for ${email}.`);
      return;
    }

    console.log(`📋 Current account type: ${user.accountType}`);
    user.accountType = 'pro';
    await user.save();

    console.log(`✅ User ${email} has been upgraded to pro.`);
  } catch (err) {
    console.error('❌ Error upgrading user:', err.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed.');
  }
};

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.log('❌ Please provide an email address as a command line argument.');
  console.log('Usage: node upgradeUserByEmail.js <email>');
  process.exit(1);
}

upgradeUserToPro(email);
