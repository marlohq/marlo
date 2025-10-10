import { env } from '@workspace/core/env.js';

// OAuth and Authentication
export const OAUTH_ENCRYPTION_KEY = env.require('OAUTH_ENCRYPTION_KEY');
export const AUTH_SECRET = env.require('AUTH_SECRET');
export const SYNC_AUTH_SECRET = env.require('SYNC_AUTH_SECRET');

// Google configuration
export const GOOGLE_CLIENT_ID = env.require('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = env.require('GOOGLE_CLIENT_SECRET');
export const GOOGLE_GMAIL_TOPIC = env.require('GOOGLE_GMAIL_TOPIC');

// Stripe configuration
export const STRIPE_SECRET_KEY = env.get('STRIPE_SECRET_KEY');
export const STRIPE_SIGNING_SECRET = env.get('STRIPE_SIGNING_SECRET');
export const STRIPE_DEFAULT_PRICE_ID = env.get('STRIPE_DEFAULT_PRICE_ID');
export const FEATURE_STRIPE_ENABLED = !!STRIPE_SECRET_KEY;

// Desktop app configuration
// NOTE(fks): Tokens cannot start with "GITHUB_" in GitHub, so we use "GH_"
export const GH_FETCH_RELEASE_TOKEN = env.get('GH_FETCH_RELEASE_TOKEN');
export const FEATURE_DESKTOP_DOWNLOADS_ENABLED = !!GH_FETCH_RELEASE_TOKEN;

export const PUBLIC_BACKEND_URL = env.require('PUBLIC_BACKEND_URL');
