import { env } from '@workspace/core/env.js';

// Bull Board Authentication (optional)
export const BULL_BOARD_USERNAME = env.get('BULL_BOARD_USERNAME');
export const BULL_BOARD_PASSWORD = env.get('BULL_BOARD_PASSWORD');

// Google OAuth
export const GOOGLE_CLIENT_ID = env.require('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = env.require('GOOGLE_CLIENT_SECRET');

// Google Service Account
const GOOGLE_SERVICE_ACCOUNT = env.require('GOOGLE_SERVICE_ACCOUNT');
