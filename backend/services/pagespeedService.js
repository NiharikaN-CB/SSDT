const axios = require('axios');

/**
 * Get all available PageSpeed API keys from environment variables
 * Supports PSI_API_KEY, PSI_API_KEY_2, PSI_API_KEY_3, etc.
 * @returns {Array<string>} - Array of API keys
 */
function getApiKeys() {
  const keys = [];

  // Get primary API key
  if (process.env.PSI_API_KEY) {
    keys.push(process.env.PSI_API_KEY);
  }

  // Get additional API keys (PSI_API_KEY_2, PSI_API_KEY_3, etc.)
  let i = 2;
  while (process.env[`PSI_API_KEY_${i}`]) {
    keys.push(process.env[`PSI_API_KEY_${i}`]);
    i++;
  }

  console.log(`📋 Found ${keys.length} PageSpeed API key(s) configured`);
  return keys;
}

/**
 * Get PageSpeed Insights report for a given URL with fallback support
 * @param {string} url - The URL to analyze
 * @returns {Promise<Object>} - PageSpeed Insights report data
 */
async function getPageSpeedReport(url) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    throw new Error('No PageSpeed API keys configured. Please set PSI_API_KEY in environment variables.');
  }

  let lastError = null;

  // Try each API key until one succeeds
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = i === 0 ? 'primary' : `fallback #${i}`;

    try {
      console.log(`🔑 Attempting PageSpeed API with ${keyLabel} key (${i + 1}/${apiKeys.length})...`);

      // PageSpeed Insights API endpoint
      const endpoint = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

      // Make request to PageSpeed Insights API
      const response = await axios.get(endpoint, {
        params: {
          url: url,
          key: apiKey,
          category: ['performance', 'accessibility', 'best-practices', 'seo'],
          strategy: 'desktop'
        },
        timeout: 30000 // 30 second timeout
      });

      console.log(`✅ Successfully fetched PageSpeed report using ${keyLabel} key`);
      return response.data;

    } catch (error) {
      lastError = error;
      console.error(`❌ ${keyLabel} key failed:`, error.message);

      if (error.response) {
        // Log detailed error information
        const status = error.response.status;
        const errorMsg = error.response.data?.error?.message || 'Unknown error';
        console.error(`   Status: ${status}, Message: ${errorMsg}`);

        // Check if it's a rate limit or quota error
        const isRateLimitError = status === 429 || errorMsg.includes('quota') || errorMsg.includes('rate limit');
        const isAuthError = status === 401 || status === 403;

        if (isAuthError) {
          console.warn(`⚠️  ${keyLabel} key has authentication issues, skipping to next key...`);
        } else if (isRateLimitError) {
          console.warn(`⚠️  ${keyLabel} key is rate limited or quota exceeded, trying next key...`);
        } else {
          console.warn(`⚠️  ${keyLabel} key encountered error, trying next key...`);
        }
      } else if (error.request) {
        console.error(`   No response received from PageSpeed API`);
      } else {
        console.error(`   Error: ${error.message}`);
      }

      // If this is the last key, throw the error
      if (i === apiKeys.length - 1) {
        console.error('❌ All PageSpeed API keys failed');
        break;
      }

      // Wait a bit before trying the next key (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // All API keys failed, throw the last error
  console.error('💥 All PageSpeed API keys exhausted');

  if (lastError?.response) {
    const status = lastError.response.status;
    const errorMsg = lastError.response.data?.error?.message || 'Unknown error';

    if (status === 429 || errorMsg.includes('quota')) {
      throw new Error('All PageSpeed API keys are rate limited or quota exceeded. Please try again later or add more API keys.');
    } else if (status === 401 || status === 403) {
      throw new Error('PageSpeed API authentication failed for all configured keys. Please check your API keys.');
    } else {
      throw new Error(`PageSpeed API error: ${status} - ${errorMsg}`);
    }
  } else if (lastError?.request) {
    throw new Error('No response from PageSpeed API');
  } else {
    throw new Error(`PageSpeed service error: ${lastError?.message || 'Unknown error'}`);
  }
}

module.exports = {
  getPageSpeedReport
};
