const axios = require('axios');

/**
 * Get PageSpeed Insights report for a given URL
 * @param {string} url - The URL to analyze
 * @returns {Promise<Object>} - PageSpeed Insights report data
 */
async function getPageSpeedReport(url) {
  try {
    const apiKey = process.env.PSI_API_KEY;

    if (!apiKey) {
      throw new Error('PSI_API_KEY is not configured in environment variables');
    }

    // PageSpeed Insights API endpoint
    const endpoint = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

    // Make request to PageSpeed Insights API
    const response = await axios.get(endpoint, {
      params: {
        url: url,
        key: apiKey,
        category: ['performance', 'accessibility', 'best-practices', 'seo'],
        strategy: 'desktop'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching PageSpeed report:', error.message);

    if (error.response) {
      // API returned an error response
      throw new Error(`PageSpeed API error: ${error.response.status} - ${error.response.data.error?.message || 'Unknown error'}`);
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('No response from PageSpeed API');
    } else {
      // Something else went wrong
      throw new Error(`PageSpeed service error: ${error.message}`);
    }
  }
}

module.exports = {
  getPageSpeedReport
};
