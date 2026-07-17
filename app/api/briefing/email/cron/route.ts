import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { recordJobRun } from '@/lib/job-runs'
import { readBriefingSnapshot, amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { buildBriefingEmail } from '@/lib/briefing/email-template'
import { signUnsubscribeToken } from '@/lib/briefing/email-token'
import { sendEmail } from '@/lib/email'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * GET /api/briefing/email/cron
 *
 * Wekelijkse cron die de bevroren weekbriefing (profiles.briefing_snapshot) ook
 * PER E-MAIL stuurt aan gebruikers die daar expliciet voor kozen
 * (profiles.weekly_briefing_email = true). Spiegelt exact het bestaande
 * snapshots/news-ingest-cron-patroon:
 *  - CRON_SECRET-auth, fail-closed in productie (ontbrekend secret → 500);
 *  - service-role-client (leest alle profielen, omzeilt RLS bewust — system-actor);
 *  - recordJobRun('briefing-email', …) → zichtbaar op /beheer/jobs.
 *
 * Consume, niet hergenereren: de mail rendert alleen de al-berekende snapshot
 * (dezelfde bron als /overzicht). Geen kerngetal wordt opnieuw berekend.
 *
 * Idempotentie: per gebruiker een app_settings-week-gate
 * (`briefing_email_sent_week_<uid>`), zodat een cron-retry / multi-region-run
 * niet dubbel mailt. De gate wordt alleen gezet ná een geslaagde verzending.
 *
 * Privacy: de template is euro-vrij (vrijheidstijd-first); detail zit achter de
 * CTA in de app. Alleen eigen data — geen partner/huishoud-aggregaten.
 *
 * Aanbevolen schema: maandagochtend, recap van de net-afgesloten week
 * (vercel.json: "0 7 * * 1").
 *
 * NB: de cron vuurt pas zodra CRON_SECRET in de prod-omgeving gezet is
 * (aparte infra-fix, buiten deze feature).
 */

function getServiceClientOrNull() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

/** Secret voor de HMAC-unsubscribe-tokens: eigen secret of val terug op CRON_SECRET. */
function getUnsubSecret(): string | null {
  return process.env.EMAIL_UNSUB_SECRET || process.env.CRON_SECRET || null
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString()
  const service = getServiceClientOrNull()

  // ── Auth: verify CRON_SECRET ──────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  // In productie is een geconfigureerd secret verplicht — een ontbrekend
  // secret mag dit service-role-endpoint niet openbaar maken (fail-closed).
  // Bewust GEEN job_runs-write op de pre-auth-takken (spiegel snapshots/cron):
  // een onbevoegde caller mag /beheer/jobs niet kunnen volpompen met error-rijen.
  if (!cronSecret && isProduction) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const isAuthorized =
    !cronSecret || // dev mode zonder secret
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    return unauthorized()
  }

  if (!service) {
    return NextResponse.json(
      {
        error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
        description: 'This endpoint requires the service role key to read snapshots and email users.',
      },
      { status: 500 },
    )
  }

  const unsubSecret = getUnsubSecret()
  if (!unsubSecret) {
    // Zonder secret kunnen we geen veilige afmeld-link tekenen → weiger fail-closed
    // (mail zonder werkende unsubscribe is wettelijk niet toegestaan).
    await recordJobRun(service, {
      job: 'briefing-email',
      status: 'error',
      startedAt,
      error: 'EMAIL_UNSUB_SECRET/CRON_SECRET ontbreekt — geen unsubscribe-token mogelijk',
    })
    return NextResponse.json({ error: 'Unsubscribe secret not configured' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const currentWeek = amsterdamWeekKey(new Date())

  const counters = {
    candidates: 0,
    sent: 0,
    skipped_week: 0,
    skipped_no_snapshot: 0,
    skipped_no_email: 0,
    skipped_no_resend: 0,
    errors: 0,
  }

  try {
    const { data: profiles, error: profilesError } = await service
      .from('profiles')
      .select('id')
      .eq('onboarding_completed', true)
      .eq('weekly_briefing_email', true)

    if (profilesError) {
      await recordJobRun(service, {
        job: 'briefing-email',
        status: 'error',
        startedAt,
        error: profilesError.message,
      })
      return serverError(profilesError, 'briefing-email-cron:GET')
    }

    counters.candidates = profiles?.length ?? 0

    for (const profile of profiles ?? []) {
      const userId = profile.id as string
      try {
        // ── Idempotentie-gate per ISO-week ──
        const weekGateKey = `briefing_email_sent_week_${userId}`
        const { data: gateRow } = await service
          .from('app_settings')
          .select('value')
          .eq('key', weekGateKey)
          .maybeSingle()
        if (gateRow?.value === currentWeek) {
          counters.skipped_week++
          continue
        }

        // ── Bevroren snapshot (dezelfde bron als /overzicht) ──
        const snapshot = await readBriefingSnapshot(service, userId)
        if (!snapshot || (snapshot.entries.length === 0 && !snapshot.freedomSnapshot)) {
          counters.skipped_no_snapshot++
          continue
        }

        // ── E-mailadres via auth admin (leeft in auth.users, niet profiles) ──
        const { data: authData } = await service.auth.admin.getUserById(userId)
        const email = authData?.user?.email
        if (!email) {
          counters.skipped_no_email++
          continue
        }

        const token = signUnsubscribeToken(userId, unsubSecret)
        const mail = buildBriefingEmail({ snapshot, baseUrl, unsubscribeToken: token })
        if (!mail) {
          counters.skipped_no_snapshot++
          continue
        }

        const result = await sendEmail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          headers: {
            // RFC 8058 one-click unsubscribe (Gmail/Yahoo).
            'List-Unsubscribe': `<${mail.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })

        if (result.skipped) {
          // RESEND_API_KEY niet gezet — niet als 'verzonden' markeren, zodat de
          // week-gate niet opbrandt vóór e-mail geconfigureerd is.
          counters.skipped_no_resend++
          continue
        }
        if (!result.ok) {
          counters.errors++
          continue
        }

        // ── Gate zetten ná geslaagde verzending ──
        await service
          .from('app_settings')
          .upsert({ key: weekGateKey, value: currentWeek }, { onConflict: 'key' })
        counters.sent++
      } catch (err) {
        counters.errors++
        console.error('[briefing/email/cron] user failed:', userId, err)
      }
    }

    await recordJobRun(service, {
      job: 'briefing-email',
      status: 'success',
      startedAt,
      summary: counters,
      error: counters.errors > 0 ? `${counters.errors} gebruiker(s) faalden` : null,
    })

    return NextResponse.json({ success: true, week: currentWeek, summary: counters })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[briefing/email/cron] failed:', message)
    await recordJobRun(service, {
      job: 'briefing-email',
      status: 'error',
      startedAt,
      summary: counters,
      error: message,
    })
    return serverError(err, 'briefing-email-cron:GET')
  }
}
