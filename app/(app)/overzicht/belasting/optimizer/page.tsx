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
import { generateBox3Strategies, DEFAULT_GOAL_ID } from '@/lib/tax-optimizer'
import { rankStrategies, pickBest } from '@/lib/tax-optimizer/rank'
import { TAX_OPTIMIZER_GOALS } from '@/lib/tax-optimizer/goals'
import { computeJaarruimte, jaarruimteBesparing } from '@/lib/jaarruimte'
import type { GoalSection, OptimizerTopChoice } from '@/lib/tax-optimizer/types'
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
 * Alle fiscale doelen staan GESTAPELD onder elkaar (geen doel-kiezer meer). De
 * zware scenario-generatie én de ranking-per-doel draaien server-side; de page
 * bouwt één `GoalSection` per doel en de client rendert ze puur. We geven ALLEEN
 * geaggregeerde uitkomsten door — nooit de per-partner-splitsing — zodat er geen
 * partner-private bedragen lekken.
 *
 * Doelen: twee Box 3-doelen (scenario-vergelijking), jaarruimte-maximaal (Box 1,
 * via de bestaande JaarruimteCard, per persoon — ADR 0036) en een preview-doel
 * (levenslange belastingdruk, nog niet doorgerekend).
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

  // Huidige situatie: huishouden → gecombineerd (fiscaal partners), anders het
  // eigen resultaat. Partnerverdeling alleen wanneer de loader een optimale
  // verdeling leverde (household mét gedeeld partner-vermogen).
  const current = box3.combined ?? box3.personal
  const optimalAllocation = box3.optimalAllocation
    ? {
        totalTax: box3.optimalAllocation.totalTax,
        savingsVsEqual: box3.optimalAllocation.savingsVsEqual,
      }
    : undefined

  // Scenario-generatie is doel-onafhankelijk (één keer); de ranking per doel
  // gebeurt server-side (verplaatst uit de client nu de doel-kiezer weg is).
  const { baseline, strategies } = generateBox3Strategies({
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
        return { kind: 'box3', goalId: goal.id, goal, baseline, ranked, best: pickBest(ranked, goal.id) }
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

  // ── Leidende aanbeveling ("Je grootste kans nu") ──────────────────────
  // Kandidaten uit dezelfde, al-gerankte data — geen herberekening. De box3-
  // kandidaat is de winnaar van het grootste-besparing-doel; de jaarruimte-
  // kandidaat is de volledige-benutting-besparing. Kies op de meeste
  // vrijheidsdagen (savings als tiebreak); sla savings ≤ 0 over.
  // De kandidaten lezen uit de al-gebouwde secties (single source): geen
  // parallelle houders van hetzelfde getal — de jaarruimte-besparing komt uit
  // het sectie-veld, dat op zijn beurt uit `jaarruimteBesparing` is afgeleid.
  const box3MinBest =
    sections.find(
      (s): s is Extract<GoalSection, { kind: 'box3' }> =>
        s.kind === 'box3' && s.goalId === 'box3-minimaal',
    )?.best ?? null
  const jaarruimteSection = sections.find(
    (s): s is Extract<GoalSection, { kind: 'jaarruimte' }> => s.kind === 'jaarruimte',
  )

  const topCandidates: OptimizerTopChoice[] = []
  if (box3MinBest && box3MinBest.savings > 0) {
    topCandidates.push({
      goalId: 'box3-minimaal',
      title: box3MinBest.title,
      savings: box3MinBest.savings,
      freedomDays: box3MinBest.freedomDays,
      caveat: box3MinBest.caveat,
      kind: 'box3',
      anchorId: 'optimizer-box3',
    })
  }
  if (jaarruimteSection && jaarruimteSection.hasData && jaarruimteSection.besparing > 0) {
    topCandidates.push({
      goalId: 'jaarruimte-maximaal',
      title: 'Benut je jaarruimte (lijfrente)',
      savings: jaarruimteSection.besparing,
      freedomDays: jaarruimteSection.freedomDays,
      caveat:
        'Je zet dit bedrag vast tot je pensioen; de latere uitkering wordt belast, meestal tegen een lager tarief.',
      kind: 'jaarruimte',
      anchorId: 'optimizer-jaarruimte',
    })
  }
  const topChoice: OptimizerTopChoice | null =
    topCandidates.sort(
      (a, b) => b.freedomDays - a.freedomDays || b.savings - a.savings,
    )[0] ?? null

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
          deck="Al je fiscale doelen onder elkaar. TriFinity rekent per doel de scenario’s door en zet ze naast elkaar — in euro’s én in vrijheidsdagen — zodat je ziet waar ruimte ligt om vrijheid terug te kopen."
        />
      </div>

      <Box3OptimizerClient
        sections={sections}
        topChoice={topChoice}
        hasPartner={current.hasPartner}
        perspectiveAware={perspectiveAware}
      />
    </>
  )
}
