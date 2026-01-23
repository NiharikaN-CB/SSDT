const mongoose = require('mongoose');
require('dotenv').config();

const cleanupService = require('./services/cleanupService');
const ScanResult = require('./models/ScanResult');

async function clearStuckScans() {
    try {
        console.log('🔌 Connecting to MongoDB Atlas...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const args = process.argv.slice(2);
        const command = args[0] || 'stuck';

        switch (command) {
            case 'stuck':
                // Clear stuck scans (original behavior)
                await clearStuckFields();
                break;

            case 'failed':
                // Delete all failed scans completely
                await deleteFailedScans();
                break;

            case 'all':
                // Delete ALL scans and associated data (use with caution!)
                console.log('⚠️  WARNING: Deleting ALL scans and associated data...');
                const result = await cleanupService.fullCleanup();
                console.log('Result:', result);
                break;

            case 'orphans':
                // Clean up orphaned GridFS files and ZapAlerts
                await cleanupService.cleanupOrphanedGridFSFiles();
                await cleanupService.cleanupOrphanedZapAlerts();
                break;

            case 'scan':
                // Delete a specific scan by analysisId
                const analysisId = args[1];
                if (!analysisId) {
                    console.error('❌ Please provide an analysisId: node clear-stuck-scans.js scan <analysisId>');
                    process.exit(1);
                }
                const scanResult = await cleanupService.cleanupFailedScan(analysisId);
                console.log('Result:', scanResult);
                break;

            default:
                console.log(`
Usage: node clear-stuck-scans.js [command]

Commands:
  stuck    - Clear stuck WebCheck/ZAP scan fields (default)
  failed   - Delete all failed scans completely (including GridFS/ZapAlerts)
  all      - Delete ALL scans and associated data (⚠️ DESTRUCTIVE)
  orphans  - Clean up orphaned GridFS files and ZapAlerts
  scan <id> - Delete a specific scan by analysisId

Examples:
  node clear-stuck-scans.js stuck
  node clear-stuck-scans.js failed
  node clear-stuck-scans.js scan u-abc123-def456
                `);
        }

        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

async function clearStuckFields() {
    // Clear all stuck WebCheck scans
    const webCheckResult = await mongoose.connection.db.collection('scanresults').updateMany(
        { 'webCheckResult.status': 'running' },
        { $unset: { webCheckResult: '' } }
    );
    console.log(`✅ Cleared ${webCheckResult.modifiedCount} stuck WebCheck scan(s)`);

    // Clear any stuck ZAP scans
    const zapResult = await mongoose.connection.db.collection('scanresults').updateMany(
        { 'zapResult.status': 'running' },
        { $unset: { zapResult: '' } }
    );
    console.log(`✅ Cleared ${zapResult.modifiedCount} stuck ZAP scan(s)`);
}

async function deleteFailedScans() {
    // Find all failed scans
    const failedScans = await ScanResult.find({
        status: { $in: ['failed', 'stopped'] }
    }, { analysisId: 1 }).lean();

    console.log(`Found ${failedScans.length} failed/stopped scans to delete`);

    for (const scan of failedScans) {
        await cleanupService.cleanupFailedScan(scan.analysisId);
    }

    console.log(`✅ Deleted ${failedScans.length} failed scan(s) with all associated data`);
}

clearStuckScans();
