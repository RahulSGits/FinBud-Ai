const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.user.updateMany({
    where: { email: 'admin@finbud.ai' },
    data: { role: 'admin' }
  });
  console.log('Updated admin role');
}
main().catch(console.error).finally(() => prisma.$disconnect());
