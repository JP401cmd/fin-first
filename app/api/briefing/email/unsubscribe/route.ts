import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { verifyUnsubscribeToken } from '@/lib/briefing/email-token'

/**
 * GET/POST /api/briefing/email/unsubscribe?token=<hmac>
 *
 * Login-loze afmelding voor de wekelijkse briefing-e-mail (wettelijk vereist).
 * De link bevat GEEN rauwe user-id maar een HMAC-getekend token
 * (lib/briefing/email-token.ts); alleen een correct getekend token levert de uid
 * op (constant-time vergelijking). We zetten profiles.weekly_briefing_email op
 * false — uitsluitend voor de uid ín het token — via de service-role (de
 * gebruiker heeft geen sessie). Geen enkele andere rij is bereikbaar: de update
 * is hard gefilterd op `.eq('id', uid)` waarbij uid uit het geverifieerde token
 * komt.
 *
 *  - GET  → mensklik vanuit de mail: voert de afmelding uit en toont een sobere
 *           bevestigingspagina met een terugweg naar /mijn/notificaties.
 *  - POST → RFC 8058 one-click (Gmail/Yahoo `List-Unsubscribe-Post`): zelfde
 *           mutatie, minimale 200-respons.
 *
 * Fail-closed: ongeldig/ontbrekend token of ontbrekend secret → geen mutatie.
 */

function getUnsubSecret(): string | null {
  return process.env.EMAIL_UNSUB_SECRET || process.env.CRON_SECRET || null
}

/** Zet de opt-in-kolom op false voor precies de uid in het token. */
async function applyUnsubscribe(token: string | null): Promise<{ ok: boolean; status: number }> {
  const secret = getUnsubSecret()
  const uid = verifyUnsubscribeToken(token, secret)
  if (!uid) return { ok: false, status: 400 }

  try {
    const { error } = await getServiceClient()
      .from('profiles')
      .update({ weekly_briefing_email: false })
      .eq('id', uid)
    if (error) return { ok: false, status: 500 }
    return { ok: true, status: 200 }
  } catch {
    return { ok: false, status: 500 }
  }
}

function confirmationHtml(baseUrl: string): string {
  const origin = baseUrl.replace(/\/+$/, '')
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Afgemeld — TriFinity</title></head>
<body style="font-family:Georgia,'Times New Roman',serif;color:#1c1917;max-width:480px;margin:64px auto;padding:0 24px;line-height:1.6;">
  <p style="font-size:12px;color:#a8a29e;text-transform:uppercase;letter-spacing:0.12em;">TriFinity</p>
  <h1 style="font-size:22px;">Je bent afgemeld</h1>
  <p style="color:#57534e;">Je ontvangt de wekelijkse briefing-e-mail niet meer. Je gegevens en de briefing in de app blijven gewoon beschikbaar.</p>
  <p style="margin-top:24px;"><a href="${origin}/mijn/notificaties" style="color:#1c1917;">Weer aanzetten in je notificatie-instellingen</a></p>
</body></html>`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const result = await applyUnsubscribe(token)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (!result.ok) {
    return new NextResponse(
      `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Afmelden mislukt</title></head>` +
        `<body style="font-family:Georgia,serif;color:#1c1917;max-width:480px;margin:64px auto;padding:0 24px;">` +
        `<h1 style="font-size:22px;">Afmelden mislukt</h1>` +
        `<p style="color:#57534e;">Deze afmeldlink is ongeldig of verlopen. Je kunt de e-mail ook uitzetten in je ` +
        `<a href="${baseUrl.replace(/\/+$/, '')}/mijn/notificaties" style="color:#1c1917;">notificatie-instellingen</a>.</p>` +
        `</body></html>`,
      { status: result.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  return new NextResponse(confirmationHtml(baseUrl), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const result = await applyUnsubscribe(token)
  // One-click verwacht een kale 2xx; bij ongeldig token geen mutatie + foutstatus.
  return NextResponse.json({ success: result.ok }, { status: result.status })
}
