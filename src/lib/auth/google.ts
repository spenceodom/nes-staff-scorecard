/**
 * Google OAuth authentication for Workspace users.
 */

import { query } from '../db/client';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface GoogleTokenResponse {
    access_token: string;
    id_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

interface GoogleUserInfo {
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
    picture?: string;
    hd?: string; // Hosted domain (for Workspace accounts)
}

// =============================================================================
// OAUTH FLOW
// =============================================================================

/**
 * Generate the Google OAuth authorization URL.
 */
export function getGoogleAuthUrl(state?: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        throw new Error('Google OAuth credentials not configured');
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
    });

    // Add domain hint if configured
    const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;
    if (allowedDomain) {
        params.set('hd', allowedDomain);
    }

    if (state) {
        params.set('state', state);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Google OAuth credentials not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to exchange code: ${error}`);
    }

    return response.json();
}

/**
 * Get user info from Google using access token.
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error('Failed to get user info');
    }

    return response.json();
}

/**
 * Validate that the user's domain is allowed.
 */
export function validateDomain(userInfo: GoogleUserInfo): boolean {
    const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;

    // If no domain restriction, allow all domains
    if (!allowedDomain) {
        return true;
    }

    // Check hosted domain matches
    return userInfo.hd === allowedDomain;
}

/**
 * Find or create a user from Google OAuth.
 */
export async function findOrCreateGoogleUser(userInfo: GoogleUserInfo): Promise<{
    id: string;
    email: string;
    name: string | null;
    auth_provider: 'google';
    isNew: boolean;
}> {
    const email = userInfo.email.toLowerCase();
    const name = userInfo.name || null;

    // Try to find existing user
    const existing = await query<{ id: string; email: string; name: string | null }>(
        'SELECT id, email, name FROM users WHERE email = $1',
        [email]
    );

    if (existing.rows.length > 0) {
        // Update auth provider if needed
        await query(
            `UPDATE users SET auth_provider = 'google', name = COALESCE($2, name) WHERE email = $1`,
            [email, name]
        );

        return {
            id: existing.rows[0].id,
            email: existing.rows[0].email,
            name: existing.rows[0].name || name,
            auth_provider: 'google',
            isNew: false,
        };
    }

    // Create new user
    const result = await query<{ id: string }>(
        `INSERT INTO users (email, name, auth_provider) VALUES ($1, $2, 'google') RETURNING id`,
        [email, name]
    );

    return {
        id: result.rows[0].id,
        email,
        name,
        auth_provider: 'google',
        isNew: true,
    };
}
