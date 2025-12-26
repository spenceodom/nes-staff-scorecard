'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface RosterUploadResult {
    success: boolean;
    month: string;
    rowsProcessed: number;
    inserted: number;
    updated: number;
    usersProvisioned: string[];
}

export default function RosterUploadPage() {
    const router = useRouter();
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [file, setFile] = useState<File | null>(null);
    const [provisionUsers, setProvisionUsers] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<RosterUploadResult | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile && droppedFile.name.endsWith('.csv')) {
            setFile(droppedFile);
            setError('');
        } else {
            setError('Please upload a CSV file');
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setError('');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setIsUploading(true);
        setError('');
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('month', month);
            formData.append('provisionUsers', String(provisionUsers));

            const response = await fetch('/api/admin/roster/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            setResult(data);
            setFile(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

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
                        <h1 className="text-xl font-semibold text-gray-900">Upload Roster</h1>
                    </div>
                </div>
            </header>

            <main className="container py-8 max-w-2xl">
                {/* Success Result */}
                {result && (
                    <div className="alert alert-success mb-6">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <p className="font-medium">Roster uploaded successfully!</p>
                                <p className="text-sm mt-1">
                                    Processed {result.rowsProcessed} employees for {result.month}:
                                    {' '}{result.inserted} new, {result.updated} updated.
                                    {result.usersProvisioned.length > 0 && (
                                        <> {result.usersProvisioned.length} users provisioned.</>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="alert alert-error mb-6">{error}</div>
                )}

                {/* Upload Form */}
                <div className="card">
                    <div className="card-header">
                        <h2 className="font-semibold text-gray-900">Paylocity Roster Import</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Upload a CSV export from Paylocity to update the roster for a specific month.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="card-body">
                        {/* Month Selector */}
                        <div className="form-group">
                            <label htmlFor="month" className="form-label">Evaluation Month</label>
                            <input
                                type="month"
                                id="month"
                                className="form-input"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                required
                            />
                        </div>

                        {/* File Drop Zone */}
                        <div className="form-group">
                            <label className="form-label">CSV File</label>
                            <div
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                                        ? 'border-blue-500 bg-blue-50'
                                        : file
                                            ? 'border-green-500 bg-green-50'
                                            : 'border-gray-300 hover:border-gray-400'
                                    }`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
                                {file ? (
                                    <div className="flex items-center justify-center gap-3">
                                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <div className="text-left">
                                            <p className="font-medium text-gray-900">{file.name}</p>
                                            <p className="text-sm text-gray-500">
                                                {(file.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFile(null)}
                                            className="ml-4 text-gray-400 hover:text-gray-600"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <p className="text-gray-600 mt-2">
                                            Drag and drop your CSV file here, or{' '}
                                            <label className="text-blue-600 hover:underline cursor-pointer">
                                                browse
                                                <input
                                                    type="file"
                                                    accept=".csv"
                                                    className="sr-only"
                                                    onChange={handleFileChange}
                                                />
                                            </label>
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Expected columns: Employee ID, First Name, Last Name, Position, Location, Work Email
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Provision Users Checkbox */}
                        <div className="form-group">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={provisionUsers}
                                    onChange={(e) => setProvisionUsers(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">
                                    Create user accounts from work emails (for house managers)
                                </span>
                            </label>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="btn btn-primary w-full"
                            disabled={!file || isUploading}
                        >
                            {isUploading ? (
                                <>
                                    <span className="spinner"></span>
                                    Uploading...
                                </>
                            ) : (
                                'Upload Roster'
                            )}
                        </button>
                    </form>
                </div>

                {/* Column Mapping Info */}
                <div className="card mt-6">
                    <div className="card-body">
                        <h3 className="font-semibold text-gray-900 mb-3">Paylocity Column Mapping</h3>
                        <div className="text-sm text-gray-600 space-y-2">
                            <p>The importer automatically maps these Paylocity columns:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li><strong>Employee ID</strong> → employee_id</li>
                                <li><strong>First Name</strong> + <strong>Last Name</strong> → employee_name</li>
                                <li><strong>Position Description</strong> → position</li>
                                <li><strong>Location Description</strong> → location (mapped to area)</li>
                                <li><strong>Work Email</strong> → work_email (optional)</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
