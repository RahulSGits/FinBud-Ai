// Removes the seeded demo data, leaving real records untouched.
//
//   node scripts/purge-demo-data.mjs            # dry run — shows what would go
//   node scripts/purge-demo-data.mjs --confirm  # actually delete
//
// Deletion is irreversible and this runs against whatever DATABASE_URL points
// at, so it refuses to delete anything without --confirm, and prints the exact
// rows first. Real calls placed through a provider are never touched: they are
// distinguished by having a providerCallId that the simulator never produces.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const confirm = process.argv.includes('--confirm');

// Every marker of a simulated or seeded row.
//  - `seeded-`  scripts/seed-calls.mjs back-fill
//  - `mock-`    the in-app simulator (lib/livekit/mock.ts)
// A call with neither prefix reached a real provider and is real history.
const FAKE_CALL_PREFIXES = ['seeded-', 'mock-'];

const DEMO_CONTACT_PHONES = [
  '+919812345001', '+919812345002', '+919812345003', '+919812345004',
  '+919812345005', '+919812345006', '+919812345007', '+919812345008',
];

const DEMO_CAMPAIGNS = ['July home loan follow-ups'];

async function main() {
  const fakeCallWhere = {
    OR: [
      ...FAKE_CALL_PREFIXES.map((p) => ({ providerCallId: { startsWith: p } })),
      // Simulated calls placed before providerCallId was recorded.
      { providerCallId: null, transcriptText: { contains: 'this is Priya calling from Finance Buddha' } },
    ],
  };

  const [fakeCalls, demoContacts, demoCampaigns, realCalls, totalCalls] = await Promise.all([
    prisma.call.count({ where: fakeCallWhere }),
    prisma.contact.count({ where: { phone: { in: DEMO_CONTACT_PHONES } } }),
    prisma.campaign.count({ where: { name: { in: DEMO_CAMPAIGNS } } }),
    prisma.call.count({
      where: {
        providerCallId: { not: null },
        NOT: FAKE_CALL_PREFIXES.map((p) => ({ providerCallId: { startsWith: p } })),
      },
    }),
    prisma.call.count(),
  ]);

  console.log('Demo data found:');
  console.log(`  simulated calls   ${fakeCalls}`);
  console.log(`  demo contacts     ${demoContacts}`);
  console.log(`  demo campaigns    ${demoCampaigns}`);
  console.log('');
  console.log('Kept:');
  console.log(`  real provider calls  ${realCalls}`);
  console.log(`  other calls          ${totalCalls - fakeCalls - realCalls}`);

  if (!confirm) {
    console.log('\nDry run. Re-run with --confirm to delete.');
    return;
  }

  // Messages and notes reference contacts with onDelete: SetNull, so they
  // survive as orphans rather than blocking the delete. Remove the ones that
  // belong to demo contacts explicitly, or the WhatsApp log keeps rows about
  // people who no longer exist.
  const demoContactIds = (
    await prisma.contact.findMany({
      where: { phone: { in: DEMO_CONTACT_PHONES } },
      select: { id: true },
    })
  ).map((c) => c.id);

  const removedMessages = await prisma.message.deleteMany({ where: { contactId: { in: demoContactIds } } });
  const removedNotes = await prisma.note.deleteMany({ where: { contactId: { in: demoContactIds } } });
  const removedCalls = await prisma.call.deleteMany({ where: fakeCallWhere });
  // Any remaining calls on a demo contact, whatever their id shape.
  const removedContactCalls = await prisma.call.deleteMany({ where: { contactId: { in: demoContactIds } } });
  const removedContacts = await prisma.contact.deleteMany({ where: { id: { in: demoContactIds } } });

  // Campaigns last: Call and Contact both reference them.
  const campaigns = await prisma.campaign.findMany({
    where: { name: { in: DEMO_CAMPAIGNS } },
    select: { id: true },
  });
  for (const c of campaigns) {
    await prisma.call.deleteMany({ where: { campaignId: c.id } });
    await prisma.contact.updateMany({ where: { campaignId: c.id }, data: { campaignId: null } });
  }
  const removedCampaigns = await prisma.campaign.deleteMany({ where: { id: { in: campaigns.map((c) => c.id) } } });

  console.log('\nDeleted:');
  console.log(`  calls      ${removedCalls.count + removedContactCalls.count}`);
  console.log(`  contacts   ${removedContacts.count}`);
  console.log(`  campaigns  ${removedCampaigns.count}`);
  console.log(`  messages   ${removedMessages.count}`);
  console.log(`  notes      ${removedNotes.count}`);

  const [callsLeft, contactsLeft] = await Promise.all([prisma.call.count(), prisma.contact.count()]);
  console.log(`\nRemaining: ${callsLeft} call(s), ${contactsLeft} contact(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
