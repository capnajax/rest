import { Application } from 'filamentjs';
import { AppMeta } from '@/meta/meta-types.ts';
import { getLogger, HttpRequestLogData } from '@/util/logger.ts';

const MODULE = 'h/finalizers';

function logRequest(req: any, res: any) {
  const log = getLogger(MODULE, 'onFinalize');
  const duration = Date.now() - (req._startTime || Date.now());

  if (req.context._middleware) {
    req.context._middleware.duration =
      Date.now() - req.context._middleware.startTime;
  }

  const logData:HttpRequestLogData = {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    durationMs: duration,
  };

  log.http(logData);
}

/**
 * Register finalizers (always run)
 */
export function registerFinalizers(app: Application<AppMeta>) {
  app.onFinalize(logRequest);
}
