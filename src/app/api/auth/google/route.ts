/**
 * GET /api/auth/google
 * Initiates Google OAuth flow by redirecting to Google.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/auth/google';

export async function GET(request: NextRequest) {
    try {
        const authUrl = getGoogleAuthUrl();
        console.log('Redirecting to Google OAuth:', authUrl);
        return NextResponse.redirect(authUrl);
    } catch (error) {
        console.error('Failed to initiate Google OAuth:', error);
        // Use an absolute URL for the redirect
        const url = new URL('/login?error=oauth_init_failed', request.url);
        return NextResponse.redirect(url);
    }
}
