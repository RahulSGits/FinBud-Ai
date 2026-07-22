// Seeds the demo login accounts.
//
// Idempotent: re-running updates the password/role rather than creating
// duplicates, so it is safe to run after every deploy.
//
//   node scripts/seed-demo-accounts.mjs
//
// Both accounts MUST have an organizationId — every dashboard API route
// rejects users without one (`if (!user || !user.organizationId) -> 401`),
// so an org-less demo user can sign in but sees nothing but errors.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ORG_NAME = 'Voxora Demo Organization';

const ACCOUNTS = [
  {
    email: 'admin@voxora.ai',
    password: 'admin123',
    fullName: 'Voxora Admin',
    role: 'admin',
  },
  {
    email: 'demo@voxora.ai',
    password: 'demo123',
    fullName: 'Demo User',
    role: 'member',
  },
];

async function main() {
  // Reuse an existing organization so demo users land alongside existing data.
  let org = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
  if (!org) org = await prisma.organization.findFirst();
  if (!org) org = await prisma.organization.create({ data: { name: ORG_NAME } });

  console.log(`Organization: ${org.name} (${org.id})`);

  for (const account of ACCOUNTS) {
    const password = await bcrypt.hash(account.password, 10);

    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        password,
        fullName: account.fullName,
        role: account.role,
        organizationId: org.id,
      },
      // Reset the password and re-attach the org on every run so a drifted
      // or org-less row is repaired rather than left broken.
      update: {
        password,
        fullName: account.fullName,
        role: account.role,
        organizationId: org.id,
      },
    });

    console.log(`  ✓ ${user.email.padEnd(20)} role=${user.role.padEnd(6)} org=${user.organizationId}`);
  }

  // Repair any pre-existing user left without an organization by the old
  // hardcoded login path.
  const orphans = await prisma.user.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  if (orphans.count > 0) {
    console.log(`  ✓ repaired ${orphans.count} user(s) that had no organization`);
  }

  console.log('\nDemo accounts ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
