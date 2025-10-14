const axios = require('axios');

const PAGESPEED_API_KEY = process.env.PAGESPEED_API_KEY;
const PAGESPEED_BASE_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

if (!PAGESPEED_API_KEY) {
  console.error('❌ ERROR: PAGESPEED_API_KEY is not set in environment variables');
  process.exit(1);
}

/**
 * Analyzes a URL with Google PageSpeed Insights.
 * @param {string} url The URL to analyze.
 * @param {string} strategy The strategy to use ('desktop' or 'mobile').
 * @returns {Promise<object>} The PageSpeed Insights API response.
 */
async function analyzeUrl(url, strategy = 'desktop') {
  if (!url) {
    throw new Error('URL is required');
  }

  try {
    const response = await axios.get(PAGESPEED_BASE_URL, {
      params: {
        url: url,
        key: PAGESPEED_API_KEY,
        strategy: strategy,
      },
    });
    return response.data;
  } catch (error) {
    console.error(`PageSpeed Insights API Error: ${error.message}`);
    if (error.response) {
      // API returned an error response
      const apiError = error.response.data.error;
      if (apiError && apiError.message) {
        throw new Error(`PageSpeed API Error: ${apiError.message}`);
      } else {
        throw new Error(`PageSpeed API Error: ${error.response.status} - ${error.response.statusText}`);
      }
    } else if (error.request) {
      // Network error
      throw new Error('Failed to fetch PageSpeed Insights data: Network error');
    } else {
      // Other error
      throw new Error('Failed to fetch PageSpeed Insights data: ' + error.message);
    }
  }
}

module.exports = {
  analyzeUrl,
};