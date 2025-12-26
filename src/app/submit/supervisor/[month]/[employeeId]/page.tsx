'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

const RATING_OPTIONS = [
    { value: 'Outstanding', description: 'Consistently exceeds all expectations' },
    { value: 'Exceeds Expectations', description: 'Often goes above and beyond' },
    { value: 'Meets Expectations', description: 'Consistently meets requirements' },
    { value: 'Needs Improvement', description: 'Sometimes falls short of requirements' },
    { value: 'Unsatisfactory', description: 'Does not meet minimum requirements' },
] as const;

type RatingValue = typeof RATING_OPTIONS[number]['value'];

interface Employee {
    employee_id: string;
    employee_name: string;
    position: string;
    area: string;
}

interface Ratings {
    attitude: RatingValue | '';
    reliability: RatingValue | '';
    proactivity: RatingValue | '';
    flexibility: RatingValue | '';
    individual_interaction: RatingValue | '';
}

const RATING_LABELS: Record<keyof Ratings, string> = {
    attitude: 'Attitude',
    reliability: 'Reliability',
    proactivity: 'Proactivity (Initiative)',
    flexibility: 'Flexibility',
    individual_interaction: 'Interaction with Individuals',
};

export default function SupervisorSubmitPage() {
    const router = useRouter();
    const params = useParams();
    const month = params.month as string;
    const employeeId = params.employeeId as string;

    const [employee, setEmployee] = useState<Employee | null>(null);
    const [ratings, setRatings] = useState<Ratings>({
        attitude: '',
        reliability: '',
        proactivity: '',
        flexibility: '',
        individual_interaction: '',
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        async function fetchEmployee() {
            try {
                const response = await fetch(`/api/me/queue?month=${month}`);
                const data = await response.json();

                if (!response.ok) {
                    if (response.status === 401) {
                        router.push('/login');
                        return;
                    }
                    throw new Error(data.error || 'Failed to load employee');
                }

                const emp = data.queue.find((q: Employee & { employee_id: string }) => q.employee_id === employeeId);
                if (!emp) {
                    throw new Error('Employee not found in your queue');
                }

                setEmployee(emp);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load');
            } finally {
                setIsLoading(false);
            }
        }

        fetchEmployee();
    }, [month, employeeId, router]);

    const handleRatingChange = (field: keyof Ratings, value: RatingValue) => {
        setRatings((prev) => ({ ...prev, [field]: value }));
    };

    const isComplete = Object.values(ratings).every((v) => v !== '');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isComplete) return;

        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch('/api/submissions/supervisor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month,
                    employeeId,
                    ratings,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Submission failed');
            }

            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Submission failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatMonth = (m: string) => {
        const [year, mon] = m.split('-');
        const date = new Date(parseInt(year), parseInt(mon) - 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <span className="spinner mx-auto"></span>
                    <p className="text-gray-500 mt-4">Loading evaluation...</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Evaluation Submitted!</h1>
                    <p className="text-gray-600 mb-6">
                        Your evaluation for {employee?.employee_name} has been recorded successfully.
                    </p>
                    <button
                        onClick={() => router.push('/me/supervisor-queue')}
                        className="btn btn-primary"
                    >
                        Return to Queue
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200">
                <div className="container py-4 flex items-center gap-4">
                    <button
                        onClick={() => router.push('/me/supervisor-queue')}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">Supervisor Evaluation</h1>
                        <p className="text-sm text-gray-500">{formatMonth(month)}</p>
                    </div>
                </div>
            </header>

            <main className="container py-8 max-w-2xl">
                {/* Error */}
                {error && (
                    <div className="alert alert-error mb-6">{error}</div>
                )}

                {/* Employee Info Card */}
                {employee && (
                    <div className="card mb-6">
                        <div className="card-body flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <span className="text-xl font-semibold text-blue-600">
                                    {employee.employee_name.charAt(0)}
                                </span>
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900">{employee.employee_name}</h2>
                                <p className="text-sm text-gray-500">{employee.position} • {employee.area}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rating Form */}
                <form onSubmit={handleSubmit}>
                    <div className="space-y-6">
                        {(Object.keys(RATING_LABELS) as (keyof Ratings)[]).map((field) => (
                            <div key={field} className="card">
                                <div className="card-body">
                                    <h3 className="font-medium text-gray-900 mb-3">{RATING_LABELS[field]}</h3>
                                    <div className="space-y-2">
                                        {RATING_OPTIONS.map((option) => (
                                            <label
                                                key={option.value}
                                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${ratings[field] === option.value
                                                        ? 'border-blue-500 bg-blue-50'
                                                        : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={field}
                                                    value={option.value}
                                                    checked={ratings[field] === option.value}
                                                    onChange={() => handleRatingChange(field, option.value)}
                                                    className="mt-1"
                                                />
                                                <div>
                                                    <p className="font-medium text-gray-900">{option.value}</p>
                                                    <p className="text-sm text-gray-500">{option.description}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Submit Button */}
                    <div className="mt-8">
                        <button
                            type="submit"
                            className="btn btn-primary w-full py-3"
                            disabled={!isComplete || isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="spinner"></span>
                                    Submitting...
                                </>
                            ) : (
                                'Submit Evaluation'
                            )}
                        </button>
                        {!isComplete && (
                            <p className="text-sm text-center text-gray-500 mt-2">
                                Please rate all {Object.keys(RATING_LABELS).length} attributes to submit
                            </p>
                        )}
                    </div>
                </form>
            </main>
        </div>
    );
}
