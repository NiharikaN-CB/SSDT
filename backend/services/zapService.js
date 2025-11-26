const axios = require('axios');

// 1. Use 127.0.0.1 to avoid Windows IPv6 resolution issues
const ZAP_URL = process.env.ZAP_API_URL || 'http://127.0.0.1:8080';
const API_KEY = process.env.ZAP_API_KEY || 'ssdt-secure-zap-2025';

const zapApi = axios.create({
  baseURL: ZAP_URL,
  timeout: 5000, 
  headers: {
    'X-Zap-Api-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  params: {
    apikey: API_KEY
  }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const waitForZap = async (retries = 15) => {
  for (let i = 0; i < retries; i++) {
    try {
      await zapApi.get('/JSON/core/view/version/');
      console.log('✅ ZAP Container is ready and reachable!');
      return true;
    } catch (error) {
      // 👇 IMPROVED LOGGING: Print the actual error message
      const msg = error.response ? `Status ${error.response.status}` : error.message;
      console.log(`⏳ Waiting for ZAP to boot... (${i + 1}/${retries}) - Reason: ${msg}`);
      await sleep(2000);
    }
  }
  return false;
};

const runZapScan = async (targetUrl) => {
  console.log(`[ZAP] Starting scan for: ${targetUrl}`);

  try {
    // 0. Robust Health Check
    const isReady = await waitForZap();
    if (!isReady) {
      throw new Error('ZAP Connection Timed Out. Check http://localhost:8080 in browser.');
    }

    // 1. Spider
    console.log('[ZAP] Spidering...');
    const spiderResp = await zapApi.get('/JSON/spider/action/scan/', { params: { url: targetUrl } });
    const spiderId = spiderResp.data.scan;

    let spiderStatus = 0;
    while (spiderStatus < 100) {
      const statusResp = await zapApi.get('/JSON/spider/view/status/', { params: { scanId: spiderId } });
      spiderStatus = parseInt(statusResp.data.status);
      await sleep(1000);
    }

    // 2. Active Scan
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

    // 3. Get Alerts
    const alertsResp = await zapApi.get('/JSON/core/view/alerts/', { params: { baseurl: targetUrl } });
    const alerts = alertsResp.data.alerts;

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