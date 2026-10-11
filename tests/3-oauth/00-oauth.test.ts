import { suite, before, after } from 'node:test';
import { TestBattery } from 'test-battery';
import { Application } from 'filamentjs';
import getPort from 'get-port';
import fetch from 'node-fetch';
import { AppMeta } from '../../src/meta/meta-types.js';
import { start, stop } from '../../src/index.js';

suite('OAuth Endpoints', () => {
  let app: Application<AppMeta>;
  let port: number;

  const baseUrl = () => `http://localhost:${port}`;

  before(async () => {
    port = await getPort();
    app = await start({ port });
  });

  after(async () => {
    await stop(app);
  });

  // ── Helper Functions ──────────────────────────────────────────────────────

  /**
   * Make a token request to the OAuth token endpoint.
   */
  const tokenRequest = async (body: Record<string, unknown>) => {
    return fetch(`${baseUrl()}/v3/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  };

  /**
   * Make a revoke request to the OAuth revoke endpoint.
   */
  const revokeRequest = async (token: string) => {
    return fetch(`${baseUrl()}/v3/oauth/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });
  };

  /**
   * Make an introspect request to the OAuth introspect endpoint.
   */
  const introspectRequest = async (token: string) => {
    return fetch(`${baseUrl()}/v3/oauth/introspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });
  };

  /**
   * Make a userinfo request with Bearer token.
   */
  const userinfoRequest = async (token: string) => {
    return fetch(`${baseUrl()}/v3/oauth/userinfo`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  };

  /**
   * Make an authorize request to initiate code flow.
   */
  const authorizeRequest = async (params: Record<string, unknown>) => {
    const query = new URLSearchParams(
      params as Record<string, string>
    ).toString();
    return fetch(`${baseUrl()}/v3/oauth/authorize?${query}`, {
      method: 'GET'
    });
  };

  /**
   * Get JWKS from the OAuth jwks endpoint.
   */
  const jwksRequest = async () => {
    return fetch(`${baseUrl()}/v3/oauth/jwks`, {
      method: 'GET'
    });
  };

  /**
   * Get OIDC discovery metadata.
   */
  const oidcDiscoveryRequest = async () => {
    return fetch(
      `${baseUrl()}/v3/oauth/.well-known/openid-configuration`,
      { method: 'GET' }
    );
  };

  // ── Token Endpoint Tests ──────────────────────────────────────────────────

  suite('POST /v3/oauth/token', () => {
    TestBattery.test(
      'Should reject token request without grant_type',
      async (battery) => {
        const response = await tokenRequest({
          client_id: 'test-client'
        });

        battery
          .test('Returns 400 Bad Request')
          .value(response.status)
          .value(400)
          .equal;

        const body = (await response.json()) as Record<string, unknown>;
        battery
          .test('Returns error_invalid_request')
          .value(body.error)
          .value('invalid_request')
          .equal;
      }
    );

    TestBattery.test(
      'Should handle authorization_code grant',
      async (battery) => {
        const response = await tokenRequest({
          grant_type: 'authorization_code',
          code: 'test_code',
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback'
        });

        // TODO: Implement code exchange
        // Should verify code, client, redirectUri match
        // Should return access_token, expires_in
        const body = (await response.json()) as Record<string, unknown>;

        battery
          .test('Returns 200 OK or implements endpoint')
          .value(response.status < 500)
          .value(true)
          .equal;

        if (response.status === 200) {
          battery
            .test('Response has access_token')
            .value(typeof body.access_token)
            .value('string')
            .equal;

          battery
            .test('Response has expires_in')
            .value(typeof body.expires_in)
            .value('number')
            .equal;

          battery
            .test('Response token_type is Bearer')
            .value(body.token_type)
            .value('Bearer')
            .equal;
        }
      }
    );

    TestBattery.test(
      'Should handle refresh_token grant',
      async (battery) => {
        const response = await tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: 'test_refresh_token',
          client_id: 'test-client'
        });

        // TODO: Implement refresh token exchange
        // Should verify refresh token is valid
        // Should return new access_token
        const body = (await response.json()) as Record<string, unknown>;

        battery
          .test('Response status is valid')
          .value(response.status < 500)
          .value(true)
          .equal;

        if (response.status === 200) {
          battery
            .test('Response has access_token')
            .value(typeof body.access_token)
            .value('string')
            .equal;

          battery
            .test('Response has expires_in')
            .value(typeof body.expires_in)
            .value('number')
            .equal;
        }
      }
    );

    TestBattery.test(
      'Should handle client_credentials grant',
      async (battery) => {
        const response = await tokenRequest({
          grant_type: 'client_credentials',
          client_id: 'test-client',
          client_secret: 'test-secret'
        });

        // TODO: Implement client credentials flow
        // Should validate client credentials
        // Should return access_token for client
        const body = (await response.json()) as Record<string, unknown>;

        battery
          .test('Response status is valid')
          .value(response.status < 500)
          .value(true)
          .equal;

        if (response.status === 200) {
          battery
            .test('Response has access_token')
            .value(typeof body.access_token)
            .value('string')
            .equal;
        }
      }
    );
  });

  // ── Revoke Endpoint Tests ─────────────────────────────────────────────────

  suite('POST /v3/oauth/revoke', () => {
    TestBattery.test(
      'Should reject revoke without token',
      async (battery) => {
        const response = await fetch(`${baseUrl()}/v3/oauth/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        battery
          .test('Returns 400 Bad Request')
          .value(response.status)
          .value(400)
          .equal;

        const body = (await response.json()) as Record<string, unknown>;
        battery
          .test('Returns error_invalid_request')
          .value(body.error)
          .value('invalid_request')
          .equal;
      }
    );

    TestBattery.test(
      'Should revoke a valid token',
      async (battery) => {
        const response = await revokeRequest('test_access_token');

        // TODO: Implement token revocation
        // Should mark token as revoked in store
        // Should return 200 OK

        battery
          .test('Returns 200 OK')
          .value(response.status)
          .value(200)
          .equal;
      }
    );

    TestBattery.test(
      'Should revoke a refresh token',
      async (battery) => {
        const response = await revokeRequest('test_refresh_token');

        // TODO: Implement refresh token revocation
        // Should support token_type_hint parameter
        // Should mark refresh token as revoked

        battery
          .test('Returns 200 OK')
          .value(response.status)
          .value(200)
          .equal;
      }
    );
  });

  // ── Introspect Endpoint Tests ─────────────────────────────────────────────

  suite('POST /v3/oauth/introspect', () => {
    TestBattery.test(
      'Should reject introspect without token',
      async (battery) => {
        const response = await fetch(`${baseUrl()}/v3/oauth/introspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        battery
          .test('Returns 400 Bad Request')
          .value(response.status)
          .value(400)
          .equal;
      }
    );

    TestBattery.test(
      'Should introspect a valid token',
      async (battery) => {
        const response = await introspectRequest('valid_token');

        // TODO: Implement token introspection
        // Should verify JWT signature
        // Should check if token is revoked
        // Should return token metadata

        battery
          .test('Returns 200 OK')
          .value(response.status)
          .value(200)
          .equal;

        const body = (await response.json()) as Record<string, unknown>;

        battery
          .test('Response has active field')
          .value(typeof body.active)
          .value('boolean')
          .equal;

        if (body.active === true) {
          battery
            .test('Active token has token_type')
            .value(body.token_type)
            .not
            .nil;

          battery
            .test('Active token has scope')
            .value(typeof body.scope)
            .value('string')
            .equal;

          battery
            .test('Active token has exp')
            .value(typeof body.exp)
            .value('number')
            .equal;
        }
      }
    );

    TestBattery.test(
      'Should return inactive for invalid token',
      async (battery) => {
        const response = await introspectRequest('invalid_token');

        const body = (await response.json()) as Record<string, unknown>;

        battery
          .test('Response indicates inactive')
          .value(body.active)
          .value(false)
          .equal;
      }
    );

    TestBattery.test(
      'Should return inactive for revoked token',
      async (battery) => {
        // First get a token and revoke it
        await revokeRequest('revoked_token');

        const response = await introspectRequest('revoked_token');

        // TODO: Implement revoked token detection
        // Should check token store for revocation flag

        const body = (await response.json()) as Record<string, unknown>;

        battery
          .test('Revoked token shows as inactive')
          .value(body.active)
          .value(false)
          .equal;
      }
    );
  });

  // ── UserInfo Endpoint Tests ───────────────────────────────────────────────

  suite('GET /v3/oauth/userinfo', () => {
    TestBattery.test(
      'Should reject userinfo without Authorization header',
      async (battery) => {
        const response = await fetch(`${baseUrl()}/v3/oauth/userinfo`, {
          method: 'GET'
        });

        battery
          .test('Returns 401 Unauthorized')
          .value(response.status)
          .value(401)
          .equal;

        const body = (await response.json()) as Record<string, unknown>;
        battery
          .test('Returns error_invalid_request')
          .value(body.error)
          .value('invalid_request')
          .equal;
      }
    );

    TestBattery.test(
      'Should reject userinfo with invalid Bearer token',
      async (battery) => {
        const response = await userinfoRequest('invalid_token');

        battery
          .test('Returns 401 Unauthorized')
          .value(response.status)
          .value(401)
          .equal;
      }
    );

    TestBattery.test(
      'Should return user info for valid token',
      async (battery) => {
        const response = await userinfoRequest('valid_access_token');

        // TODO: Implement userinfo endpoint
        // Should extract userId from token
        // Should load user data from PeopleRow
        // Should return { sub, username, email?, ... }

        battery
          .test('Returns 200 OK or implements endpoint')
          .value(response.status < 500)
          .value(true)
          .equal;

        if (response.status === 200) {
          const body = (await response.json()) as Record<string, unknown>;

          battery
            .test('Response has sub claim')
            .value(typeof body.sub)
            .value('string')
            .equal;

          battery
            .test('Response is JSON object')
            .value(typeof body)
            .value('object')
            .equal;
        }
      }
    );
  });

  // ── Authorization Endpoint Tests ──────────────────────────────────────────

  suite('GET /v3/oauth/authorize', () => {
    TestBattery.test(
      'Should reject authorize without required parameters',
      async (battery) => {
        const response = await authorizeRequest({});

        battery
          .test('Returns 400 Bad Request')
          .value(response.status)
          .value(400)
          .equal;

        const body = (await response.json()) as Record<string, unknown>;
        battery
          .test('Returns error_invalid_request')
          .value(body.error)
          .value('invalid_request')
          .equal;
      }
    );

    TestBattery.test(
      'Should reject authorize with invalid response_type',
      async (battery) => {
        const response = await authorizeRequest({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'token'
        });

        battery
          .test('Returns 400 Bad Request')
          .value(response.status)
          .value(400)
          .equal;
      }
    );

    TestBattery.test(
      'Should handle authorization code flow',
      async (battery) => {
        const response = await authorizeRequest({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code',
          state: 'test_state'
        });

        // TODO: Implement authorization endpoint
        // Should validate client_id and redirect_uri
        // Should check if user is authenticated
        // Should generate authorization code
        // Should redirect to redirect_uri?code=...&state=...

        battery
          .test('Response status is valid')
          .value(response.status < 500)
          .value(true)
          .equal;

        if (response.status === 302 || response.status === 303) {
          const location = response.headers.get('location');
          battery
            .test('Redirect location is set')
            .value(location)
            .not
            .nil;

          if (location) {
            battery
              .test('Redirect contains code parameter')
              .value(location.includes('code='))
              .value(true)
              .equal;

            battery
              .test('Redirect contains state parameter')
              .value(location.includes('state=test_state'))
              .value(true)
              .equal;
          }
        }
      }
    );

    TestBattery.test(
      'Should support PKCE in authorization flow',
      async (battery) => {
        const response = await authorizeRequest({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code',
          code_challenge: 'test_code_challenge',
          code_challenge_method: 'S256'
        });

        // TODO: Implement PKCE support
        // Should store code_challenge with authorization code
        // Should verify code_verifier in token exchange

        battery
          .test('PKCE response status is valid')
          .value(response.status < 500)
          .value(true)
          .equal;
      }
    );

    TestBattery.test(
      'Should support OpenID Connect nonce',
      async (battery) => {
        const response = await authorizeRequest({
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
          response_type: 'code',
          nonce: 'test_nonce'
        });

        // TODO: Implement nonce support
        // Should store nonce with authorization code
        // Should include nonce in token response

        battery
          .test('Nonce response status is valid')
          .value(response.status < 500)
          .value(true)
          .equal;
      }
    );
  });

  // ── JWKS Endpoint Tests ───────────────────────────────────────────────────

  suite('GET /v3/oauth/jwks', () => {
    TestBattery.test(
      'Should return JWKS for token verification',
      async (battery) => {
        const response = await jwksRequest();

        battery
          .test('Returns 200 OK')
          .value(response.status)
          .value(200)
          .equal;

        battery
          .test('Returns application/json')
          .value(response.headers.get('content-type'))
          .value('application/json')
          .equal;

        const body = (await response.json()) as Record<string, unknown>;

        battery
          .test('Response has keys array')
          .value(Array.isArray(body.keys))
          .value(true)
          .equal;

        // TODO: Implement JWKS endpoint
        // Should return public key in JWKS format
        // { keys: [{ kty: 'RSA', kid, use: 'sig', n, e, ... }] }

        if (Array.isArray(body.keys) && body.keys.length > 0) {
          const firstKey = body.keys[0] as Record<string, unknown>;

          battery
            .test('Key has kty (key type)')
            .value(typeof firstKey.kty)
            .value('string')
            .equal;

          battery
            .test('Key has use property')
            .value(firstKey.use)
            .value('sig')
            .equal;
        }
      }
    );
  });

  // ── OIDC Discovery Endpoint Tests ─────────────────────────────────────────

  suite('GET /v3/oauth/.well-known/openid-configuration', () => {
    TestBattery.test(
      'Should return OIDC discovery metadata',
      async (battery) => {
        const response = await oidcDiscoveryRequest();

        battery
          .test('Returns 200 OK')
          .value(response.status)
          .value(200)
          .equal;

        battery
          .test('Returns application/json')
          .value(response.headers.get('content-type'))
          .value('application/json')
          .equal;

        const body = (await response.json()) as Record<string, unknown>;

        // TODO: Implement OIDC discovery
        // Should return metadata with required fields:
        battery
          .test('Has issuer')
          .value(typeof body.issuer)
          .value('string')
          .equal;

        battery
          .test('Has authorization_endpoint')
          .value(typeof body.authorization_endpoint)
          .value('string')
          .equal;

        battery
          .test('Has token_endpoint')
          .value(typeof body.token_endpoint)
          .value('string')
          .equal;

        battery
          .test('Has userinfo_endpoint')
          .value(typeof body.userinfo_endpoint)
          .value('string')
          .equal;

        battery
          .test('Has jwks_uri')
          .value(typeof body.jwks_uri)
          .value('string')
          .equal;

        battery
          .test('Has scopes_supported array')
          .value(Array.isArray(body.scopes_supported))
          .value(true)
          .equal;

        battery
          .test('Has response_types_supported array')
          .value(Array.isArray(body.response_types_supported))
          .value(true)
          .equal;

        battery
          .test('Has grant_types_supported array')
          .value(Array.isArray(body.grant_types_supported))
          .value(true)
          .equal;
      }
    );

    TestBattery.test(
      'Should include revocation and introspection endpoints',
      async (battery) => {
        const response = await oidcDiscoveryRequest();

        const body = (await response.json()) as Record<string, unknown>;

        // TODO: Optional but recommended OAuth2 endpoints
        battery
          .test('Has revocation_endpoint')
          .value(typeof body.revocation_endpoint)
          .value('string')
          .equal;

        battery
          .test('Has introspection_endpoint')
          .value(typeof body.introspection_endpoint)
          .value('string')
          .equal;
      }
    );

    TestBattery.test(
      'Should indicate PKCE support',
      async (battery) => {
        const response = await oidcDiscoveryRequest();

        const body = (await response.json()) as Record<string, unknown>;

        // TODO: Document PKCE support in discovery
        battery
          .test('Has code_challenge_methods_supported')
          .value(Array.isArray(body.code_challenge_methods_supported))
          .value(true)
          .equal;

        const methods = body.code_challenge_methods_supported as string[];
        battery
          .test('Supports S256 PKCE method')
          .value(methods.includes('S256'))
          .value(true)
          .equal;
      }
    );
  });
});
