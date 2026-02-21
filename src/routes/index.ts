import { Application } from 'filamentjs';
import { AppMeta } from '../meta/index.js';
import { PUBLIC } from '../meta/defaults.js';

/**
 * Register all routes
 */
export function registerRoutes(app: Application<AppMeta>) {
  // Health check endpoint
  app.get('/health', PUBLIC, async (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
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
}
