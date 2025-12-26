/**
 * GET /api/me/queue
 * Get the supervisor evaluation queue for the current user (house manager view).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/session';

const querySchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
});

interface QueueItem {
    employee_id: string;
    employee_name: string;
    position: string;
    area: string;
    status: 'pending' | 'completed';
    assigned_at: Date;
}

export async function GET(request: NextRequest) {
    try {
        const session = await requireSession();

        const searchParams = request.nextUrl.searchParams;
        const { month } = querySchema.parse({
            month: searchParams.get('month') ?? undefined,
        });

        // Get all assignments for this evaluator
        const result = await query<QueueItem>(
            `SELECT 
        sa.employee_id,
        r.employee_name,
        r.position,
        sa.area,
        CASE WHEN sa.status = 'completed' THEN 'completed' ELSE 'pending' END as status,
        sa.assigned_at
      FROM supervisor_assignments sa
      JOIN roster_monthly r ON sa.month = r.month AND sa.employee_id = r.employee_id
      WHERE sa.month = $1 
        AND LOWER(sa.evaluator_email) = LOWER($2)
        AND r.is_active = true
      ORDER BY sa.status ASC, r.employee_name ASC`,
            [month, session.email]
        );

        const pending = result.rows.filter((r) => r.status === 'pending');
        const completed = result.rows.filter((r) => r.status === 'completed');

        return NextResponse.json({
            month,
            evaluator: session.email,
            queue: result.rows,
            stats: {
                total: result.rows.length,
                pending: pending.length,
                completed: completed.length,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.error('Get queue error:', error);
        return NextResponse.json({ error: 'Failed to get queue' }, { status: 500 });
    }
}
