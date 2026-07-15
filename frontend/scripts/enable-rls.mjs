import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Enabling RLS on all tables...');
  const tables = ['User', 'Organization', 'Agent', 'Campaign', 'Contact', 'CallLog', 'CallTranscript'];
  
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`✅ Enabled RLS on ${table}`);
    } catch (e) {
      console.error(`❌ Failed to enable RLS on ${table}:`, e.message);
    }
  }

  console.log('\nConfiguring Supabase Realtime for CallLog...');
  try {
    // In Supabase, realtime is managed via the supabase_realtime publication
    // We check if it exists first
    const publicationExists = await prisma.$queryRawUnsafe(`
      SELECT pubname FROM pg_publication WHERE pubname = 'supabase_realtime';
    `);
    
    if (Array.isArray(publicationExists) && publicationExists.length === 0) {
      // Create it if it doesn't exist
      await prisma.$executeRawUnsafe(`CREATE PUBLICATION supabase_realtime;`);
    }

    // Add the table to the publication
    await prisma.$executeRawUnsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE "public"."CallLog";`);
    console.log('✅ Added CallLog to supabase_realtime publication.');
  } catch (e) {
    if (e.message.includes('already in publication')) {
       console.log('✅ CallLog is already in supabase_realtime publication.');
    } else {
       console.error('❌ Failed to add CallLog to realtime:', e.message);
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
