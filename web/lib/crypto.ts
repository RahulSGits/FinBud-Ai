// AES-256-GCM encryption for secrets stored at rest (provider API keys).
// The key is derived from APP_ENCRYPTION_SECRET (falls back to a dev default).
import crypto from 'crypto';

const SECRET = process.env.APP_ENCRYPTION_SECRET || 'finbud-dev-encryption-secret-change-me';
const KEY = crypto.createHash('sha256').update(SECRET).digest(); // 32 bytes

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload: string): string {
  try {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Encrypt/decrypt a record of key→value secrets stored as a single JSON string.
export function encryptConfig(config: Record<string, string>): string {
  return encrypt(JSON.stringify(config));
}

export function decryptConfig(payload: string): Record<string, string> {
  if (!payload) return {};
  const json = decrypt(payload);
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

// Mask a secret for display (show last 4 chars).
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return '••••••••' + value.slice(-4);
}
