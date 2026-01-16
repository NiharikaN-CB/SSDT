const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Get all available Gemini API keys from environment variables
 * Supports GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc.
 * @returns {Array<string>} - Array of API keys
 */
function getApiKeys() {
  const keys = [];

  // Get primary API key
  if (process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY);
  }

  // Get additional API keys (GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc.)
  let i = 2;
  while (process.env[`GEMINI_API_KEY_${i}`]) {
    keys.push(process.env[`GEMINI_API_KEY_${i}`]);
    i++;
  }

  console.log(`📋 Found ${keys.length} Gemini API key(s) configured`);
  return keys;
}

/**
 * Refine and combine VirusTotal, PageSpeed, Observatory, ZAP, urlscan, and WebCheck reports using Gemini AI
 * @param {Object} vtReport - VirusTotal scan result
 * @param {Object} psiReport - PageSpeed Insights report
 * @param {Object} observatoryReport - Mozilla Observatory scan result
 * @param {string} url - The scanned URL
 * @param {Object} zapReport - OWASP ZAP vulnerability scan result (optional)
 * @param {Object} urlscanReport - urlscan.io website analysis result (optional)
 * @param {Object} webCheckReport - WebCheck comprehensive scan results (optional)
 * @returns {Promise<string>} - AI-generated refined report in Markdown format
 */
async function refineReport(vtReport, psiReport, observatoryReport, url, zapReport = null, urlscanReport = null, webCheckReport = null) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    throw new Error('No Gemini API keys configured. Please set GEMINI_API_KEY in environment variables.');
  }

  let lastError = null;

  // Try each API key until one succeeds
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = i === 0 ? 'primary' : `fallback #${i}`;

    try {
      console.log(`🔑 Attempting Gemini API with ${keyLabel} key (${i + 1}/${apiKeys.length})...`);

      // Initialize Gemini AI with current API key
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // Extract key data from reports
      const vtStats = vtReport?.data?.attributes?.stats || {};
      const vtCategories = vtReport?.data?.attributes?.categories || {};
      const vtTotalEngines = Object.values(vtStats).reduce((sum, val) => sum + val, 0);
      const vtMaliciousCount = vtStats.malicious || 0;
      const vtSuspiciousCount = vtStats.suspicious || 0;

      // Extract PageSpeed scores
      const lighthouseResult = psiReport?.lighthouseResult || {};
      const categories = lighthouseResult.categories || {};
      const performanceScore = categories.performance?.score ? Math.round(categories.performance.score * 100) : 'N/A';
      const accessibilityScore = categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : 'N/A';
      const bestPracticesScore = categories['best-practices']?.score ? Math.round(categories['best-practices'].score * 100) : 'N/A';
      const seoScore = categories.seo?.score ? Math.round(categories.seo.score * 100) : 'N/A';

      // Extract Observatory data
      const observatoryGrade = observatoryReport?.grade || 'N/A';
      const observatoryScore = observatoryReport?.score || 'N/A';
      const observatoryTestsPassed = observatoryReport?.tests_passed || 0;
      const observatoryTestsFailed = observatoryReport?.tests_failed || 0;
      const observatoryTestsTotal = observatoryReport?.tests_quantity || 0;
      const hasObservatoryData = observatoryReport && !observatoryReport.error;

      // Extract ZAP data
      const hasZapData = zapReport && !zapReport.error && zapReport.alerts;
      const zapRiskCounts = zapReport?.riskCounts || { High: 0, Medium: 0, Low: 0, Informational: 0 };
      const zapAlertCount = zapReport?.alerts?.length || 0;
      const zapHighRisk = zapReport?.alerts?.filter(a => a.risk === 'High') || [];
      const zapMediumRisk = zapReport?.alerts?.filter(a => a.risk === 'Medium') || [];

      // Extract urlscan data
      const hasUrlscanData = urlscanReport && !urlscanReport.error && urlscanReport.verdicts;
      const urlscanVerdicts = urlscanReport?.verdicts || {};
      const urlscanPage = urlscanReport?.page || {};
      const urlscanStats = urlscanReport?.stats || {};
      const urlscanIsMalicious = urlscanVerdicts?.overall?.malicious || false;
      const urlscanScore = urlscanVerdicts?.overall?.score || 0;

      // Extract WebCheck data
      const hasWebCheckData = webCheckReport && Object.keys(webCheckReport).length > 0;
      const webCheckHeaders = webCheckReport?.headers || {};
      const webCheckTls = webCheckReport?.tls || webCheckReport?.ssl || {};
      const webCheckTechStack = webCheckReport?.['tech-stack'] || {};
      const webCheckFirewall = webCheckReport?.firewall || {};
      const webCheckDns = webCheckReport?.dns || {};
      const webCheckHsts = webCheckReport?.hsts || {};
      const webCheckSecurityTxt = webCheckReport?.['security-txt'] || {};
      const webCheckRobotsTxt = webCheckReport?.['robots-txt'] || {};
      const webCheckCookies = webCheckReport?.cookies || {};
      const webCheckCarbon = webCheckReport?.carbon || {};
      const webCheckQuality = webCheckReport?.quality || {};

      // Build the prompt for Gemini
      const prompt = `You are a cybersecurity and web performance expert. Analyze the following reports for the URL: ${url}

VirusTotal Security Report:
- Total Engines Scanned: ${vtTotalEngines}
- Malicious Detections: ${vtMaliciousCount}
- Suspicious Detections: ${vtSuspiciousCount}
- Categories: ${JSON.stringify(vtCategories)}
- Full VT Stats: ${JSON.stringify(vtStats)}

PageSpeed Insights Performance Report:
- Performance Score: ${performanceScore}/100
- Accessibility Score: ${accessibilityScore}/100
- Best Practices Score: ${bestPracticesScore}/100
- SEO Score: ${seoScore}/100

${hasObservatoryData ? `Mozilla Observatory Security Configuration Report:
- Security Grade: ${observatoryGrade}
- Security Score: ${observatoryScore}/100
- Tests Passed: ${observatoryTestsPassed}
- Tests Failed: ${observatoryTestsFailed}
- Total Tests: ${observatoryTestsTotal}` : 'Mozilla Observatory: Not available for this scan'}

${hasZapData ? `OWASP ZAP Vulnerability Scan Report:
- Total Alerts: ${zapAlertCount}
- High Risk Vulnerabilities: ${zapRiskCounts.High}
- Medium Risk Vulnerabilities: ${zapRiskCounts.Medium}
- Low Risk Vulnerabilities: ${zapRiskCounts.Low}
- Informational: ${zapRiskCounts.Informational}
${zapHighRisk.length > 0 ? `- High Risk Issues: ${zapHighRisk.slice(0, 5).map(a => a.alert).join(', ')}` : ''}
${zapMediumRisk.length > 0 ? `- Medium Risk Issues: ${zapMediumRisk.slice(0, 5).map(a => a.alert).join(', ')}` : ''}` : 'OWASP ZAP: Scan not available or still in progress'}

${hasUrlscanData ? `urlscan.io Website Analysis Report:
- Malicious Verdict: ${urlscanIsMalicious ? 'YES - MALICIOUS' : 'No - Clean'}
- Threat Score: ${urlscanScore}/100
- Domain: ${urlscanPage.domain || 'N/A'}
- Server IP: ${urlscanPage.ip || 'N/A'}
- Country: ${urlscanPage.country || 'N/A'}
- Server: ${urlscanPage.server || 'N/A'}
- TLS Issuer: ${urlscanPage.tlsIssuer || 'N/A'}
- Unique IPs: ${urlscanStats.uniqIPs || 0}
- Total Requests: ${urlscanStats.requests || 0}` : 'urlscan.io: Scan not available or still in progress'}

${hasWebCheckData ? `WebCheck Comprehensive Scan Report:
- Security Headers: ${JSON.stringify(webCheckHeaders?.headers || webCheckHeaders || 'N/A')}
- TLS/SSL Configuration: ${webCheckTls?.grade || webCheckTls?.valid ? `Grade: ${webCheckTls.grade || 'Valid'}, Protocol: ${webCheckTls.protocol || 'N/A'}, Cipher: ${webCheckTls.cipher || 'N/A'}` : 'N/A'}
- Technology Stack: ${Array.isArray(webCheckTechStack?.technologies) ? webCheckTechStack.technologies.map(t => t.name || t).join(', ') : 'N/A'}
- Firewall/WAF Detection: ${webCheckFirewall?.hasWaf ? `Detected: ${webCheckFirewall.waf || 'Yes'}` : 'No WAF detected'}
- HSTS Status: ${webCheckHsts?.enabled ? `Enabled (max-age: ${webCheckHsts.maxAge || 'N/A'})` : 'Not enabled'}
- DNS Configuration: ${webCheckDns?.a ? `A Records: ${webCheckDns.a.join(', ')}` : 'N/A'}
- Security.txt: ${webCheckSecurityTxt?.present ? 'Present' : 'Not found'}
- Robots.txt: ${webCheckRobotsTxt?.present ? 'Present' : 'Not found'}
- Cookies: ${Array.isArray(webCheckCookies) ? `${webCheckCookies.length} cookies found` : 'N/A'}
- Carbon Footprint: ${webCheckCarbon?.co2 ? `${webCheckCarbon.co2}g CO2 per visit` : 'N/A'}
- Code Quality Score: ${webCheckQuality?.score || 'N/A'}` : 'WebCheck: Scan not available or still in progress'}

Task:
Generate a comprehensive, professional analysis report that includes:

1. Executive Summary (2-3 sentences): Overall assessment of the URL's security and performance.

2. Security Analysis:
   - Risk level (Low/Medium/High) based on VirusTotal results
   - Mozilla Observatory security grade and configuration assessment (if available)
   - OWASP ZAP vulnerability findings and their severity (if available)
   - urlscan.io website analysis and threat detection (if available)
   - WebCheck findings: security headers, TLS/SSL grade, WAF detection, HSTS status (if available)
   - Key security findings and threats detected (if any)
   - Specific concerns or red flags from all scan sources

3. Infrastructure Analysis (from WebCheck if available):
   - Technology stack and frameworks detected
   - DNS configuration assessment
   - Cookie security analysis
   - Security.txt and robots.txt presence

4. Performance Analysis:
   - Overall performance rating
   - Key performance metrics and their implications
   - Accessibility and SEO considerations
   - Environmental impact (carbon footprint if available)

5. Actionable Recommendations:
   - Security improvements (if needed) - include malware protection, security headers/configurations, ZAP vulnerability fixes, TLS improvements, and HSTS implementation
   - Performance optimizations
   - Best practices to implement

6. Conclusion: Final verdict on whether the URL is safe to use and performs well.

IMPORTANT FORMATTING INSTRUCTIONS:
- Use simple text formatting with headers (use # for headers) and bullet points (use - for lists)
- DO NOT use double asterisks for bolding any terms within headers or list items
- DO NOT wrap the entire response in markdown code blocks (do not use triple backticks)
- Keep the report concise, professional, and actionable
- Focus on practical insights rather than raw data
- Ensure ALL scores (Performance, Accessibility, Best Practices, SEO, Observatory Grade, ZAP vulnerabilities, and WebCheck findings if available) are mentioned in the analysis`;

      // Generate the refined report
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const refinedReport = response.text();

      console.log(`✅ Successfully generated report using ${keyLabel} key`);
      return refinedReport;

    } catch (error) {
      lastError = error;
      console.error(`❌ ${keyLabel} key failed:`, error.message);

      // Check if it's a rate limit or overload error
      const isRateLimitError = error.message?.includes('overloaded') ||
        error.message?.includes('503') ||
        error.message?.includes('quota') ||
        error.message?.includes('rate limit');

      const isAuthError = error.message?.includes('API key') ||
        error.message?.includes('401') ||
        error.message?.includes('403');

      if (isAuthError) {
        console.warn(`⚠️  ${keyLabel} key has authentication issues, skipping to next key...`);
      } else if (isRateLimitError) {
        console.warn(`⚠️  ${keyLabel} key is rate limited or overloaded, trying next key...`);
      } else {
        console.warn(`⚠️  ${keyLabel} key encountered error, trying next key...`);
      }

      // If this is the last key, throw the error
      if (i === apiKeys.length - 1) {
        console.error('❌ All Gemini API keys failed');
        break;
      }

      // Wait a bit before trying the next key (500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // All API keys failed, throw the last error
  console.error('💥 All Gemini API keys exhausted');

  if (lastError?.message?.includes('API key') || lastError?.message?.includes('401') || lastError?.message?.includes('403')) {
    throw new Error('Gemini API authentication failed for all configured keys. Please check your API keys.');
  } else if (lastError?.message?.includes('overloaded') || lastError?.message?.includes('503')) {
    throw new Error('All Gemini API keys are currently overloaded or rate limited. Please try again later or add more API keys.');
  } else {
    throw new Error(`Gemini service error: ${lastError?.message || 'Unknown error'}`);
  }
}

/**
 * Format a markdown report into clean plain text for PDF generation
 * @param {string} markdownReport - The markdown-formatted report
 * @returns {Promise<string>} - Clean plain text formatted for PDF
 */
async function formatReportForPdf(markdownReport) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    // Fallback: basic markdown stripping if no API keys
    return stripMarkdownBasic(markdownReport);
  }

  let lastError = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = i === 0 ? 'primary' : `fallback #${i}`;

    try {
      console.log(`📄 Formatting report for PDF using ${keyLabel} key...`);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Convert the following markdown report into clean, professionally formatted plain text suitable for a PDF document.

RULES:
1. Remove all markdown syntax (# headers, ** bold, - bullets, etc.)
2. Convert headers into UPPERCASE section titles followed by a blank line
3. Convert bullet points into properly indented paragraphs with ">" prefix
4. Keep the content readable and well-structured
5. Do NOT use any emojis or special Unicode characters
6. Use only standard ASCII characters
7. Preserve all important information
8. Add appropriate spacing between sections

MARKDOWN REPORT:
${markdownReport}

OUTPUT (clean plain text only):`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const formattedText = response.text().trim();

      console.log(`✅ Successfully formatted report for PDF using ${keyLabel} key`);
      return formattedText;

    } catch (error) {
      lastError = error;
      console.error(`❌ ${keyLabel} key failed for PDF formatting:`, error.message);

      if (i === apiKeys.length - 1) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Fallback to basic stripping if all keys fail
  console.warn('⚠️ All Gemini keys failed, using basic markdown stripping');
  return stripMarkdownBasic(markdownReport);
}

/**
 * Basic markdown stripping fallback
 * @param {string} text - Markdown text
 * @returns {string} - Plain text
 */
function stripMarkdownBasic(text) {
  return text
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Convert bullets to indented text
    .replace(/^[-*]\s+/gm, '  > ')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Format scan data into structured bilingual JSON for PDF
 * @param {Object} scanResult - The complete scan result
 * @returns {Promise<Object>} - Structured bilingual data
 */
async function formatScanDataForPdf(scanResult) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    throw new Error('No Gemini API keys configured');
  }

  // Extract all scan data
  const vtStats = scanResult.vtResult?.data?.attributes?.stats || {};
  const malicious = vtStats.malicious || 0;
  const suspicious = vtStats.suspicious || 0;
  const harmless = vtStats.harmless || 0;
  const undetected = vtStats.undetected || 0;
  const totalEngines = Object.values(vtStats).reduce((sum, val) => sum + val, 0);
  const overallRisk = malicious > 0 ? 'High' : suspicious > 0 ? 'Medium' : 'Low';

  const categories = scanResult.pagespeedResult?.lighthouseResult?.categories || {};
  const performanceScore = Math.round((categories.performance?.score || 0) * 100);
  const accessibilityScore = Math.round((categories.accessibility?.score || 0) * 100);
  const bestPracticesScore = Math.round((categories['best-practices']?.score || 0) * 100);
  const seoScore = Math.round((categories.seo?.score || 0) * 100);

  const obs = scanResult.observatoryResult || {};
  const zap = scanResult.zapResult || {};
  const urlscan = scanResult.urlscanResult || {};
  const webCheck = scanResult.webCheckResult?.results || {};

  const scanDataText = `
Target URL: ${scanResult.target}
Scan ID: ${scanResult.analysisId}
Status: ${scanResult.status}
Overall Risk Level: ${overallRisk}

VIRUSTOTAL ANALYSIS:
- Total Engines Scanned: ${totalEngines}
- Malicious Detections: ${malicious}
- Suspicious: ${suspicious}
- Harmless: ${harmless}
- Undetected: ${undetected}

PAGESPEED INSIGHTS:
- Performance Score: ${performanceScore}/100
- Accessibility Score: ${accessibilityScore}/100
- Best Practices Score: ${bestPracticesScore}/100
- SEO Score: ${seoScore}/100

MOZILLA OBSERVATORY:
- Security Grade: ${obs.grade || 'N/A'}
- Score: ${obs.score || 0}/100
- Tests Passed: ${obs.tests_passed || 0}
- Tests Failed: ${obs.tests_failed || 0}

OWASP ZAP VULNERABILITY SCAN:
- Status: ${zap.status || 'N/A'}
- Total Alerts: ${zap.totalAlerts || 0}
- High Risk: ${zap.riskCounts?.High || 0}
- Medium Risk: ${zap.riskCounts?.Medium || 0}
- Low Risk: ${zap.riskCounts?.Low || 0}
- Informational: ${zap.riskCounts?.Informational || 0}
${zap.alerts ? `- Top Vulnerabilities: ${zap.alerts.slice(0, 5).map(a => `[${a.risk}] ${a.alert}`).join('; ')}` : ''}

URLSCAN.IO ANALYSIS:
- Verdict: ${urlscan.verdicts?.overall?.malicious ? 'MALICIOUS' : 'Clean'}
- Threat Score: ${urlscan.verdicts?.overall?.score || 0}/100
- Domain: ${urlscan.page?.domain || 'N/A'}
- Server IP: ${urlscan.page?.ip || 'N/A'}
- Country: ${urlscan.page?.country || 'N/A'}
- Server: ${urlscan.page?.server || 'N/A'}

WEBCHECK ANALYSIS:
- TLS Grade: ${webCheck.tls?.tlsInfo?.grade || webCheck.ssl?.grade || 'N/A'}
- WAF Detected: ${webCheck.firewall?.hasWaf ? `Yes (${webCheck.firewall.waf})` : 'No'}
- HSTS Enabled: ${webCheck.hsts?.enabled ? 'Yes' : 'No'}
- Technologies: ${webCheck['tech-stack']?.technologies?.slice(0, 5).map(t => t.name || t).join(', ') || 'N/A'}
`;

  let lastError = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = i === 0 ? 'primary' : `fallback #${i}`;

    try {
      console.log(`📊 Formatting scan data for PDF using ${keyLabel} key...`);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Convert this security scan data into a structured JSON format for a professional bilingual PDF report (English and Japanese).

SCAN DATA:
${scanDataText}

Return a JSON object with this EXACT structure:
{
  "header": {
    "title": { "en": "Security Scan Report", "ja": "Japanese translation" },
    "target": "${scanResult.target}",
    "scanId": "${scanResult.analysisId}",
    "date": "${new Date().toLocaleDateString()}",
    "status": { "en": "${scanResult.status}", "ja": "Japanese translation" }
  },
  "summary": {
    "title": { "en": "Executive Summary", "ja": "Japanese translation" },
    "riskLevel": { "en": "${overallRisk}", "ja": "Japanese translation" },
    "riskLabel": { "en": "Overall Risk Level", "ja": "Japanese translation" }
  },
  "sections": [
    {
      "id": "virustotal",
      "title": { "en": "VirusTotal Analysis", "ja": "Japanese translation" },
      "items": [
        { "label": { "en": "Total Engines", "ja": "Japanese" }, "value": "${totalEngines}", "type": "stat" },
        { "label": { "en": "Malicious", "ja": "Japanese" }, "value": "${malicious}", "type": "danger" },
        { "label": { "en": "Suspicious", "ja": "Japanese" }, "value": "${suspicious}", "type": "warning" },
        { "label": { "en": "Harmless", "ja": "Japanese" }, "value": "${harmless}", "type": "success" },
        { "label": { "en": "Undetected", "ja": "Japanese" }, "value": "${undetected}", "type": "stat" }
      ]
    },
    {
      "id": "pagespeed",
      "title": { "en": "PageSpeed Insights", "ja": "Japanese translation" },
      "items": [
        { "label": { "en": "Performance", "ja": "Japanese" }, "value": "${performanceScore}/100", "type": "score" },
        { "label": { "en": "Accessibility", "ja": "Japanese" }, "value": "${accessibilityScore}/100", "type": "score" },
        { "label": { "en": "Best Practices", "ja": "Japanese" }, "value": "${bestPracticesScore}/100", "type": "score" },
        { "label": { "en": "SEO", "ja": "Japanese" }, "value": "${seoScore}/100", "type": "score" }
      ]
    },
    {
      "id": "observatory",
      "title": { "en": "Mozilla Observatory", "ja": "Japanese translation" },
      "items": [
        { "label": { "en": "Security Grade", "ja": "Japanese" }, "value": "${obs.grade || 'N/A'}", "type": "grade" },
        { "label": { "en": "Score", "ja": "Japanese" }, "value": "${obs.score || 0}/100", "type": "score" },
        { "label": { "en": "Tests Passed", "ja": "Japanese" }, "value": "${obs.tests_passed || 0}", "type": "success" },
        { "label": { "en": "Tests Failed", "ja": "Japanese" }, "value": "${obs.tests_failed || 0}", "type": "danger" }
      ]
    },
    {
      "id": "zap",
      "title": { "en": "OWASP ZAP Vulnerability Scan", "ja": "Japanese translation" },
      "items": [
        { "label": { "en": "Total Alerts", "ja": "Japanese" }, "value": "${zap.totalAlerts || 0}", "type": "stat" },
        { "label": { "en": "High Risk", "ja": "Japanese" }, "value": "${zap.riskCounts?.High || 0}", "type": "danger" },
        { "label": { "en": "Medium Risk", "ja": "Japanese" }, "value": "${zap.riskCounts?.Medium || 0}", "type": "warning" },
        { "label": { "en": "Low Risk", "ja": "Japanese" }, "value": "${zap.riskCounts?.Low || 0}", "type": "info" },
        { "label": { "en": "Informational", "ja": "Japanese" }, "value": "${zap.riskCounts?.Informational || 0}", "type": "stat" }
      ],
      "alerts": ${JSON.stringify((zap.alerts || []).slice(0, 7).map(a => ({ risk: a.risk, alert: a.alert })))}
    },
    {
      "id": "urlscan",
      "title": { "en": "urlscan.io Analysis", "ja": "Japanese translation" },
      "items": [
        { "label": { "en": "Verdict", "ja": "Japanese" }, "value": { "en": "${urlscan.verdicts?.overall?.malicious ? 'MALICIOUS' : 'Clean'}", "ja": "Japanese" }, "type": "${urlscan.verdicts?.overall?.malicious ? 'danger' : 'success'}" },
        { "label": { "en": "Threat Score", "ja": "Japanese" }, "value": "${urlscan.verdicts?.overall?.score || 0}/100", "type": "score" },
        { "label": { "en": "Domain", "ja": "Japanese" }, "value": "${urlscan.page?.domain || 'N/A'}", "type": "stat" },
        { "label": { "en": "Server IP", "ja": "Japanese" }, "value": "${urlscan.page?.ip || 'N/A'}", "type": "stat" },
        { "label": { "en": "Country", "ja": "Japanese" }, "value": "${urlscan.page?.country || 'N/A'}", "type": "stat" },
        { "label": { "en": "Server", "ja": "Japanese" }, "value": "${urlscan.page?.server || 'N/A'}", "type": "stat" }
      ]
    },
    {
      "id": "webcheck",
      "title": { "en": "WebCheck Analysis", "ja": "Japanese translation" },
      "items": [
        { "label": { "en": "TLS Grade", "ja": "Japanese" }, "value": "${webCheck.tls?.tlsInfo?.grade || webCheck.ssl?.grade || 'N/A'}", "type": "grade" },
        { "label": { "en": "WAF Detected", "ja": "Japanese" }, "value": { "en": "${webCheck.firewall?.hasWaf ? 'Yes' : 'No'}", "ja": "Japanese" }, "type": "${webCheck.firewall?.hasWaf ? 'success' : 'warning'}" },
        { "label": { "en": "HSTS Enabled", "ja": "Japanese" }, "value": { "en": "${webCheck.hsts?.enabled ? 'Yes' : 'No'}", "ja": "Japanese" }, "type": "${webCheck.hsts?.enabled ? 'success' : 'warning'}" },
        { "label": { "en": "Technologies", "ja": "Japanese" }, "value": "${webCheck['tech-stack']?.technologies?.slice(0, 5).map(t => t.name || t).join(', ') || 'N/A'}", "type": "stat" }
      ]
    }
  ]
}

IMPORTANT RULES:
1. Return ONLY valid JSON, no markdown or extra text
2. Translate ALL "ja" fields to proper Japanese
3. Keep technical terms (like URLs, IPs, scores) unchanged
4. Ensure professional translations suitable for a business report`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let jsonText = response.text().trim();

      // Clean up JSON
      jsonText = jsonText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(jsonText);
      console.log(`✅ Successfully formatted scan data using ${keyLabel} key`);
      return parsed;

    } catch (error) {
      lastError = error;
      console.error(`❌ ${keyLabel} key failed for scan data formatting:`, error.message);

      if (i === apiKeys.length - 1) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Scan data formatting failed: ${lastError?.message}`);
}

/**
 * Format AI analysis into structured JSON for PDF
 * @param {string} markdownReport - The markdown AI report
 * @returns {Promise<Object>} - Structured analysis data
 */
async function formatAiAnalysisForPdf(markdownReport) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    throw new Error('No Gemini API keys configured');
  }

  let lastError = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = i === 0 ? 'primary' : `fallback #${i}`;

    try {
      console.log(`📝 Formatting AI analysis for PDF using ${keyLabel} key...`);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Convert this security analysis report into a structured JSON format for a professional PDF document.

REPORT:
${markdownReport}

Return a JSON object with this structure:
{
  "title": "AI-Generated Security Analysis",
  "sections": [
    {
      "heading": "Section Title (e.g., Executive Summary)",
      "type": "paragraph|bullets|mixed",
      "content": [
        { "type": "paragraph", "text": "Paragraph text here..." },
        { "type": "bullets", "items": ["Bullet point 1", "Bullet point 2"] },
        { "type": "bold_text", "label": "Risk Level:", "text": "HIGH" }
      ]
    }
  ]
}

RULES:
1. Return ONLY valid JSON
2. Preserve all important information from the report
3. Use "paragraph" for regular text
4. Use "bullets" for lists
5. Use "bold_text" for key-value pairs that should be emphasized
6. Group related content under appropriate section headings
7. Do NOT include emojis or special unicode characters
8. Keep it professional and well-structured`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let jsonText = response.text().trim();

      jsonText = jsonText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(jsonText);
      console.log(`✅ Successfully formatted AI analysis using ${keyLabel} key`);
      return parsed;

    } catch (error) {
      lastError = error;
      console.error(`❌ ${keyLabel} key failed for AI analysis formatting:`, error.message);

      if (i === apiKeys.length - 1) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(`AI analysis formatting failed: ${lastError?.message}`);
}

/**
 * Translate formatted AI analysis to Japanese
 * @param {Object} formattedAnalysis - The structured English analysis
 * @returns {Promise<Object>} - Same structure in Japanese
 */
async function translateAiAnalysisToJapanese(formattedAnalysis) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    throw new Error('No Gemini API keys configured');
  }

  let lastError = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = i === 0 ? 'primary' : `fallback #${i}`;

    try {
      console.log(`🌐 Translating AI analysis to Japanese using ${keyLabel} key...`);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Translate this security analysis JSON from English to Japanese. Keep the exact same structure, only translate the text content.

INPUT JSON:
${JSON.stringify(formattedAnalysis, null, 2)}

RULES:
1. Return ONLY valid JSON with the EXACT same structure
2. Translate ALL text content to Japanese
3. Keep technical terms like URLs, IPs, version numbers unchanged
4. Translate section headings, paragraphs, and bullet points
5. Maintain professional tone suitable for a business security report
6. The "title" should be translated to: "AIによるセキュリティ分析"

OUTPUT (Japanese JSON only):`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let jsonText = response.text().trim();

      jsonText = jsonText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(jsonText);
      console.log(`✅ Successfully translated AI analysis to Japanese using ${keyLabel} key`);
      return parsed;

    } catch (error) {
      lastError = error;
      console.error(`❌ ${keyLabel} key failed for Japanese translation:`, error.message);

      if (i === apiKeys.length - 1) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Japanese translation failed: ${lastError?.message}`);
}

module.exports = {
  refineReport,
  translateText,
  formatReportForPdf,
  formatScanDataForPdf,
  formatAiAnalysisForPdf,
  translateAiAnalysisToJapanese
};

/**
 * Translate an array of texts using Gemini AI
 * Uses JSON format for reliable 1:1 text mapping
 * @param {string[]} texts - Array of texts to translate
 * @param {string} targetLang - Target language ('en' for English, 'ja' for Japanese)
 * @returns {Promise<string[]>} - Array of translated texts
 */
async function translateText(texts, targetLang) {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    throw new Error('No Gemini API keys configured. Please set GEMINI_API_KEY in environment variables.');
  }

  if (!texts || texts.length === 0) {
    return [];
  }

  const langName = targetLang === 'ja' ? 'Japanese' : 'English';
  const sourceLang = targetLang === 'ja' ? 'English' : 'Japanese';

  let lastError = null;

  // Try each API key until one succeeds
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const keyLabel = i === 0 ? 'primary' : `fallback #${i}`;

    try {
      console.log(`🌐 Translating ${texts.length} texts to ${langName} using ${keyLabel} key...`);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // Build input as JSON object with numeric keys
      const inputObj = {};
      texts.forEach((text, idx) => {
        inputObj[idx] = text;
      });

      const prompt = `Translate the following texts from ${sourceLang} to ${langName}.

INPUT (JSON object with numeric keys):
${JSON.stringify(inputObj, null, 2)}

CRITICAL RULES:
1. Return ONLY a valid JSON object
2. Use the SAME numeric keys as the input
3. Each value should be the translation of the corresponding input value
4. Preserve emojis and special characters
5. Do NOT add any text before or after the JSON

OUTPUT (JSON object only):`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let translatedText = response.text().trim();

      // Clean up response - remove markdown code blocks if present
      translatedText = translatedText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      // Parse JSON response
      let translatedObj;
      try {
        translatedObj = JSON.parse(translatedText);
      } catch (parseError) {
        console.error('❌ Failed to parse Gemini JSON response:', translatedText.substring(0, 200));
        throw new Error('Invalid JSON response from Gemini');
      }

      // Build result array in correct order
      const translations = [];
      for (let j = 0; j < texts.length; j++) {
        if (translatedObj[j] !== undefined) {
          translations.push(String(translatedObj[j]));
        } else if (translatedObj[String(j)] !== undefined) {
          translations.push(String(translatedObj[String(j)]));
        } else {
          // Fallback to original if translation missing
          console.warn(`⚠️ Missing translation for index ${j}, using original`);
          translations.push(texts[j]);
        }
      }

      console.log(`✅ Successfully translated ${translations.length} texts using ${keyLabel} key`);
      return translations;

    } catch (error) {
      lastError = error;
      console.error(`❌ ${keyLabel} key failed for translation:`, error.message);

      if (i === apiKeys.length - 1) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.error('💥 All Gemini API keys exhausted for translation');
  throw new Error(`Translation failed: ${lastError?.message || 'Unknown error'}`);
}

