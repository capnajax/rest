/**
 * OAuth Security Module
 *
 * Exports all security-related types, providers, and utilities.
 * Used by both internal operations and OAuth endpoints.
 */

export * from './types.js';
export * from './provider.js';
export * from './token-store.js';
export * from './jwt-provider.js';

// Global registry instance for OAuth providers
import { OAuthProviderRegistry } from './provider.js';

export const oauthRegistry = new OAuthProviderRegistry();
