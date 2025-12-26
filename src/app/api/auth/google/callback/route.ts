/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback, validates user, creates session.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    exchangeCodeForTokens,
    getGoogleUserInfo,
    validateDomain,
    findOrCreateGoogleUser,
} from '@/lib/auth/google';
import { createSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
        console.error('Google OAuth error:', error);
        return NextResponse.redirect(new URL('/login?error=oauth_denied', request.url));
    }

    if (!code) {
        return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
    }

    try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);

        // Get user info
        const userInfo = await getGoogleUserInfo(tokens.access_token);

        // Validate domain
        if (!validateDomain(userInfo)) {
            return NextResponse.redirect(new URL('/login?error=invalid_domain', request.url));
        }

        // Find or create user
        const user = await findOrCreateGoogleUser(userInfo);

        // Create session
        await createSession(user);

        // Redirect to appropriate page
        return NextResponse.redirect(new URL('/dashboard', request.url));
    } catch (error) {
        console.error('Google OAuth callback error:', error);
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
    }
}
