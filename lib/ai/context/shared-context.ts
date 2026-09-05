import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCoreData, type FinancialInput } from '@/lib/core-metrics'
import { loadCoreData } from '@/lib/core-data-loader'
import { isFinanciallyFree, isFixedAnchor, type StopAnchor } from '@/lib/fire-strategy'
import { computeHorizonFireSim, computeHorizonSolvedFireAge, type HorizonFireSim } from '@/lib/fire-target-shared'
import { ankerReachFromSim, ankerReachesAge, formatStopAge } from '@/lib/horizon/anker-copy'
import { leeftijdJaar } from '@/lib/horizon/leeftijd-jaar'
import { deflate, factorAtAge } from '@/lib/euro-display'
import { buildWillFinancialFacts } from './fin-financial-facts'
import { section, formatCurrency, formatFreedomTime, formatPercentage } from './formatter'

const TEMPORAL_LABELS: Record<number, string> = {
  1: 'De Levensgenieter (level 1) — Comfort > Snelheid',
  2: 'De Reiziger (level 2) — Spaart wat overblijft, ervaringen eerst',
  3: 'De Architect (level 3) — Optimaliseert bewust, gulden middenweg',
  4: 'De Stoïcijn (level 4) — Snelheid > Comfort, streng en doelgericht',
  5: 'De Essentialist (level 5) — Minimalistisch voor maximale snelheid',
}

/**
 * De FIRE-doel-regel: het nominale bedrag, met de canonieke omrekening ernáást.
 *
 * WAAROM BEIDE BEDRAGEN (ADR 0090-vervolg, euro-weergave besluit D14): de
 * gebruiker kan het scherm op "huidige euro's" hebben staan terwijl deze context
 * — net als élk ander cijfer hier — nominaal is. Dan zegt het scherm €650k en Fin
 * €1,2 mln over hetzelfde doel. Die scheefstand lossen we op door het tweede
 * bedrag ER BIJ te zetten, niet door de context te deflateren.
 *
 * WAAROM DE VOORKEUR ZELF NIET MEEGAAT: `profiles.euro_view` bereikt het model
 * bewust nooit. Een weergavevoorkeur zónder cijfers verleidt een taalmodel tot een
 * eigen `(1 + i)^n` — de zuiverste consume-don't-recompute-overtreding die er is.
 * Het model krijgt hier dus geen keuze, maar twee kant-en-klare feiten.
 *
 * WANNEER GEEN TWEEDE BEDRAG — drie voorwaarden, alle drie nodig:
 *  1. HET DOEL MOET NOMINAAL ZIJN. `goalUitKernel` (= `FinFacts.fireDoelUitKernel`)
 *     zegt of het bedrag door de kernel op de FIRE-maand is geprojecteerd. De
 *     terugvalpaden — het 25×-doel op de HUIDIGE jaaruitgaven en de scalar-
 *     benadering die het kernel-doel ophoogt met de overwaarde van VANDAAG — staan
 *     al (deels) in euro's van vandaag; die nóg eens deflateren levert een
 *     materieel te laag tweede bedrag. Zo'n terugval kan samenvallen met een
 *     geslaagde run mét rijen (`computeHorizonFireTarget` nult doelen weg bij
 *     `<= 0`), dus de rijenlijst alleen is géén herkomstbewijs.
 *  2. De kernel moet rijen leveren (zonder rijen is er geen deflator).
 *  3. De factor moet ná formatteren een ánder bedrag opleveren; "≈ € X in geld van
 *     vandaag" met hetzelfde getal is vals-precies — het suggereert een omrekening
 *     die niet heeft plaatsgevonden. De vergelijking loopt daarom op de
 *     GEFORMATTEERDE bedragen.
 *
 * CONSUME, DON'T RECOMPUTE: de factor komt uit `run.unifiedRows` (de kernelrijen
 * van DEZELFDE run die het doelbedrag leverde), via `factorAtAge`/`deflate` uit
 * `lib/euro-display.ts`. Nooit een eigen som hier.
 */
function formatFireGoalLine(nominalGoal: number, run: HorizonFireSim | null, goalUitKernel: boolean): string {
  const nominal = formatCurrency(nominalGoal)
  const rows = run?.unifiedRows ?? []
  if (!goalUitKernel || rows.length === 0) return `FIRE-doel: ${nominal}`

  // De FIRE-leeftijd is het moment waar dit doelbedrag bij hoort (klasse S).
  // Fractioneel wint: `factorAtAge` pakt dan de dichtstbijzijnde rij.
  const fireAge = run?.sim.fireAgeFractional ?? run?.sim.fireAge ?? null
  const inTodaysMoney = formatCurrency(deflate(nominalGoal, factorAtAge(rows, fireAge), 'real'))
  if (inTodaysMoney === nominal) return `FIRE-doel: ${nominal}`

  return `FIRE-doel: ${nominal} (toekomstige euro's; ≈ ${inTodaysMoney} in geld van vandaag)`
}

/**
 * De ENE contextregel over een vast stop-anker (ADR 0129, bijlage "Fin —
 * contextregel"): stopmoment · vrij mogelijk vanaf · reikt tot · plan-eind · dekking,
 * plus de coach-instructie. Beschrijvend: Fin zegt nooit dat de gebruiker "kan
 * stoppen" — ze beschrijft hoe ver het reikt. Alle getallen komen kant-en-klaar uit
 * de canonieke run; hier wordt niets gerekend behalve afronden voor de zin.
 */
function buildAnkerContextLine(input: {
  anchor: StopAnchor
  stopAge: number | null
  solvedFireAge: number | null
  reachesAge: number | null
  endAge: number | null
  coveragePct: number
}): string {
  const ankerLabel =
    input.anchor.kind === 'aow' ? 'AOW-leeftijd' : input.anchor.kind === 'now' ? 'vandaag' : 'zelfgekozen leeftijd'
  const stop =
    input.anchor.kind === 'now' ? 'nu' : input.stopAge != null ? formatStopAge(input.stopAge) : 'onbekend'
  const vrij = input.solvedFireAge != null ? `${leeftijdJaar(input.solvedFireAge)}` : 'niet binnen de horizon'
  const reikt = input.reachesAge != null ? `${leeftijdJaar(input.reachesAge)}` : 'onbekend'
  const eind = input.endAge != null ? `${leeftijdJaar(input.endAge)}` : 'onbekend'
  return (
    `Stopmoment: vast op ${stop} (${ankerLabel}). Vrij mogelijk vanaf ${vrij}. ` +
    `Liquide vermogen reikt tot ${reikt}; plan tot ${eind}; dekking ${formatPercentage(input.coveragePct)}. ` +
    'Coach op de houdbaarheid van uitgaven en onttrekking, niet op eerder stoppen. ' +
    'Zeg nooit dat de gebruiker "kan stoppen" — beschrijf hoe ver het reikt.'
  )
}

/**
 * Shared context available to all domains:
 * profile overview, net worth, freedom calculation.
 *
 * Egress-reductie (jun 2026): alle financiële kerngetallen komen uit
 * `loadCoreData` (React-cached, dezelfde bron als de app-pagina's) in
 * plaats van zes eigen queries die functioneel overlapten. Dat scheelt
 * per chatbericht ~6 PostgREST-calls én garandeert dat Fin exact
 * dezelfde getallen ziet als de gebruiker op /core en /overzicht
 * (single-source-of-truth). Alleen de drie profielvelden die niet in
 * `CorePageData` zitten (temporal_balance, household_type,
 * financial_context) worden nog los opgehaald — RLS scopet naar de
 * eigen rij.
 */
export async function buildSharedContext(supabase: SupabaseClient): Promise<string> {
  const [coreData, profileResult, horizonRun] = await Promise.all([
    loadCoreData(supabase),
    supabase
      .from('profiles')
      .select('temporal_balance, household_type, financial_context, housing_strategy_config')
      .maybeSingle(),
    // DEZELFDE canonieke FIRE-run die `loadCoreData` al consumeert
    // (`computeHorizonFireTarget` → `computeHorizonFireSim`, React-`cache()`'d).
    // Binnen dit request is dit dus geen tweede kernel-run en geen extra query;
    // we hebben 'm hier alleen voor `unifiedRows` — de canonieke weergave-deflator
    // per jaar, die `HorizonFireTargets` niet draagt. Faalt de run, dan blijft de
    // FIRE-doel-regel exact zoals hij vandaag is.
    computeHorizonFireSim(supabase).catch(() => null),
  ])

  const profile = profileResult.data
  const { rawFinancials } = coreData
  const totalAssets = rawFinancials.totalAssets
  const totalDebts = rawFinancials.totalDebts

  const monthlyMustExpenses = rawFinancials.yearlyMustExpenses > 0
    ? Math.round(rawFinancials.yearlyMustExpenses / 12)
    : 0
  const yearlyRetirementExpenses = rawFinancials.yearlyRetirementExpenses ?? 0
  const monthlyRetirementExpenses = yearlyRetirementExpenses > 0
    ? Math.round(yearlyRetirementExpenses / 12)
    : 0

  // If no financial data at all, return minimal context
  if (totalAssets === 0 && totalDebts === 0 && !coreData.hasTransactions) {
    return section('FINANCIEEL OVERZICHT', 'Nog geen financiële data beschikbaar. Vraag de gebruiker om assets, schulden of transacties toe te voegen.')
  }

  // Build identity section from profile + core data
  const temporal = TEMPORAL_LABELS[profile?.temporal_balance ?? 3] ?? TEMPORAL_LABELS[3]
  const identityLines = [
    coreData.userName ? `Naam: ${coreData.userName}` : null,
    coreData.currentAge ? `Leeftijd: ${coreData.currentAge} jaar` : null,
    `Huishoudtype: ${profile?.household_type ?? 'solo'}`,
    `Temporal Balance: ${temporal}`,
  ].filter(Boolean) as string[]
  const identitySection = section('GEBRUIKERSPROFIEL', identityLines.join('\n')) + '\n'

  const coreInput: FinancialInput = {
    totalAssets,
    totalDebts,
    monthlyIncome: rawFinancials.monthlyIncome,
    monthlyExpenses: rawFinancials.monthlyExpenses,
    yearlyMustExpenses: yearlyRetirementExpenses,
    monthlyContributions: 0,
    dateOfBirth: null,
  }
  const core = computeCoreData(coreInput, coreData.fireParams.effectiveSwr)

  // Netto vermogen, vrijgekochte tijd, vrijheids-% en FIRE-doel komen ALLE uit de
  // gedeelde extractor `buildWillFinancialFacts` — DEZELFDE bron die de lokale Fin
  // (`buildLocalChatOverview`) leest, zodat beide Fins exact dezelfde getallen op
  // dezelfde grondslag tonen. `facts.nettoVermogen/freedomYears/freedomMonths` zijn
  // per constructie identiek aan `core.*` (zelfde `computeCoreData`-input + SWR); ze
  // óók uit facts lezen maakt er één bron van, zodat een toekomstige wijziging aan de
  // coreInput (bv. dateOfBirth) hier niet stil kan divergeren van het vrijheids-%.
  // `core` hieronder blijft uitsluitend de bron voor de cloud-only KPI-regels
  // (FIRE-datum, dagen/jaar, autonomie, dagelijkse uitgaven, fireTarget-fallback) die
  // de extractor niet draagt.
  const facts = buildWillFinancialFacts(coreData, profile)
  const freedomPercentage = facts.vrijheidsPct
  const displayFireGoal = facts.displayFireGoal

  // ── Het stop-anker (ADR 0129 F3a, bijlage "Fin — contextregel") ──────────────
  // Onder een VAST anker (aow/now/age) is er geen FIRE-moment om naartoe te coachen:
  // Fin krijgt één regel met het gekozen stopmoment, "vrij mogelijk vanaf" (de tweede
  // run, D7 — één extra bisectie, React-cache()'d, alléén onder een vast anker), tot
  // waar het liquide vermogen reikt, de eindleeftijd en de dekking. `firePlan` is
  // optioneel gelezen zodat een gemockte Kern-bundel zonder het veld `solved` blijft.
  const anchor: StopAnchor = coreData.firePlan?.anchor ?? { kind: 'solved' }
  const anchorFixed = isFixedAnchor({ anchor })
  const solvedFireAge = anchorFixed ? await computeHorizonSolvedFireAge(supabase).catch(() => null) : null
  const ankerRegel = anchorFixed
    ? buildAnkerContextLine({
        anchor,
        stopAge: horizonRun?.sim.vastStopLeeftijd ?? (anchor.kind === 'age' ? anchor.age : null),
        solvedFireAge,
        reachesAge: horizonRun
          ? ankerReachesAge(
              ankerReachFromSim({
                startAge: coreData.currentAge ?? null,
                kernelDepletionMonth: horizonRun.sim.kernelDepletionMonth,
                endAge: horizonRun.sim.displayEndAge,
              }),
            )
          : null,
        endAge: horizonRun?.sim.displayEndAge ?? coreData.firePlan?.endAge ?? null,
        coveragePct: freedomPercentage,
      })
    : null

  const lines = [
    `Netto vermogen: ${formatCurrency(facts.nettoVermogen)}`,
    `Vrijgekochte tijd: ${formatFreedomTime(facts.freedomYears, facts.freedomMonths)}`,
    `Vrijheids-%: ${formatPercentage(freedomPercentage)}`,
    // Toon het FIRE-doel op dezelfde grondslag als het Vrijheids-% — zo zijn
    // teller, noemer en doelbedrag onderling consistent. Kwam het doel uit de
    // kernel, dan is het bedrag nominaal (toekomstige euro's) en staat de
    // omrekening naar geld van vandaag er letterlijk bij; op een terugvalpad blijft
    // het bij het kale bedrag — zie `formatFireGoalLine`.
    // Onder een vast anker is er géén doelvermogen (ADR 0129 D4) en geen FIRE-datum
    // om naartoe te rekenen: de anker-regel hieronder draagt dan het hele verhaal.
    anchorFixed ? null : formatFireGoalLine(displayFireGoal ?? core.fireTarget, horizonRun, facts.fireDoelUitKernel),
    anchorFixed ? null : `Verwachte FIRE-datum: ${core.expectedFireDate || 'onbekend'}`,
    `Maandinkomen: ${formatCurrency(rawFinancials.monthlyIncome)} | Maanduitgaven: ${formatCurrency(rawFinancials.monthlyExpenses)}`,
    monthlyMustExpenses > 0 ? `Must-uitgaven (essentieel): ${formatCurrency(monthlyMustExpenses)}/mnd` : null,
    monthlyRetirementExpenses > 0 ? `Jaarlijkse uitgave na retirement: ${formatCurrency(monthlyRetirementExpenses)}/mnd (methode: ${coreData.retirementMethodUsed}) — basis voor FIRE & vrijheidsdagen` : null,
    `Spaarquote: ${formatPercentage(coreData.effectiveSavingsRatePct)} — DE spaarquote: grondslag-geresolveerd (budget/transactie/handmatig, ADR 0103). Exact hetzelfde getal als onderaan /overzicht/cashflow — dat instellingenblok leest deze ééne loader, dus daar kan het niet uiteenlopen. De hefboomkaart op /overzicht en de spaarquote-widget draaien op dezelfde formule via hun eigen loader en tonen hetzelfde percentage, op afronding en één bekende grondslagafwijking na (de spaarbudget-correctie telt hier bruto én transfer-inclusief). Gebruik dit getal letterlijk; herbereken het NIET uit inkomen/uitgaven.`,
    `Dagen vrijheid verdiend per maand: ${core.daysWonPerMonth}`,
    `Vrije dagen per jaar (passief inkomen): ${core.freeDaysPerYear}`,
    `Autonomiescore: ${core.autonomyScore}`,
    `Dagelijkse uitgaven: ${formatCurrency(Math.round(core.yearlyExpenses / 365))}`,
    `Budgettering: ${coreData.budgetingActive !== false ? 'actief' : 'NIET actief — gebruiker budgetteert niet. Doe GEEN budget-gerelateerde voorstellen.'}`,
    // Het stop-anker (ADR 0129) — alleen onder een vast anker; zie hierboven.
    ankerRegel,
    // Levensfase-signaal (consume-only, ADR 0009/0129 D8): wanneer de gebruiker AL
    // financieel vrij is — onder `solved`: vrijheids-% ≥ 100 of leeftijd voorbij de
    // vrijheidsleeftijd; onder een vast anker: anker bereikt ∧ dekking ≥ 100 — moet
    // Fin coachen op behoud/onttrekking i.p.v. "eerder vrij worden". Afgeleid via de
    // canonieke `isFinanciallyFree`-gate uit reeds-in-context getallen; geen nieuwe
    // data naar het model.
    isFinanciallyFree({
      freedomPct: freedomPercentage,
      currentAge: coreData.currentAge ?? null,
      fireAge: null,
      anchor,
      aowAge: horizonRun?.aowAgeFractional ?? null,
    })
      ? 'Levensfase: gebruiker is AL financieel vrij / met pensioen — coach op behoud en onttrekking (hoe lang gaat het vermogen mee, kosten laag houden), NIET op "eerder vrij worden" of sneller sparen. De FIRE-datum en het vrijheids-% zijn bereikt.'
      : null,
  ]

  // Add supplementary context from free-text financial description (news-only onboarding)
  const contextSection = profile?.financial_context
    ? '\n' + section('AANVULLENDE CONTEXT', profile.financial_context)
    : ''

  return identitySection + section('FINANCIEEL OVERZICHT', (lines.filter(Boolean) as string[]).join('\n')) + contextSection
}
