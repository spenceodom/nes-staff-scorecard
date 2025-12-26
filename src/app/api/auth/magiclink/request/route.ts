/**
 * POST /api/auth/magiclink/request
 * Requests a magic link email for non-Workspace users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestMagicLink } from '@/lib/auth/magic-link';

const requestSchema = z.object({
    email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email } = requestSchema.parse(body);

        const result = await requestMagicLink(email);

        return NextResponse.json({
            success: result.success,
            message: result.message,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, message: 'Invalid email address' },
                { status: 400 }
            );
        }

        console.error('Magic link request error:', error);
        return NextResponse.json(
            { success: false, message: 'An error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
