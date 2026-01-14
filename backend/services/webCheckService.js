const axios = require('axios');
const ScanResult = require('../models/ScanResult');

// Internal Docker URL or localhost for native development
const WEBCHECK_BASE_URL = process.env.WEBCHECK_URI || 'http://localhost:3002';

// All available scan types
const ALLOWED_SCANS = [
    'ssl', 'dns', 'headers', 'cookies', 'firewall', 'ports',
    'screenshot', 'tech-stack', 'hsts', 'security-txt', 'block-lists',
    'social-tags', 'linked-pages', 'robots-txt', 'sitemap', 'status',
    'redirects', 'mail-config', 'trace-route', 'http-security', 'get-ip',
    'dns-server', 'dnssec', 'txt-records', 'carbon', 'archives',
    'legacy-rank', 'whois', 'tls', 'quality'
];

// Track active WebCheck scans to prevent duplicates
const activeWebCheckScans = new Map();

/**
 * Run a WebCheck scan
 * @param {string} scanType - Type of scan (e.g., 'ssl', 'dns')
 * @param {string} url - Target URL to scan
 * @returns {Promise<object>} Scan results
 */
const runScan = async (scanType, url) => {
    if (!ALLOWED_SCANS.includes(scanType)) {
        throw new Error(`Invalid scan type: ${scanType}. Allowed: ${ALLOWED_SCANS.join(', ')}`);
    }

    try {
        console.log(`[WebCheck] Running ${scanType} scan for: ${url}`);

        const response = await axios.get(`${WEBCHECK_BASE_URL}/api/${scanType}`, {
            params: { url },
            timeout: 120000 // 120 second timeout for heavy scans
        });

        return response.data;
    } catch (error) {
        console.error(`[WebCheck] ${scanType} scan error:`, error.message);

        if (error.code === 'ECONNREFUSED') {
            throw new Error('WebCheck service is not available. Ensure the container is running.');
        }

        throw new Error(`Failed to run ${scanType} scan: ${error.message}`);
    }
};

/**
 * Get list of available scan types
 * @returns {string[]} Array of scan type names
 */
const getAvailableScans = () => ALLOWED_SCANS;

/**
 * Check if WebCheck service is healthy
 * @returns {Promise<boolean>}
 */
const checkHealth = async () => {
    try {
        const response = await axios.get(`${WEBCHECK_BASE_URL}/health`, { timeout: 5000 });
        return response.data.status === 'healthy';
    } catch (error) {
        console.error('[WebCheck] Health check failed:', error.message);
        return false;
    }
};

/**
 * Run ALL WebCheck scans in parallel for a URL
 * @param {string} url - Target URL to scan
 * @returns {Promise<object>} Object with all scan results keyed by scan type
 */
const runAllScans = async (url) => {
    console.log(`[WebCheck] Running ALL ${ALLOWED_SCANS.length} scans for: ${url}`);

    const results = await Promise.allSettled(
        ALLOWED_SCANS.map(async (scanType) => {
            try {
                const data = await runScan(scanType, url);
                return { type: scanType, success: true, data };
            } catch (error) {
                return { type: scanType, success: false, error: error.message };
            }
        })
    );

    // Collect results into an object keyed by scan type
    const scanResults = {};
    results.forEach((result, index) => {
        const type = ALLOWED_SCANS[index];
        if (result.status === 'fulfilled' && result.value.success) {
            scanResults[type] = result.value.data;
        } else {
            scanResults[type] = {
                error: result.reason?.message || result.value?.error || 'Scan failed'
            };
        }
    });

    console.log(`[WebCheck] Completed ${Object.keys(scanResults).length} scans`);
    return scanResults;
};

/**
 * Start WebCheck scans asynchronously (runs in background, saves to MongoDB)
 * Similar pattern to ZAP async scanning
 * @param {string} url - Target URL to scan
 * @param {string} analysisId - The scan's analysis ID for database lookup
 * @param {string} userId - User ID for ownership verification
 * @returns {Promise<object>} Initial status with pending state
 */
const startAsyncWebCheckScan = async (url, analysisId, userId) => {
    console.log(`[WebCheck] 🚀 Starting async WebCheck scan for: ${url}`);
    console.log(`[WebCheck] Analysis ID: ${analysisId}`);

    // Check if there's already an active scan for this analysis
    if (activeWebCheckScans.has(analysisId)) {
        console.log(`[WebCheck] ⏭️ Scan already in progress for ${analysisId}`);
        return {
            status: 'running',
            message: 'WebCheck scan already in progress',
            analysisId
        };
    }

    // Mark scan as active
    activeWebCheckScans.set(analysisId, {
        url,
        userId,
        startTime: Date.now(),
        completed: 0,
        total: ALLOWED_SCANS.length
    });

    // Initialize WebCheck result in database with pending status
    try {
        await ScanResult.findOneAndUpdate(
            { analysisId, userId },
            {
                webCheckResult: {
                    status: 'running',
                    progress: 0,
                    completedScans: 0,
                    totalScans: ALLOWED_SCANS.length,
                    message: 'Starting WebCheck scans...',
                    startedAt: new Date()
                }
            }
        );
    } catch (dbError) {
        console.error('[WebCheck] Failed to initialize DB record:', dbError.message);
    }

    // Run scans asynchronously (don't await - runs in background)
    runWebCheckInBackground(url, analysisId, userId).catch(err => {
        console.error(`[WebCheck] Background scan error for ${analysisId}:`, err.message);
    });

    // Return immediately with pending status
    return {
        status: 'running',
        message: 'WebCheck scan started in background',
        progress: 0,
        totalScans: ALLOWED_SCANS.length,
        analysisId
    };
};

/**
 * Run WebCheck scans in background and update MongoDB progressively
 * @param {string} url - Target URL
 * @param {string} analysisId - Analysis ID for DB updates
 * @param {string} userId - User ID for ownership
 */
const runWebCheckInBackground = async (url, analysisId, userId) => {
    console.log(`[WebCheck] 🔄 Background scan started for: ${url}`);
    const startTime = Date.now();

    const results = {};
    let completedCount = 0;
    let hasErrors = false;

    // Run scans in batches to avoid overwhelming the WebCheck service
    // Process 5 scans at a time
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < ALLOWED_SCANS.length; i += BATCH_SIZE) {
        batches.push(ALLOWED_SCANS.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
        // Check if scan was cancelled
        if (!activeWebCheckScans.has(analysisId)) {
            console.log(`[WebCheck] ⏹️ Scan was cancelled for ${analysisId}`);
            return;
        }

        // Run batch of scans in parallel
        const batchPromises = batch.map(async (scanType) => {
            try {
                const data = await runScan(scanType, url);
                return { type: scanType, success: true, data };
            } catch (error) {
                return { type: scanType, success: false, error: error.message };
            }
        });

        const batchResults = await Promise.allSettled(batchPromises);

        // Process batch results
        for (const result of batchResults) {
            completedCount++;
            const scanResult = result.status === 'fulfilled' ? result.value : {
                type: 'unknown',
                success: false,
                error: result.reason?.message || 'Scan failed'
            };

            if (scanResult.success) {
                results[scanResult.type] = scanResult.data;
            } else {
                results[scanResult.type] = { error: scanResult.error };
                hasErrors = true;
            }
        }

        // Update progress in database after each batch
        const progress = Math.round((completedCount / ALLOWED_SCANS.length) * 100);
        try {
            await ScanResult.findOneAndUpdate(
                { analysisId, userId },
                {
                    webCheckResult: {
                        status: 'running',
                        progress,
                        completedScans: completedCount,
                        totalScans: ALLOWED_SCANS.length,
                        message: `Completed ${completedCount}/${ALLOWED_SCANS.length} scans...`,
                        partialResults: results,
                        startedAt: new Date(startTime)
                    }
                }
            );
            console.log(`[WebCheck] 📊 Progress: ${progress}% (${completedCount}/${ALLOWED_SCANS.length})`);
        } catch (dbError) {
            console.error('[WebCheck] Failed to update progress:', dbError.message);
        }

        // Update active scan tracker
        const activeScan = activeWebCheckScans.get(analysisId);
        if (activeScan) {
            activeScan.completed = completedCount;
        }
    }

    // All scans complete - save final results
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[WebCheck] ✅ All scans complete for ${url} in ${duration}s`);

    // Save final results to database
    try {
        await ScanResult.findOneAndUpdate(
            { analysisId, userId },
            {
                webCheckResult: {
                    status: 'completed',
                    progress: 100,
                    completedScans: ALLOWED_SCANS.length,
                    totalScans: ALLOWED_SCANS.length,
                    message: 'WebCheck scan completed',
                    results,
                    hasErrors,
                    duration: parseFloat(duration),
                    completedAt: new Date()
                }
            }
        );
        console.log(`[WebCheck] 💾 Final results saved to database for ${analysisId}`);
    } catch (dbError) {
        console.error('[WebCheck] Failed to save final results:', dbError.message);
    }

    // Remove from active scans
    activeWebCheckScans.delete(analysisId);
};

/**
 * Stop an active WebCheck scan
 * @param {string} analysisId - The analysis ID to stop
 * @returns {boolean} Whether the scan was stopped
 */
const stopWebCheckScan = (analysisId) => {
    if (activeWebCheckScans.has(analysisId)) {
        console.log(`[WebCheck] 🛑 Stopping scan for ${analysisId}`);
        activeWebCheckScans.delete(analysisId);
        return true;
    }
    return false;
};

/**
 * Check if a WebCheck scan is active
 * @param {string} analysisId - The analysis ID to check
 * @returns {object|null} Active scan info or null
 */
const getActiveScanStatus = (analysisId) => {
    return activeWebCheckScans.get(analysisId) || null;
};

module.exports = {
    runScan,
    runAllScans,
    getAvailableScans,
    checkHealth,
    startAsyncWebCheckScan,
    stopWebCheckScan,
    getActiveScanStatus,
    ALLOWED_SCANS
};
