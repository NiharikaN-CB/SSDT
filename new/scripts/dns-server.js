import { promises as dnsPromises } from 'dns';
import axios from 'axios';
import middleware from './_common/middleware.js';

// Timeout wrapper for promises
const withTimeout = (promise, ms, message = 'Operation timed out') => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    )
  ]);
};

const dnsHandler = async (url) => {
  try {
    // Parse domain - handle both full URLs and bare domains
    let domain;
    try {
      const parsed = new URL(url);
      domain = parsed.hostname;
    } catch {
      domain = url.replace(/^(?:https?:\/\/)?/i, '').split('/')[0];
    }

    // Resolve IP addresses with timeout (10 seconds)
    const addresses = await withTimeout(
      dnsPromises.resolve4(domain),
      10000,
      `DNS resolution timed out for ${domain}`
    );

    // Process each address with individual timeouts
    const results = await Promise.all(addresses.map(async (address) => {
      // Reverse lookup with 5 second timeout
      let hostname = null;
      try {
        hostname = await withTimeout(
          dnsPromises.reverse(address),
          5000,
          'Reverse lookup timed out'
        );
      } catch (error) {
        // Reverse lookup failed or timed out
        hostname = null;
      }

      // Check DoH support with 3 second timeout
      let dohDirectSupports = false;
      try {
        await axios.get(`https://${address}/dns-query`, { timeout: 3000 });
        dohDirectSupports = true;
      } catch (error) {
        dohDirectSupports = false;
      }

      return {
        address,
        hostname,
        dohDirectSupports,
      };
    }));

    return {
      domain,
      dns: results,
    };
  } catch (error) {
    // Handle timeout errors gracefully
    if (error.message.includes('timed out')) {
      return {
        error: error.message,
        partial: true,
        message: 'DNS lookup took too long. The DNS server may be slow to respond.'
      };
    }
    throw new Error(`An error occurred while resolving DNS. ${error.message}`);
  }
};


export const handler = middleware(dnsHandler);
export default handler;
