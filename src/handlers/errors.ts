import { Application, HttpError } from 'filamentjs';
import { AppMeta } from '../meta/meta-types.js';
import { getLogger } from '../util/logger.js';

const MODULE = 'h.errors';

/**
 * Register error handlers
 */
export function registerErrorHandlers(app: Application<AppMeta>) {
  app.onError(async (err, req, res) => {
    const log = getLogger(MODULE, 'onError');
    const level = req.endpointMeta.logging.level;

    if (level === 'debug' || level === 'error') {
      log.error({
        error: err.message,
        stack: err.stack,
        method: req.method,
        path: req.path,
      });
    }

    if (!res.headers.frozen) {
      const statusCode = err instanceof HttpError ? err.statusCode : 500;
      res.status(statusCode).json({
        error: statusCode < 500 ? err.message : 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  });
}
