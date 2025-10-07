const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const Bottleneck = require('bottleneck');

console.log('Loaded VT_API_KEY:', process.env.VT_API_KEY);

const VT_API_KEY = process.env.VT_API_KEY;
const VT_BASE = 'https://www.virustotal.com/api/v3';





// rate limiter (public API = 4 requests/min)
const limiter = new Bottleneck({
  reservoir: 4,
  reservoirRefreshAmount: 4,
  reservoirRefreshInterval: 60 * 1000
});

// Helper for requests
async function vtPost(path, data, headers = {}) {
  return limiter.schedule(() =>
    axios.post(`${VT_BASE}${path}`, data, { headers: { 'x-apikey': VT_API_KEY, ...headers } })
  );
}

async function vtGet(path) {
  return limiter.schedule(() =>
    axios.get(`${VT_BASE}${path}`, { headers: { 'x-apikey': VT_API_KEY } })
  );
}

// Upload & scan file
async function scanFile(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const res = await vtPost('/files', form, form.getHeaders());
  return res.data;
}

// Scan a URL
async function scanUrl(url) {
  const encodedUrl = `url=${encodeURIComponent(url)}`;
  const res = await vtPost('/urls', encodedUrl, { 'Content-Type': 'application/x-www-form-urlencoded' });
  return res.data;
}

// Fetch analysis result
async function getAnalysis(id) {
  const res = await vtGet(`/analyses/${id}`);
  return res.data;
}

module.exports = { scanFile, scanUrl, getAnalysis };
