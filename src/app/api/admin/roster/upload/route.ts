/**
 * POST /api/admin/roster/upload
 * Upload roster CSV from Paylocity export.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/session';
import { canUploadRoster, canAccessArea } from '@/lib/auth/authorization';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Paylocity column mappings (case-insensitive)
const PAYLOCITY_COLUMNS = {
    employeeId: ['Employee ID', 'EmployeeId', 'Emp ID', 'EmpID', 'employee_id'],
    firstName: ['First Name', 'FirstName', 'first_name'],
    lastName: ['Last Name', 'LastName', 'last_name'],
    position: ['Position Description', 'Position', 'Job Title', 'position'],
    location: ['Location Description', 'Location', 'location'],
    workEmail: ['Work Email', 'WorkEmail', 'Email', 'work_email', 'email'],
};

// Location to area mapping (configurable)
const LOCATION_TO_AREA: Record<string, string> = {
    'Salt Lake': 'South Valley',
    'SLC': 'South Valley',
    'South Valley': 'South Valley',
    'Price': 'Price',
};

// =============================================================================
// CSV PARSING
// =============================================================================

interface ParsedRow {
    employeeId: string;
    employeeName: string;
    position: string;
    location: string;
    area: string;
    workEmail: string | null;
}

function findColumn(headers: string[], candidates: string[]): number {
    const lowerCandidates = candidates.map((c) => c.toLowerCase());
    return headers.findIndex((h) => lowerCandidates.includes(h.toLowerCase().trim()));
}

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) {
        throw new Error('Empty CSV file');
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'));
    const rows = lines.slice(1).map((line) => {
        // Simple CSV parsing (handles quoted fields)
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    });

    return { headers, rows };
}

function mapLocationToArea(location: string): string {
    // Try exact match first
    if (LOCATION_TO_AREA[location]) {
        return LOCATION_TO_AREA[location];
    }

    // Try case-insensitive match
    const lowerLocation = location.toLowerCase();
    for (const [key, value] of Object.entries(LOCATION_TO_AREA)) {
        if (key.toLowerCase() === lowerLocation) {
            return value;
        }
    }

    // Default to the location itself if no mapping found
    return location;
}

function parseRosterCSV(content: string): ParsedRow[] {
    const { headers, rows } = parseCSV(content);

    // Find column indices
    const empIdIdx = findColumn(headers, PAYLOCITY_COLUMNS.employeeId);
    const firstNameIdx = findColumn(headers, PAYLOCITY_COLUMNS.firstName);
    const lastNameIdx = findColumn(headers, PAYLOCITY_COLUMNS.lastName);
    const positionIdx = findColumn(headers, PAYLOCITY_COLUMNS.position);
    const locationIdx = findColumn(headers, PAYLOCITY_COLUMNS.location);
    const emailIdx = findColumn(headers, PAYLOCITY_COLUMNS.workEmail);

    // Validate required columns
    if (empIdIdx === -1) throw new Error('Employee ID column not found');
    if (firstNameIdx === -1 && lastNameIdx === -1) {
        throw new Error('First Name or Last Name column not found');
    }
    if (positionIdx === -1) throw new Error('Position column not found');
    if (locationIdx === -1) throw new Error('Location column not found');

    return rows
        .filter((row) => row[empIdIdx]?.trim()) // Skip rows without employee ID
        .map((row) => {
            const firstName = firstNameIdx >= 0 ? row[firstNameIdx]?.trim() || '' : '';
            const lastName = lastNameIdx >= 0 ? row[lastNameIdx]?.trim() || '' : '';
            const employeeName = `${lastName}, ${firstName}`.replace(/^, /, '').replace(/, $/, '');
            const location = row[locationIdx]?.trim() || '';

            return {
                employeeId: row[empIdIdx]?.trim() || '',
                employeeName,
                position: row[positionIdx]?.trim() || '',
                location,
                area: mapLocationToArea(location),
                workEmail: emailIdx >= 0 ? row[emailIdx]?.trim() || null : null,
            };
        });
}

// =============================================================================
// REQUEST VALIDATION
// =============================================================================

const uploadSchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
    provisionUsers: z.boolean().optional().default(false),
});

// =============================================================================
// ROUTE HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
    try {
        // Authenticate
        const session = await requireSession();

        // Check permission
        if (!canUploadRoster(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Parse form data
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const monthValue = formData.get('month') as string;
        const provisionUsersValue = formData.get('provisionUsers') === 'true';

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Validate input
        const { month, provisionUsers } = uploadSchema.parse({
            month: monthValue,
            provisionUsers: provisionUsersValue,
        });

        // Parse CSV
        const content = await file.text();
        const parsedRows = parseRosterCSV(content);

        if (parsedRows.length === 0) {
            return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 400 });
        }

        // Check area access
        const areas = [...new Set(parsedRows.map((r) => r.area))];
        for (const area of areas) {
            if (!canAccessArea(session, area)) {
                return NextResponse.json(
                    { error: `You don't have access to area: ${area}` },
                    { status: 403 }
                );
            }
        }

        // Insert/update roster in transaction
        const result = await withTransaction(async (client) => {
            let inserted = 0;
            let updated = 0;
            const usersProvisioned: string[] = [];

            for (const row of parsedRows) {
                // Upsert roster entry
                const res = await client.query(
                    `INSERT INTO roster_monthly (month, employee_id, employee_name, position, location, area, work_email, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           ON CONFLICT (month, employee_id) 
           DO UPDATE SET 
             employee_name = EXCLUDED.employee_name,
             position = EXCLUDED.position,
             location = EXCLUDED.location,
             area = EXCLUDED.area,
             work_email = COALESCE(EXCLUDED.work_email, roster_monthly.work_email),
             is_active = true
           RETURNING (xmax = 0) AS inserted`,
                    [month, row.employeeId, row.employeeName, row.position, row.location, row.area, row.workEmail]
                );

                if (res.rows[0]?.inserted) {
                    inserted++;
                } else {
                    updated++;
                }

                // Optionally provision users
                if (provisionUsers && row.workEmail) {
                    const userRes = await client.query(
                        `INSERT INTO users (email, name, auth_provider)
             VALUES ($1, $2, 'magiclink')
             ON CONFLICT (email) DO NOTHING
             RETURNING id`,
                        [row.workEmail.toLowerCase(), row.employeeName]
                    );

                    if (userRes.rows.length > 0) {
                        usersProvisioned.push(row.workEmail);
                    }
                }
            }

            return { inserted, updated, usersProvisioned };
        });

        return NextResponse.json({
            success: true,
            month,
            rowsProcessed: parsedRows.length,
            inserted: result.inserted,
            updated: result.updated,
            usersProvisioned: result.usersProvisioned,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.error('Roster upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process roster' },
            { status: 500 }
        );
    }
}
