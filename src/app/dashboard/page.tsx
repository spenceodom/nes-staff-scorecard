'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface CompletionRate {
    completed: number;
    total: number;
    percentage: number;
}

interface DashboardSummary {
    totalStaff: number;
    completionRates: {
        admin: CompletionRate;
        supervisor: CompletionRate;
        recruiter: CompletionRate;
        all: CompletionRate;
    };
    averages: {
        admin: number | null;
        supervisor: number | null;
        recruiter: number | null;
        overall: number | null;
    };
}

interface StaffMember {
    employeeId: string;
    name: string;
    position: string;
    area: string;
    scores: {
        admin: number | null;
        supervisor: number | null;
        recruiter: number | null;
        final: number | null;
    };
    missing: string[];
}

interface DashboardData {
    month: string;
    summary: DashboardSummary;
    areaBreakdown: Record<string, { total: number; completed: number; avgScore: number | null }>;
    staff: StaffMember[];
}

export default function DashboardPage() {
    const router = useRouter();
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchDashboard = useCallback(async () => {
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch(`/api/dashboard?month=${month}`);
            const result = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    router.push('/login');
                    return;
                }
                throw new Error(result.error || 'Failed to load dashboard');
            }

            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        } finally {
            setIsLoading(false);
        }
    }, [month, router]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    const formatMonth = (m: string) => {
        const [year, mon] = m.split('-');
        const date = new Date(parseInt(year), parseInt(mon) - 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const getScoreColor = (score: number | null) => {
        if (score === null) return 'text-gray-400';
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200">
                <div className="container py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
                        <p className="text-sm text-gray-500">Staff scorecard overview</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="month"
                            className="form-input text-sm"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => router.push('/admin/roster')}
                                className="btn btn-secondary text-sm"
                            >
                                Upload Roster
                            </button>
                            <button
                                onClick={() => router.push('/admin/assignments')}
                                className="btn btn-secondary text-sm"
                            >
                                Assignments
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container py-8">
                {/* Error */}
                {error && (
                    <div className="alert alert-error mb-6">{error}</div>
                )}

                {isLoading ? (
                    <div className="text-center py-12">
                        <span className="spinner mx-auto"></span>
                        <p className="text-gray-500 mt-4">Loading dashboard...</p>
                    </div>
                ) : data ? (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-4 gap-6 mb-8">
                            <div className="card">
                                <div className="card-body">
                                    <p className="text-sm text-gray-500">Total Staff</p>
                                    <p className="text-3xl font-bold text-gray-900">{data.summary.totalStaff}</p>
                                </div>
                            </div>
                            <div className="card">
                                <div className="card-body">
                                    <p className="text-sm text-gray-500">Overall Average</p>
                                    <p className={`text-3xl font-bold ${getScoreColor(data.summary.averages.overall)}`}>
                                        {data.summary.averages.overall !== null ? data.summary.averages.overall : '—'}
                                    </p>
                                </div>
                            </div>
                            <div className="card">
                                <div className="card-body">
                                    <p className="text-sm text-gray-500">Complete Evaluations</p>
                                    <p className="text-3xl font-bold text-green-600">
                                        {data.summary.completionRates.all.completed}
                                        <span className="text-base font-normal text-gray-400">
                                            /{data.summary.completionRates.all.total}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <div className="card">
                                <div className="card-body">
                                    <p className="text-sm text-gray-500">Completion Rate</p>
                                    <p className="text-3xl font-bold text-blue-600">
                                        {data.summary.completionRates.all.percentage}%
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Completion Progress by Role */}
                        <div className="card mb-8">
                            <div className="card-header">
                                <h2 className="font-semibold text-gray-900">Completion by Role</h2>
                            </div>
                            <div className="card-body">
                                <div className="grid grid-cols-3 gap-6">
                                    {(['admin', 'supervisor', 'recruiter'] as const).map((role) => (
                                        <div key={role}>
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="capitalize text-gray-600">{role}</span>
                                                <span className="font-medium">
                                                    {data.summary.completionRates[role].completed}/{data.summary.completionRates[role].total}
                                                    {' '}({data.summary.completionRates[role].percentage}%)
                                                </span>
                                            </div>
                                            <div className="progress-bar">
                                                <div
                                                    className="progress-fill"
                                                    style={{ width: `${data.summary.completionRates[role].percentage}%` }}
                                                ></div>
                                            </div>
                                            {data.summary.averages[role] !== null && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Avg: {data.summary.averages[role]}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Area Breakdown */}
                        {Object.keys(data.areaBreakdown).length > 1 && (
                            <div className="card mb-8">
                                <div className="card-header">
                                    <h2 className="font-semibold text-gray-900">By Area</h2>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-2 gap-6">
                                        {Object.entries(data.areaBreakdown).map(([area, areaData]) => (
                                            <div key={area} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                                <div>
                                                    <p className="font-medium text-gray-900">{area}</p>
                                                    <p className="text-sm text-gray-500">
                                                        {areaData.completed}/{areaData.total} complete
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-2xl font-bold ${getScoreColor(areaData.avgScore)}`}>
                                                        {areaData.avgScore !== null ? areaData.avgScore : '—'}
                                                    </p>
                                                    <p className="text-xs text-gray-500">Average</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Staff Table */}
                        <div className="card">
                            <div className="card-header flex items-center justify-between">
                                <h2 className="font-semibold text-gray-900">Staff Scores</h2>
                                <p className="text-sm text-gray-500">{data.staff.length} employees</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Position</th>
                                            <th>Area</th>
                                            <th className="text-center">Admin</th>
                                            <th className="text-center">Supervisor</th>
                                            <th className="text-center">Recruiter</th>
                                            <th className="text-center">Final</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.staff.map((s) => (
                                            <tr key={s.employeeId}>
                                                <td className="font-medium">{s.name}</td>
                                                <td className="text-gray-600">{s.position}</td>
                                                <td className="text-gray-600">{s.area}</td>
                                                <td className={`text-center ${getScoreColor(s.scores.admin)}`}>
                                                    {s.scores.admin ?? '—'}
                                                </td>
                                                <td className={`text-center ${getScoreColor(s.scores.supervisor)}`}>
                                                    {s.scores.supervisor ?? '—'}
                                                </td>
                                                <td className={`text-center ${getScoreColor(s.scores.recruiter)}`}>
                                                    {s.scores.recruiter ?? '—'}
                                                </td>
                                                <td className={`text-center font-semibold ${getScoreColor(s.scores.final)}`}>
                                                    {s.scores.final ?? '—'}
                                                </td>
                                                <td>
                                                    {s.missing.length === 0 ? (
                                                        <span className="badge badge-success">Complete</span>
                                                    ) : (
                                                        <span className="badge badge-warning">
                                                            Missing: {s.missing.join(', ')}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : null}
            </main>
        </div>
    );
}
