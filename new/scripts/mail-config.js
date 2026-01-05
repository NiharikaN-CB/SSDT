import dns from 'dns';
import middleware from './_common/middleware.js';

// Use promises API for DNS
const dnsPromises = dns.promises;

const mailConfigHandler = async (url) => {
  try {
    // Parse domain from URL - handle both full URLs and bare domains
    let domain;
    try {
      // Try to parse as full URL first
      const parsed = new URL(url);
      domain = parsed.hostname;
    } catch {
      // If not a valid URL, treat it as a bare domain
      // Remove any protocol prefix and path
      domain = url.replace(/^(?:https?:\/\/)?/i, '').split('/')[0];
    }

    if (!domain) {
      throw new Error('Could not extract domain from URL');
    }

    // Get MX records
    let mxRecords = [];
    try {
      mxRecords = await dnsPromises.resolveMx(domain);
    } catch (e) {
      // No MX records
    }

    // Get TXT records
    let txtRecords = [];
    try {
      txtRecords = await dnsPromises.resolveTxt(domain);
    } catch (e) {
      // No TXT records
    }

    // Filter for only email related TXT records (SPF, DKIM, DMARC, and certain provider verifications)
    const emailTxtRecords = txtRecords.filter(record => {
      const recordString = record.join('');
      return (
        recordString.startsWith('v=spf1') ||
        recordString.startsWith('v=DKIM1') ||
        recordString.startsWith('v=DMARC1') ||
        recordString.startsWith('protonmail-verification=') ||
        recordString.startsWith('google-site-verification=') || // Google Workspace
        recordString.startsWith('MS=') || // Microsoft 365
        recordString.startsWith('zoho-verification=') || // Zoho
        recordString.startsWith('titan-verification=') || // Titan
        recordString.includes('bluehost.com') // BlueHost
      );
    });

    // Identify specific mail services
    const mailServices = emailTxtRecords.map(record => {
      const recordString = record.join('');
      if (recordString.startsWith('protonmail-verification=')) {
        return { provider: 'ProtonMail', value: recordString.split('=')[1] };
      } else if (recordString.startsWith('google-site-verification=')) {
        return { provider: 'Google Workspace', value: recordString.split('=')[1] };
      } else if (recordString.startsWith('MS=')) {
        return { provider: 'Microsoft 365', value: recordString.split('=')[1] };
      } else if (recordString.startsWith('zoho-verification=')) {
        return { provider: 'Zoho', value: recordString.split('=')[1] };
      } else if (recordString.startsWith('titan-verification=')) {
        return { provider: 'Titan', value: recordString.split('=')[1] };
      } else if (recordString.includes('bluehost.com')) {
        return { provider: 'BlueHost', value: recordString };
      } else {
        return null;
      }
    }).filter(record => record !== null);

    // Check MX records for Yahoo
    const yahooMx = mxRecords.filter(record => record.exchange.includes('yahoodns.net'));
    if (yahooMx.length > 0) {
      mailServices.push({ provider: 'Yahoo', value: yahooMx[0].exchange });
    }
    // Check MX records for Mimecast
    const mimecastMx = mxRecords.filter(record => record.exchange.includes('mimecast.com'));
    if (mimecastMx.length > 0) {
      mailServices.push({ provider: 'Mimecast', value: mimecastMx[0].exchange });
    }

    return {
      domain,
      mxRecords,
      txtRecords: emailTxtRecords,
      mailServices,
    };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return { skipped: 'No mail server in use on this domain' };
    } else {
      throw new Error(error.message);
    }
  }
};

export const handler = middleware(mailConfigHandler);
export default handler;
