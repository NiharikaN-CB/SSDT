import puppeteer from 'puppeteer-core';
import middleware from './_common/middleware.js';

/**
 * Tech Stack Detection - Using Puppeteer directly with header/script analysis
 * Fallback approach that doesn't rely on Wappalyzer's bundled Chromium
 */

// Common technology patterns to detect
const techPatterns = {
  // JavaScript Frameworks
  'React': { scripts: ['/react', 'react.js', 'react.min.js'], globals: ['React', 'ReactDOM'] },
  'Vue.js': { scripts: ['/vue', 'vue.js', 'vue.min.js'], globals: ['Vue'] },
  'Angular': { scripts: ['angular', 'ng-'], globals: ['angular', 'ng'] },
  'jQuery': { scripts: ['jquery'], globals: ['jQuery', '$'] },
  'Next.js': { scripts: ['_next'], meta: { generator: 'Next.js' } },
  'Nuxt.js': { scripts: ['_nuxt'], globals: ['$nuxt'] },
  'Svelte': { scripts: ['svelte'] },

  // CMS
  'WordPress': { meta: { generator: 'WordPress' }, paths: ['/wp-content/', '/wp-includes/'] },
  'Drupal': { meta: { generator: 'Drupal' }, paths: ['/sites/default/', '/modules/'] },
  'Joomla': { meta: { generator: 'Joomla' } },
  'Shopify': { globals: ['Shopify'], headers: { 'x-shopify-stage': true } },
  'Wix': { scripts: ['wix.com'], meta: { generator: 'Wix' } },
  'Squarespace': { scripts: ['squarespace'] },

  // Analytics
  'Google Analytics': { scripts: ['google-analytics.com', 'googletagmanager.com', 'gtag'] },
  'Google Tag Manager': { scripts: ['googletagmanager.com/gtm.js'] },
  'Facebook Pixel': { scripts: ['connect.facebook.net'] },
  'Hotjar': { scripts: ['hotjar.com'] },

  // CDN/Hosting
  'Cloudflare': { headers: { 'cf-ray': true, 'server': 'cloudflare' } },
  'AWS': { headers: { 'x-amz-cf-id': true, 'server': 'AmazonS3' } },
  'Vercel': { headers: { 'x-vercel-id': true, 'server': 'Vercel' } },
  'Netlify': { headers: { 'x-nf-request-id': true, 'server': 'Netlify' } },

  // Web Servers
  'Nginx': { headers: { 'server': 'nginx' } },
  'Apache': { headers: { 'server': 'Apache' } },
  'IIS': { headers: { 'server': 'Microsoft-IIS' } },

  // UI Frameworks
  'Bootstrap': { scripts: ['bootstrap'], classes: ['container', 'row', 'col-'] },
  'Tailwind CSS': { classes: ['flex', 'grid', 'px-', 'py-', 'text-'] },
  'Material-UI': { scripts: ['@material-ui', '@mui'] },

  // Security
  'reCAPTCHA': { scripts: ['recaptcha', 'grecaptcha'] },
  'hCaptcha': { scripts: ['hcaptcha'] },
};

const techStackHandler = async (url) => {
  console.log(`[TECH-STACK] Starting analysis for: ${url}`);

  let browser = null;
  const detectedTech = [];

  try {
    // Launch browser with system Chromium
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // Collect response headers
    let responseHeaders = {};
    page.on('response', response => {
      if (response.url() === url || response.url() === url + '/') {
        responseHeaders = response.headers();
      }
    });

    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Get page content
    const pageData = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src]'))
        .map(s => s.src);
      const inlineScripts = Array.from(document.querySelectorAll('script:not([src])'))
        .map(s => s.textContent).join(' ');
      const metas = {};
      document.querySelectorAll('meta[name], meta[property]').forEach(m => {
        const key = m.getAttribute('name') || m.getAttribute('property');
        metas[key] = m.getAttribute('content');
      });
      const html = document.documentElement.outerHTML;
      const globals = Object.keys(window).slice(0, 100); // First 100 globals

      return { scripts, inlineScripts, metas, html, globals };
    });

    // Detect technologies
    for (const [techName, patterns] of Object.entries(techPatterns)) {
      let detected = false;
      let confidence = 0;
      const evidence = [];

      // Check scripts
      if (patterns.scripts) {
        for (const script of pageData.scripts) {
          if (patterns.scripts.some(p => script.toLowerCase().includes(p.toLowerCase()))) {
            detected = true;
            confidence += 30;
            evidence.push(`Script: ${script.substring(0, 50)}`);
            break;
          }
        }
      }

      // Check inline scripts
      if (patterns.scripts && pageData.inlineScripts) {
        for (const pattern of patterns.scripts) {
          if (pageData.inlineScripts.toLowerCase().includes(pattern.toLowerCase())) {
            detected = true;
            confidence += 20;
            evidence.push(`Inline script contains: ${pattern}`);
            break;
          }
        }
      }

      // Check meta tags
      if (patterns.meta) {
        for (const [metaKey, metaValue] of Object.entries(patterns.meta)) {
          const pageMetaValue = pageData.metas[metaKey] || '';
          if (pageMetaValue.toLowerCase().includes(metaValue.toLowerCase())) {
            detected = true;
            confidence += 40;
            evidence.push(`Meta ${metaKey}: ${pageMetaValue}`);
          }
        }
      }

      // Check globals
      if (patterns.globals) {
        for (const global of patterns.globals) {
          if (pageData.globals.includes(global)) {
            detected = true;
            confidence += 30;
            evidence.push(`Global: ${global}`);
            break;
          }
        }
      }

      // Check headers
      if (patterns.headers) {
        for (const [headerKey, headerValue] of Object.entries(patterns.headers)) {
          const responseHeaderValue = responseHeaders[headerKey.toLowerCase()];
          if (responseHeaderValue) {
            if (headerValue === true || responseHeaderValue.toLowerCase().includes(headerValue.toLowerCase())) {
              detected = true;
              confidence += 40;
              evidence.push(`Header ${headerKey}: ${responseHeaderValue}`);
            }
          }
        }
      }

      // Check HTML for paths
      if (patterns.paths) {
        for (const pathPattern of patterns.paths) {
          if (pageData.html.includes(pathPattern)) {
            detected = true;
            confidence += 25;
            evidence.push(`Path found: ${pathPattern}`);
            break;
          }
        }
      }

      if (detected) {
        detectedTech.push({
          name: techName,
          confidence: Math.min(confidence, 100),
          evidence: evidence.slice(0, 3) // Limit evidence
        });
      }
    }

    // Sort by confidence
    detectedTech.sort((a, b) => b.confidence - a.confidence);

    console.log(`[TECH-STACK] Detected ${detectedTech.length} technologies`);

    if (detectedTech.length === 0) {
      throw new Error('Unable to find any technologies for site');
    }

    return {
      url: url,
      technologies: detectedTech.map(t => ({
        name: t.name,
        confidence: t.confidence,
        categories: [getCategoryForTech(t.name)]
      }))
    };

  } catch (error) {
    console.error(`[TECH-STACK] Error: ${error.message}`);
    throw new Error(error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

// Helper to categorize technologies
function getCategoryForTech(techName) {
  const categories = {
    'React': 'JavaScript framework',
    'Vue.js': 'JavaScript framework',
    'Angular': 'JavaScript framework',
    'jQuery': 'JavaScript library',
    'Next.js': 'JavaScript framework',
    'Nuxt.js': 'JavaScript framework',
    'Svelte': 'JavaScript framework',
    'WordPress': 'CMS',
    'Drupal': 'CMS',
    'Joomla': 'CMS',
    'Shopify': 'E-commerce',
    'Wix': 'Website builder',
    'Squarespace': 'Website builder',
    'Google Analytics': 'Analytics',
    'Google Tag Manager': 'Tag manager',
    'Facebook Pixel': 'Analytics',
    'Hotjar': 'Analytics',
    'Cloudflare': 'CDN',
    'AWS': 'Cloud hosting',
    'Vercel': 'PaaS',
    'Netlify': 'PaaS',
    'Nginx': 'Web server',
    'Apache': 'Web server',
    'IIS': 'Web server',
    'Bootstrap': 'CSS framework',
    'Tailwind CSS': 'CSS framework',
    'Material-UI': 'UI framework',
    'reCAPTCHA': 'Security',
    'hCaptcha': 'Security'
  };
  return categories[techName] || 'Other';
}

export const handler = middleware(techStackHandler);
export default handler;
