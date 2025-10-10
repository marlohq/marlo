import { jwtVerify } from 'jose';
import { SYNC_AUTH_SECRET } from './env.ts';

interface UserJWTPayload {
	sub: string;
	userId: string;
}

const authSecret = new TextEncoder().encode(SYNC_AUTH_SECRET);

export async function verifyJWT(token: string): Promise<UserJWTPayload | null> {
	try {
		const { payload } = await jwtVerify<UserJWTPayload>(token, authSecret);
		return payload;
	} catch {
		// jwtVerify throws if the token is invalid or expired.
		return null;
	}
}
