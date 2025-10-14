const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Refine and combine VirusTotal and PageSpeed reports using Gemini AI
 * @param {Object} vtReport - VirusTotal scan result
 * @param {Object} psiReport - PageSpeed Insights report
 * @param {string} url - The scanned URL
 * @returns {Promise<string>} - AI-generated refined report in Markdown format
 */
async function refineReport(vtReport, psiReport, url) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables');
    }

    // Initialize Gemini AI
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

Task:
Generate a comprehensive, professional analysis report that includes:

1. Executive Summary (2-3 sentences): Overall assessment of the URL's security and performance.

2. Security Analysis:
   - Risk level (Low/Medium/High) based on VirusTotal results
   - Key security findings and threats detected (if any)
   - Specific concerns or red flags

3. Performance Analysis:
   - Overall performance rating
   - Key performance metrics and their implications
   - Accessibility and SEO considerations

4. Actionable Recommendations:
   - Security improvements (if needed)
   - Performance optimizations
   - Best practices to implement

5. Conclusion: Final verdict on whether the URL is safe to use and perform well.

IMPORTANT FORMATTING INSTRUCTIONS:
- Use simple text formatting with headers (use # for headers) and bullet points (use - for lists)
- DO NOT use double asterisks for bolding any terms within headers or list items
- DO NOT wrap the entire response in markdown code blocks (do not use triple backticks)
- Keep the report concise, professional, and actionable
- Focus on practical insights rather than raw data
- Ensure ALL scores (Performance, Accessibility, Best Practices, SEO) are mentioned in the analysis`;

    // Generate the refined report
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const refinedReport = response.text();

    return refinedReport;
  } catch (error) {
    console.error('Error generating refined report with Gemini:', error.message);

    if (error.message?.includes('API key')) {
      throw new Error('Gemini API authentication failed. Please check your API key.');
    } else {
      throw new Error(`Gemini service error: ${error.message}`);
    }
  }
}

module.exports = {
  refineReport
};
