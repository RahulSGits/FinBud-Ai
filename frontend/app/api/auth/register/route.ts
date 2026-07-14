import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, company } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const exists = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashed,
        fullName,
      },
    });

    if (company) {
      const org = await db.organization.create({
        data: { name: company },
      });
      await db.user.update({
        where: { id: user.id },
        data: { organizationId: org.id },
      });
    }

    const token = await signToken({ userId: user.id, email: user.email });

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, fullName: user.fullName },
    });
    res.cookies.set('finbud_token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax' });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
