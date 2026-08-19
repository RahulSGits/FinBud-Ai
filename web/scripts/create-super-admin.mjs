// Creates (or promotes) the platform owner.
//
//   node scripts/create-super-admin.mjs owner@example.com "Full Name"
//
// The platform owner belongs to NO company — that is what lets them see across
// all of them, and it is why this cannot be done through the normal user
// screens, which only ever create people inside the creator's own company.
//
// Idempotent: run it again on the same address to promote an existing account
// rather than fail on the unique email.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

const email = (process.argv[2] ?? '').toLowerCase().trim();
const name = process.argv[3] ?? 'Platform Owner';

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('usage: node scripts/create-super-admin.mjs <email> ["Full Name"]');
  process.exit(1);
}

/**
 * A password nobody has to think up.
 *
 * Generated rather than shared-default, because this account can see every
 * company on the platform — the one login where a predictable password is
 * least acceptable. Shown once; only the hash is stored.
 */
function strongPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `Fb-${out.slice(0, 6)}-${out.slice(6, 12)}-${out.slice(12, 16)}`;
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      // Detached from any company: a platform owner sitting inside one tenant
      // would be scoped to it by every helper in lib/authz.
      data: { role: 'super_admin', companyId: null, status: 'active' },
    });
    console.log(`Promoted existing account to platform owner: ${email}`);
    console.log('Password unchanged. Use the account you already had.');
    return;
  }

  const password = strongPassword();
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: 'super_admin',
      status: 'active',
      companyId: null,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
    },
  });

  await prisma.auditLog.create({
    data: { action: 'platform.owner_created', entity: 'User', entityId: user.id },
  }).catch(() => {});

  console.log('Platform owner created.\n');
  console.log(`  email    : ${email}`);
  console.log(`  password : ${password}`);
  console.log('\nShown once — it is not stored anywhere in readable form.');
  console.log('You will be asked to change it on first sign-in. Sign in at /platform.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
