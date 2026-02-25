import { suite, before, after, it } from 'node:test';
import { Application } from 'filamentjs';
import getPort from 'get-port';
import fetch from 'node-fetch';
import { TestBattery } from 'test-battery';
import { start, stop } from '../../src/index.ts';
import { AppMeta } from '../../src/meta/meta-types.ts';

suite('Example Test', () => {

  let app: Application<AppMeta>;
  let port: number;
  
  const baseUrl = () => `http://localhost:${port}`;

  const getSession = async (cookie?: string) => {
    const response = await fetch(`${baseUrl()}/user/my-session`, {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : undefined,
    });
    return response;
  };
  const createAndPatchSession = async () => {
    const createResponse = await getSession();
    const sessionCookie =
      createResponse.headers.get('set-cookie')?.split(';')[0];

    if (sessionCookie) {
      const patchResponse = await fetch(`${baseUrl()}/user/my-session`, {
        method: 'PATCH',
        headers: {
          Cookie: sessionCookie as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ foo: 'bar' }),
      });
      return patchResponse;
    }
    return null;
  };
  const createPatchAndGetSession = async () => {
    const createResponse = await getSession();
    const sessionCookie =
      createResponse.headers.get('set-cookie')?.split(';')[0];

    if (sessionCookie) {
      const patchResponse = await fetch(`${baseUrl()}/user/my-session`, {
        method: 'PATCH',
        headers: {
          Cookie: sessionCookie as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ foo: 'bar' }),
      });
      return await getSession(sessionCookie);
    }
    return null;
  };

  before(async () => {
    app = await start({port: getPort()}, p => port = p);
  });

  after(async () => {
    await stop(app);
  });

  TestBattery.test('should pass', (battery) => {
    battery.test('1 + 1 = 2').value(1 + 1).value(2).equal;
  });

  TestBattery.test('should work with async', async (battery) => {
    battery.test('result = 42').value(Promise.resolve(42)).value(42).equal;
  });

  TestBattery.test('Create session', async (battery) => {
    const response = await getSession();
    battery.test('Session created ok').value(response.status).value(200).equal;
    battery.test('Session cookie set')
      .value(response.headers.get('set-cookie')).not.nil;
  });

  TestBattery.test('Patch session', async (battery) => {
    const response = await createAndPatchSession();
    const body = await response?.json() as Record<string, any>;
    battery.test('Session patched ok').value(response?.status).value(200).equal;
    battery.test('Content-Type is application/json')
      .value(response?.headers.get('content-type'))
      .value('application/json').equal;
    battery.test('Response body has updated session data')
      .value(body?.session?.data?.foo).value('bar').equal;
  });

  TestBattery.test('Get patched session', async (battery) => {
    const response = await createPatchAndGetSession();
    const body = await response?.json() as Record<string, any>;
    battery.test('Session retrieved ok').value(response?.status).value(200).equal;
    battery.test('Content-Type is application/json')
      .value(response?.headers.get('content-type'))
      .value('application/json').equal;
    battery.test('Response body has updated session data')
      .value(body?.session?.data?.foo).value('bar').equal;
  });

});
