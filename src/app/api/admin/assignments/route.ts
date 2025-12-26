/**
 * Supervisor Assignments API
 * GET /api/admin/assignments - List assignments
 * POST /api/admin/assignments/initialize - Initialize from prior month
 * PATCH /api/admin/assignments - Bulk update assignments
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/session';
import { canManageAssignments, buildAreaFilter, canAccessArea } from '@/lib/auth/authorization';

// =============================================================================
// GET - List assignments for a month
// =============================================================================

const listSchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
    area: z.string().optional(),
    status: z.enum(['all', 'assigned', 'completed', 'unassigned']).optional().default('all'),
});

interface AssignmentRow {
    employee_id: string;
    employee_name: string;
    position: string;
    area: string;
    evaluator_email: string | null;
    status: string | null;
    assigned_at: Date | null;
}

export async function GET(request: NextRequest) {
    try {
        const session = await requireSession();

        if (!canManageAssignments(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const { month, area, status } = listSchema.parse({
            month: searchParams.get('month') ?? undefined,
            area: searchParams.get('area') ?? undefined,
            status: searchParams.get('status') || 'all',
        });

        // Build query with area filter
        const areaFilter = buildAreaFilter(session, 'r.area');
        const params: (string | null)[] = [month];
        let whereClause = 'WHERE r.month = $1 AND r.is_active = true';

        if (areaFilter) {
            const areaParams = areaFilter.params.map((_, i) => `$${params.length + i + 1}`);
            whereClause += ` AND r.area IN (${areaParams.join(', ')})`;
            params.push(...areaFilter.params);
        }

        if (area) {
            if (!canAccessArea(session, area)) {
                return NextResponse.json({ error: 'Access denied to this area' }, { status: 403 });
            }
            params.push(area);
            whereClause += ` AND r.area = $${params.length}`;
        }

        // Query roster with left join to assignments
        const result = await query<AssignmentRow>(
            `SELECT 
        r.employee_id,
        r.employee_name,
        r.position,
        r.area,
        sa.evaluator_email,
        sa.status,
        sa.assigned_at
      FROM roster_monthly r
      LEFT JOIN supervisor_assignments sa ON r.month = sa.month AND r.employee_id = sa.employee_id
      ${whereClause}
      ORDER BY r.area, r.employee_name`,
            params
        );

        // Filter by status if specified
        let assignments = result.rows;
        if (status === 'unassigned') {
            assignments = assignments.filter((a) => !a.evaluator_email);
        } else if (status === 'assigned') {
            assignments = assignments.filter((a) => a.evaluator_email && a.status === 'assigned');
        } else if (status === 'completed') {
            assignments = assignments.filter((a) => a.status === 'completed');
        }

        // Summary stats
        const stats = {
            total: result.rows.length,
            unassigned: result.rows.filter((a) => !a.evaluator_email).length,
            assigned: result.rows.filter((a) => a.evaluator_email && a.status === 'assigned').length,
            completed: result.rows.filter((a) => a.status === 'completed').length,
        };

        return NextResponse.json({
            month,
            assignments,
            stats,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.error('List assignments error:', error);
        return NextResponse.json({ error: 'Failed to list assignments' }, { status: 500 });
    }
}

// =============================================================================
// PATCH - Bulk update assignments
// =============================================================================

const bulkUpdateSchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    assignments: z.array(
        z.object({
            employeeId: z.string(),
            evaluatorEmail: z.string().email().nullable(),
        })
    ),
});

export async function PATCH(request: NextRequest) {
    try {
        const session = await requireSession();

        if (!canManageAssignments(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { month, assignments } = bulkUpdateSchema.parse(body);

        const result = await withTransaction(async (client) => {
            let updated = 0;
            let created = 0;

            for (const { employeeId, evaluatorEmail } of assignments) {
                // Verify employee exists in roster and user has access
                const employeeResult = await client.query<{ area: string }>(
                    'SELECT area FROM roster_monthly WHERE month = $1 AND employee_id = $2',
                    [month, employeeId]
                );

                if (employeeResult.rows.length === 0) {
                    continue; // Skip if employee not in roster
                }

                const area = employeeResult.rows[0].area;
                if (!canAccessArea(session, area)) {
                    continue; // Skip if user doesn't have access to this area
                }

                if (evaluatorEmail) {
                    // Upsert assignment
                    const res = await client.query(
                        `INSERT INTO supervisor_assignments (month, employee_id, area, evaluator_email, assigned_by_email)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (month, employee_id)
             DO UPDATE SET 
               evaluator_email = EXCLUDED.evaluator_email,
               assigned_by_email = EXCLUDED.assigned_by_email,
               assigned_at = NOW()
             RETURNING (xmax = 0) AS inserted`,
                        [month, employeeId, area, evaluatorEmail.toLowerCase(), session.email]
                    );

                    if (res.rows[0]?.inserted) {
                        created++;
                    } else {
                        updated++;
                    }
                } else {
                    // Remove assignment if evaluator is null
                    await client.query(
                        'DELETE FROM supervisor_assignments WHERE month = $1 AND employee_id = $2',
                        [month, employeeId]
                    );
                    updated++;
                }
            }

            return { updated, created };
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.error('Bulk update assignments error:', error);
        return NextResponse.json({ error: 'Failed to update assignments' }, { status: 500 });
    }
}
