import { Application } from 'filamentjs';

import { PUBLIC, SESSIONLESS } from '../meta/defaults.js';
import { getLogger } from '../util/logger.js';
import { AppMeta, Context } from '../meta/meta-types.js';
import { isReady } from '../util/readiness.js';
import '../data/query.js'; // for side effects only

import { articleRoutes } from './article.js';
import { oauthRoutes } from './oauth.js';
import { userRoutes } from './user.js';

const MODULE= 'routes';

/**
 * Register all routes
 */
export function registerRoutes(app: Application<AppMeta, Context>) {
  const log = getLogger(MODULE, 'registerRoutes');

  // Health check endpoint
  app.get('/health', PUBLIC, SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/health');
    res.json({
      status: isReady() ? 'healthy' : 'not-ready',
      timestamp: new Date().toISOString()
    });
  });

  // Example endpoint
  app.get('/', PUBLIC, async (req, res) => {
    res.json({
      message: 'Welcome to your Filament API',
      endpoints: {
        health: 'GET /health',
      },
    });
  });

  function registerRouteGroup(
    groupName: string,
    registerFn: (app: Application<AppMeta, Context>) => void
  ) {
    log.info(`Registering ${groupName} routes`);
    registerFn(app);
  }

  registerRouteGroup('article', articleRoutes);
  registerRouteGroup('oauth', oauthRoutes);
  registerRouteGroup('user', userRoutes);

  log.info('All routes registered');
}
