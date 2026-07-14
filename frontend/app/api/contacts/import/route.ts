import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthUser();
    if (!session?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.organizationId;

    const { contacts, campaignId } = await req.json();

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
    }

    // Clean and validate contacts
    const validContacts = contacts.map((c: any) => ({
      organizationId,
      campaignId: campaignId || null,
      name: c.name || null,
      phone: c.phone || '',
      email: c.email || null,
      company: c.company || null,
      loanAmount: c.loanAmount ? parseFloat(c.loanAmount) : null,
      loanType: c.loanType || null,
      status: 'pending',
      notes: c.notes || null,
      tags: c.tags || null,
      customFields: c.customFields ? JSON.stringify(c.customFields) : null,
    })).filter(c => c.phone !== ''); // Phone is required

    if (validContacts.length === 0) {
      return NextResponse.json({ error: 'No valid contacts found (missing phone numbers)' }, { status: 400 });
    }

    // Insert into DB
    const result = await db.contact.createMany({
      data: validContacts,
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      imported: result.count,
      total: contacts.length
    });

  } catch (error: any) {
    console.error('Failed to import contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
