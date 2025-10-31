const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

// Validate environment variables
if (!process.env.MONGO_URI) {
  console.error('❌ ERROR: MONGO_URI is not set in .env file');
  process.exit(1);
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Define User schema directly in this script to avoid model initialization issues
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  otp: String,
  otpExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  accountType: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free'
  },
  bio: { type: String, default: '', maxlength: 500 },
  totalScans: { type: Number, default: 0 },
  proExpiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now },
  passwordResetAt: { type: Date, default: null }
});

const User = mongoose.model('User', UserSchema);

/**
 * Main function to manage user account type
 */
async function manageUserAccount(email) {
  let connection = null;
  
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Invalid email format');
      rl.close();
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    
    // Connect to MongoDB with explicit settings
    connection = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ MongoDB connected successfully');
    
    // Wait a moment for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`🔍 Searching for user: ${email}`);
    
    // Find user with timeout
    const user = await User.findOne({ email: email.toLowerCase() })
      .maxTimeMS(10000)
      .exec();

    if (!user) {
      console.log(`❌ User not found: ${email}`);
      console.log('💡 Make sure the user has registered first');
      rl.close();
      process.exit(1);
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Found user: ${user.name}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`💎 Current Account Type: ${user.accountType.toUpperCase()}`);
    if (user.accountType === 'pro' && user.proExpiresAt) {
      console.log(`📅 PRO expires: ${user.proExpiresAt.toLocaleDateString()}`);
    }
    console.log('═══════════════════════════════════════');
    console.log('');

    // Ask user what action to take
    console.log('What would you like to do?');
    console.log('  1️⃣  - Upgrade to PRO');
    console.log('  2️⃣  - Downgrade to FREE');
    console.log('  3️⃣  - Cancel (no changes)');
    console.log('');

    const choice = await question('Enter your choice (1, 2, or 3): ');

    if (choice === '1') {
      // Upgrade to PRO
      if (user.accountType === 'pro') {
        console.log('');
        console.log('ℹ️  User is already a PRO user');
        
        const extendChoice = await question('Do you want to extend PRO by 1 year? (yes/no): ');
        
        if (extendChoice.toLowerCase() === 'yes' || extendChoice.toLowerCase() === 'y') {
          const currentExpiry = user.proExpiresAt || new Date();
          const newExpiry = new Date(currentExpiry.getTime() + 365 * 24 * 60 * 60 * 1000);
          
          user.proExpiresAt = newExpiry;
          await user.save();
          
          console.log('');
          console.log('✅ SUCCESS! PRO subscription extended');
          console.log(`📅 New expiry date: ${newExpiry.toLocaleDateString()}`);
        } else {
          console.log('');
          console.log('⏭️  No changes made');
        }
      } else {
        console.log('');
        console.log('⬆️  Upgrading user to PRO...');
        
        user.accountType = 'pro';
        user.proExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
        
        await user.save();

        console.log('');
        console.log('✅ SUCCESS! User upgraded to PRO');
        console.log(`👤 Name: ${user.name}`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`💎 Account Type: PRO`);
        console.log(`📅 PRO expires: ${user.proExpiresAt.toLocaleDateString()}`);
      }
    } else if (choice === '2') {
      // Downgrade to FREE
      if (user.accountType === 'free') {
        console.log('');
        console.log('ℹ️  User is already on FREE plan');
      } else {
        const confirmDowngrade = await question('⚠️  Are you sure you want to downgrade to FREE? (yes/no): ');
        
        if (confirmDowngrade.toLowerCase() === 'yes' || confirmDowngrade.toLowerCase() === 'y') {
          console.log('');
          console.log('⬇️  Downgrading user to FREE...');
          
          user.accountType = 'free';
          user.proExpiresAt = null;
          
          await user.save();

          console.log('');
          console.log('✅ SUCCESS! User downgraded to FREE');
          console.log(`👤 Name: ${user.name}`);
          console.log(`📧 Email: ${user.email}`);
          console.log(`💎 Account Type: FREE`);
        } else {
          console.log('');
          console.log('⏭️  Downgrade cancelled - no changes made');
        }
      }
    } else if (choice === '3') {
      console.log('');
      console.log('⏭️  Operation cancelled - no changes made');
    } else {
      console.log('');
      console.log('❌ Invalid choice - no changes made');
    }

    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    
    if (error.name === 'MongooseServerSelectionError') {
      console.error('💡 Could not connect to MongoDB. Check:');
      console.error('   1. MongoDB is running');
      console.error('   2. MONGO_URI in .env is correct');
      console.error('   3. Network/firewall settings');
    } else if (error.name === 'ValidationError') {
      console.error('💡 Validation error:', error.message);
    }
    
    rl.close();
    process.exit(1);
  } finally {
    // Clean up connection
    rl.close();
    if (connection) {
      try {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
      } catch (closeError) {
        console.error('⚠️  Error closing connection:', closeError.message);
      }
    }
  }
}

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.log('❌ Error: Email address is required');
  console.log('');
  console.log('Usage:');
  console.log('  node upgradeUserToPro.js <email>');
  console.log('');
  console.log('Example:');
  console.log('  node upgradeUserToPro.js user@example.com');
  console.log('');
  process.exit(1);
}

// Run the account management
manageUserAccount(email);