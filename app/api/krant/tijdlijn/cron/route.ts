import { NextResponse } from 'next/server'
import { errorResponse, serverError } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { mapWithConcurrency } from '@/lib/concurrency'
import { isNewsOnly, resolveActiveModules } from '@/lib/modules/resolve'
import { isCloudAllowed } from '@/lib/ai/privacy-gate'
import { laadKandidaten } from '@/lib/krant/editie-loader'
import { ietsNieuwsSindsVorige, ruimAlleTijdlijnenOp, ververs } from '@/lib/krant/tijdlijn-run'
import { inTijdlijnBeta } from '@/lib/krant/tijdlijn-beta'
import { aiKrantToegestaan, bepaalKrantBron, leestTijdlijn, type KrantBron } from '@/lib/krant/tijdlijn-bron'
import { AI_LAAG_MARGE_MS, AI_LAAG_TIMEOUT_MS, maakAiStap } from '@/lib/krant/tijdlijn-ai'

export const maxDuration = 300

/** Ruim binnen maxDuration: wat niet past, komt bij de volgende run of de vernieuwknop. */
export const TIJDLIJN_CRON_TIJDBUDGET_MS = 240_000
export const TIJDLIJN_CRON_CONCURRENCY = 3

/**
 * GET /api/krant/tijdlijn/cron — de dagelijkse verversing van de tijdlijn-bèta
 * (Krant 1C, U11: "automatisch na de ingest", naast de knop uit fase 2).
 *
 * Dagelijks 06:30 UTC (vercel.json), ná de ingest + duiding van 05:00. Eigen
 * cron in plaats van een staart aan de ingest: het tijdbudget van de ingest
 * knelt al (de duiding wordt uitgesteld), en wat na 06:30 geduid wordt komt
 * de dag erna of via de knop. Duidt de ochtendroutine (ADR 0171, hartslag),
 * dan draait `scripts/krant/ochtend.ts hartslag` deze route na het duiden
 * nog een keer (aanvulling 30 sep 2026).
 *
 * Voor wie (B40, fase 2): iedereen met de module nieuws en afgeronde
 * onboarding wiens /nieuws de tijdlijn ÍS — dezelfde `bepaalKrantBron` als de
 * pagina; sinds 1E hoort daar ook wie de Krant MET AI koos bij (bron 'ai',
 * dezelfde tijdlijn met de laag). Zolang
 * TIJDLIJN_BETA_OPEN false staat (de tijdelijke schakelaar uit B40) is dat
 * uitsluitend de superadmin (`inTijdlijnBeta`): geen verwerking voor gewone
 * lezers vóór /privacy 2.4 live is. Wie bezwaar maakte tegen verwerking op de
 * achtergrond (profiles.krant_schaduw_bezwaar_at, art. 21 AVG) slaat deze cron
 * over — net als de weekcron; de vernieuwknop (zijn eigen verzoek) blijft werken. De rol is hier een verwerkingsslot, geen beheerrecht:
 * de route leest dezelfde profielkolommen als de weekcron (/api/krant/cron) en
 * geen inhoud van anderen (ADR 0146).
 *
 * Per lezer: `ververs` (profiel afleiden → matcher in tijdlijnmodus → een
 * verversing met bron 'tijdlijn', ook als die leeg is). Daarna één opruimstap
 * van 120 dagen (B32) over ALLE tijdlijnen — ook van wie deze run overslaat. Geen idempotentie per dag nodig: een tweede run voegt alleen
 * toe wat er nog niet stond (gezien = de eigen tijdlijn; de partiële unieke
 * index vangt een race met de knop).
 *
 * Krant 1E (ADR 0190): een lezer die de Krant MET AI koos (bron 'ai') krijgt
 * dezelfde verversing mét de AI-laag. De PRIVACY-POORT staat hier per lezer
 * (`isCloudAllowed(service, id, 'nieuws')`, vóór de laag bestaat): lokaal of
 * privé-modus = een verversing zonder AI, er gaat niets naar een aanbieder
 * (K6). De rest van de poorten zit in de laag (tier, Krant-account, bezwaar,
 * quotum van 5 per 7 dagen, tegoed). De summary telt de laag mee — alleen
 * aantallen (ADR 0146).
 *
 * Spiegelt /api/krant/cron: CRON_SECRET fail-closed in productie, geen
 * job_runs-write vóór de auth, service-role-client, en een summary met alleen
 * tellingen (ADR 0146) → /beheer/jobs als 'krant-tijdlijn'.
 */

function getServiceClientOrNull() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return getServiceClient()
}

export interface TijdlijnCronSummary {
  /** Lezers wiens /nieuws de tijdlijn is en die deze run in aanmerking kwamen. */
  lezers: number
  /** Nieuwslezers buiten de tijdlijn: bèta-vlag dicht (geen superadmin) of bewust de AI-Krant. */
  buitenBeta: number
  /** Nieuwslezers met bezwaar tegen verwerking op de achtergrond: overgeslagen. */
  bezwaar: number
  verversingen: number
  /** Verversingen die niets toevoegden. */
  leeg: number
  /** Nieuwe berichten over alle lezers. */
  berichten: number
  opgeruimd: number
  /** Verversingen die de unieke index weigerde (race met de knop): niets verloren, de volgende run neemt de rest mee. */
  overgeslagen: number
  fouten: number
  kandidaten: number
  kandidatenOngeldig: number
  tijdBudgetOp: boolean
  /** De opruimstap van 120 dagen faalde (los van de verversingen; security G2). */
  opruimenMislukt: boolean
  /** Krant 1E — lezers met bron 'ai' (de Krant met AI) in deze run. */
  aiLezers: number
  /** Verversingen waar ≥ 1 AI-tekst bleef staan. */
  aiMetAi: number
  /** Verversingen zonder AI omdat de weeklimiet (5) op was. */
  aiQuotum: number
  /** Verversingen zonder AI omdat een poort weigerde (privacy, tier, bezwaar, tegoed, model-config). */
  aiGeweigerd: number
  /** Verversingen waar het model werd aangeroepen maar niets bleef staan. */
  aiTerugvalLaag: number
  /** Matcherberichten zonder AI-toelichting (over alle AI-verversingen). */
  aiTerugvalBericht: number
  /** AI-teksten die vervielen op een getal of datum zonder grond. */
  aiGetallenTegengehouden: number
  /** AI-teksten die vervielen op de Wft-lijst, de koopmetafoor of een naam. */
  aiWftTegengehouden: number
  /** Door het model toegevoegde berichten die bleven staan. */
  aiToevoegingen: number
  /** AI-lezers zonder laag deze run: niets nieuws sinds de vorige verversing, of te weinig tijd over (Y4/Y5). */
  aiOvergeslagen: number
}

/** Paginagrootte voor de profielselectie: ruim onder PostgREST max_rows (1000). */
export const TIJDLIJN_CRON_PAGINA = 500

export async function GET(request: Request) {
  const startedAt = new Date().toISOString()
  const startMs = Date.now()
  const service = getServiceClientOrNull()

  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (!cronSecret && isProduction) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const isAuthorized = !cronSecret || authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret
  if (!isAuthorized) {
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
  }
  if (!service) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  }

  const now = new Date()
  const summary: TijdlijnCronSummary = {
    lezers: 0,
    buitenBeta: 0,
    bezwaar: 0,
    verversingen: 0,
    leeg: 0,
    berichten: 0,
    opgeruimd: 0,
    overgeslagen: 0,
    fouten: 0,
    kandidaten: 0,
    kandidatenOngeldig: 0,
    tijdBudgetOp: false,
    opruimenMislukt: false,
    aiLezers: 0,
    aiMetAi: 0,
    aiQuotum: 0,
    aiGeweigerd: 0,
    aiTerugvalLaag: 0,
    aiTerugvalBericht: 0,
    aiGetallenTegengehouden: 0,
    aiWftTegengehouden: 0,
    aiToevoegingen: 0,
    aiOvergeslagen: 0,
  }

  // De bewaartermijn (B32) EERST en los van de rest: een fout in de selectie of
  // de verversingen mag de 120-dagenbelofte uit /privacy niet stil op pauze
  // zetten (security G2, 29-09). Voor iedereen, ook wie deze run overslaat.
  try {
    summary.opgeruimd = await ruimAlleTijdlijnenOp(service, now)
  } catch (err) {
    summary.opruimenMislukt = true
    console.error('[krant/tijdlijn-cron] opruimen mislukt:', err)
  }

  try {
    // Alle profielen met afgeronde onboarding, gepagineerd op id: onder B40 is
    // dit iedereen, dus de max_rows-grens (1000) zou anders stil een
    // ongeordende rest overslaan (eindreview Y4).
    const profielen: unknown[] = []
    for (let van = 0; ; van += TIJDLIJN_CRON_PAGINA) {
      const { data: pagina, error: profielFout } = await service
        .from('profiles')
        .select('id, role, active_modules, active_subscriptions, ai_enabled, onboarding_completed, krant_schaduw_bezwaar_at, blocked_at')
        .eq('onboarding_completed', true)
        .order('id', { ascending: true })
        .range(van, van + TIJDLIJN_CRON_PAGINA - 1)
      if (profielFout) {
        await recordJobRun(service, { job: 'krant-tijdlijn', status: 'error', startedAt, summary, error: profielFout.message })
        return serverError(profielFout, 'krant-tijdlijn-cron:GET')
      }
      profielen.push(...(pagina ?? []))
      if ((pagina ?? []).length < TIJDLIJN_CRON_PAGINA) break
    }
    type Rij = {
      id: string
      role: string | null
      active_modules: string[] | null
      active_subscriptions: string[] | null
      ai_enabled: boolean | null
      krant_schaduw_bezwaar_at: string | null
      blocked_at: string | null
    }
    const nieuwslezers = (profielen as Rij[])
      .map((p) => ({ ...p, modules: resolveActiveModules(p) }))
      .filter((p) => p.modules.includes('nieuws'))
    const zonderBezwaar = nieuwslezers.filter((p) => p.krant_schaduw_bezwaar_at == null)
    summary.bezwaar = nieuwslezers.length - zonderBezwaar.length

    // De variant (alleen 'ai' telt: bewust de AI-Krant). Fail-closed: kan hij
    // niet gelezen worden, dan draait de run niet — anders kreeg een AI-lezer
    // stil weer een tijdlijn.
    const aiLezers = new Set<string>()
    const kandidaatIds = zonderBezwaar.map((p) => p.id)
    for (let i = 0; i < kandidaatIds.length; i += 100) {
      const { data: varianten, error: variantFout } = await service
        .from('nieuwsprofiel')
        .select('user_id')
        .eq('krant_variant', 'ai')
        .in('user_id', kandidaatIds.slice(i, i + 100))
      if (variantFout) {
        await recordJobRun(service, { job: 'krant-tijdlijn', status: 'error', startedAt, error: variantFout.message })
        return serverError(variantFout, 'krant-tijdlijn-cron:GET')
      }
      for (const v of (varianten ?? []) as Array<{ user_id: string }>) aiLezers.add(v.user_id)
    }

    // Sinds 1E leest ook bron 'ai' de tijdlijn (met de laag); 'oud' en 'wacht' niet.
    const bronPerLezer = new Map<string, KrantBron>()
    for (const p of zonderBezwaar) {
      bronPerLezer.set(
        p.id,
        bepaalKrantBron({
          krantAccount: isNewsOnly(p.modules),
          variant: aiLezers.has(p.id) ? 'ai' : null,
          // Geblokkeerd telt als buiten de bèta: geen verversing (security-run 0.92.28, 🟡-1).
          inBeta: p.blocked_at == null && inTijdlijnBeta(p.role),
          aiToegestaan: aiKrantToegestaan(p),
        }),
      )
    }
    const lezers = zonderBezwaar.filter((p) => leestTijdlijn(bronPerLezer.get(p.id)!)).map((p) => p.id)
    summary.lezers = lezers.length
    summary.buitenBeta = zonderBezwaar.length - lezers.length
    summary.aiLezers = lezers.filter((id) => bronPerLezer.get(id) === 'ai').length

    if (lezers.length > 0) {
      const [{ artikelen, ongeldig }, aowRows] = await Promise.all([laadKandidaten(service, now), getAowLeeftijden(service)])
      summary.kandidaten = artikelen.length
      summary.kandidatenOngeldig = ongeldig

      await mapWithConcurrency(lezers, TIJDLIJN_CRON_CONCURRENCY, async (userId) => {
        if (Date.now() - startMs > TIJDLIJN_CRON_TIJDBUDGET_MS) {
          summary.tijdBudgetOp = true
          return
        }
        try {
          let aiStap: ReturnType<typeof maakAiStap> | null = null
          if (bronPerLezer.get(userId) === 'ai') {
            // De privacy-poort per lezer, vóór de laag bestaat. Leesfout = nee.
            const cloudToegestaan = await isCloudAllowed(service, userId, 'nieuws').catch(() => false)
            // Y4: alleen een call als er sinds de vorige verversing iets nieuws
            // geduid is — anders verbruikt de cron het quotum op ongewijzigde
            // invoer. Y5: alleen als er nog een volledige call plus marge in de
            // functie past; anders deze keer zonder AI (niets betaald).
            const deadline = startMs + maxDuration * 1000
            const tijdOver = deadline - Date.now() >= AI_LAAG_TIMEOUT_MS + AI_LAAG_MARGE_MS
            const nieuws = tijdOver && (await ietsNieuwsSindsVorige(service, userId).catch(() => false))
            if (tijdOver && nieuws) aiStap = maakAiStap({ cloudToegestaan, deadline })
            else summary.aiOvergeslagen++
          }
          const uitkomst = await ververs(service, { userId, now, aowRows, kandidaten: artikelen, hertoetsVoorSchrijven: true, aiStap })
          if (uitkomst.overgeslagen) {
            // Intussen de AI-Krant gekozen of bezwaar gemaakt: niets geschreven.
            summary.overgeslagen++
            return
          }
          summary.verversingen++
          summary.berichten += uitkomst.items
          if (uitkomst.leeg) summary.leeg++
          if (uitkomst.ai) {
            const { uitkomst: ai, tellers } = uitkomst.ai
            if (ai === 'met-ai') summary.aiMetAi++
            else if (ai === 'quotum') summary.aiQuotum++
            else if (ai === 'geweigerd') summary.aiGeweigerd++
            summary.aiTerugvalLaag += ai === 'teruggevallen' ? 1 : 0
            summary.aiTerugvalBericht += tellers.terugvalBericht
            summary.aiGetallenTegengehouden += tellers.getallenTegengehouden
            summary.aiWftTegengehouden += tellers.wftTegengehouden
            summary.aiToevoegingen += tellers.toevoegingen
          }
        } catch (err) {
          // 23505 op de partiële unieke index = de knop was deze lezer net voor:
          // de compensatie in schrijfEditie haalde deze verversing weg en er is
          // niets dubbel. Geen fout (eindreview L6).
          if (err instanceof Error && /23505|duplicate key/i.test(err.message)) {
            summary.overgeslagen++
            return
          }
          summary.fouten++
          console.error('[krant/tijdlijn-cron] lezer mislukt:', userId, err)
        }
      })
    }

    await recordJobRun(service, {
      job: 'krant-tijdlijn',
      status: 'success',
      startedAt,
      summary,
      error:
        summary.fouten > 0
          ? `${summary.fouten} lezer(s) faalden`
          : summary.opruimenMislukt
            ? 'opruimen (120 dagen) mislukt'
            : summary.tijdBudgetOp
              ? 'tijdbudget op — rest volgt bij de volgende run'
              : null,
    })
    return NextResponse.json({ success: true, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[krant/tijdlijn-cron] failed:', message)
    await recordJobRun(service, { job: 'krant-tijdlijn', status: 'error', startedAt, summary, error: message })
    return serverError(err, 'krant-tijdlijn-cron:GET')
  }
}
