/**
 * OAuth Provider Interface
 *
 * Strategy pattern for realm-specific OAuth operations.
 * Each realm can have its own implementation of token generation,
 * validation, and introspection.
 */

import type {
  OAuthToken,
  OAuthClient,
  TokenIntrospectionResult,
  AuthorizationRequest,
  TokenRequest
} from './types.js';

/**
 * OAuthProvider defines the contract for realm-specific OAuth
 * operations. Implementations are strategy-based and can be
 * swapped at runtime or configured per-realm.
 */
export interface OAuthProvider {
  /**
   * The realm ID this provider is responsible for.
   */
  readonly realmId: number;

  /**
   * Generate an access token.
   * @param clientId OAuth client ID
   * @param userId User ID (null for client credentials flow)
   * @param scopes Requested scopes
   * @param expiresInSeconds Token lifetime in seconds
   * @returns The newly created token
   */
  generateAccessToken(
    clientId: string,
    userId: string | null,
    scopes: string[],
    expiresInSeconds: number
  ): Promise<OAuthToken>;

  /**
   * Generate a refresh token.
   * @param clientId OAuth client ID
   * @param userId User ID
   * @param scopes Associated scopes
   * @param expiresInSeconds Token lifetime in seconds
   * @returns The newly created refresh token
   */
  generateRefreshToken(
    clientId: string,
    userId: string,
    scopes: string[],
    expiresInSeconds: number
  ): Promise<OAuthToken>;

  /**
   * Generate an authorization code for code flow.
   * @param clientId OAuth client ID
   * @param userId User ID
   * @param redirectUri Redirect URI
   * @param scopes Requested scopes
   * @param codeChallenge PKCE code challenge (optional)
   * @param nonce Nonce for OpenID Connect (optional)
   * @returns The newly created code
   */
  generateAuthorizationCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    scopes: string[],
    codeChallenge?: string,
    nonce?: string
  ): Promise<OAuthToken>;

  /**
   * Introspect a token—determine if it's active and return its metadata.
   * @param token Token string to introspect
   * @returns Token introspection result
   */
  introspectToken(token: string): Promise<TokenIntrospectionResult>;

  /**
   * Revoke a token (invalidate it).
   * @param token Token string to revoke
   * @returns true if revoked successfully, false if not found
   */
  revokeToken(token: string): Promise<boolean>;

  /**
   * Exchange an authorization code for tokens.
   * @param code Authorization code
   * @param clientId OAuth client ID
   * @param clientSecret OAuth client secret (if needed)
   * @param redirectUri Redirect URI
   * @param codeVerifier PKCE code verifier (optional)
   * @returns Token response with access_token and optional refresh_token
   */
  exchangeCodeForToken(
    code: string,
    clientId: string,
    clientSecret: string | undefined,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;

  /**
   * Refresh an access token using a refresh token.
   * @param refreshToken Refresh token
   * @param clientId OAuth client ID
   * @param clientSecret OAuth client secret (if needed)
   * @returns Token response with new access_token
   */
  refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string | undefined
  ): Promise<{ access_token: string; expires_in: number }>;

  /**
   * Get user info for an access token.
   * @param token Access token
   * @returns User information (sub, username, etc.)
   */
  getUserInfo(
    token: string
  ): Promise<{ sub: string; username?: string; email?: string; [key: string]: unknown } | null>;

  /**
   * Validate an OAuth client.
   * @param clientId OAuth client ID
   * @param clientSecret OAuth client secret (if needed)
   * @returns OAuthClient if valid, null otherwise
   */
  validateClient(
    clientId: string,
    clientSecret?: string
  ): Promise<OAuthClient | null>;

  /**
   * Get JWT public keys (JWKS) for token validation.
   * @returns JWKS set { keys: [{ kty, kid, use, n, e, ... }] }
   */
  getJWKS(): Promise<{ keys: Record<string, unknown>[] }>;

  /**
   * Get OpenID Connect discovery metadata.
   * @param baseUrl Server base URL (e.g., https://myserver.com)
   * @returns OIDC discovery document
   */
  getOIDCMetadata(baseUrl: string): Promise<Record<string, unknown>>;
}

/**
 * Registry to manage multiple OAuthProvider instances by realm ID.
 */
export class OAuthProviderRegistry {
  private providers: Map<number, OAuthProvider> = new Map();

  /**
   * Register a provider for a specific realm.
   */
  register(realmId: number, provider: OAuthProvider): void {
    this.providers.set(realmId, provider);
  }

  /**
   * Get a provider for a specific realm.
   * @throws if provider not found
   */
  get(realmId: number): OAuthProvider {
    const provider = this.providers.get(realmId);
    if (!provider) {
      throw new Error(`No OAuth provider registered for realm ${realmId}`);
    }
    return provider;
  }

  /**
   * Check if a provider exists for a realm.
   */
  has(realmId: number): boolean {
    return this.providers.has(realmId);
  }
}
