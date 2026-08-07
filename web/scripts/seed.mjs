// Seeds a working demo: one admin, two employees, an agent, contacts and a
// campaign ready to dial.
//
//   node scripts/seed.mjs
//
// Idempotent — re-running updates the same rows rather than duplicating them,
// so it is safe to run repeatedly during development.
//
// Unlike scripts/bootstrap-admin.mjs (which invites a real admin by email and
// never sets a password), this creates accounts with a known password so the
// app can be signed into immediately. Do not run it against production.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Finbud@2026';

const PEOPLE = [
  { email: 'gaurav@financebuddha.com', name: 'Gaurav', employeeId: 'FB-001', role: 'admin', department: 'Operations', designation: 'Head of Operations' },
  { email: 'rahul@financebuddha.com', name: 'Rahul', employeeId: 'FB-014', role: 'employee', department: 'Sales', designation: 'Loan Advisor' },
  { email: 'aditya@financebuddha.com', name: 'Aditya', employeeId: 'FB-021', role: 'employee', department: 'Sales', designation: 'Loan Advisor' },
];

const AGENT = {
  name: 'Home Loan Qualifier',
  description: 'Calls home-loan applicants to confirm interest and book a callback',
  isActive: true,
  firstMessage:
    'Hello {{customer_name}}, this is Priya calling from Finance Buddha about the home loan enquiry you submitted. Is now a good time to talk?',
  systemPrompt:
    'You are Priya, a warm and efficient loan advisor at Finance Buddha. You speak clearly and never rush the customer. If asked directly, you say you are an AI assistant. You never invent interest rates, approval decisions or offers.',
  businessContext:
    'Finance Buddha arranges home loans, personal loans and balance transfers through partner banks.\nApplications are submitted online and a human loan officer completes the paperwork.\nA loan officer can call back the same day or the next morning.',
  callObjective:
    'Confirm the customer still wants a home loan and book a callback with a human loan officer. The call is successful when a callback slot is agreed or the customer clearly declines.',
  qualificationRules:
    'Ask whether they are still looking for a loan.\nAsk roughly how much they need and what the property is for.\nAsk whether they are salaried or self employed.\nA lead is qualified when they still want the loan and agree to speak with a loan officer.',
  objectionHandling:
    'I already took a loan elsewhere -> Thank them, ask if they would like a balance transfer review, and accept no as an answer.\nI am busy right now -> Offer to call back at a time they choose and end the call quickly.\nHow did you get my number -> Explain they submitted an enquiry on the Finance Buddha website.',
  complianceRules:
    'Identify yourself and the company within the first sentence.\nIf the customer asks to be removed from the list, apologise, confirm they will not be called again, and end the call immediately.\nNever quote a specific interest rate or promise approval.\nDo not call outside 9am to 8pm.',
  closingScript:
    'Interested: confirm the callback time, repeat it back, thank them and end.\nNot interested: thank them for their time and end without pushing.\nCallback requested: confirm the time they asked for and end.',
  llmModel: 'openai/gpt-4o-mini',
  sttModel: 'deepgram/nova-3',
  ttsModel: 'cartesia/sonic-3',
  language: 'multi',
  voiceProvider: 'livekit',
};

const CONTACTS = [
  { name: 'Rahul Sharma', phone: '+919812345001', company: 'Infosys', loanType: 'home', loanAmount: 4500000, email: 'rahul.sharma@example.com' },
  { name: 'Priya Nair', phone: '+919812345002', company: 'Wipro', loanType: 'home', loanAmount: 3200000, email: 'priya.nair@example.com' },
  { name: 'Imran Qureshi', phone: '+919812345003', company: 'Self-employed', loanType: 'personal', loanAmount: 800000, email: 'imran.q@example.com' },
  { name: 'Sneha Patil', phone: '+919812345004', company: 'TCS', loanType: 'balance_transfer', loanAmount: 2900000, email: 'sneha.patil@example.com' },
  { name: 'Vikram Reddy', phone: '+919812345005', company: 'Deloitte', loanType: 'home', loanAmount: 6100000, email: 'vikram.reddy@example.com' },
  { name: 'Anjali Desai', phone: '+919812345006', company: 'HDFC', loanType: 'personal', loanAmount: 550000, email: 'anjali.desai@example.com' },
  { name: 'Karthik Iyer', phone: '+919812345007', company: 'Zoho', loanType: 'home', loanAmount: 3800000, email: 'karthik.iyer@example.com' },
  { name: 'Meera Joshi', phone: '+919812345008', company: 'Freelance', loanType: 'personal', loanAmount: 400000, email: 'meera.joshi@example.com' },
];

// Written to be sent as-is: no markdown headings, short lines, and a clear
// opt-out, which is what keeps a business number off WhatsApp's block list.
const TEMPLATES = [
  {
    name: 'Interested — share details',
    leadStatus: 'interested',
    body:
      'Hi {{first_name}}, thank you for speaking with us at {{company_name}} just now.\n\n' +
      'As discussed, here is a summary of your {{loan_type}} enquiry for {{loan_amount}}. ' +
      'One of our loan officers will call you shortly with the exact rates and the documents needed.\n\n' +
      'If you have any questions in the meantime, just reply to this message.',
  },
  {
    name: 'Callback confirmation',
    leadStatus: 'callback_requested',
    body:
      'Hi {{first_name}}, thanks for your time on the call.\n\n' +
      'We have noted your request for a callback at *{{callback_time}}*. ' +
      'Our loan officer will reach you on {{phone}} then.\n\n' +
      'Reply here if you would like to change the time.',
  },
  {
    name: 'Documents checklist',
    leadStatus: null,
    body:
      'Hi {{first_name}}, to move your {{loan_type}} application forward, please keep these ready:\n\n' +
      '1. PAN card\n2. Aadhaar card\n3. Last 3 salary slips\n4. Last 6 months bank statement\n\n' +
      'You can reply with photos of the documents and we will take it from there.',
  },
  {
    name: 'Missed you — try again',
    leadStatus: 'no_answer',
    body:
      'Hi {{first_name}}, we tried reaching you from {{company_name}} regarding your {{loan_type}} enquiry ' +
      'but could not connect.\n\n' +
      'Please reply with a convenient time and we will call you back. ' +
      'If you are no longer interested, reply STOP and we will not contact you again.',
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const users = [];
  for (const p of PEOPLE) {
    users.push(
      await prisma.user.upsert({
        where: { email: p.email },
        // passwordHash is reset on update as well as create. Without it, a
        // re-seed over an existing database leaves the demo accounts on
        // whatever password they already had — which nobody knows — and the
        // script silently fails the one thing it promises: credentials you can
        // sign in with. Safe only because this is the demo seeder; the
        // production path is scripts/bootstrap-admin.mjs, which never sets one.
        update: {
          name: p.name, role: p.role, employeeId: p.employeeId, status: 'active',
          department: p.department, designation: p.designation,
          passwordHash, mustChangePassword: false,
        },
        create: { ...p, passwordHash, status: 'active', mustChangePassword: false },
      })
    );
  }
  const [admin, ravi, neha] = users;
  console.log(`Users: ${users.map((u) => u.email).join(', ')}`);

  // Agents have no natural unique key, so match on name to stay idempotent.
  const existingAgent = await prisma.agent.findFirst({ where: { name: AGENT.name } });
  const agent = existingAgent
    ? await prisma.agent.update({ where: { id: existingAgent.id }, data: AGENT })
    : await prisma.agent.create({ data: { ...AGENT, createdById: admin.id } });
  console.log(`Agent: ${agent.name}`);

  const existingCampaign = await prisma.campaign.findFirst({
    where: { name: 'July home loan follow-ups' },
  });
  const campaign = existingCampaign
    ? await prisma.campaign.update({
        where: { id: existingCampaign.id },
        data: { agentId: agent.id, concurrency: 3, retryLimit: 1, retryDelayMins: 30 },
      })
    : await prisma.campaign.create({
        data: {
          name: 'July home loan follow-ups',
          agentId: agent.id,
          createdById: admin.id,
          status: 'draft',
          concurrency: 3,
          retryLimit: 1,
          retryDelayMins: 30,
          businessHours: { tz: 'Asia/Kolkata', days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '20:00' },
        },
      });
  console.log(`Campaign: ${campaign.name}`);

  // Alternate ownership so both employees have leads to work.
  const owners = [ravi.id, neha.id];
  for (const [i, c] of CONTACTS.entries()) {
    await prisma.contact.upsert({
      where: { phone: c.phone },
      update: { ...c, campaignId: campaign.id, assignedToId: owners[i % owners.length] },
      create: {
        ...c,
        campaignId: campaign.id,
        assignedToId: owners[i % owners.length],
        status: 'pending',
      },
    });
  }
  console.log(`Contacts: ${CONTACTS.length}`);

  // Starter WhatsApp follow-ups, one per outcome staff actually act on. Matched
  // on name so editing a body in the UI is not overwritten by a re-seed.
  for (const t of TEMPLATES) {
    const existing = await prisma.messageTemplate.findFirst({ where: { name: t.name } });
    if (existing) continue;
    await prisma.messageTemplate.create({ data: { ...t, createdById: admin.id } });
  }
  console.log(`Message templates: ${TEMPLATES.length}`);

  console.log('\nSign in at /login with any of:');
  for (const p of PEOPLE) {
    console.log(`  ${p.email}  (or ${p.employeeId})   ${PASSWORD}   [${p.role}]`);
  }
  console.log('\nStart the campaign from /admin/campaigns to watch calls run.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
