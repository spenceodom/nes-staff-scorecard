'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface QueueItem {
    employee_id: string;
    employee_name: string;
    position: string;
    area: string;
    status: 'pending' | 'completed';
    assigned_at: string;
}

interface QueueStats {
    total: number;
    pending: number;
    completed: number;
}

export default function SupervisorQueuePage() {
    const router = useRouter();
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [stats, setStats] = useState<QueueStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch(`/api/me/queue?month=${month}`);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    router.push('/login');
                    return;
                }
                throw new Error(data.error || 'Failed to load queue');
            }

            setQueue(data.queue);
            setStats(data.stats);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load queue');
        } finally {
            setIsLoading(false);
        }
    }, [month, router]);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200">
                <div className="container py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">My Evaluations</h1>
                        <p className="text-sm text-gray-500">Complete supervisor evaluations for your assigned DSPs</p>
                    </div>
                    <button
                        onClick={() => router.push('/api/auth/logout')}
                        className="btn btn-secondary text-sm"
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            <main className="container py-8 max-w-3xl">
                {/* Month Selector */}
                <div className="mb-6">
                    <label className="form-label">Evaluation Month</label>
                    <input
                        type="month"
                        className="form-input w-48"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                    />
                </div>

                {/* Error */}
                {error && (
                    <div className="alert alert-error mb-6">{error}</div>
                )}

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="card">
                            <div className="card-body text-center py-4">
                                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                                <p className="text-sm text-gray-500">Assigned</p>
                            </div>
                        </div>
                        <div className="card">
                            <div className="card-body text-center py-4">
                                <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
                                <p className="text-sm text-gray-500">Pending</p>
                            </div>
                        </div>
                        <div className="card">
                            <div className="card-body text-center py-4">
                                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                                <p className="text-sm text-gray-500">Completed</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Progress Bar */}
                {stats && stats.total > 0 && (
                    <div className="card mb-6">
                        <div className="card-body">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-600">Progress</span>
                                <span className="font-medium">
                                    {stats.completed} of {stats.total} ({Math.round((stats.completed / stats.total) * 100)}%)
                                </span>
                            </div>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${(stats.completed / stats.total) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Queue List */}
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="card">
                            <div className="card-body text-center py-12">
                                <span className="spinner mx-auto"></span>
                                <p className="text-gray-500 mt-2">Loading your evaluations...</p>
                            </div>
                        </div>
                    ) : queue.length === 0 ? (
                        <div className="card">
                            <div className="card-body text-center py-12">
                                <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <p className="text-gray-600 mt-4">No evaluations assigned for this month.</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    Check with your administrator if you expected assignments.
                                </p>
                            </div>
                        </div>
                    ) : (
                        queue.map((item) => (
                            <div
                                key={item.employee_id}
                                className={`card transition-all ${item.status === 'pending'
                                        ? 'hover:shadow-md cursor-pointer'
                                        : 'opacity-75'
                                    }`}
                                onClick={() => {
                                    if (item.status === 'pending') {
                                        router.push(`/submit/supervisor/${month}/${item.employee_id}`);
                                    }
                                }}
                            >
                                <div className="card-body flex items-center gap-4">
                                    {/* Status Icon */}
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.status === 'completed'
                                            ? 'bg-green-100 text-green-600'
                                            : 'bg-orange-100 text-orange-600'
                                        }`}>
                                        {item.status === 'completed' ? (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        )}
                                    </div>

                                    {/* Employee Info */}
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900">{item.employee_name}</p>
                                        <p className="text-sm text-gray-500">{item.position} • {item.area}</p>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="flex items-center gap-3">
                                        {item.status === 'completed' ? (
                                            <span className="badge badge-success">Completed</span>
                                        ) : (
                                            <>
                                                <span className="badge badge-warning">Pending</span>
                                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
