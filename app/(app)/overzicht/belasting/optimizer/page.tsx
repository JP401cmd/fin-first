import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageOpening } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { createClient } from '@/lib/supabase/server'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { resolveBox1GrossIncome } from '@/lib/box1-income'
import {
  generateBox3Strategies,
  DEFAULT_GOAL_ID,
  buildCurrentStanding,
  pickTopChoice,
} from '@/lib/tax-optimizer'
import { rankStrategies, pickBest } from '@/lib/tax-optimizer/rank'
import { TAX_OPTIMIZER_GOALS } from '@/lib/tax-optimizer/goals'
import { computeJaarruimte, jaarruimteBesparing } from '@/lib/jaarruimte'
import type { GoalSection } from '@/lib/tax-optimizer/types'
import { Box3OptimizerClient } from '@/components/overview/belasting/optimizer-client'

export const metadata: Metadata = {
  title: 'Fiscale optimizer — TriFinity',
  description:
    'Al je fiscale doelen doorgerekend — Box 3-scenario’s én je Box 1-jaarruimte — in euro’s en vrijheidsdagen.',
}

const YEAR = 2026

/**
 * /overzicht/belasting/optimizer — de fiscale-strategie-optimizer (roadmap J).
 *
 * MVP-as = Box 3 (samenstelling-shift + fiscale partnerverdeling). De optimizer
 * is een ORCHESTRATIE-laag: hij consumeert `loadPerspectiveBox3` (canoniek,
 * partner-privacy via ADR 0036) en `lib/tax-optimizer` genereert de scenario's
 * uit de bestaande engine `calculateBox3` — géén nieuwe rekenkern, geen forfait-
 * constanten hier.
 *
 * De pagina VERGELIJKT eerst en zoomt daarna pas in: de client zet alle kansen
 * (Box 3-scenario's + de Box 1-jaarruimte) op één netto-effect-as en biedt de
 * uitwerking per kans op aanvraag. De zware scenario-generatie én de
 * ranking-per-doel draaien server-side; de page bouwt één `GoalSection` per doel
 * en de client rendert ze puur. We geven ALLEEN geaggregeerde uitkomsten door —
 * nooit de per-partner-splitsing — zodat er geen partner-private bedragen lekken.
 *
 * Doelen: twee Box 3-doelen (leveren dezelfde scenario's, anders gerankt),
 * jaarruimte-maximaal (Box 1, via de bestaande JaarruimteCard, per persoon —
 * ADR 0036) en een preview-doel (levenslange belastingdruk, nog niet
 * doorgerekend; verschijnt als voetnoot "Binnenkort").
 */
export default async function BelastingOptimizerPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  let currentUserName = 'Jij'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    currentUserName = (profile?.full_name as string | null) ?? 'Jij'
  }

  const box3 = await loadPerspectiveBox3(supabase, perspective, YEAR, currentUserName)

  // ÉÉN grondslag voor de hele vergelijking, bepaald door het gekozen
  // perspectief (zelfde regel als box3-detail.tsx): alleen de huishoud-weergave
  // rekent op het gecombineerde resultaat; persoonlijk én partner-weergave
  // gebruiken het perspectief-eigen resultaat (`box3.personal` ís in
  // partner-weergave het resultaat van de partner). Zo staan er nooit
  // huishoudcijfers zonder huishoud-markering in katern I, en klopt het
  // dagtarief (dailyExpensesByPerspective) bij de heffing die het deelt.
  const useHouseholdBasis = perspective === 'household' && !!box3.combined
  const current = useHouseholdBasis ? box3.combined! : box3.personal
  // De partnerverdeling is een HUISHOUD-hefboom: zijn grondslag (heffing van
  // het hele huishouden) mag niet naast een persoonlijke baseline in dezelfde
  // vergelijking staan. Alleen doorgeven op de huishoud-grondslag — en dan nog
  // uitsluitend de twee geaggregeerde scalars (ADR 0036).
  const optimalAllocation =
    useHouseholdBasis && box3.optimalAllocation
      ? {
          totalTax: box3.optimalAllocation.totalTax,
          savingsVsEqual: box3.optimalAllocation.savingsVsEqual,
        }
      : undefined

  // Scenario-generatie is doel-onafhankelijk (één keer); de ranking per doel
  // gebeurt server-side (verplaatst uit de client nu de doel-kiezer weg is).
  const { baseline, strategies, shiftCurve } = generateBox3Strategies({
    goalId: DEFAULT_GOAL_ID,
    year: YEAR,
    dailyExpenses: box3.dailyExpenses,
    hasPartner: current.hasPartner,
    current,
    optimalAllocation,
  })

  // ── Box 1-inputs voor het jaarruimte-doel (spiegelt box1/page.tsx) ─────
  // EIGEN persoon only — jaarruimte is per-persoon (ADR 0036), geen partner.
  const grossYearlyIncome = user
    ? (await resolveBox1GrossIncome(supabase, user.id, YEAR)).grossYearly
    : 0
  const horizonData = await loadHorizonData(supabase)
  const pensionFactorA = horizonData.pensioenFactorA

  // ── Jaarruimte-opportuniteit: besparing bij VOLLEDIGE benutting ────────
  // Via de canonieke helpers (geen herberekening): de onbenutte ruimte en de
  // marginaal-correcte belastingbesparing van die volledige inleg (ADR 0040/41).
  const jr = computeJaarruimte(grossYearlyIncome, pensionFactorA, YEAR)
  const jaarruimteSaving = jaarruimteBesparing(grossYearlyIncome, jr.jaarruimte, YEAR)
  const jaarruimteFreedomDays =
    box3.dailyExpenses > 0 ? Math.round(jaarruimteSaving / box3.dailyExpenses) : 0

  // ── Bouw ALLE doel-secties, in de volgorde van de catalogus ───────────
  const sections: GoalSection[] = TAX_OPTIMIZER_GOALS.map((goal): GoalSection => {
    switch (goal.id) {
      case 'box3-minimaal':
      case 'box3-geen-rendementsverlies': {
        const ranked = rankStrategies(strategies, goal.id)
        return {
          kind: 'box3',
          goalId: goal.id,
          goal,
          baseline,
          ranked,
          best: pickBest(ranked, goal.id),
          // Doel-onafhankelijk: dezelfde doorgerekende curve voedt de
          // verkenner-slider, ongeacht op welk doel de sectie gerankt is.
          shiftCurve,
        }
      }
      case 'jaarruimte-maximaal':
        return {
          kind: 'jaarruimte',
          goalId: goal.id,
          goal,
          grossYearlyIncome,
          pensionFactorA,
          dailyExpenses: box3.dailyExpenses,
          hasData: grossYearlyIncome > 0,
          besparing: jaarruimteSaving,
          freedomDays: jaarruimteFreedomDays,
          // Netto == bruto voor deze kans; de "geen rendementsverlies"-aanname
          // staat bij het `GoalSection`-type gedocumenteerd — hier alleen
          // doorgeven, geen eigen som.
          netEffect: jaarruimteSaving,
          netFreedomDays: jaarruimteFreedomDays,
        }
      case 'levenslang-minimaal':
        return {
          kind: 'preview',
          goalId: goal.id,
          goal,
          previewNote:
            'Straks vergelijkt TriFinity de volgorde waarin je je potten — spaargeld, beleggingen, pensioen en lijfrente — laat leeglopen, en zoekt de route met de laagste belastingdruk over je hele leven, niet alleen dit jaar.',
        }
      default: {
        const _exhaustive: never = goal.id
        throw new Error(`Onbekend fiscaal doel: ${String(_exhaustive)}`)
      }
    }
  })

  // ── Leidende kans + huidige situatie ──────────────────────────────────
  // Beide komen uit de canonieke optimizer-laag: `pickTopChoice` kiest de kans
  // met het hoogste netto effect uit dezelfde, al-gebouwde secties (geen
  // parallelle houders van hetzelfde getal), en `buildCurrentStanding` levert de
  // referentie-cijfers van katern I uit het Box 3-resultaat.
  const topChoice = pickTopChoice(sections)
  const standing = buildCurrentStanding(current, box3.dailyExpenses)

  const perspectiveAware = box3.hasHousehold && !!box3.combined && perspective !== 'personal'

  return (
    <>
      <NavStackMeta title="Fiscale optimizer" bottomBar={{ kind: 'tabs' }} />

      <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-3 sm:px-6 sm:pt-8">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/belasting/optimizer'] ?? ''}
          className="absolute right-4 top-6 sm:right-6 sm:top-8"
        />
        <PageOpening
          className="pr-20 sm:pr-24"
          kicker="Belasting · Optimizer"
          titleBefore="Van belasting berekenen naar "
          emphasis="optimaliseren"
          titleAfter=""
          deck="Eerst zie je waar je nu staat en wat elke fiscale kans per saldo oplevert — in euro’s én in vrijheidsdagen. Daarna zoom je per kans in op de uitwerking."
        />
      </div>

      <Box3OptimizerClient
        sections={sections}
        topChoice={topChoice}
        standing={standing}
        hasPartner={current.hasPartner}
        perspectiveAware={perspectiveAware}
        year={YEAR}
      />
    </>
  )
}
