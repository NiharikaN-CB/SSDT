import axios from 'axios';
import middleware from './_common/middleware.js';

// Use the Mozilla Observatory API (which is working) for TLS analysis
// The old TLS Observatory (tls-observatory.services.mozilla.com) is deprecated
const OBSERVATORY_ENDPOINTS = [
  'https://observatory-api.mdn.mozilla.net/api/v2',
  'https://http-observatory.security.mozilla.org/api/v1'
];

const tlsHandler = async (url) => {
  try {
    const domain = new URL(url).hostname;
    let lastError = null;

    // Try each endpoint until one succeeds
    for (let i = 0; i < OBSERVATORY_ENDPOINTS.length; i++) {
      const baseUrl = OBSERVATORY_ENDPOINTS[i];
      const isV2 = baseUrl.includes('mdn.mozilla.net');

      try {
        console.log(`[TLS] Trying Observatory endpoint ${i + 1}/${OBSERVATORY_ENDPOINTS.length}`);

        // For v2 API (MDN)
        if (isV2) {
          const scanResponse = await axios.post(
            `${baseUrl}/scan?host=${encodeURIComponent(domain)}`,
            {},
            { timeout: 60000 }
          );

          // Get test details if available
          let testResults = null;
          try {
            const testsResponse = await axios.get(
              `${baseUrl}/tests?host=${encodeURIComponent(domain)}`,
              { timeout: 30000 }
            );
            testResults = testsResponse.data;
          } catch (e) {
            // Tests might not be ready yet
          }

          return {
            scan: scanResponse.data,
            tests: testResults,
            tlsInfo: {
              grade: scanResponse.data.grade || 'N/A',
              score: scanResponse.data.score || 0,
              endTime: scanResponse.data.end_time,
              host: domain,
              statusCode: scanResponse.data.status_code
            }
          };
        } else {
          // For v1 API (legacy)
          const analyzeResponse = await axios.post(
            `${baseUrl}/analyze?host=${encodeURIComponent(domain)}`,
            {},
            { timeout: 60000 }
          );

          return {
            scan: analyzeResponse.data,
            tlsInfo: {
              grade: analyzeResponse.data.grade || 'N/A',
              score: analyzeResponse.data.score || 0,
              scanId: analyzeResponse.data.scan_id,
              host: domain
            }
          };
        }
      } catch (error) {
        lastError = error;
        console.warn(`[TLS] Endpoint ${i + 1} failed:`, error.message);
        continue;
      }
    }

    // All endpoints failed
    throw lastError || new Error('All Observatory endpoints failed');

  } catch (error) {
    console.error('[TLS] Error:', error.message);
    return {
      error: error.message,
      statusCode: error.response?.status || 500,
      details: 'TLS analysis uses Mozilla Observatory. The service may be temporarily unavailable.'
    };
  }
};

export const handler = middleware(tlsHandler);
export default handler;
