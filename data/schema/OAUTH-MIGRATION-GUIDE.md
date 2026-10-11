# OAuth Schema Migration Guide

## Overview

The `010-oauth-schema.sql` script creates a separate `oauth` schema with tables for OAuth 2.0 / OpenID Connect token management.

**Note:** JWT keys are managed via config files (`deployment/_generated/secrets/security.yaml`), NOT stored in the database.

## Schema Structure

### oauth.clients
Represents OAuth applications that can request tokens.

```sql
-- Create a client
INSERT INTO oauth.clients (
  realm_id,
  client_id,
  grant_types,
  scopes,
  redirect_uris
) VALUES (
  1,
  'my-app',
  '{authorization_code,refresh_token}',
  '{openid,profile,email}',
  '{"https://myapp.com/callback"}'
);
```

**Key fields:**
- `realm_id`: Tenant/realm identifier
- `client_id`: Unique within realm
- `grant_types`: Array of allowed OAuth grant types
- `scopes`: Array of scopes this client can request
- `redirect_uris`: Array of allowed redirect URIs (for authorization_code flow)
- `require_pkce`: Force PKCE for this client (recommended for public clients)
- `is_public`: If true, client doesn't authenticate with a secret

### oauth.client_secrets
One-to-many relationship with clients. Secrets are revokable and can expire.

```sql
-- Create a client secret (would normally hash the secret first)
INSERT INTO oauth.client_secrets (
  client_id,
  secret_hash,
  label,
  expires_at
) VALUES (
  'uuid-of-client',
  'sha256_hash_of_actual_secret_here',
  'production',
  NOW() + INTERVAL '1 year'
);
```

**Key fields:**
- `secret_hash`: Hashed secret (never store plaintext)
- `label`: Human-readable identifier
- `revoked`: Boolean flag to disable this secret
- `expires_at`: Optional expiration date

**Usage pattern:**
1. Generate a random secret
2. Hash it (SHA-256, bcrypt, etc.)
3. Store the hash
4. Return the plaintext secret to the client (only once)
5. Client uses secret in token requests

### oauth.tokens
Stores access tokens, refresh tokens, and authorization codes.

```sql
-- Insert an access token
INSERT INTO oauth.tokens (
  realm_id,
  value,
  type,
  client_id,
  user_id,
  scopes,
  issued_at,
  expires_at,
  metadata
) VALUES (
  1,
  'jwt_token_here',
  'access',
  'uuid-of-client',
  'uuid-of-user',
  'openid profile email',
  EXTRACT(EPOCH FROM NOW())::BIGINT,
  EXTRACT(EPOCH FROM NOW() + INTERVAL '1 hour')::BIGINT,
  '{"kid":"key-id-here"}'::jsonb
);
```

**Key fields:**
- `type`: "access", "refresh", or "code"
- `issued_at`, `expires_at`: Unix timestamps
- `revoked`: Boolean for token revocation
- `metadata`: JSON for additional data (e.g., JWT `kid`, custom claims)

**For authorization codes:**
- `code_challenge`: PKCE code challenge
- `redirect_uri`: Where to redirect after authorization
- `nonce`: OpenID Connect nonce
- `redeemed`: Track if code was exchanged for tokens

### oauth.sessions
Temporary state during OAuth authorization flow.

```sql
-- Insert authorization session
INSERT INTO oauth.sessions (
  realm_id,
  state,
  client_id,
  redirect_uri,
  scopes,
  code_challenge,
  nonce,
  expires_at
) VALUES (
  1,
  'unique_state_value',
  'uuid-of-client',
  'https://myapp.com/callback',
  'openid profile',
  'pkce_code_challenge',
  'openid_nonce',
  NOW() + INTERVAL '10 minutes'
);
```

**Key fields:**
- `state`: Unique value to prevent CSRF (use `state` from OAuth request)
- `status`: "pending" → "authorized" → "exchanged"
- `expires_at`: Sessions should expire quickly (10-15 min)

## Integration Notes

### TokenStore Implementation
The `MemoryTokenStore` can be replaced with a `PostgresTokenStore`:

```typescript
// In jwt-provider.ts or provider registry
export class PostgresTokenStore implements TokenStore {
  async save(token: OAuthToken): Promise<void> {
    await pool.query(
      `INSERT INTO oauth.tokens (realm_id, value, type, client_id, user_id, scopes, issued_at, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        token.realmId,
        token.value,
        token.type,
        token.clientId,
        token.userId,
        token.scopes.join(' '),
        Math.floor(token.issuedAt.getTime() / 1000),
        Math.floor(token.expiresAt.getTime() / 1000),
        JSON.stringify(token.metadata)
      ]
    );
  }

  async get(value: string): Promise<OAuthToken | null> {
    const result = await pool.query(
      `SELECT * FROM oauth.tokens WHERE value = $1 AND NOT revoked`,
      [value]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      value: row.value,
      type: row.type,
      realmId: row.realm_id,
      userId: row.user_id,
      clientId: row.client_id,
      issuedAt: new Date(row.issued_at * 1000),
      expiresAt: new Date(row.expires_at * 1000),
      scopes: row.scopes ? row.scopes.split(' ') : [],
      metadata: row.metadata
    };
  }

  async revoke(value: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE oauth.tokens SET revoked = true, revoked_at = NOW() WHERE value = $1`,
      [value]
    );
    return result.rowCount > 0;
  }

  // ... implement other methods similarly
}
```

### Client Validation
Looking up a client with active secrets:

```sql
-- Find a client and verify secret
SELECT c.id, c.client_id, cs.secret_hash
FROM oauth.clients c
LEFT JOIN oauth.client_secrets cs ON c.id = cs.client_id
WHERE c.realm_id = $1
  AND c.client_id = $2
  AND cs.revoked = FALSE
  AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
LIMIT 1;
```

### Authorization Code Flow

1. **Create session** (authorization request)
   ```sql
   INSERT INTO oauth.sessions (...) VALUES (...);
   ```

2. **Create code** (after user authenticates)
   ```sql
   INSERT INTO oauth.tokens (type='code', ...) VALUES (...);
   UPDATE oauth.sessions SET user_id=$1, status='authorized', code_id=$2 WHERE id=$3;
   ```

3. **Exchange code for tokens** (token endpoint)
   ```sql
   SELECT * FROM oauth.tokens WHERE value=$1 AND type='code' AND NOT redeemed;
   UPDATE oauth.tokens SET redeemed=true, redeemed_at=NOW() WHERE id=$1;
   INSERT INTO oauth.tokens (type='access', ...) VALUES (...);  -- new access token
   INSERT INTO oauth.tokens (type='refresh', ...) VALUES (...); -- new refresh token
   ```

### Cleanup
Schedule periodic cleanup of expired tokens/sessions:

```sql
-- Run daily or via cron
SELECT oauth.cleanup_expired_tokens();
SELECT oauth.cleanup_expired_sessions();
```

## Security Considerations

1. **Secret Storage:**
   - Never store plaintext secrets
   - Hash before INSERT (bcrypt, Argon2, or SHA-256)
   - Always use constant-time comparison when verifying

2. **Token Value Storage:**
   - Consider hashing token values with a one-way function
   - Use partial indexes to speed lookups on non-revoked tokens
   - Implement TTL cleanup to avoid table bloat

3. **Timestamps:**
   - Use unix timestamps (BIGINT) for token expiry (easier comparison)
   - Use TIMESTAMP for session/secret creation times

4. **HTTPS Only:**
   - All OAuth endpoints require HTTPS
   - Clients should validate server certificates

5. **State Parameter:**
   - Always verify `state` parameter matches session
   - Prevents CSRF attacks

## Performance Optimizations

- **Partial indexes** on `revoked=false` and `expires_at > NOW()`
- **Hash indexes** on token values for fast lookups
- **Composite indexes** on common filter combinations (realm_id, type, expires_at)
- **Periodic cleanup** to prevent table bloat
- **Connection pooling** for TokenStore

## Migration Order

When integrating into your schema:

1. Create the `oauth` schema
2. Create all tables
3. Create indexes
4. Create utility functions
5. Update `TokenStore` implementation to use PostgreSQL
6. Update provider registry to pass PostgresTokenStore
7. Test token generation, storage, and retrieval
