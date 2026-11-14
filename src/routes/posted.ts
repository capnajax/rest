import { Application, createRouteContext, Request, Response } from 'filamentjs';
import { ANALYTICS_ENABLED, LOG_ERRORS, PUBLIC } from '../meta/defaults.js';
import { AppMeta } from '../meta/meta-types.js';
import { getLogger } from '../util/logger.js';

const MODULE = 'r.posted';
const BASEPATH = '/posted';

export function postedRoutes(app: Application<AppMeta>) {
  const log = getLogger(MODULE, 'mediaRoutes');
  const ctx = createRouteContext(app, BASEPATH, ANALYTICS_ENABLED);

  ctx.get(
    '/:path*',
    ANALYTICS_ENABLED, PUBLIC, LOG_ERRORS, 
    (req: Request, res: Response) => {
      const path = req.params.path;
      res.statusCode = 301;
      res.headers.set('Location', `/v3/media/${path}`);
      res.end();
    }
  );

  log.info('Posted routes registered');
}
