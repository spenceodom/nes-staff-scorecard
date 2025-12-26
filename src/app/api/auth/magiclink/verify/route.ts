/**
 * GET /api/auth/magiclink/verify
 * Verifies a magic link token and creates a session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicLinkToken } from '@/lib/auth/magic-link';
import { createSession } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
        return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
    }

    try {
        // Verify and consume the token
        const email = await verifyMagicLinkToken(token);

        if (!email) {
            return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
        }

        // Get user from database
        const userResult = await query<{
            id: string;
            email: string;
            name: string | null;
            auth_provider: 'magiclink';
        }>(
            'SELECT id, email, name FROM users WHERE email = $1 AND is_active = true',
            [email]
        );

        if (userResult.rows.length === 0) {
            return NextResponse.redirect(new URL('/login?error=user_not_found', request.url));
        }

        const user = {
            ...userResult.rows[0],
            auth_provider: 'magiclink' as const,
        };

        // Create session
        await createSession(user);

        // Redirect to supervisor queue (house managers go here by default)
        return NextResponse.redirect(new URL('/me/supervisor-queue', request.url));
    } catch (error) {
        console.error('Magic link verification error:', error);
        return NextResponse.redirect(new URL('/login?error=verification_failed', request.url));
    }
}
