import { FrameworkMeta } from 'filamentjs';

/**
 * Application metadata interface
 * 
 * Extend this interface to add your own metadata properties.
 * Middleware can inspect req.endpointMeta to make decisions.
 */
export interface AppMeta extends FrameworkMeta {
  /**
   * Whether this endpoint requires authentication
   */
  requiresAuth: boolean;

  /**
   * Rate limit for this endpoint (requests per minute)
   */
  rateLimit: number;

  /**
   * Logging configuration
   */
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };

  /**
   * Tags for categorizing endpoints
   */
  tags: string[];
}
