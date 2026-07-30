// Back-fills a realistic call history.
//
//   node scripts/seed-calls.mjs [days]      (default 30)
//
// The live simulator only produces calls from "now", so a fresh install shows
// empty charts and a one-row call log — which makes the dashboards impossible to
// judge. This writes a plausible month of history instead: calls spread across
// employees, agents and days, each with a full agent/customer transcript, an AI
// summary and a lead outcome, using exactly the columns the real worker writes.
//
// Idempotent-ish: it deletes calls it previously seeded (identified by a
// providerCallId prefix) before writing a new batch, so re-running does not
// silently double the numbers.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_PREFIX = 'seeded-';

// Deterministic PRNG so a given run is reproducible and reviewable.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const OUTCOMES = [
  {
    weight: 26,
    answered: true,
    leadStatus: 'interested',
    interested: true,
    score: [70, 92],
    intent: 'home_loan_enquiry',
    nextAction: 'schedule_callback',
    objections: null,
    summary:
      'Customer is actively looking for a home loan of around ₹25,00,000 for a property in Pune. Salaried at Infosys for eight years. Asked about processing fees and paperwork; agreed to a callback from a loan officer tomorrow before 11am.',
    dialogue: [
      ['agent', '__OPENER__'],
      ['customer', 'Haan ji, speaking. Who is this?'],
      ['agent', 'This is Priya from Finance Buddha. You enquired about a home loan on our website last week. Is this a good time to talk for two minutes?'],
      ['customer', 'Yes yes, tell me. I was actually waiting for someone to call.'],
      ['agent', 'Perfect. Just so I can check the right options for you — roughly how much loan amount are you looking for?'],
      ['customer', 'Around twenty five lakhs. The property is in Pune, a two BHK.'],
      ['agent', 'Understood. And are you salaried or self employed?'],
      ['customer', 'Salaried. I work at Infosys, about eight years now.'],
      ['agent', 'That helps. With a stable salaried profile you would be eligible with several of our partner banks. I cannot quote an exact rate on this call, but a loan officer can walk you through the options and the processing fees.'],
      ['customer', 'Okay. What about the paperwork? Last time it was a lot of running around.'],
      ['agent', 'That part we handle for you — documents are collected digitally and we coordinate with the bank directly. Shall I book a callback tomorrow morning?'],
      ['customer', 'Yes, tomorrow morning works. Before eleven if possible.'],
      ['agent', 'Done, a callback before eleven tomorrow morning. Thank you for your time.'],
      ['customer', 'Thank you. Bye.'],
    ],
  },
  {
    weight: 20,
    answered: true,
    leadStatus: 'not_interested',
    interested: false,
    score: [3, 15],
    intent: 'not_interested',
    nextAction: 'do_not_contact',
    objections: 'already_has_loan',
    summary:
      'Customer already closed a home loan with HDFC last month and declined a balance transfer review. Asked to be removed from the calling list; number marked do not call.',
    dialogue: [
      ['agent', '__OPENER__'],
      ['customer', 'Yes, who is this?'],
      ['agent', 'This is Priya calling from Finance Buddha regarding a loan enquiry submitted from your number. Are you currently looking at any loan options?'],
      ['customer', 'No no. I already took a loan from HDFC last month itself.'],
      ['agent', 'I see, congratulations on getting that sorted. Would a balance transfer review be of any interest, in case a partner bank offers a lower rate?'],
      ['customer', 'Nahi, I just finished all the paperwork. I do not want to do all that again.'],
      ['agent', 'That is completely fair. Would you like me to remove your number from our calling list?'],
      ['customer', 'Yes please, remove it. I am getting too many calls.'],
      ['agent', 'I have marked your number as do not call. Apologies for the disturbance, and thank you for your time.'],
    ],
  },
  {
    weight: 18,
    answered: false,
    leadStatus: 'no_answer',
    interested: false,
    score: [0, 0],
    intent: null,
    nextAction: 'retry_later',
    objections: null,
    summary: 'No answer. The call rang out without being picked up.',
    dialogue: [['agent', '__OPENER__']],
  },
  {
    weight: 16,
    answered: true,
    leadStatus: 'callback_requested',
    interested: true,
    score: [52, 70],
    intent: 'personal_loan_enquiry',
    nextAction: 'schedule_callback',
    objections: 'bad_timing',
    summary:
      'Customer was driving and asked to be called back after 7pm. Confirmed interest in a personal loan of around ₹8,00,000 for a family wedding.',
    dialogue: [
      ['agent', '__OPENER__'],
      ['customer', 'Hello? Haan, but I am driving right now.'],
      ['agent', 'Of course, I will be very quick. This is Priya from Finance Buddha about your loan enquiry. Would you prefer I call back at a better time?'],
      ['customer', 'Yes, call me in the evening. After seven.'],
      ['agent', 'Noted, after seven this evening. Was your enquiry for a personal loan or a home loan?'],
      ['customer', 'Personal loan. Around eight lakhs, for my sister’s wedding.'],
      ['agent', 'Understood. I will have a loan officer call you after seven with the options. Please drive safely.'],
      ['customer', 'Thik hai, thank you.'],
    ],
  },
  {
    weight: 10,
    answered: true,
    leadStatus: 'interested',
    interested: true,
    score: [60, 80],
    intent: 'balance_transfer',
    nextAction: 'send_details',
    objections: 'needs_documentation',
    summary:
      'Customer is paying 9.4% on an existing home loan and is open to a balance transfer if the saving is meaningful. Wants the comparison and charges emailed before committing to a call.',
    dialogue: [
      ['agent', '__OPENER__'],
      ['customer', 'Yes, but make it quick please.'],
      ['agent', 'Understood. This is Priya from Finance Buddha — you enquired about reducing your existing home loan EMI. May I ask what rate you are on currently?'],
      ['customer', 'Nine point four percent. It has gone up twice already.'],
      ['agent', 'That is on the higher side for a salaried profile. A balance transfer to a partner bank could bring that down, though the exact rate depends on the bank’s assessment.'],
      ['customer', 'How much would I actually save? And what are the charges?'],
      ['agent', 'That depends on your outstanding amount and remaining tenure. Can I email you a written comparison including all charges, so you can look at it properly?'],
      ['customer', 'Yes, email it. I will look and then decide.'],
      ['agent', 'I will send that across today. Thank you for your time.'],
    ],
  },
  {
    weight: 7,
    answered: false,
    leadStatus: 'voicemail',
    interested: false,
    score: [0, 5],
    intent: null,
    nextAction: 'retry_later',
    objections: null,
    summary: 'Reached voicemail. Left a short message with a callback reference.',
    dialogue: [
      ['agent', '__OPENER__'],
      ['agent', 'This message is from Finance Buddha regarding the loan enquiry submitted from this number. We will try you again at a better time. Thank you.'],
    ],
  },
  {
    weight: 3,
    answered: false,
    leadStatus: 'unknown',
    interested: false,
    score: [0, 0],
    intent: null,
    nextAction: 'retry_later',
    objections: null,
    summary: 'Call connected but the line dropped before a conversation could take place.',
    dialogue: [
      ['agent', '__OPENER__'],
      ['agent', 'Hello? Can you hear me?'],
    ],
  },
];

function pick(random) {
  const total = OUTCOMES.reduce((n, o) => n + o.weight, 0);
  let n = random() * total;
  for (const o of OUTCOMES) {
    if (n < o.weight) return o;
    n -= o.weight;
  }
  return OUTCOMES[0];
}

function between(random, [lo, hi]) {
  return lo === hi ? lo : lo + Math.floor(random() * (hi - lo + 1));
}

async function main() {
  const days = Math.max(1, Math.min(Number(process.argv[2]) || 30, 365));
  const random = makeRandom(20260728);

  const [agents, contacts, employees] = await Promise.all([
    prisma.agent.findMany(),
    prisma.contact.findMany({ include: { campaign: true } }),
    prisma.user.findMany({ where: { role: 'employee', status: 'active' } }),
  ]);

  if (!agents.length || !contacts.length) {
    console.error('Run `node scripts/seed.mjs` first — this needs agents and contacts to exist.');
    process.exit(1);
  }

  const removed = await prisma.call.deleteMany({
    where: { providerCallId: { startsWith: SEED_PREFIX } },
  });
  if (removed.count) console.log(`Removed ${removed.count} previously seeded call(s).`);

  const rows = [];
  let n = 0;

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    // Fewer calls at weekends, so the daily chart has believable shape.
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);
    const weekend = day.getDay() === 0;
    const callsToday = weekend ? Math.floor(random() * 3) : 4 + Math.floor(random() * 9);

    for (let i = 0; i < callsToday; i++) {
      const outcome = pick(random);
      const contact = contacts[Math.floor(random() * contacts.length)];
      const agent = agents[Math.floor(random() * agents.length)];

      // Campaign calls have no startedById; employee-initiated ones do. Mixing
      // both is what makes the analytics attribution logic worth testing.
      const viaCampaign = random() < 0.65;
      const employee = employees.length
        ? employees[Math.floor(random() * employees.length)]
        : null;

      const startedAt = new Date(day);
      startedAt.setHours(9 + Math.floor(random() * 11), Math.floor(random() * 60), Math.floor(random() * 60));

      const durationSec = outcome.answered ? 45 + Math.floor(random() * 220) : 0;
      const greeting = (agent.firstMessage || 'Hello, am I speaking with the account holder?').replace(
        /\{\{\s*customer_name\s*\}\}/g,
        contact.name || 'there'
      );

      const transcript = outcome.dialogue.map(([who, text]) => ({
        role: who === 'agent' ? 'assistant' : 'user',
        text: text === '__OPENER__' ? greeting : text,
      }));

      rows.push({
        phone: contact.phone,
        direction: 'outbound',
        status: 'completed',
        providerCallId: `${SEED_PREFIX}${startedAt.getTime()}-${n++}`,
        contactId: contact.id,
        campaignId: viaCampaign ? contact.campaignId : null,
        agentId: agent.id,
        startedById: viaCampaign ? null : employee?.id ?? null,
        durationSec,
        transcript,
        transcriptText: transcript
          .map((t) => `${t.role === 'user' ? 'Customer' : 'Agent'}: ${t.text}`)
          .join('\n'),
        summary: outcome.summary,
        interested: outcome.interested,
        leadStatus: outcome.leadStatus,
        leadScore: between(random, outcome.score),
        customerIntent: outcome.intent,
        nextAction: outcome.nextAction,
        objections: outcome.objections,
        recordingUrl: outcome.answered ? '/sample-call.mp3' : null,
        startedAt,
        endedAt: new Date(startedAt.getTime() + durationSec * 1000),
      });
    }
  }

  await prisma.call.createMany({ data: rows });

  const answered = rows.filter((r) => r.durationSec > 0).length;
  const interested = rows.filter((r) => r.interested).length;
  console.log(`Seeded ${rows.length} calls across ${days} days.`);
  console.log(`  connected: ${answered} (${Math.round((answered / rows.length) * 100)}%)`);
  console.log(`  interested: ${interested} (${Math.round((interested / answered) * 100)}% of connected)`);
  console.log(`  with full transcripts: ${rows.filter((r) => r.transcript.length > 1).length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
