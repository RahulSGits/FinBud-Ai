// Transactional email via Resend.
//
// Only used for account lifecycle: invitations and password resets. There is no
// marketing email in this product.
import { Resend } from 'resend';

const FROM = process.env.RESEND_FROM || 'FinBud AI <onboarding@resend.dev>';

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export function appUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}

export interface SendResult {
  sent: boolean;
  /// Populated when sending was skipped or failed, for the caller to surface.
  reason?: string;
  /// In development without a Resend key, the link is returned so an admin can
  /// copy it manually rather than being blocked.
  fallbackUrl?: string;
}

function layout(title: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:36px;">
          <tr><td>
            <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:24px;">FinBud AI</div>
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:#475569;">${body}</div>
            <a href="${cta.url}"
               style="display:inline-block;margin:28px 0 8px;padding:12px 22px;background:#059669;color:#ffffff;
                      text-decoration:none;border-radius:9999px;font-size:15px;font-weight:600;">
              ${cta.label}
            </a>
            <p style="font-size:13px;line-height:1.6;color:#94a3b8;margin:20px 0 0;">
              If the button doesn't work, paste this into your browser:<br>
              <span style="color:#64748b;word-break:break-all;">${cta.url}</span>
            </p>
          </td></tr>
        </table>
        <p style="font-size:12px;color:#94a3b8;margin:20px 0 0;">
          You received this because an administrator added you to FinBud AI.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  token: string;
  invitedByName?: string | null;
  expiresAt: Date;
}): Promise<SendResult> {
  const url = appUrl(`/accept-invite?token=${encodeURIComponent(opts.token)}`);
  const resend = client();

  // Without a key the invite is still valid — hand the link back so the admin
  // can deliver it another way instead of the whole flow failing.
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; invite link not delivered');
    return { sent: false, reason: 'RESEND_API_KEY is not configured', fallbackUrl: url };
  }

  const hours = Math.max(1, Math.round((opts.expiresAt.getTime() - Date.now()) / 3_600_000));
  const inviter = opts.invitedByName ? `${opts.invitedByName} has` : 'An administrator has';

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: 'Set up your FinBud AI account',
      html: layout(
        `Welcome, ${opts.name}`,
        `<p style="margin:0 0 12px;">${inviter} given you access to FinBud AI.</p>
         <p style="margin:0;">Choose a password to activate your account. This link expires in ${hours} hours.</p>`,
        { label: 'Set your password', url }
      ),
    });

    if (error) {
      console.error('[email] resend error:', error);
      return { sent: false, reason: error.message, fallbackUrl: url };
    }
    return { sent: true };
  } catch (err: any) {
    console.error('[email] send failed:', err);
    return { sent: false, reason: err?.message || 'send failed', fallbackUrl: url };
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  token: string;
  expiresAt: Date;
}): Promise<SendResult> {
  const url = appUrl(`/accept-invite?token=${encodeURIComponent(opts.token)}`);
  const resend = client();

  if (!resend) {
    return { sent: false, reason: 'RESEND_API_KEY is not configured', fallbackUrl: url };
  }

  const hours = Math.max(1, Math.round((opts.expiresAt.getTime() - Date.now()) / 3_600_000));

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: 'Reset your FinBud AI password',
      html: layout(
        'Reset your password',
        `<p style="margin:0 0 12px;">Hi ${opts.name}, we received a request to reset your password.</p>
         <p style="margin:0;">This link expires in ${hours} hours. If you didn't ask for this, you can ignore it.</p>`,
        { label: 'Choose a new password', url }
      ),
    });

    if (error) return { sent: false, reason: error.message, fallbackUrl: url };
    return { sent: true };
  } catch (err: any) {
    return { sent: false, reason: err?.message || 'send failed', fallbackUrl: url };
  }
}
