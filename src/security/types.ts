/**
 * OAuth Security Types
 *
 * Core types for OAuth token handling, introspection, and realm-based
 * strategy pattern.
 */

/**
 * Represents an OAuth token (access token, refresh token, or code).
 */
export interface OAuthToken {
  value: string;
  type: 'access' | 'refresh' | 'code';
  realmId: number;
  userId: string | null; // null for client credentials
  clientId: string;
  issuedAt: Date;
  expiresAt: Date;
  scopes: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Result of token introspection.
 */
export interface TokenIntrospectionResult {
  active: boolean;
  token_type?: string;
  scope?: string;
  client_id?: string;
  username?: string;
  sub?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

/**
 * OAuth client registration (credentials).
 */
export interface OAuthClient {
  id: string;
  secret: string;
  realmId: number;
  redirectUris: string[];
  grantTypes: string[];
  scopes: string[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Authorization request parameters.
 */
export interface AuthorizationRequest {
  client_id: string;
  redirect_uri: string;
  response_type: 'code' | 'token'; // 'code' for code flow, 'token' for implicit
  scope?: string;
  state?: string;
  code_challenge?: string; // for PKCE
  code_challenge_method?: 'S256' | 'plain';
  nonce?: string; // for OpenID Connect
}

/**
 * Token request parameters.
 */
export interface TokenRequest {
  grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';
  code?: string;
  refresh_token?: string;
  client_id: string;
  client_secret?: string;
  redirect_uri?: string;
  code_verifier?: string; // for PKCE
  scope?: string;
}

/**
 * JWT Claims for access tokens.
 */
export interface AccessTokenClaims {
  sub: string; // user ID
  client_id: string;
  scope: string;
  iat: number;
  exp: number;
  realm_id: number;
  [key: string]: unknown;
}
