
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const Bottleneck = require('bottleneck');

const VT_API_KEY = process.env.VT_API_KEY;
const VT_BASE = 'https://www.virustotal.com/api/v3';

// Validate API key on startup
if (!VT_API_KEY) {
  console.error('❌ ERROR: VT_API_KEY is not set in environment variables');
  process.exit(1);
}

// Rate limiter (public API = 4 requests/min)
const limiter = new Bottleneck({
  reservoir: 4,
  reservoirRefreshAmount: 4,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 1,
  minTime: 250 // 250ms between requests
});

// Helper for POST requests
async function vtPost(path, data, headers = {}) {
  try {
    const response = await limiter.schedule(() =>
      axios.post(`${VT_BASE}${path}`, data, {
        headers: {
          'x-apikey': VT_API_KEY,
          ...headers
        },
        timeout: 30000 // 30 second timeout
      })
    );
    return response.data;
  } catch (error) {
    console.error(`VirusTotal POST Error (${path}):`, error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'VirusTotal API request failed');
  }
}

// Helper for GET requests
async function vtGet(path) {
  try {
    const response = await limiter.schedule(() =>
      axios.get(`${VT_BASE}${path}`, {
        headers: {
          'x-apikey': VT_API_KEY
        },
        timeout: 30000
      })
    );
    return response.data;
  } catch (error) {
    console.error(`VirusTotal GET Error (${path}):`, error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'VirusTotal API request failed');
  }
}

// Upload & scan file
async function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  console.log(`📤 Uploading file to VirusTotal: ${filePath}`);
  const result = await vtPost('/files', form, form.getHeaders());
  console.log(`✅ File uploaded successfully. Analysis ID: ${result.data.id}`);
  
  return result;
}

// Scan a URL
async function scanUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL provided');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  const formData = new URLSearchParams();
  formData.append('url', url);

  console.log(`🔍 Submitting URL for analysis: ${url}`);
  const result = await vtPost('/urls', formData.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  console.log(`✅ URL submitted successfully. Analysis ID: ${result.data.id}`);
  
  return result;
}

// Fetch analysis result
async function getAnalysis(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid analysis ID provided');
  }

  console.log(`📊 Fetching analysis result: ${id}`);
  const result = await vtGet(`/analyses/${id}`);
  console.log(`✅ Analysis result retrieved. Status: ${result.data.attributes.status}`);
  
  return result;
}

// Get file report by hash
async function getFileReport(hash) {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Invalid file hash provided');
  }

  console.log(`📄 Fetching file report: ${hash}`);
  const result = await vtGet(`/files/${hash}`);
  
  return result;
}

module.exports = {
  scanFile,
  scanUrl,
  getAnalysis,
  getFileReport
};
