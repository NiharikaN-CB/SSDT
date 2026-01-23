/**
 * Scheduled cleanup job for scan data
 * Runs periodically to clean up:
 * - Failed/stopped scans that weren't cleaned up immediately
 * - Orphaned GridFS files
 * - Orphaned ZapAlert documents
 */

const cleanupService = require('../services/cleanupService');
const ScanResult = require('../models/ScanResult');

// Cleanup interval: 1 hour (in milliseconds)
const CLEANUP_INTERVAL = 60 * 60 * 1000;

// Track if cleanup is already running to prevent overlap
let isCleanupRunning = false;
let cleanupIntervalId = null;

/**
 * Run the cleanup tasks
 */
async function runCleanup() {
    if (isCleanupRunning) {
        console.log('[CleanupJob] Cleanup already in progress, skipping...');
        return;
    }

    isCleanupRunning = true;
    console.log('[CleanupJob] Starting scheduled cleanup...');
    const startTime = Date.now();

    try {
        // 1. Clean up failed/stopped scans
        const failedScans = await ScanResult.find({
            status: { $in: ['failed', 'stopped'] }
        }, { analysisId: 1, userId: 1 }).lean();

        console.log(`[CleanupJob] Found ${failedScans.length} failed/stopped scans to clean up`);

        for (const scan of failedScans) {
            try {
                await cleanupService.cleanupFailedScan(scan.analysisId, scan.userId);
            } catch (err) {
                console.error(`[CleanupJob] Failed to cleanup scan ${scan.analysisId}:`, err.message);
            }
        }

        // 2. Clean up orphaned GridFS files (files older than 7 days without parent scan)
        await cleanupService.cleanupOrphanedGridFSFiles();

        // 3. Clean up orphaned ZapAlert documents
        await cleanupService.cleanupOrphanedZapAlerts();

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[CleanupJob] Cleanup completed in ${duration}s`);

    } catch (error) {
        console.error('[CleanupJob] Cleanup job error:', error.message);
    } finally {
        isCleanupRunning = false;
    }
}

/**
 * Start the cleanup job scheduler
 */
function startCleanupJob() {
    console.log(`[CleanupJob] Starting cleanup scheduler (interval: ${CLEANUP_INTERVAL / 1000 / 60} minutes)`);

    // Run immediately on startup (after a short delay to allow DB connection)
    setTimeout(() => {
        console.log('[CleanupJob] Running initial cleanup...');
        runCleanup();
    }, 10000); // 10 second delay

    // Schedule periodic cleanup
    cleanupIntervalId = setInterval(runCleanup, CLEANUP_INTERVAL);

    console.log('[CleanupJob] Cleanup job scheduled');
}

/**
 * Stop the cleanup job scheduler
 */
function stopCleanupJob() {
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
        console.log('[CleanupJob] Cleanup job stopped');
    }
}

module.exports = {
    startCleanupJob,
    stopCleanupJob,
    runCleanup
};
