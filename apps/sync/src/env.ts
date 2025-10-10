import { env } from '@workspace/core/env.js';

// Authentication
export const SYNC_AUTH_SECRET = env.require('SYNC_AUTH_SECRET');

// Database
export const DIRECT_DATABASE_URL = env.require('DIRECT_DATABASE_URL');
