// Creates the first admin account.
//
// Chicken-and-egg: accounts only exist by invitation, and only an admin can
// invite. This script seeds the very first admin so the invite flow has
// somewhere to start. Run once per deployment.
//
//   node scripts/bootstrap-admin.mjs "admin@company.com" "Full Name"
//
// It never sets a password. The admin receives a normal invite link, so no
// credential is ever typed into a terminal or stored in shell history.
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

const INVITE_TTL_HOURS = 48;

async function main() {
  const email = (process.argv[2] || '').toLowerCase().trim();
  const name = process.argv[3] || 'Administrator';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: node scripts/bootstrap-admin.mjs "admin@company.com" "Full Name"');
    process.exit(1);
  }

  const existingAdmins = await prisma.user.count({ where: { role: 'admin', status: 'active' } });
  if (existingAdmins > 0) {
    console.error(
      `Refusing to run: ${existingAdmins} active admin(s) already exist.\n` +
        'Invite further admins from the dashboard instead.'
    );
    process.exit(1);
  }

  const raw = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      create: { email, name, role: 'admin', status: 'invited' },
      update: { name, role: 'admin' },
    });

    await tx.invite.deleteMany({ where: { email, acceptedAt: null } });
    await tx.invite.create({
      data: { email, role: 'admin', tokenHash, expiresAt, invitedById: user.id },
    });

    await tx.auditLog.create({
      data: { action: 'admin.bootstrapped', entity: 'User', entityId: user.id, meta: { email } },
    });
  });

  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  console.log('\n  First admin created.\n');
  console.log(`  Email:   ${email}`);
  console.log(`  Expires: ${expiresAt.toLocaleString()}\n`);
  console.log('  Open this link to set the password:\n');
  console.log(`  ${base}/accept-invite?token=${encodeURIComponent(raw)}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
