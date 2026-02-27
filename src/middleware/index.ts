import { Application } from 'filamentjs';
import { AppMeta } from '@/meta/meta-types.ts';
import sessionManager from '@/data/sessions.ts';
import { parseContentMiddleware } from './parse-body.ts';
import { getLogger } from '@/util/logger.ts';

const MODULE = 'middleware';

/**
 * Register all middleware
 */
export function registerMiddleware(app: Application<AppMeta>) {

  // Request logging middleware
  app.use(async (req, res, next) => {
    const log = getLogger(MODULE, 'requestLogging');
    log.verbose('Logging request');
    const level = req.endpointMeta.logging.level;

    req.context._middleware = {
      startTime: Date.now(),
      request: `\x1b[36m${req.method} \x1b[33m${req.path}\x1b[0m`,
    }

    await next();
  });

  // parse cookies middleware
  app.use(async (req, res, next) => {
    const log = getLogger(MODULE, 'parseCookies');
    log.verbose('Parsing cookies');
    let cookieHeader = req.headers['cookie'];
    req.context.cookies = {};
    if (cookieHeader) {
      if (!Array.isArray(cookieHeader)) {
        cookieHeader = [cookieHeader];
      }
      for (const header of cookieHeader) {
        // Handle case where cookie header is a string
        header.split(';').forEach(cookie => {
          const [name, ...rest] = cookie.trim().split('=');
          req.context.cookies[name] = rest.join('=');
        });
      }
    }
    await next();
  });

  // Session management middleware
  app.use(async (req, res, next) => {
    const log = getLogger(MODULE, 'sessionManagement');
    log.verbose('Managing session. Policy: %o', 
      req.endpointMeta.sessionPolicy
    );

    const newSession = async () => {
      log.verbose(' --> newSession');
      const session = await sessionManager.createSession(null);
      res.setHeader('Set-Cookie',
        `session=${session.sessionId}; HttpOnly; Path=/;`);
    }

    const getSession = async () => {
      log.verbose(' --> getSession');
      const sessionCookie = req.context.cookies.session;
      if (!sessionCookie) {
        log.verbose('   --> no session cookie found');
        return null;
      }
      const session = await sessionManager.getSession(sessionCookie);
      log.verbose('   --> session found: %o', session);      
      if (session && req.endpointMeta.sessionPolicy?.extendOnRequest) {
        log.verbose('   --> extending session');      
        session.extend();
        log.verbose('   --> session extended');      
      }
      req.context.session = await sessionManager.getSession(sessionCookie);
      log.verbose('   --> session attached to context: %o', req.context.session?.serialize());

      return session;
    }

    if (req.endpointMeta.sessionPolicy === null) {
      req.context.session = null;
    } else {
      if (req.endpointMeta.sessionPolicy.createAnonymous) {
        // Create an anonymous session if one doesn't exist
        await getSession() || await newSession();
      } else {
        // Only use session if session cookie is present
        await getSession() || (req.context.session = null);
      }
    }

    log.verbose('session attached to context: %o', req.context.session?.serialize());

    await next();

  });

  parseContentMiddleware(app);

}
