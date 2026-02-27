import { Application } from 'filamentjs';
import { AppMeta } from '@/meta/meta-types.ts';
import { getLogger } from '@/util/logger.ts';

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

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  });
}
