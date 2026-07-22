// Server-side access to configured provider credentials.
// Resolution order: admin-configured keys in the DB → environment variables.
import { db } from './db';
import { decryptConfig } from './crypto';

// Catalog of supported providers (the keys each one needs).
export const PROVIDER_CATALOG = [
  { slug: 'openai', name: 'OpenAI', category: 'llm', fields: ['api_key'] },
  { slug: 'vapi', name: 'Vapi', category: 'voice', fields: ['api_key'] },
  { slug: 'omnidimension', name: 'OmniDimension', category: 'voice', fields: ['api_key'] },
  { slug: 'exotel', name: 'Exotel', category: 'telephony', fields: ['api_key', 'api_token', 'sid', 'from_number'] }
];

export async function getProviderConfig(slug: string): Promise<Record<string, string>> {
  const row = await db.apiKey.findFirst({ where: { provider: slug } });
  if (row) return decryptConfig(row.keyEncrypted);
  return {};
}

// Single API key for a provider (e.g., openai, vapi).
export async function getApiKey(slug: string, envVar: string): Promise<string> {
  const cfg = await getProviderConfig(slug);
  return cfg.api_key || process.env[envVar] || '';
}
