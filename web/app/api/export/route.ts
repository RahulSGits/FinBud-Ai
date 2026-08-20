// Getting the data out.
//
// GET /api/export?type=<kind>&format=csv|xlsx&days=&campaignId=&status=&q=
//
// SECURITY: every query below is scoped with visibleContacts(user) /
// visibleCalls(user) / visibleCampaigns(user) from lib/authz. That is the whole
// security surface of this endpoint — an export that forgot one of those
// fragments would hand a single employee the entire company's contact book in a
// file they can walk out with. The scopes return `{}` for admins, so the same
// code path serves both roles without a role branch anywhere in here.
import { NextRequest, NextResponse } from 'next/server';
import { CallStatus, ContactStatus, LeadStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { auditData } from '@/lib/audit';
import { requireUser, type SessionUser } from '@/lib/auth';
import { errorResponse, visibleCalls, visibleCampaigns, visibleContacts } from '@/lib/authz';
import {
  CSV_MIME,
  XLSX_MIME,
  filenameFor,
  toCsv,
  toXlsx,
  type ExportColumn,
  type ExportRow,
} from '@/lib/export';

export const dynamic = 'force-dynamic';

/** A pull this size is already an "ask us for a database dump" conversation. */
const MAX_ROWS = 50_000;
const MAX_DAYS = 365;

type Kind = 'interested' | 'contacts' | 'calls' | 'campaign';
const KINDS: Kind[] = ['interested', 'contacts', 'calls', 'campaign'];

type Format = 'csv' | 'xlsx';

/** Kind → the slug that ends up in the downloaded filename. */
const FILE_KIND: Record<Kind, string> = {
  interested: 'interested-leads',
  contacts: 'contacts',
  calls: 'calls',
  campaign: 'campaign-results',
};

/** What "interested" means for the export: the flag the worker sets, or a lead
 *  status a human would chase. Both, because a callback request is a live lead
 *  even when the model never ticked the boolean. */
const INTEREST_FILTER: Prisma.CallWhereInput = {
  OR: [
    { interested: true },
    { leadStatus: { in: [LeadStatus.interested, LeadStatus.callback_requested] } },
  ],
};

interface Sheet {
  rows: ExportRow[];
  columns: ExportColumn[];
  /** True when the query hit MAX_ROWS and the file is only part of the answer. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

function pretty(value: string): string {
  return value.replace(/_/g, ' ');
}

function parseFormat(raw: string | null): Format | null {
  if (!raw || raw === 'csv') return 'csv';
  if (raw === 'xlsx') return 'xlsx';
  return null;
}

/** Start of the window, N days back, counting today as day one. */
function parseSince(raw: string | null): Date | null {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return null;
  const days = Math.min(Math.floor(n), MAX_DAYS);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  return since;
}

function asContactStatus(raw: string | null): ContactStatus | null {
  if (!raw) return null;
  return (Object.values(ContactStatus) as string[]).includes(raw)
    ? (raw as ContactStatus)
    : null;
}

function asCallStatus(raw: string | null): CallStatus | null {
  if (!raw) return null;
  return (Object.values(CallStatus) as string[]).includes(raw) ? (raw as CallStatus) : null;
}

function asLeadStatus(raw: string | null): LeadStatus | null {
  if (!raw) return null;
  return (Object.values(LeadStatus) as string[]).includes(raw) ? (raw as LeadStatus) : null;
}

/** Mirrors the client-side filter on the contacts table so an export matches
 *  what the person was looking at when they clicked the button. */
function contactSearch(q: string | null): Prisma.ContactWhereInput | null {
  const term = (q ?? '').trim();
  if (!term) return null;
  return {
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
      { company: { contains: term, mode: 'insensitive' } },
    ],
  };
}

// ---------------------------------------------------------------------------
// interested — the money export
// ---------------------------------------------------------------------------

const INTERESTED_COLUMNS: ExportColumn[] = [
  { key: 'contactName', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'loanType', label: 'Loan type' },
  { key: 'loanAmount', label: 'Loan amount' },
  { key: 'leadStatus', label: 'Lead status' },
  { key: 'leadScore', label: 'Lead score' },
  { key: 'customerIntent', label: 'Customer intent' },
  { key: 'nextAction', label: 'Next action' },
  { key: 'objections', label: 'Objections' },
  { key: 'summary', label: 'Call summary' },
  { key: 'durationSec', label: 'Duration (seconds)' },
  { key: 'agentName', label: 'Agent' },
  { key: 'campaignName', label: 'Campaign' },
  { key: 'assignedTo', label: 'Assigned employee' },
  { key: 'startedAt', label: 'Call date' },
];

async function buildInterested(
  user: SessionUser,
  since: Date | null,
  campaignId: string | null
): Promise<Sheet> {
  const where: Prisma.CallWhereInput = {
    AND: [
      visibleCalls(user), // scope first: an employee only ever exports their own leads
      INTEREST_FILTER,
      ...(since ? [{ startedAt: { gte: since } }] : []),
      ...(campaignId ? [{ campaignId }] : []),
    ],
  };

  const calls = await db.call.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: MAX_ROWS + 1,
    include: {
      contact: {
        select: {
          name: true,
          phone: true,
          email: true,
          company: true,
          loanType: true,
          loanAmount: true,
          assignedTo: { select: { name: true } },
        },
      },
      agent: { select: { name: true } },
      campaign: { select: { name: true } },
    },
  });

  const truncated = calls.length > MAX_ROWS;
  const rows = (truncated ? calls.slice(0, MAX_ROWS) : calls).map<ExportRow>((c) => ({
    contactName: c.contact?.name ?? '',
    // The call keeps its own copy of the number, which survives the contact
    // being deleted — fall back to it rather than exporting a blank row.
    phone: c.contact?.phone ?? c.phone,
    email: c.contact?.email ?? '',
    company: c.contact?.company ?? '',
    loanType: c.contact?.loanType ?? '',
    loanAmount: c.contact?.loanAmount ?? '',
    leadStatus: pretty(c.leadStatus),
    leadScore: c.leadScore ?? '',
    customerIntent: c.customerIntent ?? '',
    nextAction: c.nextAction ?? '',
    objections: c.objections ?? '',
    summary: c.summary ?? '',
    durationSec: c.durationSec,
    agentName: c.agent?.name ?? '',
    campaignName: c.campaign?.name ?? '',
    assignedTo: c.contact?.assignedTo?.name ?? '',
    startedAt: c.startedAt,
  }));

  return { rows, columns: INTERESTED_COLUMNS, truncated };
}

// ---------------------------------------------------------------------------
// contacts
// ---------------------------------------------------------------------------

const CONTACT_COLUMNS: ExportColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'loanType', label: 'Loan type' },
  { key: 'loanAmount', label: 'Loan amount' },
  { key: 'status', label: 'Status' },
  { key: 'tags', label: 'Tags' },
  { key: 'campaignName', label: 'Campaign' },
  { key: 'assignedTo', label: 'Assigned to' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'callCount', label: 'Calls made' },
  { key: 'lastOutcome', label: 'Last outcome' },
  { key: 'lastAttemptAt', label: 'Last attempt' },
  { key: 'nextAttemptAt', label: 'Next attempt' },
  { key: 'createdAt', label: 'Added' },
];

async function buildContacts(
  user: SessionUser,
  since: Date | null,
  campaignId: string | null,
  status: ContactStatus | null,
  q: string | null
): Promise<Sheet> {
  const search = contactSearch(q);
  const where: Prisma.ContactWhereInput = {
    AND: [
      visibleContacts(user), // employees export only the leads assigned to them
      ...(status ? [{ status }] : []),
      ...(campaignId ? [{ campaignId }] : []),
      ...(since ? [{ createdAt: { gte: since } }] : []),
      ...(search ? [search] : []),
    ],
  };

  const contacts = await db.contact.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS + 1,
    include: {
      assignedTo: { select: { name: true } },
      campaign: { select: { name: true } },
      _count: { select: { calls: true } },
      calls: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: { leadStatus: true },
      },
    },
  });

  const truncated = contacts.length > MAX_ROWS;
  const rows = (truncated ? contacts.slice(0, MAX_ROWS) : contacts).map<ExportRow>((c) => ({
    name: c.name ?? '',
    phone: c.phone,
    email: c.email ?? '',
    company: c.company ?? '',
    loanType: c.loanType ?? '',
    loanAmount: c.loanAmount ?? '',
    status: pretty(c.status),
    tags: c.tags,
    campaignName: c.campaign?.name ?? '',
    assignedTo: c.assignedTo?.name ?? '',
    attempts: c.attempts,
    callCount: c._count.calls,
    lastOutcome: c.calls[0] ? pretty(c.calls[0].leadStatus) : '',
    lastAttemptAt: c.lastAttemptAt,
    nextAttemptAt: c.nextAttemptAt,
    createdAt: c.createdAt,
  }));

  return { rows, columns: CONTACT_COLUMNS, truncated };
}

// ---------------------------------------------------------------------------
// calls
// ---------------------------------------------------------------------------

const CALL_COLUMNS: ExportColumn[] = [
  { key: 'startedAt', label: 'Call date' },
  { key: 'contactName', label: 'Contact' },
  { key: 'phone', label: 'Phone' },
  { key: 'campaignName', label: 'Campaign' },
  { key: 'agentName', label: 'Agent' },
  { key: 'startedBy', label: 'Started by' },
  { key: 'assignedTo', label: 'Assigned to' },
  { key: 'status', label: 'Call status' },
  { key: 'leadStatus', label: 'Outcome' },
  { key: 'interested', label: 'Interested' },
  { key: 'leadScore', label: 'Lead score' },
  { key: 'durationSec', label: 'Duration (seconds)' },
  { key: 'customerIntent', label: 'Customer intent' },
  { key: 'nextAction', label: 'Next action' },
  { key: 'objections', label: 'Objections' },
  { key: 'failureReason', label: 'Failure reason' },
  { key: 'summary', label: 'Summary' },
  { key: 'transcript', label: 'Transcript' },
];

async function buildCalls(
  user: SessionUser,
  since: Date | null,
  campaignId: string | null,
  rawStatus: string | null
): Promise<Sheet> {
  // One `status` parameter serves every kind, so accept whichever enum makes
  // sense here: `completed` is a call status, `interested` is a lead status.
  const callStatus = asCallStatus(rawStatus);
  const leadStatus = callStatus ? null : asLeadStatus(rawStatus);

  const where: Prisma.CallWhereInput = {
    AND: [
      visibleCalls(user), // their own leads, plus calls they placed themselves
      ...(since ? [{ startedAt: { gte: since } }] : []),
      ...(campaignId ? [{ campaignId }] : []),
      ...(callStatus ? [{ status: callStatus }] : []),
      ...(leadStatus ? [{ leadStatus }] : []),
    ],
  };

  const calls = await db.call.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: MAX_ROWS + 1,
    include: {
      contact: { select: { name: true, assignedTo: { select: { name: true } } } },
      agent: { select: { name: true } },
      campaign: { select: { name: true } },
      startedBy: { select: { name: true } },
    },
  });

  const truncated = calls.length > MAX_ROWS;
  const rows = (truncated ? calls.slice(0, MAX_ROWS) : calls).map<ExportRow>((c) => ({
    startedAt: c.startedAt,
    contactName: c.contact?.name ?? '',
    phone: c.phone,
    campaignName: c.campaign?.name ?? '',
    agentName: c.agent?.name ?? '',
    startedBy: c.startedBy?.name ?? '',
    assignedTo: c.contact?.assignedTo?.name ?? '',
    status: pretty(c.status),
    leadStatus: pretty(c.leadStatus),
    interested: c.interested,
    leadScore: c.leadScore ?? '',
    durationSec: c.durationSec,
    customerIntent: c.customerIntent ?? '',
    nextAction: c.nextAction ?? '',
    objections: c.objections ?? '',
    failureReason: c.failureReason ?? '',
    summary: c.summary ?? '',
    transcript: c.transcriptText ?? '',
  }));

  return { rows, columns: CALL_COLUMNS, truncated };
}

// ---------------------------------------------------------------------------
// campaign
// ---------------------------------------------------------------------------

const CAMPAIGN_COLUMNS: ExportColumn[] = [
  { key: 'name', label: 'Contact' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'loanType', label: 'Loan type' },
  { key: 'loanAmount', label: 'Loan amount' },
  { key: 'status', label: 'Contact status' },
  { key: 'assignedTo', label: 'Assigned to' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'callsMade', label: 'Calls made' },
  { key: 'talkTimeSec', label: 'Talk time (seconds)' },
  { key: 'interestedCalls', label: 'Interested calls' },
  { key: 'lastOutcome', label: 'Last outcome' },
  { key: 'leadScore', label: 'Lead score' },
  { key: 'lastCallAt', label: 'Last call' },
  { key: 'summary', label: 'Last summary' },
  { key: 'nextAttemptAt', label: 'Next attempt' },
];

async function buildCampaign(user: SessionUser, campaignId: string): Promise<Sheet | null> {
  // Scoped lookup: an employee may export a campaign they created, nobody
  // else's. Returning null makes this a 404 rather than leaking its existence.
  const campaign = await db.campaign.findFirst({
    where: { AND: [{ id: campaignId }, visibleCampaigns(user)] },
    select: { id: true },
  });
  if (!campaign) return null;

  const contactWhere: Prisma.ContactWhereInput = {
    AND: [visibleContacts(user), { campaignId: campaign.id }],
  };
  const callWhere: Prisma.CallWhereInput = {
    AND: [visibleCalls(user), { campaignId: campaign.id }],
  };

  // Per-contact call results come from grouped queries rather than a nested
  // fetch of every call: a long campaign has tens of thousands of them, and all
  // the sheet needs is a count, the talk time and the latest outcome.
  const [contacts, totals, interested] = await Promise.all([
    db.contact.findMany({
      where: contactWhere,
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS + 1,
      include: {
        assignedTo: { select: { name: true } },
        calls: {
          where: { campaignId: campaign.id },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { leadStatus: true, leadScore: true, summary: true, startedAt: true },
        },
      },
    }),
    db.call.groupBy({
      by: ['contactId'],
      where: callWhere,
      _count: true,
      _sum: { durationSec: true },
    }),
    db.call.groupBy({
      by: ['contactId'],
      where: { AND: [callWhere, INTEREST_FILTER] },
      _count: true,
    }),
  ]);

  const totalBy = new Map(totals.map((t) => [t.contactId, t]));
  const interestedBy = new Map(interested.map((t) => [t.contactId, t._count]));

  const truncated = contacts.length > MAX_ROWS;
  const rows = (truncated ? contacts.slice(0, MAX_ROWS) : contacts).map<ExportRow>((c) => {
    const total = totalBy.get(c.id);
    const last = c.calls[0] ?? null;

    return {
      name: c.name ?? '',
      phone: c.phone,
      email: c.email ?? '',
      company: c.company ?? '',
      loanType: c.loanType ?? '',
      loanAmount: c.loanAmount ?? '',
      status: pretty(c.status),
      assignedTo: c.assignedTo?.name ?? '',
      attempts: c.attempts,
      callsMade: total?._count ?? 0,
      talkTimeSec: total?._sum.durationSec ?? 0,
      interestedCalls: interestedBy.get(c.id) ?? 0,
      lastOutcome: last ? pretty(last.leadStatus) : '',
      leadScore: last?.leadScore ?? '',
      lastCallAt: last?.startedAt ?? '',
      summary: last?.summary ?? '',
      nextAttemptAt: c.nextAttemptAt,
    };
  });

  return { rows, columns: CAMPAIGN_COLUMNS, truncated };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  let user: SessionUser;
  try {
    user = await requireUser();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const params = req.nextUrl.searchParams;
  const rawType = params.get('type');
  const kind = (KINDS as string[]).includes(rawType ?? '') ? (rawType as Kind) : null;
  if (!kind) {
    return NextResponse.json(
      { error: `Unknown export type. Expected one of: ${KINDS.join(', ')}.` },
      { status: 400 }
    );
  }

  const format = parseFormat(params.get('format'));
  if (!format) {
    return NextResponse.json({ error: 'Format must be csv or xlsx.' }, { status: 400 });
  }

  const since = parseSince(params.get('days'));
  const campaignId = params.get('campaignId') || null;
  const rawStatus = params.get('status');
  const q = params.get('q');

  if (kind === 'campaign' && !campaignId) {
    return NextResponse.json(
      { error: 'campaignId is required for a campaign export.' },
      { status: 400 }
    );
  }

  let sheet: Sheet | null;
  try {
    if (kind === 'interested') {
      sheet = await buildInterested(user, since, campaignId);
    } else if (kind === 'contacts') {
      sheet = await buildContacts(user, since, campaignId, asContactStatus(rawStatus), q);
    } else if (kind === 'calls') {
      sheet = await buildCalls(user, since, campaignId, rawStatus);
    } else {
      sheet = await buildCampaign(user, campaignId as string);
    }
  } catch (e) {
    console.error('export failed:', e);
    return NextResponse.json({ error: 'Could not build the export' }, { status: 500 });
  }

  if (!sheet) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // Nothing matched. Answer in JSON so the client can say "nothing to export
  // yet" instead of handing someone an empty spreadsheet they have to open to
  // discover that. No audit row either — no data left the building.
  if (sheet.rows.length === 0) {
    return NextResponse.json({ ok: true, rows: 0, message: 'Nothing to export yet' });
  }

  const body = format === 'xlsx' ? toXlsx(sheet.rows, sheet.columns) : toCsv(sheet.rows, sheet.columns);
  const filename = filenameFor(FILE_KIND[kind], format);

  // Exporting the customer list is precisely the action you want a trail for:
  // who pulled what, how much of it, and with which filters applied.
  await db.auditLog.create({
    data: auditData(user, {
      action: 'data.exported',
      entity: 'Export',
      entityId: kind === 'campaign' ? campaignId : null,
      meta: {
        kind,
        format,
        rows: sheet.rows.length,
        truncated: sheet.truncated,
        filters: {
          days: params.get('days') ?? null,
          campaignId,
          status: rawStatus ?? null,
          q: q ?? null,
        },
      },
    }),
  });

  return new NextResponse(body, {
    headers: {
      'Content-Type': format === 'xlsx' ? XLSX_MIME : CSV_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Read by the export button for its toast; same-origin fetch can see them.
      'X-Export-Rows': String(sheet.rows.length),
      'X-Export-Truncated': sheet.truncated ? 'true' : 'false',
      'X-Export-Limit': String(MAX_ROWS),
      'Cache-Control': 'no-store',
    },
  });
}
