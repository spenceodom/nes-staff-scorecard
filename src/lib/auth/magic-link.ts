/**
 * Magic link authentication for non-Workspace users (house managers).
 */

import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import { query } from '../db/client';

// =============================================================================
// CONFIGURATION
// =============================================================================

const TOKEN_EXPIRY_MINUTES = 15;

function getResend(): Resend {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('RESEND_API_KEY environment variable is not set');
    }
    return new Resend(apiKey);
}

// =============================================================================
// TOKEN OPERATIONS
// =============================================================================

/**
 * Generate a secure random token.
 */
function generateToken(): string {
    return randomBytes(32).toString('hex');
}

/**
 * Create a magic link token for an email.
 * Returns the token if the email exists in users table, null otherwise.
 */
export async function createMagicLinkToken(email: string): Promise<string | null> {
    // Check if user exists and is active
    const userResult = await query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 AND is_active = true',
        [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
        return null; // User doesn't exist
    }

    // Delete any existing unused tokens for this email
    await query(
        'DELETE FROM magic_link_tokens WHERE email = $1 AND used_at IS NULL',
        [email.toLowerCase()]
    );

    // Create new token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await query(
        `INSERT INTO magic_link_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
        [email.toLowerCase(), token, expiresAt]
    );

    return token;
}

/**
 * Verify and consume a magic link token.
 * Returns the email if valid, null otherwise.
 */
export async function verifyMagicLinkToken(token: string): Promise<string | null> {
    // Find valid token
    const result = await query<{ id: string; email: string }>(
        `SELECT id, email FROM magic_link_tokens 
     WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [token]
    );

    if (result.rows.length === 0) {
        return null; // Invalid or expired token
    }

    const { id, email } = result.rows[0];

    // Mark token as used
    await query('UPDATE magic_link_tokens SET used_at = NOW() WHERE id = $1', [id]);

    return email;
}

// =============================================================================
// EMAIL SENDING
// =============================================================================

/**
 * Send a magic link email.
 */
export async function sendMagicLinkEmail(email: string, token: string): Promise<boolean> {
    const resend = getResend();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const magicLink = `${appUrl}/api/auth/magiclink/verify?token=${token}`;

    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM || 'NES Scorecard <noreply@nes-scorecard.app>',
            to: email,
            subject: 'Sign in to NES Staff Scorecard',
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a365d;">NES Staff Scorecard</h2>
          <p>Click the button below to sign in to your account. This link will expire in ${TOKEN_EXPIRY_MINUTES} minutes.</p>
          <p style="margin: 30px 0;">
            <a href="${magicLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Sign In
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            Or copy and paste this link into your browser:<br />
            <a href="${magicLink}" style="color: #2563eb;">${magicLink}</a>
          </p>
        </div>
      `,
        });

        return true;
    } catch (error) {
        console.error('Failed to send magic link email:', error);
        return false;
    }
}

/**
 * Request a magic link for an email.
 * Creates token and sends email if user exists.
 */
export async function requestMagicLink(email: string): Promise<{
    success: boolean;
    message: string;
}> {
    const token = await createMagicLinkToken(email);

    if (!token) {
        // Don't reveal whether the email exists
        return {
            success: true,
            message: 'If an account exists with this email, you will receive a sign-in link shortly.',
        };
    }

    const sent = await sendMagicLinkEmail(email, token);

    return {
        success: sent,
        message: sent
            ? 'Check your email for a sign-in link.'
            : 'Failed to send email. Please try again later.',
    };
}
