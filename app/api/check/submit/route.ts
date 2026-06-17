/**
 * POST /api/check/submit — publiek, niet-geauthenticeerd schrijfpad van de
 * Vrijheidscheck (ADR 0022). De enige plek waar een anonieme bezoeker een rij in
 * `lead_intakes` laat schrijven; daarom drie verdedigingslagen vóór de write:
 *   1. payload-grens + strikte Zod-validatie
 *   2. IP-rate-limit (faalt gesloten)
 *   3. Cloudflare Turnstile (fail-closed in productie, dev mag zonder key door)
 *
 * Daarna: server-side het rapport berekenen (consume, don't recompute), de intake
 * versleuteld opslaan, en het token teruggeven dat doordraagt naar /signup?check=.
 *
 * RLS op `lead_intakes` staat dicht — schrijven kan uitsluitend via de
 * service-role (getServiceClient), nooit via een client-sessie.
 */

import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/service'
import {
  encryptField,
  blindIndex,
  isFieldEncryptionConfigured,
} from '@/lib/crypto/field-encryption'
import { verifyTurnstileDetailed } from '@/lib/security/turnstile'
import { checkIpRateLimit, getClientIp } from '@/lib/security/ip-rate-limit'
import { buildReport } from '@/lib/check/build-report'
import { buildCheckReportNews } from '@/lib/check/report-news'
import type { CheckIntake } from '@/lib/check/types'

// Node-runtime: field-encryption gebruikt node:crypto en we lezen de service-role-key.
export const runtime = 'nodejs'

const MAX_BODY_BYTES = 64 * 1024

const intakeSchema = z.object({
  firstName: z.string().max(80).nullish(),
  dateOfBirth: z.string().min(4).max(40),
  household: z.enum(['alleen', 'samen', 'gezin']),
  monthlyIncomeNet: z.number().min(0).max(1_000_000),
  yearlyIncomeGross: z.number().min(0).max(20_000_000).nullish(),
  expenses: z.object({
    wonen: z.number().min(0).max(1_000_000),
    vasteLasten: z.number().min(0).max(1_000_000),
    vrijBesteedbaar: z.number().min(0).max(1_000_000),
    totaalMaand: z.number().min(0).max(1_000_000),
  }),
  emergencyFund: z.number().min(0).max(100_000_000),
  assets: z
    .array(
      z.object({
        assetType: z.string().min(1).max(40),
        name: z.string().min(1).max(120),
        value: z.number().min(0).max(1_000_000_000),
        extra: z.string().max(120).nullish(),
        expectedReturnPct: z.number().min(-50).max(50).nullish(),
      }),
    )
    .max(60),
  debts: z
    .array(
      z.object({
        debtType: z.string().min(1).max(40),
        name: z.string().min(1).max(120),
        balance: z.number().min(0).max(1_000_000_000),
        interestRatePct: z.number().min(0).max(100),
        monthlyPayment: z.number().min(0).max(1_000_000),
      }),
    )
    .max(60),
  pension: z.object({
    aowExpectedMonthly: z.number().min(0).max(100_000).nullish(),
    expectedReturnPct: z.number().min(-50).max(50).nullish(),
    riskProfile: z.enum(['defensief', 'neutraal', 'offensief']).nullish(),
    retirementMonthlyExpenses: z.number().min(0).max(1_000_000).nullish(),
  }),
  lifeEvents: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        label: z.string().min(1).max(120),
        age: z.number().min(0).max(120),
        amount: z.number().min(-1_000_000_000).max(1_000_000_000).nullish(),
        recurringYearly: z.number().min(-100_000_000).max(100_000_000).nullish(),
        durationYears: z.number().min(0).max(100).nullish(),
      }),
    )
    .max(20)
    .optional(),
  goal: z.object({ label: z.string().max(140) }).nullish(),
})

const payloadSchema = z.object({
  intake: intakeSchema,
  email: z.email().max(254),
  consentAt: z.string().min(10).max(40),
  turnstileToken: z.string().max(4000).optional().default(''),
})

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  // 1) Grootte-grens vóór parsing.
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return fail(413, 'Verzoek te groot.')
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail(400, 'Ongeldige aanvraag.')
  }

  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return fail(400, 'De ingevoerde gegevens zijn ongeldig.')
  }
  // `consentAt` zit in het schema voor de client-UI maar is GEEN bron van waarheid:
  // het toestemmingsmoment leggen we server-side vast (client kan het niet vervalsen).
  const { intake, email, turnstileToken } = parsed.data

  // 2) IP-rate-limit — faalt gesloten.
  const ip = getClientIp(request.headers)
  try {
    const rl = await checkIpRateLimit(ip)
    if (!rl.allowed) {
      return fail(429, 'Te veel aanvragen. Probeer het later opnieuw.')
    }
  } catch {
    return fail(503, 'Tijdelijk niet beschikbaar. Probeer het later opnieuw.')
  }

  // 3) Turnstile — fail-closed; in dev zonder key bewust doorlaten.
  const ts = await verifyTurnstileDetailed(turnstileToken, ip)
  if (!ts.success) {
    const devBypass =
      ts.reason === 'not-configured' && process.env.NODE_ENV !== 'production'
    if (!devBypass) {
      // Log de reden server-side voor diagnose — nooit het secret of de token.
      console.warn(`[check/submit] Turnstile geweigerd (reason=${ts.reason ?? 'onbekend'})`)
      // Diagnoseerbaar zónder interne details te lekken:
      //  - 'not-configured' (secret ontbreekt op de server) of 'empty-token'
      //    (client kreeg geen token, bv. script niet geladen) wijzen op een
      //    laad-/config-probleem → vraag de gebruiker te verversen.
      //  - 'rejected'/'error' is een echte afwijzing → generieke fout.
      const isLoadProblem = ts.reason === 'not-configured' || ts.reason === 'empty-token'
      return fail(
        422,
        isLoadProblem
          ? 'De beveiligingscheck kon niet laden — ververs de pagina en probeer opnieuw'
          : 'Verificatie mislukt. Probeer het opnieuw.',
      )
    }
  }

  // Encryptie verplicht: nooit een plain intake wegschrijven.
  if (!isFieldEncryptionConfigured()) {
    return fail(503, 'Tijdelijk niet beschikbaar.')
  }

  // Rapport server-side berekenen (pure engines, geen herberekening elders).
  let report
  try {
    report = buildReport(intake as CheckIntake)
  } catch {
    return fail(500, 'Het rapport kon niet worden opgesteld. Probeer het opnieuw.')
  }

  // RLS op `lead_intakes` staat dicht — schrijven kan uitsluitend via de
  // service-role. Dezelfde client voedt ook de nieuws-read hieronder (algemeen
  // nieuws uit `news_articles`, geen gebruikersinput).
  const supabase = getServiceClient()

  // Algemeen financieel nieuws (tot 3 items) op submit-moment inbakken. Volledig
  // fail-safe: een nieuws-hapering mag het opslaan van de lead NOOIT blokkeren —
  // `buildCheckReportNews` werpt niet, maar de try/catch is de extra vangrail.
  // Geen personalisatie/PII: alleen de gedeelde `news_articles`-bron.
  try {
    report.news = await buildCheckReportNews(supabase, new Date())
  } catch {
    // Stilzwijgend degraderen: rapport zonder nieuws-sectie.
  }

  const intakeEncrypted = encryptField(JSON.stringify(intake))
  const emailIndex = blindIndex(email)
  // Toestemmingsmoment server-side: het tijdstip waarop de geldige aanvraag binnenkomt.
  const consentAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  // Dedupe op blind index: bestaat er al een (niet-geconverteerde) lead?
  const { data: existing, error: selErr } = await supabase
    .from('lead_intakes')
    .select('id, token, converted_user_id')
    .eq('email_blind_index', emailIndex)
  if (selErr) {
    return fail(500, 'Er ging iets mis. Probeer het later opnieuw.')
  }

  const rows = existing ?? []
  if (rows.some((r) => r.converted_user_id)) {
    return fail(409, 'Dit e-mailadres heeft al een account. Log in om verder te gaan.')
  }

  const open = rows.find((r) => !r.converted_user_id)
  if (open) {
    const { error } = await supabase
      .from('lead_intakes')
      .update({
        email,
        intake_encrypted: intakeEncrypted,
        report_snapshot: report,
        consent_at: consentAt,
        expires_at: expiresAt,
      })
      .eq('id', open.id)
    if (error) {
      return fail(500, 'Opslaan mislukt. Probeer het opnieuw.')
    }
    return Response.json({ token: open.token })
  }

  const { data: inserted, error: insErr } = await supabase
    .from('lead_intakes')
    .insert({
      email,
      email_blind_index: emailIndex,
      intake_encrypted: intakeEncrypted,
      report_snapshot: report,
      consent_at: consentAt,
      expires_at: expiresAt,
    })
    .select('token')
    .single()

  if (insErr || !inserted) {
    return fail(500, 'Opslaan mislukt. Probeer het opnieuw.')
  }

  return Response.json({ token: inserted.token })
}
