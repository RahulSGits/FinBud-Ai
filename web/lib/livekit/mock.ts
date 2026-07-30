// Mock call simulator — active when USE_MOCK_CALLS=true.
//
// Runs the full call lifecycle (ringing → in progress → transcript → analysis)
// against the same database writes the real worker performs, so campaigns,
// dashboards and analytics can be exercised end to end with zero telephony or
// model spend.
import { CallStatus, ContactStatus, LeadStatus } from '@prisma/client';
import { db } from '../db';
import type { DispatchParams, DispatchResult } from './dispatch';

/** Deterministic per-call outcome so a given call always replays the same. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

interface Outcome {
  weight: number;
  answered: boolean;
  leadStatus: LeadStatus;
  interested: boolean;
  leadScore: number;
  summary: string;
  intent: string | null;
  nextAction: string;
  objections: string | null;
}

const OUTCOMES: Outcome[] = [
  {
    weight: 30, answered: true, leadStatus: LeadStatus.interested, interested: true, leadScore: 82,
    summary: 'Customer is actively looking for a home loan of around ₹25,00,000. Asked about interest rates and processing fees, and requested a callback from a loan officer tomorrow morning.',
    intent: 'home_loan_enquiry', nextAction: 'schedule_callback', objections: null,
  },
  {
    weight: 22, answered: true, leadStatus: LeadStatus.not_interested, interested: false, leadScore: 8,
    summary: 'Customer already has an ongoing loan with another lender and is not looking to refinance at this time.',
    intent: 'not_interested', nextAction: 'do_not_contact', objections: 'already_has_loan',
  },
  {
    weight: 20, answered: false, leadStatus: LeadStatus.no_answer, interested: false, leadScore: 0,
    summary: 'No answer. The call rang out without being picked up.',
    intent: null, nextAction: 'retry_later', objections: null,
  },
  {
    weight: 14, answered: true, leadStatus: LeadStatus.callback_requested, interested: true, leadScore: 61,
    summary: 'Customer was driving and asked to be called back in the evening. Showed initial interest in a personal loan.',
    intent: 'personal_loan_enquiry', nextAction: 'schedule_callback', objections: 'bad_timing',
  },
  {
    weight: 8, answered: false, leadStatus: LeadStatus.voicemail, interested: false, leadScore: 3,
    summary: 'Reached voicemail. Left a short message with a callback number.',
    intent: null, nextAction: 'retry_later', objections: null,
  },
  {
    weight: 6, answered: true, leadStatus: LeadStatus.interested, interested: true, leadScore: 74,
    summary: 'Customer asked detailed questions about balance transfer options and eligibility. Wants documentation emailed before deciding.',
    intent: 'balance_transfer', nextAction: 'send_details', objections: 'needs_documentation',
  },
];

function pickOutcome(seed: string): Outcome {
  const total = OUTCOMES.reduce((n, o) => n + o.weight, 0);
  let n = hash(seed) % total;
  for (const o of OUTCOMES) {
    if (n < o.weight) return o;
    n -= o.weight;
  }
  return OUTCOMES[0];
}

/**
 * Full agent/customer dialogues, one per outcome.
 *
 * Written out turn by turn rather than assembled from fragments: a call record
 * is the thing an employee actually reads before following a lead up, and a
 * three-line stub tells them nothing. These run the real shape of a
 * qualification call — identify, confirm interest, qualify (amount, employment,
 * property), handle the objection, then close on the outcome — including the
 * code-mixed Hindi/English an Indian customer actually speaks.
 */
const DIALOGUE: Record<LeadStatus, { agent: string; customer?: string }[]> = {
  [LeadStatus.interested]: [
    { agent: '__OPENER__', customer: 'Haan ji, speaking. Who is this?' },
    {
      agent: 'This is Priya from Finance Buddha. You enquired about a home loan on our website last week. Is this a good time to talk for two minutes?',
      customer: 'Yes yes, tell me. I was actually waiting for someone to call.',
    },
    {
      agent: 'Perfect. Just so I can check the right options for you — roughly how much loan amount are you looking for?',
      customer: 'Around twenty five lakhs. The property is in Pune, a two BHK.',
    },
    {
      agent: 'Understood, twenty five lakhs for a two BHK in Pune. And are you salaried or self employed?',
      customer: 'Salaried. I work at Infosys, about eight years now.',
    },
    {
      agent: 'That helps. With a stable salaried profile you would be eligible with several of our partner banks. I am not able to quote you an exact rate on this call, but a loan officer can walk you through the options and the processing fees.',
      customer: 'Okay. What about the paperwork? Last time it was a lot of running around.',
    },
    {
      agent: 'That part we handle for you — the loan officer collects the documents digitally and coordinates with the bank directly. Shall I book a callback for you tomorrow morning?',
      customer: 'Yes, tomorrow morning works. Before eleven if possible.',
    },
    {
      agent: 'Done, I have noted a callback before eleven tomorrow morning. Someone from the loan team will call you on this same number. Thank you for your time.',
      customer: 'Thank you. Bye.',
    },
  ],

  [LeadStatus.not_interested]: [
    { agent: '__OPENER__', customer: 'Yes, who is this?' },
    {
      agent: 'This is Priya calling from Finance Buddha regarding a loan enquiry submitted from your number. Are you currently looking at any loan options?',
      customer: 'No no. I already took a loan from HDFC last month itself.',
    },
    {
      agent: 'I see, congratulations on getting that sorted. Would a balance transfer review be of any interest, in case a partner bank can offer you a lower rate?',
      customer: 'Nahi, I just finished all the paperwork. I do not want to do all that again.',
    },
    {
      agent: 'That is completely fair. Would you like me to remove your number from our calling list?',
      customer: 'Yes please, remove it. I am getting too many calls.',
    },
    {
      agent: 'I have marked your number as do not call, and you will not receive further calls from us. Apologies for the disturbance, and thank you for your time.',
    },
  ],

  [LeadStatus.callback_requested]: [
    { agent: '__OPENER__', customer: 'Hello? Haan, but I am driving right now.' },
    {
      agent: 'Of course, I will be very quick. This is Priya from Finance Buddha about your loan enquiry. Would you prefer I call back at a better time?',
      customer: 'Yes, call me in the evening. After seven.',
    },
    {
      agent: 'Noted, after seven this evening. Just so the right person calls you — was your enquiry for a personal loan or a home loan?',
      customer: 'Personal loan. Around eight lakhs, for my sister’s wedding.',
    },
    {
      agent: 'Understood, a personal loan of around eight lakhs. I will have a loan officer call you after seven with the options. Please drive safely.',
      customer: 'Thik hai, thank you.',
    },
  ],

  [LeadStatus.voicemail]: [
    { agent: '__OPENER__' },
    {
      agent: 'This message is from Finance Buddha regarding the loan enquiry submitted from this number. We will try you again at a better time, or you can reach us on our website. Thank you.',
    },
  ],

  [LeadStatus.no_answer]: [{ agent: '__OPENER__' }],

  [LeadStatus.unknown]: [
    { agent: '__OPENER__', customer: 'Hello?' },
    { agent: 'This is Priya from Finance Buddha. Can you hear me?' },
  ],
};

function buildTranscript(outcome: Outcome, greeting: string, name?: string | null) {
  const opener = greeting.replace(/\{\{\s*customer_name\s*\}\}/g, name || 'there');

  if (!outcome.answered) {
    const script = DIALOGUE[outcome.leadStatus] ?? DIALOGUE[LeadStatus.no_answer];
    return script.map((turn) => ({
      role: 'assistant',
      text: turn.agent === '__OPENER__' ? opener : turn.agent,
    }));
  }

  const script = DIALOGUE[outcome.leadStatus] ?? DIALOGUE[LeadStatus.interested];
  const turns: { role: string; text: string }[] = [];

  for (const turn of script) {
    turns.push({ role: 'assistant', text: turn.agent === '__OPENER__' ? opener : turn.agent });
    if (turn.customer) turns.push({ role: 'user', text: turn.customer });
  }
  return turns;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serverless hosts freeze the instance once the response is sent, so a
 * fire-and-forget simulation is not guaranteed to run — on Vercel a mock call
 * could sit at "ringing" until the stale-call reaper failed it, which reads as
 * a broken product on the very first demo. There the lifecycle runs inline
 * (compressed, so a campaign tick dialling several contacts stays fast); on a
 * long-lived local server it stays in the background at a watchable pace.
 */
const SERVERLESS = !!process.env.VERCEL;

/**
 * Simulate a call. Locally it returns immediately like the real dispatcher and
 * drives the lifecycle in the background; on serverless it completes inline.
 */
export async function mockDispatch(params: DispatchParams): Promise<DispatchResult> {
  const roomName = `mock-${params.callId}`;
  if (SERVERLESS) {
    await simulate(params).catch((e) => console.error('[mock call] failed', e));
    // The Call row is already 'completed', but callers treat this as "the dial
    // went out" — returning ringing keeps the two modes indistinguishable.
    return { roomName, status: CallStatus.ringing };
  }
  void simulate(params).catch((e) => console.error('[mock call] failed', e));
  return { roomName, status: CallStatus.ringing };
}

async function simulate(params: DispatchParams): Promise<void> {
  const outcome = pickOutcome(params.callId);
  const pace = (ms: number) => (SERVERLESS ? sleep(Math.min(ms, 50)) : sleep(ms));

  const agent = await db.agent.findUnique({
    where: { id: params.agentId },
    select: { firstMessage: true },
  });
  const greeting = agent?.firstMessage || 'Hello, am I speaking with the account holder?';

  await pace(700);
  await db.call.updateMany({
    where: { id: params.callId, status: CallStatus.initiated },
    data: { status: CallStatus.ringing },
  });

  if (outcome.answered) {
    await pace(900);
    await db.call.updateMany({
      where: { id: params.callId },
      data: { status: CallStatus.in_progress },
    });
  }

  await pace(1200);

  const turns = buildTranscript(outcome, greeting, params.customerName);
  const durationSec = outcome.answered ? 40 + (hash(params.callId) % 170) : 0;

  // Route through the same reporting path the real worker uses, so mock and
  // live calls can never diverge in how results are persisted.
  const { applyCallReport } = await import('./report');
  await applyCallReport({
    callId: params.callId,
    durationSec,
    transcript: turns,
    transcriptText: turns
      .map((t) => `${t.role === 'user' ? 'Customer' : 'Agent'}: ${t.text}`)
      .join('\n'),
    summary: outcome.summary,
    interested: outcome.interested,
    leadStatus: outcome.leadStatus,
    leadScore: outcome.leadScore,
    customerIntent: outcome.intent,
    nextAction: outcome.nextAction,
    objections: outcome.objections,
    recordingUrl: outcome.answered ? '/sample-call.mp3' : null,
  });
}

/** Contact statuses a mock outcome should map onto. */
export function contactStatusFor(lead: LeadStatus): ContactStatus {
  if (lead === LeadStatus.no_answer || lead === LeadStatus.voicemail) return ContactStatus.retry;
  if (lead === LeadStatus.not_interested) return ContactStatus.do_not_call;
  return ContactStatus.completed;
}
