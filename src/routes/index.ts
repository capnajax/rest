import { Application } from 'filamentjs';
import { AppMeta } from '@/meta/meta-types.ts';
import { PUBLIC, SESSIONLESS } from '@/meta/defaults.ts';
import { userRoutes } from './user.ts';
import { isReady } from '@/util/readiness.ts';

/**
 * Register all routes
 */
export function registerRoutes(app: Application<AppMeta>) {
  // Health check endpoint
  app.get('/health', PUBLIC, SESSIONLESS, async (req, res) => {
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

  userRoutes(app);
}
