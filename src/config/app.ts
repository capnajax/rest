/**
 * Application configuration
 */

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
};

/**
 * Validate required environment variables
 */
export function validateConfig() {
  // Add validation for required env vars here
  return true;
}
