'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const errorMessages: Record<string, string> = {
        oauth_init_failed: 'Failed to start Google sign-in. Please try again.',
        oauth_denied: 'Google sign-in was cancelled.',
        invalid_domain: 'Your Google account is not authorized. Please use your NES Workspace account.',
        auth_failed: 'Authentication failed. Please try again.',
        missing_code: 'Invalid authentication response. Please try again.',
        missing_token: 'Invalid sign-in link. Please request a new one.',
        invalid_token: 'Your sign-in link has expired or already been used.',
        user_not_found: 'No account found with this email address.',
        verification_failed: 'Failed to verify sign-in link. Please try again.',
    };

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMessage('');

        try {
            const response = await fetch('/api/auth/magiclink/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (data.success) {
                setMagicLinkSent(true);
            } else {
                setErrorMessage(data.message || 'Failed to send sign-in link.');
            }
        } catch {
            setErrorMessage('An error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">NES Staff Scorecard</h1>
                    <p className="text-gray-600 mt-1">Monthly performance evaluation system</p>
                </div>

                {/* Error Alert */}
                {(error || errorMessage) && (
                    <div className="alert alert-error mb-6">
                        {errorMessages[error || ''] || errorMessage || 'An error occurred.'}
                    </div>
                )}

                {/* Login Card */}
                <div className="card">
                    <div className="card-body">
                        {/* Google OAuth Section */}
                        <div className="mb-6">
                            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                                NES Staff
                            </h2>
                            <a
                                href="/api/auth/google"
                                className="btn btn-google w-full"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path
                                        fill="#4285F4"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="#34A853"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="#FBBC05"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="#EA4335"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                Sign in with Google
                            </a>
                            <p className="text-xs text-gray-500 mt-2 text-center">
                                For directors, admins, and recruiters with NES Workspace accounts
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="bg-white px-4 text-gray-500">or</span>
                            </div>
                        </div>

                        {/* Magic Link Section */}
                        <div>
                            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                                House Managers
                            </h2>

                            {magicLinkSent ? (
                                <div className="alert alert-success">
                                    <div className="flex items-start gap-3">
                                        <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <div>
                                            <p className="font-medium">Check your email!</p>
                                            <p className="text-sm mt-1">We sent a sign-in link to <strong>{email}</strong></p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleMagicLink}>
                                    <div className="form-group">
                                        <label htmlFor="email" className="form-label">
                                            Email address
                                        </label>
                                        <input
                                            type="email"
                                            id="email"
                                            className="form-input"
                                            placeholder="yourname.nes@gmail.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-primary w-full"
                                        disabled={isSubmitting || !email}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <span className="spinner"></span>
                                                Sending...
                                            </>
                                        ) : (
                                            'Send Sign-in Link'
                                        )}
                                    </button>
                                    <p className="text-xs text-gray-500 mt-2 text-center">
                                        For house managers with Gmail accounts
                                    </p>
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-gray-500 mt-6">
                    NES Staff Scorecard v1 • South Valley & Price Pilot
                </p>
            </div>
        </div>
    );
}
