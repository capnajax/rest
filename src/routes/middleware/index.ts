import { Application } from 'filamentjs';
import { AppMeta, Context } from '../../meta/meta-types.js';
import sessionManager from '../../data/sessions.js';
import { parseContentMiddleware } from './parse-body.js';
import { getLogger } from '../../util/logger.js';

const MODULE = 'middleware';

/**
 * Register all middleware
 */
export function registerMiddleware(app: Application<AppMeta, Context>) {

  // parse cookies middleware
  app.use(async (req, res) => {
    const log = getLogger(MODULE, 'parseCookies');
    log.verbose('Parsing cookies');
    let cookieHeader = req.headers.get('Cookie');
    req.context.cookies = {};
    if (cookieHeader) {
      if (!Array.isArray(cookieHeader)) {
        cookieHeader = [cookieHeader];
      }
      for (const header of cookieHeader) {
        // Handle case where cookie header is a string
        header.split(';').forEach(cookie => {
          const [name, ...rest] = cookie.trim().split('=');
          (req.context.cookies as Record<string, string>)[name] =
            rest.join('=');
        });
      }
    }
  });

  // Session management middleware
  app.use(async (req, res) => {
    const log = getLogger(MODULE, 'sessionManagement');
    log.verbose('Managing session. Policy: %o', 
      req.endpointMeta.sessionPolicy
    );

    const newSession = async () => {
      log.verbose(' --> newSession');
      const session = await sessionManager.createSession(null);
      res.headers.set('Set-Cookie',
        `session=${session.sessionId}; HttpOnly; Path=/;`);
    }

    const getSession = async () => {
      log.verbose(' --> getSession');
      const sessionCookie = req.context.cookies?.session;
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
  });

  parseContentMiddleware(app);

}
