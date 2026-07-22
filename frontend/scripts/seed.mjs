import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Clear out everything first to prevent duplicates on rerun
  await prisma.organization.deleteMany({});

  const org = await prisma.organization.create({
    data: {
      name: 'FinBud Solutions',
    },
  });

  const hashed = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      email: 'admin@finbud.ai',
      password: hashed,
      fullName: 'FinBud Admin',
      role: 'admin',
      organizationId: org.id,
    }
  });

  const agent = await prisma.agent.create({
    data: {
      organizationId: org.id,
      name: 'Priya (Sales)',
      description: 'AI Agent for Outbound Sales',
      llmProvider: 'openai',
      model: 'gpt-4o-mini',
      voiceProvider: 'exote',
      voiceId: 'exote_default',
      status: 'active',
      systemPrompt: 'You are Priya, a helpful sales assistant.',
      firstMessage: 'Hello, this is Priya from FinBud!',
      // Left null on purpose: a placeholder here makes Vapi reject every call
      // with "assistantId must be a UUID". The real id is written when the
      // agent is synced to the provider via POST/PUT /api/agents.
      externalAgentId: null,
      vapiAssistantId: null
    }
  });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: org.id,
      agentId: agent.id,
      name: 'Q3 Leads Campaign',
      status: 'running',
      totalContacts: 2,
      completedCalls: 1
    }
  });

  const contact1 = await prisma.contact.create({
    data: {
      organizationId: org.id,
      campaignId: campaign.id,
      name: 'Rahul Singh',
      phone: '+919999999999',
      status: 'pending'
    }
  });

  const contact2 = await prisma.contact.create({
    data: {
      organizationId: org.id,
      campaignId: campaign.id,
      name: 'Jane Doe',
      phone: '+15555555555',
      status: 'connected'
    }
  });

  await prisma.callLog.create({
    data: {
      organizationId: org.id,
      agentId: agent.id,
      campaignId: campaign.id,
      contactId: contact2.id,
      phone: contact2.phone,
      direction: 'outbound',
      status: 'completed',
      duration: 120,
      outcome: 'Completed',
      interested: true,
      leadStatus: 'interested',
      summary: 'Jane was interested in our financial products.'
    }
  });

  console.log('Seed completed successfully.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
