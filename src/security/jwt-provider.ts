/**
 * JWT-based OAuth Provider Implementation
 *
 * A concrete implementation of OAuthProvider that uses JWT for token
 * management. Each realm has its own instance with independent keys.
 *
 * TODO: Complete implementation details:
 *   - Key rotation strategy (store keys in db_properties or crypto storage)
 *   - JWT signing/verification using crypto.sign/verify or jsonwebtoken
 *   - Scope validation and parsing
 *   - Code challenge verification for PKCE
 *   - Nonce handling for OpenID Connect
 */

import { decode, sign, verify } from 'jsonwebtoken';
import type {
  OAuthClient,
  OAuthToken,
  TokenIntrospectionResult,
  AccessTokenClaims
} from './types.js';
import type { OAuthProvider } from './provider.js';
import type { TokenStore } from './token-store.js';
import { appConfig } from '../config/app.js';

export interface JWTOAuthProviderConfig {
  realmId: number;
  tokenStore: TokenStore;
  accessTokenTTL: number; // seconds
  refreshTokenTTL: number; // seconds
  authorizationCodeTTL: number; // seconds
  issuer: string; // e.g., "https://myserver.com"
  jwksUri?: string; // optional custom JWKS URI
}

/**
 * JWT-based OAuth provider implementation.
 * Tokens are signed JWTs with optional revocation via TokenStore.
 */
export class JWTOAuthProvider implements OAuthProvider {
  readonly realmId: number;

  private tokenStore: TokenStore;
  private config: JWTOAuthProviderConfig;
  // TODO: Initialize with keypair from secure storage
  // private privateKey: string;
  // private publicKey: string;

  constructor(config: JWTOAuthProviderConfig) {
    this.realmId = config.realmId;
    this.config = config;
    this.tokenStore = config.tokenStore;
  }

  private getSigningKey() {
    const keys = appConfig().security.jwtKeys || [];
    const now = new Date();

    const activeKey = keys.find((key) => {
      if (!key || !key.private || !key.public) {
        return false;
      }
      if (key.expiry && new Date(key.expiry) < now) {
        return false;
      }
      return true;
    }) || keys[0];

    if (!activeKey) {
      throw new Error('No JWT signing key configured in appConfig.security.jwtKeys');
    }
    return activeKey;
  }

  private getPublicKeyForKid(kid: string) {
    const key = (appConfig().security.jwtKeys || []).find((entry) => entry.kid === kid);
    if (!key || !key.public) {
      throw new Error(`No public key configured for kid ${kid}`);
    }
    return key.public;
  }

  private signJWT(claims: AccessTokenClaims, keyInfo: { kid: string; private: string }): string {
    return sign(claims, keyInfo.private, {
      algorithm: 'ES256',
      keyid: keyInfo.kid
    });
  }

  private verifyJWT(token: string) {
    const decoded = decode(token, { complete: true });
    if (!decoded || typeof decoded !== 'object' || !('header' in decoded)) {
      throw new Error('Invalid JWT token');
    }

    const header = (decoded as { header: { kid?: unknown } }).header;
    const kid = header.kid;
    if (typeof kid !== 'string') {
      throw new Error('JWT token is missing kid header');
    }

    const publicKey = this.getPublicKeyForKid(kid);
    return verify(token, publicKey, {
      algorithms: ['ES256'],
      issuer: this.config.issuer
    }) as AccessTokenClaims;
  }

  async generateAccessToken(
    clientId: string,
    userId: string | null,
    scopes: string[],
    expiresInSeconds: number
  ): Promise<OAuthToken> {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + expiresInSeconds * 1000);
    const signingKey = this.getSigningKey();

    const jwtValue = this.signJWT({
      sub: userId || clientId,
      client_id: clientId,
      scope: scopes.join(' '),
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      realm_id: this.realmId
    }, signingKey);

    const token: OAuthToken = {
      value: jwtValue,
      type: 'access',
      realmId: this.realmId,
      userId,
      clientId,
      issuedAt,
      expiresAt,
      scopes,
      metadata: {
        kid: signingKey.kid
      }
    };

    await this.tokenStore.save(token);
    return token;
  }

  async generateRefreshToken(
    clientId: string,
    userId: string,
    scopes: string[],
    expiresInSeconds: number
  ): Promise<OAuthToken> {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + expiresInSeconds * 1000);

    // TODO: Implement refresh token generation (typically opaque)

    const token: OAuthToken = {
      value: 'refresh_token_stub', // TODO: Replace with generated token
      type: 'refresh',
      realmId: this.realmId,
      userId,
      clientId,
      issuedAt,
      expiresAt,
      scopes
    };

    await this.tokenStore.save(token);
    return token;
  }

  async generateAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    scopes: string[],
    codeChallenge?: string,
    nonce?: string
  ): Promise<OAuthToken> {
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.config.authorizationCodeTTL * 1000
    );

    // TODO: Store code with redemption metadata
    // (redirectUri, codeChallenge, nonce, etc.)

    const token: OAuthToken = {
      value: 'auth_code_stub', // TODO: Replace with generated code
      type: 'code',
      realmId: this.realmId,
      userId,
      clientId,
      issuedAt,
      expiresAt,
      scopes,
      metadata: {
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        nonce
      }
    };

    await this.tokenStore.save(token);
    return token;
  }

  async introspectToken(token: string): Promise<TokenIntrospectionResult> {
    try {
      this.verifyJWT(token);
    } catch (err) {
      return { active: false };
    }

    const storedToken = await this.tokenStore.get(token);
    if (!storedToken) {
      return { active: false };
    }

    return {
      active: true,
      token_type: storedToken.type,
      scope: storedToken.scopes.join(' '),
      client_id: storedToken.clientId,
      username: storedToken.userId || undefined,
      sub: storedToken.userId || undefined,
      iat: Math.floor(storedToken.issuedAt.getTime() / 1000),
      exp: Math.floor(storedToken.expiresAt.getTime() / 1000),
      ...storedToken.metadata
    };
  }

  async revokeToken(token: string): Promise<boolean> {
    return this.tokenStore.revoke(token);
  }

  async exchangeCodeForToken(
    code: string,
    clientId: string,
    clientSecret: string | undefined,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
    // TODO: Implement code exchange
    // 1. Verify code exists and not expired
    // 2. Verify code matches clientId
    // 3. Verify redirectUri matches code's redirectUri
    // 4. If code has code_challenge, verify PKCE codeVerifier
    // 5. Exchange for access/refresh tokens
    // 6. Mark code as redeemed (not reusable)

    return {
      access_token: 'access_token_stub',
      refresh_token: 'refresh_token_stub',
      expires_in: this.config.accessTokenTTL
    };
  }

  async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string | undefined
  ): Promise<{ access_token: string; expires_in: number }> {
    // TODO: Implement refresh token exchange
    // 1. Verify refreshToken exists and not expired
    // 2. Verify refreshToken matches clientId
    // 3. Generate new access token with same scopes
    // 4. Optionally rotate refresh token

    return {
      access_token: 'new_access_token_stub',
      expires_in: this.config.accessTokenTTL
    };
  }

  async getUserInfo(
    token: string
  ): Promise<{
    sub: string;
    username?: string;
    email?: string;
    [key: string]: unknown;
  } | null> {
    // TODO: Introspect token and load user data from people table
    // 1. Verify token is active
    // 2. Extract sub (userId)
    // 3. Load PeopleRow by userId
    // 4. Return { sub, username, ... }

    return null;
  }

  async validateClient(
    clientId: string,
    clientSecret?: string
  ): Promise<OAuthClient | null> {
    // TODO: Load and validate OAuth client from persistent store
    // Check schema for oauth_clients table or store in info column

    return null;
  }

  async getJWKS(): Promise<{ keys: Record<string, unknown>[] }> {
    // TODO: Return public key in JWKS format
    // Format: { keys: [{ kty: 'RSA', kid, use: 'sig', n, e, ... }] }

    return { keys: [] };
  }

  async getOIDCMetadata(baseUrl: string): Promise<Record<string, unknown>> {
    // TODO: Return OpenID Connect discovery metadata
    // Required fields:
    //   - issuer
    //   - authorization_endpoint
    //   - token_endpoint
    //   - userinfo_endpoint
    //   - jwks_uri
    //   - scopes_supported
    //   - response_types_supported
    //   - etc.

    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${baseUrl}/v3/oauth/authorize`,
      token_endpoint: `${baseUrl}/v3/oauth/token`,
      userinfo_endpoint: `${baseUrl}/v3/oauth/userinfo`,
      jwks_uri: this.config.jwksUri || `${baseUrl}/v3/oauth/jwks`,
      scopes_supported: ['openid', 'profile', 'email'],
      response_types_supported: ['code', 'token'],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'client_credentials'
      ],
      revocation_endpoint: `${baseUrl}/v3/oauth/revoke`,
      introspection_endpoint: `${baseUrl}/v3/oauth/introspect`,
      code_challenge_methods_supported: ['S256', 'plain']
    };
  }
}
