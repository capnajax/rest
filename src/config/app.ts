/**
 * Application configuration
 */

export interface AppConfig {
  port: number | Promise<number>;
  nodeEnv: string;
  logLevel: string;

  sessions: {
    duration: number;
  }
}

export const appConfig:AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  sessions: {
    duration: 1000 * 60 * 60 * 24, // 1 day
  }
};

/**
 * Validate required environment variables
 */
export function validateConfig() {
  // Add validation for required env vars here
  return true;
}
