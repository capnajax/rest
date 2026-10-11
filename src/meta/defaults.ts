import { AppMeta, Context } from './meta-types.js';
export { roleBased } from './roles.js';

/**
 * Default metadata for all endpoints
 * 
 * Individual endpoints can override these values with Partial<AppMeta>
 */
export const defaultMeta: AppMeta = {
  application: {
    maxRequestSize: 1024 * 1024
  },
  analytics: {
    enabled: false,
  },
  contentTypes: {
    supportedTypes: ['json', 'yaml', 'toml'],
    allowMissingContentType: false
  },
  requiresAuth: true,
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

export const jsonYamlToml:string[] = (() => {
  const result:string[] = [];
  for (const f in ['json', 'yaml', 'toml']) {
    for (const g in ['application', 'text']) {
      result.push(`${g}/${f}`);
    }
  }
  return result;
})();

export const defaultContext: Context = {
  application: {
    observability: undefined
  },
  contentTypes: {
    allowMissingContentType: false,
    defaultType: 'application/json',
    supportedTypes: jsonYamlToml
  }
}

/**
 * Common metadata presets for convenience
 */
export const PUBLIC: Partial<AppMeta> = {
  requiresAuth: false
};

export const ANALYTICS_ENABLED: Partial<AppMeta> = {
  analytics: {
    enabled: true
  }
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
