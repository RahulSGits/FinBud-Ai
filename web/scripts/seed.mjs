// Seeds the accounts and the starter WhatsApp templates. Nothing else.
//
// It used to also create a demo agent, a demo campaign and eight invented
// contacts with Indian names and plausible loan amounts. Those rows are
// indistinguishable from real ones in the dashboard, and a re-seed silently put
// them back after they had been deleted — so a call log that looked like real
// activity was mostly fixtures. Agents, campaigns and contacts are now only
// ever created by a person or an import.
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
  const [admin] = users;
  console.log(`Users: ${users.map((u) => u.email).join(', ')}`);

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
  console.log('\nNo agents, campaigns or contacts are created — build those in the app.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
