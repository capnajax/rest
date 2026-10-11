import { Application, createRouteContext } from 'filamentjs';
import { AppMeta, Context } from '../meta/meta-types.js';
import { PUBLIC, SESSIONLESS } from '../meta/defaults.js';
import { getLogger } from '../util/logger.js';
import type { TokenRequest } from '../security/types.js';
import { appConfig } from '../config/app.js';

const MODULE = 'oauth-routes';

export function oauthRoutes(app: Application<AppMeta, Context>) {
  const log = getLogger(MODULE, 'oauthRoutes');
  const ctx = createRouteContext(app, '/v3/oauth', PUBLIC);

  /**
   * POST /v3/oauth/token
   *
   * OAuth token endpoint.
   * Supports:
   *   - authorization_code grant (code exchange)
   *   - refresh_token grant (refresh token exchange)
   *   - client_credentials grant
   *
   * Request body:
   * {
   *   grant_type: "authorization_code" | "refresh_token" | "client_credentials",
   *   code?: string,              // for authorization_code
   *   refresh_token?: string,     // for refresh_token
   *   client_id: string,
   *   client_secret?: string,
   *   redirect_uri?: string,      // for authorization_code
   *   code_verifier?: string,     // for PKCE
   *   scope?: string
   * }
   *
   * TODO: Implement token endpoint
   *   - Parse request body
   *   - Determine realm from client_id or request context
   *   - Get OAuthProvider from registry
   *   - Validate client credentials
   *   - Handle each grant_type separately
   *   - Return { access_token, token_type: "Bearer", expires_in, refresh_token?, ... }
   */
  ctx.post('/token', SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'POST', '/token');

    if (!req.context.body) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'empty request body'
      });
      return;
    }

    try {
      const body = await req.context.body() as Partial<TokenRequest>;
      const grantType = body.grant_type;

      log.debug('Token request:', { grant_type: grantType });

      // TODO: Parse request and determine realm
      // TODO: Get provider from registry
      // TODO: Validate client
      // TODO: Implement grant_type handlers

      res.json({
        error: 'not_implemented',
        error_description: 'Token endpoint not yet implemented'
      });
    } catch (err) {
      log.error('Token request error:', err);
      res.status(400).json({
        error: 'invalid_request',
        error_description: (err as Error).message
      });
    }
  });

  /**
   * POST /v3/oauth/revoke
   *
   * OAuth token revocation endpoint.
   * Revokes an access token or refresh token.
   *
   * Request body:
   * {
   *   token: string,            // token to revoke
   *   token_type_hint?: string  // "access_token" or "refresh_token"
   * }
   *
   * TODO: Implement revocation
   *   - Parse request body
   *   - Determine realm from context or token introspection
   *   - Get OAuthProvider from registry
   *   - Call provider.revokeToken()
   *   - Return 200 OK (no content)
   */
  ctx.post('/revoke', SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'POST', '/revoke');

    if (!req.context.body) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'empty request body'
      });
      return;
    }

    try {
      const body = await req.context.body() as {
        token?: string;
        token_type_hint?: string;
      };
      const token = body.token;

      if (!token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'token parameter is required'
        });
      }

      log.debug('Revoke request for token:', { token: token.substring(0, 10) + '...' });

      // TODO: Determine realm from token or context
      // TODO: Get provider from registry
      // TODO: Call provider.revokeToken()

      res.status(200).json({});
    } catch (err) {
      log.error('Revoke request error:', err);
      res.status(400).json({
        error: 'invalid_request',
        error_description: (err as Error).message
      });
    }
  });

  /**
   * POST /v3/oauth/introspect
   *
   * OAuth token introspection endpoint (internal and external).
   * Validates a token and returns its metadata.
   *
   * Request body:
   * {
   *   token: string,             // token to introspect
   *   token_type_hint?: string   // "access_token" or "refresh_token"
   * }
   *
   * Response: { active: boolean, ... token metadata ... }
   *
   * TODO: Implement introspection
   *   - Parse request body
   *   - Determine realm from token or context
   *   - Get OAuthProvider from registry
   *   - Call provider.introspectToken()
   *   - Return introspection result
   */
  ctx.post('/introspect', SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'POST', '/introspect');

    if (!req.context.body) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'empty request body'
      });
      return;
    }

    try {
      const body = await req.context.body() as {
        token?: string;
        token_type_hint?: string;
      };
      const token = body.token;

      if (!token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'token parameter is required'
        });
      }

      log.debug('Introspect request for token:', {
        token: token.substring(0, 10) + '...'
      });

      // TODO: Determine realm from token or context
      // TODO: Get provider from registry
      // TODO: Call provider.introspectToken()

      const result = { active: false };
      res.json(result);
    } catch (err) {
      log.error('Introspect request error:', err);
      res.status(400).json({
        error: 'invalid_request',
        error_description: (err as Error).message
      });
    }
  });

  /**
   * GET /v3/oauth/userinfo
   *
   * OpenID Connect UserInfo endpoint.
   * Returns authenticated user information.
   *
   * Requires Bearer token in Authorization header:
   *   Authorization: Bearer <access_token>
   *
   * Response: { sub, username, email?, ... }
   *
   * TODO: Implement userinfo
   *   - Extract Bearer token from Authorization header
   *   - Determine realm from token or context
   *   - Get OAuthProvider from registry
   *   - Call provider.getUserInfo()
   *   - Load additional user data from PeopleRow if needed
   *   - Return user info JSON
   */
  ctx.get('/userinfo', SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/userinfo');

    try {
      let authHeader = req.headers.get('authorization') as string;

      if (!authHeader) {
        return res.status(401).json({
          error: 'invalid_request',
          error_description: 'Missing Authorization header'
        });
      }
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'invalid_request',
          error_description: 'Missing or invalid Authorization header'
        });
      }

      const token = authHeader.substring(7);

      log.debug('UserInfo request with token:', {
        token: token.substring(0, 10) + '...'
      });

      // TODO: Determine realm from token or context
      // TODO: Get provider from registry
      // TODO: Call provider.getUserInfo()

      res.json({
        sub: 'user_id_stub'
        // TODO: Add user fields from provider
      });
    } catch (err) {
      log.error('UserInfo request error:', err);
      res.status(401).json({
        error: 'invalid_token',
        error_description: (err as Error).message
      });
    }
  });

  /**
   * GET /v3/oauth/authorize
   *
   * OAuth authorization endpoint (authorization code flow).
   * Initiates the authorization flow and redirects user for consent.
   *
   * Query parameters:
   * {
   *   client_id: string,
   *   redirect_uri: string,
   *   response_type: "code",    // for code flow
   *   scope?: string,
   *   state?: string,           // for CSRF protection
   *   code_challenge?: string,  // for PKCE
   *   code_challenge_method?: "S256" | "plain",
   *   nonce?: string           // for OpenID Connect
   * }
   *
   * TODO: Implement authorization endpoint
   *   - Parse query parameters
   *   - Validate client_id and redirect_uri
   *   - Check if user is authenticated (from session)
   *   - If not, redirect to login
   *   - If authenticated, generate authorization code
   *   - Redirect to redirect_uri with ?code=...&state=...
   */
  ctx.get('/authorize', SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/authorize');

    try {
      const clientId = req.query.client_id as string | undefined;
      const redirectUri = req.query.redirect_uri as string | undefined;
      const responseType = req.query.response_type as string | undefined;
      const state = req.query.state as string | undefined;
      const codeChallenge = req.query.code_challenge as string | undefined;
      const nonce = req.query.nonce as string | undefined;

      log.debug('Authorization request:', {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType
      });

      if (!clientId || !redirectUri || responseType !== 'code') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description:
            'Missing required parameters: client_id, redirect_uri, response_type=code'
        });
      }

      // TODO: Validate client_id and redirect_uri
      // TODO: Check if user is authenticated
      // TODO: Generate authorization code
      // TODO: Redirect to redirect_uri?code=...&state=...

      res.status(400).json({
        error: 'not_implemented',
        error_description: 'Authorization endpoint not yet implemented'
      });
    } catch (err) {
      log.error('Authorization request error:', err);
      res.status(400).json({
        error: 'invalid_request',
        error_description: (err as Error).message
      });
    }
  });

  /**
   * GET /v3/oauth/jwks
   *
   * JSON Web Key Set endpoint.
   * Exposes public keys for JWT signature verification.
   *
   * Response: { keys: [{ kty: "RSA", kid, use: "sig", n, e, ... }, ...] }
   *
   * TODO: Implement JWKS endpoint
   *   - Determine realm from context or configuration
   *   - Get OAuthProvider from registry
   *   - Call provider.getJWKS()
   *   - Return JWKS set
   */
  ctx.get('/jwks', SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/jwks');

    try {
      // TODO: Determine realm
      // TODO: Get provider from registry
      // TODO: Call provider.getJWKS()

      res.json({ keys: [] });
    } catch (err) {
      log.error('JWKS request error:', err);
      res.status(500).json({
        error: 'server_error',
        error_description: (err as Error).message
      });
    }
  });

  /**
   * GET /v3/oauth/.well-known/openid-configuration
   *
   * OpenID Connect Discovery endpoint.
   * Exposes metadata for automatic client configuration.
   *
   * Response: { issuer, authorization_endpoint, token_endpoint, ... }
   *
   * TODO: Implement OIDC discovery
   *   - Determine realm from context or configuration
   *   - Get OAuthProvider from registry
   *   - Call provider.getOIDCMetadata(baseUrl)
   *   - Return discovery document
   */
  ctx.get('/.well-known/openid-configuration', SESSIONLESS, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/.well-known/openid-configuration');

    try {
      const baseUrl = appConfig().app.global.baseUrl;

      log.debug('OIDC discovery request from:', { baseUrl });

      // TODO: Determine realm
      // TODO: Get provider from registry
      // TODO: Call provider.getOIDCMetadata(baseUrl)

      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/v3/oauth/authorize`,
        token_endpoint: `${baseUrl}/v3/oauth/token`,
        userinfo_endpoint: `${baseUrl}/v3/oauth/userinfo`,
        jwks_uri: `${baseUrl}/v3/oauth/jwks`,
        scopes_supported: ['openid', 'profile'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token']
      });
    } catch (err) {
      log.error('OIDC discovery error:', err);
      res.status(500).json({
        error: 'server_error',
        error_description: (err as Error).message
      });
    }
  });

  log.info('OAuth routes registered');
}
