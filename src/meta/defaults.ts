import { AppMeta } from './meta-types.ts';
export { roleBased } from './roles.ts';

/**
 * Default metadata for all endpoints
 * 
 * Individual endpoints can override these values with Partial<AppMeta>
 */
export const defaultMeta: AppMeta = {
  contentTypes: {
    supportedTypes: ['json', 'yaml', 'toml'],
    allowMissingContentType: false
  },
  requiresAuth: true,
  rateLimit: 100,
  logging: {
    level: 'info',
  },
  sessionPolicy: {
    createAnonymous: false,
    extendOnRequest: true
  },
  tags: [],
  roles: {
    endpoint: []
  }
};

/**
 * Common metadata presets for convenience
 */
export const PUBLIC: Partial<AppMeta> = {
  requiresAuth: false
};

export const AUTHENTICATED: Partial<AppMeta> = {
  requiresAuth: true
};

export const SESSIONLESS: Partial<AppMeta> = {
  sessionPolicy: null
};

export const SESSION_REQUIRED: Partial<AppMeta> = {
  sessionPolicy: {
    createAnonymous: true
  } as Partial<AppMeta>['sessionPolicy']
};
