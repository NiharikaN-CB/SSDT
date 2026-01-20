const mongoose = require('mongoose');
require('dotenv').config();

async function clearStuckScans() {
    try {
        console.log('🔌 Connecting to MongoDB Atlas...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Clear all stuck WebCheck scans
        const result = await mongoose.connection.db.collection('scanresults').updateMany(
            { 'webCheckResult.status': 'running' },
            { $unset: { webCheckResult: '' } }
        );

        console.log(`✅ Cleared ${result.modifiedCount} stuck WebCheck scan(s)`);

        // Also clear any stuck ZAP scans (just in case)
        const zapResult = await mongoose.connection.db.collection('scanresults').updateMany(
            { 'zapResult.status': 'running' },
            { $unset: { zapResult: '' } }
        );

        console.log(`✅ Cleared ${zapResult.modifiedCount} stuck ZAP scan(s)`);

        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

clearStuckScans();
