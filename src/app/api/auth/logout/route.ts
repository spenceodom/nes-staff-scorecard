/**
 * POST /api/auth/logout
 * Destroys the current session.
 */

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth/session';

export async function POST() {
    await destroySession();
    return NextResponse.json({ success: true });
}

export async function GET() {
    await destroySession();
    return NextResponse.redirect('/login');
}
