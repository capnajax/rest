import { AppMeta } from './index.js';

/**
 * Default metadata for all endpoints
 * 
 * Individual endpoints can override these values with Partial<AppMeta>
 */
export const defaultMeta: AppMeta = {
  requiresAuth: false,
  rateLimit: 100,
  logging: {
    level: 'info',
  },
  tags: [],
};

/**
 * Common metadata presets for convenience
 */
export const PUBLIC: Partial<AppMeta> = {
  requiresAuth: false,
  rateLimit: 100,
};

export const AUTHENTICATED: Partial<AppMeta> = {
  requiresAuth: true,
  rateLimit: 50,
};
