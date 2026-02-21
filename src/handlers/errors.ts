import { Application } from 'filamentjs';
import { AppMeta } from '../meta/index.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Register error handlers
 */
export function registerErrorHandlers(app: Application<AppMeta>) {
  app.onError(async (err, req, res) => {
    const level = req.endpointMeta.logging.level;

    if (level === 'debug' || level === 'error') {
      logger.error({
        error: err.message,
        stack: err.stack,
        method: req.method,
        path: req.path,
      });
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  });
}
