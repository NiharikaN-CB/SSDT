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
 * Refine and combine VirusTotal, PageSpeed, and Observatory reports using Gemini AI
 * @param {Object} vtReport - VirusTotal scan result
 * @param {Object} psiReport - PageSpeed Insights report
 * @param {Object} observatoryReport - Mozilla Observatory scan result
 * @param {string} url - The scanned URL
 * @returns {Promise<string>} - AI-generated refined report in Markdown format
 */
async function refineReport(vtReport, psiReport, observatoryReport, url) {
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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

Task:
Generate a comprehensive, professional analysis report that includes:

1. Executive Summary (2-3 sentences): Overall assessment of the URL's security and performance.

2. Security Analysis:
   - Risk level (Low/Medium/High) based on VirusTotal results
   - Mozilla Observatory security grade and configuration assessment (if available)
   - Key security findings and threats detected (if any)
   - Specific concerns or red flags from both VirusTotal and Observatory

3. Performance Analysis:
   - Overall performance rating
   - Key performance metrics and their implications
   - Accessibility and SEO considerations

4. Actionable Recommendations:
   - Security improvements (if needed) - include both malware protection AND security headers/configurations
   - Performance optimizations
   - Best practices to implement

5. Conclusion: Final verdict on whether the URL is safe to use and performs well.

IMPORTANT FORMATTING INSTRUCTIONS:
- Use simple text formatting with headers (use # for headers) and bullet points (use - for lists)
- DO NOT use double asterisks for bolding any terms within headers or list items
- DO NOT wrap the entire response in markdown code blocks (do not use triple backticks)
- Keep the report concise, professional, and actionable
- Focus on practical insights rather than raw data
- Ensure ALL scores (Performance, Accessibility, Best Practices, SEO, and Observatory Grade if available) are mentioned in the analysis`;

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

module.exports = {
  refineReport
};
