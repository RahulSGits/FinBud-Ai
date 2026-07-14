import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  try {
    const admin = await getAuthUser();
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, password, fullName, orgName } = await req.json();

    if (!email || !password || !fullName || !orgName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const exists = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    
    // Create Organization and User
    const org = await db.organization.create({
      data: {
        name: orgName,
      }
    });

    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashed,
        fullName,
        organizationId: org.id,
      },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, fullName: user.fullName },
    });
  } catch (e) {
    console.error('Create User Error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await getAuthUser();
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, role } = await req.json();
    if (!id || !role) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });

    const user = await db.user.update({
      where: { id },
      data: { role },
    });

    return NextResponse.json({ ok: true, user: { id: user.id, role: user.role } });
  } catch (e) {
    console.error('Update User Error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
