/**
 * API Configuration
 * Centralized configuration for API endpoints
 * Uses environment variables to support different deployment environments
 */

// Get the API URL from environment variables
// Falls back to localhost if not set (for development without .env file)
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Get the full API endpoint URL
 * @param {string} path - The API path (e.g., '/api/vt/combined-url-scan')
 * @returns {string} - The full URL
 */
export const getApiUrl = (path) => {
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_URL}/${cleanPath}`;
};

/**
 * API base URL
 * Use this directly if you need just the base URL
 */
export const API_BASE_URL = API_URL;

export default {
  getApiUrl,
  API_BASE_URL,
};
