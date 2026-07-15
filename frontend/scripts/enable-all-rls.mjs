import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching all tables in the public schema...');
  
  // Query all tables in the 'public' schema
  const tablesResult = await prisma.$queryRawUnsafe(`
    SELECT tablename 
    FROM pg_catalog.pg_tables 
    WHERE schemaname = 'public';
  `);
  
  console.log(`Found ${tablesResult.length} tables. Enabling RLS on all of them to remove the red UNRESTRICTED badges...`);

  for (const row of tablesResult) {
    const table = row.tablename;
    // Skip prisma migrations table
    if (table === '_prisma_migrations') continue;
    
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`✅ Enabled RLS on ${table}`);
    } catch (e) {
      console.error(`❌ Failed to enable RLS on ${table}:`, e.message);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
