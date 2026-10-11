import { Application } from 'filamentjs';
import { AppMeta } from '../meta/meta-types.js';
import { getLogger, HttpRequestLogData } from '../util/logger.js';

const MODULE = 'h/finalizers';

function logRequest(req: any, res: any) {
  const log = getLogger(MODULE, 'onFinalize');
  const middleware = req.context?._middleware;
  const startTime = middleware?.startTime ?? req._startTime ?? Date.now();
  const duration = Date.now() - startTime;

  if (middleware) {
    middleware.duration = duration;
  }

  const url = req.originalUrl || req.url || req.path || '/';

  const logData: HttpRequestLogData = {
    method: req.method,
    url,
    statusCode: res.statusCode,
    durationMs: duration,
  };

  const logDataStr = `${logData.method} ${logData.url} - ` +
    `${logData.statusCode} (${logData.durationMs}ms)`;

  log.info(logDataStr);
  log.http(logDataStr);
}

/**
 * Register finalizers (always run)
 */
export function registerFinalizers(app: Application<AppMeta>) {
  app.onFinalize(logRequest);
}
