import { getServiceClient } from '@/lib/supabase/service'

// Transactionele e-mail via Resend (REST, geen SDK nodig). Versturen gebeurt
// alleen als RESEND_API_KEY is gezet; anders wordt de poging als 'skipped'
// gelogd zodat de flow (bv. huishouden-invite) blijft werken (link-fallback).
// Elke poging landt in mail_log → zichtbaar op /beheer/email.
//
// mail_log wordt bewust via de service-role-client geschreven (systeem-log,
// geen user_id-kolom). Zo hoeft er geen authenticated INSERT-policy op de
// tabel te staan die een ingelogde gebruiker zou laten spoofen (to_email/
// subject). Zie migratie 20260713*_db_slotwerk_rechten_policies.sql, punt 4.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

async function recordMail(
  toEmail: string,
  subject: string,
  status: 'sent' | 'failed' | 'skipped',
  provider: string,
  error: string | null,
): Promise<void> {
  try {
    await getServiceClient()
      .from('mail_log')
      .insert({ to_email: toEmail, subject, status, provider, error })
  } catch {
    // mail_log-fout mag de flow nooit breken.
  }
}

export async function sendEmail(
  opts: {
    to: string
    subject: string
    html: string
    /**
     * Optionele extra e-mailheaders. Bedoeld voor RFC 8058 one-click
     * unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`) op
     * engagement-mail zoals de weekbriefing. Resend geeft deze door aan de
     * uitgaande SMTP-headers. Transactionele mail (huishouden-invite) laat dit
     * bewust leeg.
     */
    headers?: Record<string, string>
  },
): Promise<{ ok: boolean; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'TriFinity <noreply@trifinity.app>'

  if (!apiKey) {
    await recordMail(opts.to, opts.subject, 'skipped', 'resend', 'RESEND_API_KEY niet ingesteld')
    return { ok: false, skipped: true }
  }

  try {
    const payload: Record<string, unknown> = {
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }
    if (opts.headers && Object.keys(opts.headers).length > 0) {
      payload.headers = opts.headers
    }
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      await recordMail(opts.to, opts.subject, 'failed', 'resend', t.slice(0, 500))
      return { ok: false }
    }
    await recordMail(opts.to, opts.subject, 'sent', 'resend', null)
    return { ok: true }
  } catch (err) {
    await recordMail(opts.to, opts.subject, 'failed', 'resend', err instanceof Error ? err.message : 'onbekend')
    return { ok: false }
  }
}

/** Template voor de huishouden-uitnodiging. */
export function householdInviteEmail(
  inviterEmail: string | null | undefined,
  inviteLink: string,
): { subject: string; html: string } {
  const who = inviterEmail ? `${inviterEmail} heeft` : 'Iemand heeft'
  const subject = 'Je bent uitgenodigd voor een huishouden op TriFinity'
  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; color: #1c1917; line-height: 1.6; max-width: 480px;">
      <p>Hoi,</p>
      <p>${who} je uitgenodigd om samen jullie financiën te bekijken in <strong>TriFinity</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${inviteLink}" style="background:#1c1917;color:#fff;padding:10px 18px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;">Uitnodiging accepteren</a>
      </p>
      <p style="font-size:13px;color:#57534e;">Of plak deze link in je browser:<br>${inviteLink}</p>
      <p style="font-size:13px;color:#57534e;">De uitnodiging verloopt over 7 dagen.</p>
    </div>`
  return { subject, html }
}
