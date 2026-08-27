import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { withCanonicalOverviewFigures } from '@/lib/overview/canonical-health'
import { computeFreedomTotal } from '@/lib/briefing/overview-briefing'

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
    // gebaseerde freedomPct, simFireCountdown (met scalar-kernel-fallback) en de
    // vrijheidstijd-grondslag (netWorth + recentMonthlyExpenses).
    // `loadHorizonData` faalt liever niet de hele kaart: bij een horizon-fout
    // valt de patch terug op de bundel-eigen waarden (zelfde `null`-contract als
    // op /overzicht). Parallel omdat beide React-`cache()`'d zijn en de kernel-run
    // gedeeld wordt — geen tweede query-set.
    const [bundle, horizonData] = await Promise.all([
      loadDashboardData(supabase),
      loadHorizonData(supabase).catch(() => null),
    ])
    const { simFireCountdown, fireProjResult, userName } = bundle
    // Canonieke kerngetallen erover heen — identiek aan
    // components/overview/overzicht-secondary-loader.tsx.
    const dashboardData = withCanonicalOverviewFigures(bundle.dashboardData, horizonData)

    const netWorth = dashboardData.netWorth
    // Uitgaven-basis (canoniek 12-mnd rolling; valt terug op de losse maand voor
    // accounts zonder aggregaat). Bepaalt of de kaart een vrijheids-% kan tonen.
    const dailyExpenseRate = dashboardData.dailyExpenseRate ?? 0
    const recentMonthlyExpenses = dashboardData.recentMonthlyExpenses ?? dashboardData.monthlyExpenses
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

    // ── Vrijheidstijd (netto vermogen ÷ dagtarief) — DEZELFDE motor en grondslag
    //    als de "Jouw vrijheid deze week"-hero (computeFreedomTotal op netWorth +
    //    recentMonthlyExpenses). Bij een tekort (negatief vermogen) 0/0 i.p.v. de
    //    absolute-waarde-lezing, zodat de kaart geen "gekochte vrijheid" suggereert.
    const freedomTotal = computeFreedomTotal(netWorth, recentMonthlyExpenses)
    const freedomTime = freedomTotal.breakdown.isDeficit
      ? { years: 0, months: 0 }
      : { years: freedomTotal.breakdown.years, months: freedomTotal.breakdown.months }

    // ── Vrijheidsdagen gewonnen uit acties (all-time + deze maand) — canoniek uit
    //    de bundel (afkap-vrije actions_kpi_aggregate-RPC). Dit is een ANDERE
    //    grootheid dan de vrijheidstijd hierboven (gewonnen-uit-acties, niet totaal).
    const totalFreedomDaysWon = dashboardData.totalFreedomDaysWon
    const nowDate = new Date()
    const currentMonthKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`
    const freedomDaysWonThisMonth =
      dashboardData.freedomDaysMonthly.find((m) => m.month === currentMonthKey)?.days ?? 0

    // Spaarquote — canonieke 6-maands quote (savingsRate6m), gelijk aan /overzicht.
    const savingsRate6m = dashboardData.savingsRate6m

    // Build card data based on privacy level
    const cardData: Record<string, unknown> = {
      privacyLevel,
      freedomPercentage: canCalculateFire ? Math.round(freedomPct * 10) / 10 : null,
      freedomDaysWon: Math.round(totalFreedomDaysWon),
      freedomDaysWonThisMonth: Math.round(freedomDaysWonThisMonth),
      fireCountdown,
      freedomTime,
      savingsRate: canCalculateFire ? Math.round(savingsRate6m * 10) / 10 : null,
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
