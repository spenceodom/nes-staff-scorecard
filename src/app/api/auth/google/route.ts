/**
 * GET /api/auth/google
 * Initiates Google OAuth flow by redirecting to Google.
 */

import { NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/auth/google';

export async function GET() {
    try {
        const authUrl = getGoogleAuthUrl();
        return NextResponse.redirect(authUrl);
    } catch (error) {
        console.error('Failed to initiate Google OAuth:', error);
        return NextResponse.redirect('/login?error=oauth_init_failed');
    }
}
