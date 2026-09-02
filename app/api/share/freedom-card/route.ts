import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { withCanonicalOverviewFigures } from '@/lib/overview/canonical-health'
import { summarizeRunway, runwayYearsMonths } from '@/lib/briefing/overview-briefing'
import { computeHorizonRunway } from '@/lib/fire-target-shared'
import { credibleDailyExpense, credibleMonthlyBasis } from '@/lib/format'

/**
 * Deelbare vrijheidskaart (/overzicht → "Deel je vrijheidsweek").
 *
 * CONSUME, DON'T RECOMPUTE (CLAUDE.md / ADR 0009): deze route herberekent GEEN
 * eigen FIRE-doel of -status meer. Ze consumeert exact dezelfde canonieke
 * horizon-kernel-uitkomsten als de hub/dashboard via `loadDashboardData`, zodat
 * de kaart-cijfers per definitie sporen met wat de gebruiker op /overzicht ziet.
 *
 * Die belofte vraagt sinds bevinding H4 om DEZELFDE laatste stap als de hub:
 * `/overzicht` legt `withCanonicalOverviewFigures` over de bundel heen (score,
 * vrijheids-% en noodfonds uit `loadHorizonData`), omdat de bundel die drie
 * onafhankelijk afleidt. Zonder die stap zou dit outbound-artefact het rauwe
 * bundel-percentage tonen — precies het gat dat de oorspronkelijke bevinding
 * mat (24,2% op de kaart naast 11% in de gezondheidsmodal). De kaart is
 * persoonlijk (geen perspectief-cookie), dus `loadHorizonData` draait hier op
 * de standaard `'personal'`-blik — dezelfde blik als `loadDashboardData`.
 *
 * Historie (WF-OVZ-11-bug1): de kaart draaide voorheen een eigen
 * `computeFireProjection` (legacy v1-engine) + `fireTarget = yearlyExpenses/SWR`
 * op het 6-maands uitgaven-gemiddelde (huidige levensstijl). De hub gebruikt de
 * horizon-kernel met de ná-pensioen-uitgaven als doelgrondslag → veel lager doel
 * → hoger freedomPct. Dat gaf tegenstrijdige cijfers op een outbound artefact
 * (33.4% "Niet haalbaar" op de kaart vs. 88.4% "FINANCIEEL VRIJ" op de hub).
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)

    if (!claims) {
      return unauthorized()
    }

    // Parse privacy level from query params
    const url = new URL(request.url)
    const privacyLevel = url.searchParams.get('privacy') || 'anonymous'
    if (!['anonymous', 'named', 'full'].includes(privacyLevel)) {
      return badRequest('Ongeldig privacy niveau')
    }

    // Canonieke bundel — dezelfde bron als de /overzicht-hub. Levert de kernel-
    // gebaseerde freedomPct en simFireCountdown (met scalar-kernel-fallback). De
    // VRIJHEIDSTIJD komt sinds ADR 0126 PR C niet meer uit deze bundel maar uit
    // de runway hieronder; `recentMonthlyExpenses` bepaalt hier alleen nog of er
    // überhaupt een geloofwaardige uitgavenbasis is (canCalculateFire).
    // `loadHorizonData` faalt liever niet de hele kaart: bij een horizon-fout
    // valt de patch terug op de bundel-eigen waarden (zelfde `null`-contract als
    // op /overzicht). Parallel omdat beide React-`cache()`'d zijn en de kernel-run
    // gedeeld wordt — geen tweede query-set.
    const [bundle, horizonData, runway] = await Promise.all([
      loadDashboardData(supabase),
      loadHorizonData(supabase).catch(() => null),
      // De "stop nu"-runway (ADR 0126 D1 + PR C) — de TOTALE vrijheidstijd van
      // deze kaart. Persoonlijke blik, gelijk aan de twee loaders hierboven;
      // draait op de React-cache()'de gedeelde FIRE-run, dus geen tweede
      // query-set. Faalt hij, dan levert de motor zelf `unavailable` en toont de
      // kaart geen vrijheidstijd — nooit een fallback-som.
      computeHorizonRunway(supabase),
    ])
    const { simFireCountdown, fireProjResult, userName } = bundle
    // Canonieke kerngetallen erover heen — identiek aan
    // components/overview/overzicht-secondary-loader.tsx.
    const dashboardData = withCanonicalOverviewFigures(bundle.dashboardData, horizonData)

    const netWorth = dashboardData.netWorth
    // Uitgaven-basis (canoniek 12-mnd rolling; valt terug op de losse maand voor
    // accounts zonder aggregaat). Bepaalt of de kaart een vrijheids-% kan tonen.
    // Zelfde geloofwaardigheidsvloer als de maandbasis hieronder: zonder deze
    // vloer houdt één transactie van € 1 in het rolling venster
    // `canCalculateFire`/`hasExpenses` true en publiceert de deelkaart een
    // becijferd vrijheids-% naast een vrijheidstijd van nul (UR2-03).
    const dailyExpenseRate = credibleDailyExpense(dashboardData.dailyExpenseRate)
    // Voorkeursvolgorde ongewijzigd, maar een kandidaat die door de
    // geloofwaardigheidsvloer zakt slaan we over (UR2-03) — dezelfde regel als
    // op /overzicht, zodat een deelbare kaart nooit een eeuw vrijheid claimt op
    // een rolling venster met één transactie van €1.
    const recentMonthlyExpenses =
      credibleMonthlyBasis(dashboardData.recentMonthlyExpenses) ||
      credibleMonthlyBasis(dashboardData.monthlyExpenses)
    const canCalculateFire = dailyExpenseRate > 0 || recentMonthlyExpenses > 0

    // ── Vrijheids-% (FIRE-voortgang, ADR 0009) — canoniek uit de bundel ──
    const freedomPct = dashboardData.freedomPct

    // ── FIRE-countdown/label — kernel-simulatie (simFireCountdown), met de
    //    scalar-kernel-projectie als fallback. Exact hetzelfde ?? -patroon als de
    //    hub-widgets (nooit meer de legacy computeFireProjection). `fireDate` draagt
    //    de status-tekst ('Bereikt!' / 'Niet haalbaar' / 'mrt 2038').
    const fireCountdownLabel =
      simFireCountdown?.fireDate ||
      fireProjResult.fireDate ||
      (canCalculateFire ? 'Niet haalbaar' : 'Nog geen data')
    const fireCountdown = {
      years: simFireCountdown?.countdownYears ?? fireProjResult.countdownYears,
      months: simFireCountdown?.countdownMonths ?? fireProjResult.countdownMonths,
      days: simFireCountdown?.countdownDays ?? fireProjResult.countdownDays,
      label: fireCountdownLabel,
    }

    // ── Vrijheidstijd — DE RUNWAY, niet de platte deling (ADR 0126 D1 + PR C).
    //    Dit is een uitspraak over een HEEL vermogen ("hoe lang kom ik mee als ik
    //    nu stop"), dus hoort ze bij de kernel-run mét rendement, inflatie, AOW,
    //    belasting en de eigen woon-/eindstrategie — dezelfde grootheid als de
    //    kop op /overzicht waar deze kaart vandaan wordt gedeeld. Tot PR C stond
    //    hier netto vermogen ÷ 12-mnd dagtarief: een MARGINALE grondslag die als
    //    totaal werd gepubliceerd, en die op een outbound artefact structureel
    //    afweek van het scherm ernaast.
    //
    //    Zwijggevallen (tekort, geen geboortedatum, geen geloofwaardige
    //    uitgavenbasis, D7-inconsistentie) leveren `null` en dus 0/0 — de kaart
    //    valt dan terug op haar bestaande "nog geen gegevens"-staat i.p.v. een
    //    becijferde claim te publiceren.
    //
    //    Bij de twee OPEN uitkomsten (het vermogen raakt binnen de horizon niet
    //    op) is `months` een ONDERGRENS tot de eigen eindleeftijd resp. het
    //    horizonplafond. Op een deelbare kaart is dat de veilige kant: de kaart
    //    onderschat dan hooguit, en claimt nooit meer dan de kernel rekende.
    const runwayPoint = summarizeRunway(runway)
    const freedomTime = runwayPoint ? runwayYearsMonths(runwayPoint) : { years: 0, months: 0 }

    // ── Vrijheidsdagen gewonnen uit acties (all-time + deze maand) — canoniek uit
    //    de bundel (afkap-vrije actions_kpi_aggregate-RPC). Dit is een ANDERE
    //    grootheid dan de vrijheidstijd hierboven (gewonnen-uit-acties, niet totaal).
    const totalFreedomDaysWon = dashboardData.totalFreedomDaysWon
    const nowDate = new Date()
    const currentMonthKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`
    const freedomDaysWonThisMonth =
      dashboardData.freedomDaysMonthly.find((m) => m.month === currentMonthKey)?.days ?? 0

    // Spaarquote — HET app-brede getal: de EFFECTIEVE, grondslag-geresolveerde
    // quote uit de bundel (ADR 0103), gelijk aan /overzicht, het instellingenblok
    // en de spaarquote-widget. Was `savingsRate6m` (de rauwe 6-maands meting):
    // een deelbare kaart die een ander percentage draagt dan het scherm waar hij
    // vandaan komt, is precies de drift die het besluit van 31 aug 2026 opruimt.
    const savingsRatePct = dashboardData.effectiveSavingsRatePct

    // Build card data based on privacy level
    const cardData: Record<string, unknown> = {
      privacyLevel,
      freedomPercentage: canCalculateFire ? Math.round(freedomPct * 10) / 10 : null,
      freedomDaysWon: Math.round(totalFreedomDaysWon),
      freedomDaysWonThisMonth: Math.round(freedomDaysWonThisMonth),
      fireCountdown,
      freedomTime,
      savingsRate: canCalculateFire ? Math.round(savingsRatePct * 10) / 10 : null,
      generatedAt: new Date().toISOString(),
      // Metadata about data availability (helps the card show N/A for missing metrics)
      dataAvailability: {
        hasTransactions: dashboardData.monthlyIncome > 0 || dashboardData.monthlyExpenses > 0,
        hasAssets: bundle.sharedAssets.length > 0,
        hasDebts: bundle.sharedDebts.length > 0,
        hasExpenses: dailyExpenseRate > 0,
        canCalculateFire,
      },
    }

    // Named: include user name
    if (privacyLevel === 'named' || privacyLevel === 'full') {
      cardData.displayName = userName || claims.email?.split('@')[0] || 'Gebruiker'
    }

    // Full: include EUR amounts (opt-in). FIRE-doel op de canonieke incl.-woning-
    // grondslag (simRequiredNetWorth) — dezelfde noemer als de vrijheids-%; valt
    // terug op de scalar fireTarget als de kernel-sim niet draaide.
    if (privacyLevel === 'full') {
      const displayFireGoal = dashboardData.simRequiredNetWorth ?? dashboardData.fireTarget
      cardData.netWorth = netWorth
      cardData.fireTarget = displayFireGoal != null && displayFireGoal > 0 ? displayFireGoal : null
    }

    return Response.json(cardData)
  } catch (error) {
    return serverError(error, 'share:GET', 'Kaart genereren mislukt. Probeer het later opnieuw.')
  }
}
