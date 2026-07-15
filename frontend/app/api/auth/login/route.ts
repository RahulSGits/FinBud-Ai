import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    // Demo accounts
    if (email === 'admin@finbud.ai' && password === 'admin123') {
      let admin = await db.user.findUnique({ where: { email: 'admin@finbud.ai' } });
      if (!admin) {
        const hashed = await bcrypt.hash('admin123', 10);
        admin = await db.user.create({
          data: { email: 'admin@finbud.ai', password: hashed, fullName: 'Admin User' },
        });
      }
      const token = await signToken({ userId: admin.id, email: admin.email });
      const res = NextResponse.json({ user: { id: admin.id, email: admin.email, fullName: admin.fullName } });
      res.cookies.set('finbud_token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax' });
      return res;
    }

    if (email === 'demo@finbud.ai' && password === 'demo123') {
      let demo = await db.user.findUnique({ where: { email: 'demo@finbud.ai' } });
      if (!demo) {
        const hashed = await bcrypt.hash('demo123', 10);
        demo = await db.user.create({
          data: { email: 'demo@finbud.ai', password: hashed, fullName: 'Demo User' },
        });
        // Seed demo data
        const agent = await db.agent.create({ data: { organizationId: demo.organizationId || 'demo-org', name: 'Sales Agent Priya', description: 'Outbound sales agent for product demos', status: 'active', language: 'en', voiceId: 'exotel-default' } });
        const campaign = await db.campaign.create({ data: { organizationId: demo.organizationId || 'demo-org', name: 'Q2 Outreach Campaign', status: 'running', agentId: agent.id } });
        const outcomes = ['Interested', 'Not Interested', 'Callback', 'No Answer', 'Voicemail'];
        for (let i = 0; i < 40; i++) {
          await db.callLog.create({ data: { organizationId: demo.organizationId || 'demo-org', agentId: agent.id, campaignId: campaign.id, phone: `+1555${String(1000 + i).padStart(4, '0')}`, duration: Math.floor(Math.random() * 300) + 30, outcome: outcomes[Math.floor(Math.random() * outcomes.length)], cost: parseFloat((Math.random() * 0.5 + 0.1).toFixed(2)), startedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) } });
        }
      }
      const token = await signToken({ userId: demo.id, email: demo.email });
      const res = NextResponse.json({ user: { id: demo.id, email: demo.email, fullName: demo.fullName } });
      res.cookies.set('finbud_token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax' });
      return res;
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });



    const token = await signToken({ userId: user.id, email: user.email });
    const res = NextResponse.json({ user: { id: user.id, email: user.email, fullName: user.fullName } });
    res.cookies.set('finbud_token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax' });
    return res;
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
