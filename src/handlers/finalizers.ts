import { Application } from 'filamentjs';
import { AppMeta } from '@/meta/meta-types.ts';
import { pino } from 'pino';

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
 * Register finalizers (always run)
 */
export function registerFinalizers(app: Application<AppMeta>) {
  app.onFinalize(async (req, res) => {
    const duration = Date.now() - (req._startTime || Date.now());
    const level = req.endpointMeta.logging.level;

    const m = req.context._middleware || {};
    m.duration = m.startTime ? Date.now() - m.startTime : undefined;

    if (req.context._middleware) {
      req.context._middleware.duration =
        Date.now() - req.context._middleware.startTime;
    }

    if (level === 'debug' || level === 'info') {
      logger.info(`${m.request} - ${res.statusCode} - ${duration && `${duration}ms`}`);
    }
  });
}
