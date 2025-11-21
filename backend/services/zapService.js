const axios = require('axios');

// Docker vs Localhost switch
const ZAP_BASE_URL = process.env.ZAP_PROXY_URL || 'http://127.0.0.1:8080';
const ZAP_API_URL = `${ZAP_BASE_URL}/JSON`;
const API_KEY = process.env.ZAP_API_KEY;

// 1. Start Spider Scan (Mapping)
const startSpiderScan = async (targetUrl) => {
  try {
    if (!targetUrl) throw new Error('Target URL is required');
    
    // console.log(`Service: Initiating ZAP Spider for ${targetUrl}`);
    const response = await axios.get(`${ZAP_API_URL}/spider/action/scan/`, {
      params: {
        url: targetUrl,
        apikey: API_KEY
      }
    });
    return response.data.scan;
  } catch (error) {
    console.error('Start Spider Error:', error.message);
    throw error;
  }
};

// 2. Check Spider Status
const getSpiderStatus = async (scanId) => {
  try {
    const response = await axios.get(`${ZAP_API_URL}/spider/view/status/`, {
      params: {
        scanId: scanId,
        apikey: API_KEY
      }
    });
    return parseInt(response.data.status);
  } catch (error) {
    console.error('Spider Status Error:', error.message);
    throw error;
  }
};

// 3. Start Active Scan (Attacking)
const startActiveScan = async (targetUrl) => {
  try {
    // console.log(`Service: Initiating ZAP Active Scan for ${targetUrl}`);
    const response = await axios.get(`${ZAP_API_URL}/ascan/action/scan/`, {
      params: {
        url: targetUrl,
        recurse: true,
        inScopeOnly: false,
        scanPolicyName: '',
        method: '',
        postData: '',
        apikey: API_KEY
      }
    });
    return response.data.scan;
  } catch (error) {
    console.error('Start Active Scan Error:', error.message);
    throw error;
  }
};

// 4. Check Active Scan Status
const getActiveScanStatus = async (scanId) => {
  try {
    const response = await axios.get(`${ZAP_API_URL}/ascan/view/status/`, {
      params: {
        scanId: scanId,
        apikey: API_KEY
      }
    });
    return parseInt(response.data.status);
  } catch (error) {
    console.error('Active Scan Status Error:', error.message);
    throw error;
  }
};

// 5. Get Alerts (The Results)
const getZapAlerts = async (targetUrl) => {
  try {
    const response = await axios.get(`${ZAP_API_URL}/core/view/alerts/`, {
      params: {
        baseurl: targetUrl,
        start: 0,
        count: 5000, // <--- CRITICAL FIX: Fetch up to 5000 alerts (Default was 100)
        apikey: API_KEY
      }
    });
    return response.data.alerts;
  } catch (error) {
    console.error('Get Alerts Error:', error.message);
    throw error;
  }
};

module.exports = { 
  startSpiderScan, 
  getSpiderStatus, 
  startActiveScan, 
  getActiveScanStatus, 
  getZapAlerts 
};