const axios = require('axios');

// 1. Use 127.0.0.1 to avoid Windows IPv6 resolution issues
const ZAP_URL = process.env.ZAP_API_URL || 'http://127.0.0.1:8080';
const API_KEY = process.env.ZAP_API_KEY || 'ssdt-secure-zap-2025';

const zapApi = axios.create({
  baseURL: ZAP_URL,
  timeout: 5000, 
  headers: {
    'X-Zap-Api-Key': API_KEY, // Header is required by newer ZAP versions
    'Content-Type': 'application/json'
  },
  params: {
    apikey: API_KEY // Query param fallback
  }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Waits for ZAP to become ready by checking the Version API
 */
const waitForZap = async (retries = 15) => {
  for (let i = 0; i < retries; i++) {
    try {
      // 2. CHECK VERSION instead of root '/' to avoid 403 Forbidden errors
      await zapApi.get('/JSON/core/view/version/');
      console.log('✅ ZAP Container is ready and reachable!');
      return true;
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.error('❌ ZAP API Key Rejected. Check your .env file matches the Docker command.');
        return false;
      }
      console.log(`⏳ Waiting for ZAP to boot... (${i + 1}/${retries})`);
      await sleep(2000);
    }
  }
  return false;
};

const runZapScan = async (targetUrl) => {
  console.log(`[ZAP] Starting scan for: ${targetUrl}`);

  try {
    // 3. Robust Health Check
    const isReady = await waitForZap();
    if (!isReady) {
      throw new Error('ZAP Container is not reachable or API Key is invalid.');
    }

    // 4. Spider (Crawl)
    console.log('[ZAP] Spidering...');
    const spiderResp = await zapApi.get('/JSON/spider/action/scan/', { params: { url: targetUrl } });
    const spiderId = spiderResp.data.scan;

    let spiderStatus = 0;
    while (spiderStatus < 100) {
      const statusResp = await zapApi.get('/JSON/spider/view/status/', { params: { scanId: spiderId } });
      spiderStatus = parseInt(statusResp.data.status);
      await sleep(1000);
    }

    // 5. Active Scan (Attack)
    console.log('[ZAP] Active Scanning...');
    const ascanResp = await zapApi.get('/JSON/ascan/action/scan/', { 
      params: { url: targetUrl, recurse: 'true', inScopeOnly: 'false' } 
    });
    const ascanId = ascanResp.data.scan;

    let ascanStatus = 0;
    while (ascanStatus < 100) {
      const statusResp = await zapApi.get('/JSON/ascan/view/status/', { params: { scanId: ascanId } });
      ascanStatus = parseInt(statusResp.data.status);
      await sleep(2000);
    }

    // 6. Get Alerts
    const alertsResp = await zapApi.get('/JSON/core/view/alerts/', { params: { baseurl: targetUrl } });
    const alerts = alertsResp.data.alerts;

    // 7. Format Results
    const riskCounts = { High: 0, Medium: 0, Low: 0, Informational: 0 };
    alerts.forEach(a => { if(riskCounts[a.risk] !== undefined) riskCounts[a.risk]++; });

    return {
      site: targetUrl,
      riskCounts,
      alerts: alerts.map(a => ({
        alert: a.alert,
        risk: a.risk,
        description: a.description,
        solution: a.solution
      }))
    };

  } catch (error) {
    console.error('[ZAP] Service Error:', error.message);
    throw error;
  }
};

module.exports = { runZapScan };