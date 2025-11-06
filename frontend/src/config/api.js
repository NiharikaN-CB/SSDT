/**
 * API Configuration
 * Centralized configuration for API endpoints
 * Supports DUAL MODE:
 *  - Development: Uses package.json proxy (empty base URL)
 *  - Production: Uses environment variable (NGROK URL or production backend)
 */

// Determine API URL based on environment
// In development with proxy: use empty string to let package.json proxy handle routing
// In production build: use REACT_APP_API_URL from .env.production (NGROK URL)
const API_URL = process.env.NODE_ENV === 'production'
  ? (process.env.REACT_APP_API_URL || '')
  : ''; // Empty in development - relies on package.json proxy

/**
 * Get the full API endpoint URL
 * @param {string} path - The API path (e.g., 'api/vt/combined-url-scan' or '/api/vt/combined-url-scan')
 * @returns {string} - The full URL for fetch
 */
export const getApiUrl = (path) => {
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // If API_URL is empty (development mode), return path with leading slash for proxy
  if (!API_URL) {
    return `/${cleanPath}`;
  }

  // Production mode: return full URL
  return `${API_URL}/${cleanPath}`;
};

/**
 * API base URL
 * Use this directly if you need just the base URL
 */
export const API_BASE_URL = API_URL;

/**
 * Check if running in development mode with proxy
 */
export const isUsingProxy = () => !API_URL;

export default {
  getApiUrl,
  API_BASE_URL,
  isUsingProxy,
};
