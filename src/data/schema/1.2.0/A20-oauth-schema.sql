
CREATE TYPE grant_type_enum AS ENUM ('authorization_code', 'client_credentials', 'refresh_token');

CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(32) NOT NULL,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  grant_types grant_type_enum[] NOT NULL DEFAULT '{"authorization_code"}',
  scopes TEXT[] NOT NULL DEFAULT '{}',
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  require_pkce BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
);

-- This allows clients to have their own users, separate from the main user
-- base. Useful for multi-tenant scenarios.
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO organizations (name, description) VALUES (
  'rocket-code',
  'RocketCode main organization for blog authors, admins, and users.'
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  short_name TEXT,
  email TEXT UNIQUE,
  role_ids INTEGER[] NOT NULL DEFAULT '{}',
  user_info JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, username),
  UNIQUE(organization_id, email)
);

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

--
-- client_secrets
--
-- Revokable client secrets (one-to-many with clients).
--
-- Secrets are hashed before storage. The actual secret is only shown once
-- during creation. Use the hash for verification during authentication.
--
CREATE TABLE client_secrets (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  secret_hash TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
);

CREATE TYPE token_type_enum AS ENUM ('access', 'refresh', 'code');

--
-- tokens
--
-- OAuth tokens (access tokens, refresh tokens, authorization codes).
--
-- This table stores token metadata. The actual token value is stored but
-- may be hashed or partially masked for security.
--
CREATE TABLE tokens (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL,

  -- Token type: "access", "refresh", or "code"
  type token_type_enum NOT NULL,

  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  issued_at TIMESTAMPZ NOT NULL,
  expires_at TIMESTAMPZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  redirect_uri TEXT,
  code_challenge VARCHAR(255),
  nonce VARCHAR(255),
  -- For authorization codes: redeemed at timestamp, or null if it hasn't been
  -- redeemed yet
  redeemed_at TIMESTAMP,

  -- Additional metadata (e.g., kid for JWT, custom claims)
  metadata JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

--
-- sessions
--
-- OAuth authorization sessions (state during flow).
--
-- Stores temporary state during OAuth flows (authorization request state,
-- PKCE state, nonce, etc.) to prevent replay attacks and correlate
-- authorization requests with token requests.
--
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,

  -- Unique state value for the authorization request
  state VARCHAR(255) NOT NULL,

  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- User who authorized (NULL during authorization flow, set after auth)
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Requested redirect_uri
  redirect_uri TEXT NOT NULL,

  -- Requested scopes
  scopes TEXT[] NOT NULL DEFAULT '{}',

  -- PKCE code_challenge
  code_challenge VARCHAR(255),

  -- OpenID Connect nonce
  nonce VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  -- Associated authorization code (if exchanged)
  code_id INTEGER REFERENCES tokens(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

--
-- Cleanup: Remove expired tokens periodically
--
-- This function can be called via a scheduled job to clean up old tokens.
--
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM tokens
  WHERE expires_at < EXTRACT(EPOCH FROM NOW())::BIGINT;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

--
-- Cleanup: Remove expired sessions periodically
--
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- Grant appropriate permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
