import { Application } from 'filamentjs';
import { AppMeta } from '../meta/index.js';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Register finalizers (always run)
 */
export function registerFinalizers(app: Application<AppMeta>) {
  app.onFinalize(async (req, res) => {
    const duration = Date.now() - (req._startTime || Date.now());
    const level = req.endpointMeta.logging.level;

    if (level === 'debug' || level === 'info') {
      logger.info({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        event: 'request.complete',
      });
    }
  });
}
