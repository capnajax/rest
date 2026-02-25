import { Application } from 'filamentjs';
import { pino } from 'pino';
import sessionManager from '@/data/sessions.ts';
import { SESSION_REQUIRED } from '@/meta/defaults.ts';
import { AppMeta } from '@/meta/meta-types.ts';
import { Session } from 'node:inspector';

const logger = pino({
  level: process.env.LOG_LEVEL || 'trace',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

async function sessionGet(req: any, res: any) {
  res.json({
    policy: req.endpointMeta.sessionPolicy,
    session: req.context.session,
  });
}
async function sessionDelete(req: any, res: any) {
  if (req.context.session) {
    // no need to await this before responding
    sessionManager.deleteSession(req.context.session.sessionId);
    res.json({
      message: 'Session destroyed',
    });
  } else {
    res.status(401).json({
      error: 'No active session to destroy',
    });
  }
}
async function sessionPatch(req: any, res: any) {
  // Extend the session expiration
  let body;

  try {
    body = await req.context.body();
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  if (await sessionManager.patchSession(
    req.context.session.sessionId,
    body as Record<string, unknown>
  )) {
    // refresh session data from session manager in case it was modified there
    req.context.session = await sessionManager.getSession(
      req.context.session.sessionId
    ) as unknown as Session;
    res.json({
      message: `Session patched`,
      session: req.context.session,
    });
  }
}

export function userRoutes(app: Application<AppMeta>) {

  app.get('/user/my-session', SESSION_REQUIRED, sessionGet);
  app.get('/user/my-session/no-touch',
    {sessionPolicy: {createAnonymous: true, extendOnRequest: false}},
    sessionGet
  );

  app.delete('/user/my-session', sessionDelete);

  app.patch('/user/my-session', SESSION_REQUIRED, sessionPatch);
  app.patch('/user/my-session/no-touch',
    {sessionPolicy: {createAnonymous: true, extendOnRequest: false}},
    sessionPatch
  );
}

