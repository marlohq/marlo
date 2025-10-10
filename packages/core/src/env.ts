import { Env } from '@humanwhocodes/env';
export const env = new Env();

export const SENTRY_DSN = env.get('SENTRY_DSN');
