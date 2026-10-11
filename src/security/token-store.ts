/**
 * OAuth Token Store
 *
 * Manages token persistence, introspection, and revocation.
 * Can be backed by database, cache, or memory (implementation-specific).
 */

import type { OAuthToken, TokenIntrospectionResult } from './types.js';

/**
 * TokenStore defines the contract for token persistence.
 *
 * TODO: Implement backing store (e.g., database or Redis).
 *       Consider:
 *       - tokens table in postgres
 *       - token_id, token_value (hashed), type, realm_id, user_id,
 *         client_id, issued_at, expires_at, scopes, revoked
 *       - TTL-based cleanup or explicit revocation
 */
export interface TokenStore {
  /**
   * Save a token.
   */
  save(token: OAuthToken): Promise<void>;

  /**
   * Retrieve a token by value.
   * Returns null if not found or expired.
   */
  get(value: string): Promise<OAuthToken | null>;

  /**
   * Revoke a token (mark as invalid).
   * Returns true if found and revoked, false if not found.
   */
  revoke(value: string): Promise<boolean>;

  /**
   * Check if a token is revoked.
   */
  isRevoked(value: string): Promise<boolean>;

  /**
   * Delete expired tokens (cleanup).
   */
  deleteExpired(): Promise<number>;
}

/**
 * In-memory token store (suitable for development/testing).
 *
 * WARNING: This does NOT persist tokens and is NOT suitable for production.
 * Implement a database-backed store for production.
 */
export class MemoryTokenStore implements TokenStore {
  private tokens: Map<string, OAuthToken> = new Map();
  private revokedTokens: Set<string> = new Set();

  async save(token: OAuthToken): Promise<void> {
    this.tokens.set(token.value, token);
  }

  async get(value: string): Promise<OAuthToken | null> {
    if (this.revokedTokens.has(value)) {
      return null;
    }

    const token = this.tokens.get(value);
    if (!token) {
      return null;
    }

    if (token.expiresAt < new Date()) {
      this.tokens.delete(value);
      return null;
    }

    return token;
  }

  async revoke(value: string): Promise<boolean> {
    if (!this.tokens.has(value)) {
      return false;
    }
    this.revokedTokens.add(value);
    return true;
  }

  async isRevoked(value: string): Promise<boolean> {
    return this.revokedTokens.has(value);
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const [key, token] of this.tokens) {
      if (token.expiresAt < now) {
        this.tokens.delete(key);
        count++;
      }
    }

    return count;
  }
}

/**
 * Utility function to convert a token to introspection result.
 */
export function tokenToIntrospectionResult(
  token: OAuthToken
): TokenIntrospectionResult {
  return {
    active: true,
    token_type: token.type,
    scope: token.scopes.join(' '),
    client_id: token.clientId,
    username: token.userId || undefined,
    sub: token.userId || undefined,
    iat: Math.floor(token.issuedAt.getTime() / 1000),
    exp: Math.floor(token.expiresAt.getTime() / 1000),
    ...token.metadata
  };
}
