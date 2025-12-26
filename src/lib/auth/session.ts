/**
 * Session management using JWT tokens stored in HTTP-only cookies.
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { query } from '../db/client';

// =============================================================================
// TYPES
// =============================================================================

export interface UserSession {
    userId: string;
    email: string;
    name: string | null;
    authProvider: 'google' | 'magiclink';
    roles: Array<{ role: string; area: string }>;
}

interface SessionPayload extends UserSession {
    iat: number;
    exp: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const SESSION_COOKIE_NAME = 'nes-session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): Uint8Array {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        throw new Error('SESSION_SECRET environment variable is not set');
    }
    return new TextEncoder().encode(secret);
}

// =============================================================================
// JWT OPERATIONS
// =============================================================================

/**
 * Create a signed JWT for the session.
 */
async function createSessionToken(session: UserSession): Promise<string> {
    const token = await new SignJWT({ ...session })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(getSecret());

    return token;
}

/**
 * Verify and decode a session token.
 */
async function verifySessionToken(token: string): Promise<UserSession | null> {
    try {
        const { payload } = await jwtVerify(token, getSecret());

        // Validate required fields exist
        if (
            typeof payload.userId !== 'string' ||
            typeof payload.email !== 'string' ||
            typeof payload.authProvider !== 'string' ||
            !Array.isArray(payload.roles)
        ) {
            return null;
        }

        return {
            userId: payload.userId as string,
            email: payload.email as string,
            name: (payload.name as string | null) ?? null,
            authProvider: payload.authProvider as 'google' | 'magiclink',
            roles: payload.roles as Array<{ role: string; area: string }>,
        };
    } catch {
        return null;
    }
}

// =============================================================================
// SESSION OPERATIONS
// =============================================================================

/**
 * Create a new session for a user.
 */
export async function createSession(user: {
    id: string;
    email: string;
    name: string | null;
    auth_provider: 'google' | 'magiclink';
}): Promise<void> {
    // Fetch user roles
    const rolesResult = await query<{ role: string; area: string }>(
        'SELECT role, area FROM user_roles WHERE user_id = $1',
        [user.id]
    );

    const session: UserSession = {
        userId: user.id,
        email: user.email,
        name: user.name,
        authProvider: user.auth_provider,
        roles: rolesResult.rows,
    };

    const token = await createSessionToken(session);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_DURATION / 1000,
        path: '/',
    });

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
}

/**
 * Get the current session from cookies.
 */
export async function getSession(): Promise<UserSession | null> {
    // Development bypass
    if (process.env.DEV_BYPASS_AUTH) {
        console.log('--- AUTH BYPASS TRIGGERED ---', process.env.DEV_BYPASS_AUTH);
        const userResult = await query<{ id: string; email: string; name: string | null; last_login_at: Date | null }>(
            'SELECT id, email, name, last_login_at FROM users WHERE email = $1',
            [process.env.DEV_BYPASS_AUTH]
        );

        if (userResult.rows.length === 0) {
            console.error('--- AUTH BYPASS FAILED: User not found ---', process.env.DEV_BYPASS_AUTH);
        } else {
            const user = userResult.rows[0];
            const rolesResult = await query<{ role: string; area: string }>(
                'SELECT role, area FROM user_roles WHERE user_id = $1',
                [user.id]
            );

            console.log('--- AUTH BYPASS SUCCESS ---', { userId: user.id, roles: rolesResult.rows.length });
            return {
                userId: user.id,
                email: user.email,
                name: user.name,
                authProvider: 'google',
                roles: rolesResult.rows,
            };
        }
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
        return null;
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
        return null;
    }

    return {
        userId: payload.userId,
        email: payload.email,
        name: payload.name,
        authProvider: payload.authProvider,
        roles: payload.roles,
    };
}

/**
 * Destroy the current session.
 */
export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Require an authenticated session. Throws if not authenticated.
 */
export async function requireSession(): Promise<UserSession> {
    const session = await getSession();
    if (!session) {
        throw new Error('Unauthorized');
    }
    return session;
}
