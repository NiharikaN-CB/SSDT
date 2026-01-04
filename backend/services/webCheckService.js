const axios = require('axios');

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
            timeout: 60000 // 60 second timeout for heavy scans
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

module.exports = {
    runScan,
    getAvailableScans,
    checkHealth,
    ALLOWED_SCANS
};
