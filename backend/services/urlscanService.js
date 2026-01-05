const axios = require('axios');
const Bottleneck = require('bottleneck');

const URLSCAN_API_KEY = process.env.URLSCAN_API_KEY;
const URLSCAN_BASE = 'https://urlscan.io/api/v1';

// Validate API key on startup
if (!URLSCAN_API_KEY) {
    console.warn('⚠️ WARNING: URLSCAN_API_KEY is not set. urlscan.io features will be disabled.');
}

// Rate limiter (Public API is often limited, e.g., 1 request every 2 seconds)
const limiter = new Bottleneck({
    minTime: 2000, // 2 seconds between requests to be safe
    maxConcurrent: 1
});

/**
 * Helper for POST requests
 */
async function urlscanPost(path, data) {
    try {
        const response = await limiter.schedule(() =>
            axios.post(`${URLSCAN_BASE}${path}`, data, {
                headers: {
                    'API-Key': URLSCAN_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            })
        );
        return response.data;
    } catch (error) {
        console.error(`urlscan POST Error (${path}):`, error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'urlscan API request failed');
    }
}

/**
 * Helper for GET requests
 */
async function urlscanGet(url) {
    try {
        const response = await limiter.schedule(() =>
            axios.get(url, {
                headers: {
                    'API-Key': URLSCAN_API_KEY
                },
                timeout: 30000
            })
        );
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null; // Scan not ready yet
        }
        console.error(`urlscan GET Error (${url}):`, error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'urlscan API request failed');
    }
}

/**
 * Submit a URL for scanning
 * @param {string} url - URL to scan
 * @param {string} visibility - 'public', 'unlisted', or 'private' (pro only)
 * @returns {Promise<object>} - Submission result with uuid
 */
async function submitUrlScan(url, visibility = 'unlisted') {
    if (!URLSCAN_API_KEY) throw new Error('urlscan API key not configured');

    console.log(`🔍 Submitting URL to urlscan.io: ${url}`);

    const payload = {
        url: url,
        visibility: visibility
    };

    const result = await urlscanPost('/scan/', payload);
    console.log(`✅ urlscan submission successful. UUID: ${result.uuid}`);

    return result;
}

/**
 * Fetch analysis result by UUID
 * @param {string} uuid - Scan UUID from submission
 * @returns {Promise<object|null>} - Result or null if not ready
 */
async function getUrlScanResult(uuid) {
    if (!uuid) throw new Error('Invalid scan UUID provided');

    const resultUrl = `${URLSCAN_BASE}/result/${uuid}/`;
    console.log(`📊 Fetching urlscan result: ${uuid}`);

    const result = await urlscanGet(resultUrl);

    if (result) {
        console.log(`✅ urlscan result retrieved.`);
    } else {
        console.log(`⏳ urlscan result not ready yet.`);
    }

    return result;
}

/**
 * Run complete urlscan flow - submit and wait for result
 * Used by combined scan to match other scanner patterns
 * @param {string} targetUrl - URL to scan
 * @param {number} maxWaitTime - Maximum wait time in ms (default: 90 seconds)
 * @returns {Promise<object>} - Scan results
 */
async function runUrlScan(targetUrl, maxWaitTime = 90000) {
    console.log(`🔍 [urlscan] Starting scan for: ${targetUrl}`);

    try {
        // Submit the URL
        const submission = await submitUrlScan(targetUrl, 'unlisted');
        const uuid = submission.uuid;

        // Poll for results
        const startTime = Date.now();
        const pollInterval = 5000; // 5 seconds between polls

        while (Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));

            const result = await getUrlScanResult(uuid);

            if (result) {
                console.log(`✅ [urlscan] Scan completed for: ${targetUrl}`);

                // Extract key metrics for easy access
                const verdicts = result.verdicts || {};
                const page = result.page || {};
                const lists = result.lists || {};

                return {
                    uuid: uuid,
                    url: targetUrl,
                    task: result.task,
                    page: {
                        url: page.url,
                        domain: page.domain,
                        ip: page.ip,
                        country: page.country,
                        server: page.server,
                        tlsIssuer: page.tlsIssuer,
                        tlsValidDays: page.tlsValidDays
                    },
                    verdicts: {
                        overall: verdicts.overall || {},
                        urlscan: verdicts.urlscan || {},
                        engines: verdicts.engines || {},
                        community: verdicts.community || {}
                    },
                    stats: {
                        uniqIPs: result.stats?.uniqIPs || 0,
                        uniqCountries: result.stats?.uniqCountries || 0,
                        dataLength: result.stats?.dataLength || 0,
                        requests: result.stats?.requests || 0
                    },
                    lists: {
                        ips: lists.ips || [],
                        countries: lists.countries || [],
                        urls: (lists.urls || []).slice(0, 20) // Limit to first 20 URLs
                    },
                    screenshot: result.task?.screenshotURL || null,
                    reportUrl: `https://urlscan.io/result/${uuid}/`
                };
            }

            console.log(`⏳ [urlscan] Waiting for result... (${Math.round((Date.now() - startTime) / 1000)}s)`);
        }

        // Timeout - return partial result
        console.warn(`⚠️ [urlscan] Scan timed out after ${maxWaitTime / 1000}s`);
        return {
            uuid: uuid,
            url: targetUrl,
            status: 'timeout',
            message: 'Scan submitted but result not ready in time',
            reportUrl: `https://urlscan.io/result/${uuid}/`
        };

    } catch (error) {
        console.error('[urlscan] Service Error:', error.message);
        throw error;
    }
}

module.exports = {
    submitUrlScan,
    getUrlScanResult,
    runUrlScan  // For combined scan integration
};
