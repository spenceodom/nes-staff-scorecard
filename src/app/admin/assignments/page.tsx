'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Assignment {
    employee_id: string;
    employee_name: string;
    position: string;
    area: string;
    evaluator_email: string | null;
    status: string | null;
    assigned_at: string | null;
}

interface AssignmentStats {
    total: number;
    unassigned: number;
    assigned: number;
    completed: number;
}

export default function AssignmentsPage() {
    const router = useRouter();
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [stats, setStats] = useState<AssignmentStats | null>(null);
    const [filter, setFilter] = useState<'all' | 'unassigned' | 'assigned' | 'completed'>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editEmail, setEditEmail] = useState('');
    const [isInitializing, setIsInitializing] = useState(false);
    const [initializeSourceMonth, setInitializeSourceMonth] = useState('');

    const fetchAssignments = useCallback(async () => {
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch(`/api/admin/assignments?month=${month}&status=${filter}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load assignments');
            }

            setAssignments(data.assignments);
            setStats(data.stats);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load assignments');
        } finally {
            setIsLoading(false);
        }
    }, [month, filter]);

    useEffect(() => {
        fetchAssignments();
    }, [fetchAssignments]);

    useEffect(() => {
        // Set default source month to previous month
        const [year, monthNum] = month.split('-').map(Number);
        const prevDate = new Date(year, monthNum - 2, 1);
        setInitializeSourceMonth(
            `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
        );
    }, [month]);

    const handleSaveAssignment = async (employeeId: string) => {
        try {
            const response = await fetch('/api/admin/assignments', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month,
                    assignments: [{ employeeId, evaluatorEmail: editEmail || null }],
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save assignment');
            }

            setEditingId(null);
            setEditEmail('');
            fetchAssignments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        }
    };

    const handleInitialize = async () => {
        setIsInitializing(true);
        setError('');

        try {
            const response = await fetch('/api/admin/assignments/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetMonth: month,
                    sourceMonth: initializeSourceMonth,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to initialize');
            }

            fetchAssignments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to initialize');
        } finally {
            setIsInitializing(false);
        }
    };

    const filteredAssignments = assignments;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200">
                <div className="container py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <h1 className="text-xl font-semibold text-gray-900">Supervisor Assignments</h1>
                    </div>
                </div>
            </header>

            <main className="container py-8">
                {/* Controls Bar */}
                <div className="card mb-6">
                    <div className="card-body flex flex-wrap items-center gap-4">
                        {/* Month Selector */}
                        <div>
                            <label className="form-label">Month</label>
                            <input
                                type="month"
                                className="form-input"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                            />
                        </div>

                        {/* Filter */}
                        <div>
                            <label className="form-label">Filter</label>
                            <select
                                className="form-input"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as typeof filter)}
                            >
                                <option value="all">All ({stats?.total || 0})</option>
                                <option value="unassigned">Unassigned ({stats?.unassigned || 0})</option>
                                <option value="assigned">Assigned ({stats?.assigned || 0})</option>
                                <option value="completed">Completed ({stats?.completed || 0})</option>
                            </select>
                        </div>

                        {/* Spacer */}
                        <div className="flex-1"></div>

                        {/* Initialize Button */}
                        <div>
                            <label className="form-label">Initialize From</label>
                            <div className="flex gap-2">
                                <input
                                    type="month"
                                    className="form-input w-36"
                                    value={initializeSourceMonth}
                                    onChange={(e) => setInitializeSourceMonth(e.target.value)}
                                />
                                <button
                                    onClick={handleInitialize}
                                    disabled={isInitializing}
                                    className="btn btn-secondary whitespace-nowrap"
                                >
                                    {isInitializing ? (
                                        <>
                                            <span className="spinner"></span>
                                            Initializing...
                                        </>
                                    ) : (
                                        'Copy Assignments'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="alert alert-error mb-6">{error}</div>
                )}

                {/* Stats Summary */}
                {stats && (
                    <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="card">
                            <div className="card-body text-center">
                                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                                <p className="text-sm text-gray-500">Total DSPs</p>
                            </div>
                        </div>
                        <div className="card">
                            <div className="card-body text-center">
                                <p className="text-2xl font-bold text-orange-600">{stats.unassigned}</p>
                                <p className="text-sm text-gray-500">Unassigned</p>
                            </div>
                        </div>
                        <div className="card">
                            <div className="card-body text-center">
                                <p className="text-2xl font-bold text-blue-600">{stats.assigned}</p>
                                <p className="text-sm text-gray-500">Assigned</p>
                            </div>
                        </div>
                        <div className="card">
                            <div className="card-body text-center">
                                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                                <p className="text-sm text-gray-500">Completed</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Assignments Table */}
                <div className="card">
                    <div className="overflow-x-auto">
                        {isLoading ? (
                            <div className="p-8 text-center">
                                <span className="spinner mx-auto"></span>
                                <p className="text-gray-500 mt-2">Loading assignments...</p>
                            </div>
                        ) : filteredAssignments.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                No assignments found for this month.
                            </div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Position</th>
                                        <th>Area</th>
                                        <th>Evaluator</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAssignments.map((a) => (
                                        <tr key={a.employee_id}>
                                            <td className="font-medium">{a.employee_name}</td>
                                            <td className="text-gray-600">{a.position}</td>
                                            <td className="text-gray-600">{a.area}</td>
                                            <td>
                                                {editingId === a.employee_id ? (
                                                    <input
                                                        type="email"
                                                        className="form-input text-sm py-1"
                                                        placeholder="evaluator@email.com"
                                                        value={editEmail}
                                                        onChange={(e) => setEditEmail(e.target.value)}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    a.evaluator_email || (
                                                        <span className="text-gray-400 italic">Unassigned</span>
                                                    )
                                                )}
                                            </td>
                                            <td>
                                                {a.status === 'completed' ? (
                                                    <span className="badge badge-success">Completed</span>
                                                ) : a.evaluator_email ? (
                                                    <span className="badge badge-pending">Assigned</span>
                                                ) : (
                                                    <span className="badge badge-warning">Unassigned</span>
                                                )}
                                            </td>
                                            <td>
                                                {editingId === a.employee_id ? (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleSaveAssignment(a.employee_id)}
                                                            className="text-green-600 hover:text-green-800"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingId(null);
                                                                setEditEmail('');
                                                            }}
                                                            className="text-gray-400 hover:text-gray-600"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ) : a.status !== 'completed' ? (
                                                    <button
                                                        onClick={() => {
                                                            setEditingId(a.employee_id);
                                                            setEditEmail(a.evaluator_email || '');
                                                        }}
                                                        className="text-blue-600 hover:text-blue-800 text-sm"
                                                    >
                                                        Edit
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
