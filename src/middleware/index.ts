import { Application } from 'filamentjs';
import { AppMeta } from '../meta/index.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

/**
 * Register all middleware
 */
export function registerMiddleware(app: Application<AppMeta>) {
  // Request logging middleware
  app.use(async (req, res, next) => {
    const level = req.endpointMeta.logging.level;

    if (level === 'debug' || level === 'info') {
      logger.info({
        method: req.method,
        path: req.path,
        event: 'request.start',
      });
    }

    await next();
  });

  // Add more middleware here
  // Example: Authentication, rate limiting, etc.
}
