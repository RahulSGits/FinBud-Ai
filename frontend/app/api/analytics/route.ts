import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthUser();
    if (!session?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.organizationId;

    // Get basic stats
    const totalCalls = await db.callLog.count({ where: { organizationId } });
    const interestedCalls = await db.callLog.count({ where: { organizationId, status: 'interested' } });
    
    // Avg duration (rough estimate from CallLog.duration if available)
    const callsWithDuration = await db.callLog.findMany({
      where: { organizationId, duration: { gt: 0 } },
      select: { duration: true }
    });
    const avgDuration = callsWithDuration.length > 0
      ? Math.round(callsWithDuration.reduce((acc, c) => acc + (c.duration || 0), 0) / callsWithDuration.length)
      : 0;

    const conversionRate = totalCalls > 0 ? ((interestedCalls / totalCalls) * 100).toFixed(1) : '0.0';

    return NextResponse.json({
      metrics: [
        { label: 'Total Calls', value: totalCalls.toString(), change: 'Live', positive: true },
        { label: 'Avg Duration', value: `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`, change: 'Live', positive: true },
        { label: 'Conversion', value: `${conversionRate}%`, change: 'Live', positive: true },
        { label: 'Interested', value: interestedCalls.toString(), change: 'Live', positive: true }
      ]
    });
  } catch (error) {
    console.error('Analytics fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
