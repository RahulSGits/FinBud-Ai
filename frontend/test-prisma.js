const { PrismaClient } = require('@prisma/client');
console.log("URL IS:", process.env.DATABASE_URL);
const prisma = new PrismaClient();
prisma.user.findFirst().then(console.log).catch(console.error).finally(() => prisma.$disconnect());
