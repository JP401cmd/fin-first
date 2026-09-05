import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCoreData, type FinancialInput } from '@/lib/core-metrics'
import { loadCoreData } from '@/lib/core-data-loader'
import { fireAgeForDisplay, isFinanciallyFree, isFixedAnchor, type StopAnchor } from '@/lib/fire-strategy'
import { computeHorizonFireSim, computeHorizonSolvedFireAge, type HorizonFireSim } from '@/lib/fire-target-shared'
import { ankerReachFromSim, ankerReachesAge, formatStopAge } from '@/lib/horizon/anker-copy'
import { leeftijdJaar } from '@/lib/horizon/leeftijd-jaar'
import { guardFreedomAge } from '@/lib/horizon/outcome-guard'
import { deriveCountdown } from '@/lib/horizon/fire-scalar'
import { isKernelReachedNowDisplay } from '@/lib/horizon-kernel/bridge'
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
 * Het vrijheidsmoment (leeftijd + datum + aftelling) — CONSUME, DON'T RECOMPUTE.
 *
 * WAT HIER MIS WAS (UR3-06, kaartgeval 1): deze regel las `core.expectedFireDate`
 * uit `computeCoreData`. Dat is een EIGEN maand-voor-maand projectie met een vaste
 * `DEFAULT_RETURN` van 7%, zonder schuldaflossing, inflatie of woonstrategie, en
 * met het naïeve 25×-`fireTarget` als doel — een ándere motor dan de kernel-bisectie
 * die /toekomst toont. Op een account waar /toekomst "42 — je kunt nu al stoppen"
 * zei, adviseerde Fin "juli 2028, over 2,5 jaar".
 *
 * WAT HET NU IS: exact de keten die /toekomst en de /overzicht-bundel al draaien —
 * `sim.fireAgeFractional` uit de canonieke run → `guardFreedomAge` (M6-vangrail op
 * de horizon-parkeerstand) → `fireAgeForDisplay` (afronden is WEERGAVE, nooit de
 * drempel) → `deriveCountdown` (dezelfde helper als `dashboard-data-loader.ts`) →
 * `isKernelReachedNowDisplay` voor de "nu al"-lezing (B93-doel=0-quirk; dezelfde
 * regel als de banner in `horizon-client.tsx`). Hier wordt niets gerekend.
 *
 * GEEN TERUGVAL OP DE OUDE PROJECTIE: draaide de kernel niet, dan is het antwoord
 * "onbekend" — niet een getal uit een tweede motor. Acceptatiecriterium 4 van de
 * kaart: liever zeggen dat je het niet hebt dan het schatten.
 */
function buildFireMomentLine(
  fireAgeFractional: number | null,
  currentAge: number | null,
): string {
  if (fireAgeFractional == null || currentAge == null || !guardFreedomAge(fireAgeFractional).ok) {
    return 'Vrijheidsmoment: onbekend — de projectie kon niet draaien. Zeg dat je het vrijheidsmoment niet hebt; schat of bereken het NIET zelf.'
  }
  const leeftijd = fireAgeForDisplay(fireAgeFractional)
  const countdown = deriveCountdown(fireAgeFractional, currentAge)
  if (isKernelReachedNowDisplay(fireAgeFractional, currentAge)) {
    return (
      `Vrijheidsleeftijd: ${leeftijd} — BEREIKT. Volgens de huidige cijfers kan de gebruiker nu al stoppen met werken ` +
      '(exact wat /toekomst toont). Noem géén toekomstige FIRE-datum en geen "nog X jaar te gaan".'
    )
  }
  return (
    `Vrijheidsleeftijd: ${leeftijd} (exact wat /toekomst toont). ` +
    `Verwachte FIRE-datum: ${countdown.fireDate} — nog ${countdown.countdownYears} jaar en ${countdown.countdownMonths} maanden.`
  )
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

  // DE vrijheidsleeftijd uit de canonieke run — fractioneel, want hij is hier zowel
  // DREMPEL (`isFinanciallyFree`) als weergave-invoer (`buildFireMomentLine` rondt
  // pas in de laatste stap af, via `fireAgeForDisplay`). Nooit zelf afronden — zie
  // de seam-toelichting bij `fireAgeForDisplay` in lib/fire-strategy.ts.
  const kernelFireAgeFractional = horizonRun?.sim.fireAgeFractional ?? horizonRun?.sim.fireAge ?? null

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
    anchorFixed ? null : buildFireMomentLine(kernelFireAgeFractional, coreData.currentAge ?? null),
    `Maandinkomen: ${formatCurrency(rawFinancials.monthlyIncome)} | Maanduitgaven: ${formatCurrency(rawFinancials.monthlyExpenses)}`,
    monthlyMustExpenses > 0 ? `Must-uitgaven (essentieel): ${formatCurrency(monthlyMustExpenses)}/mnd` : null,
    monthlyRetirementExpenses > 0 ? `Jaarlijkse uitgave na retirement: ${formatCurrency(monthlyRetirementExpenses)}/mnd (methode: ${coreData.retirementMethodUsed}) — basis voor FIRE & vrijheidsdagen` : null,
    `Spaarquote: ${formatPercentage(coreData.effectiveSavingsRatePct)} — DE spaarquote: grondslag-geresolveerd (budget/transactie/handmatig, ADR 0103). Exact hetzelfde getal als onderaan /overzicht/cashflow — dat instellingenblok leest deze ééne loader, dus daar kan het niet uiteenlopen. De hefboomkaart op /overzicht en de spaarquote-widget draaien op dezelfde formule via hun eigen loader en tonen hetzelfde percentage, op afronding en één bekende grondslagafwijking na (de spaarbudget-correctie telt hier bruto én transfer-inclusief). Gebruik dit getal letterlijk; herbereken het NIET uit inkomen/uitgaven.`,
    `Dagen vrijheid verdiend per maand: ${core.daysWonPerMonth}`,
    `Vrije dagen per jaar (passief inkomen): ${core.freeDaysPerYear}`,
    `Autonomiescore: ${core.autonomyScore}`,
    // HET dagtarief — de €→vrijheidsdagen-koers. CONSUMEER `facts.dagtarief` (het
    // canonieke 12-maands rolling `coreData.dailyExpenseRate`), niet
    // `core.yearlyExpenses / 365` (huidige-maand-uitgaven × 12 ÷ 365, een naïeve
    // extrapolatie). Dat verschil was UR3-06 geval 3: de cashflowpagina zei "één dag
    // vrijheid kost je nu €105" terwijl Fin met €135/dag rekende en €3.500 op 26
    // i.p.v. 33 vrijheidsdagen uitkwam. `facts.dagtarief` bestond al precies hiervoor
    // maar werd door deze bouwer niet gelezen.
    `Dagtarief (uitgaven per dag): ${formatCurrency(facts.dagtarief)} — DE €→vrijheidsdagen-koers, hetzelfde tarief als op /overzicht/cashflow ("één dag vrijheid kost je nu ..."). Deel bedragen door dit getal om ze in vrijheidsdagen uit te drukken; leid het NIET af uit maandinkomen/-uitgaven.`,
    // De marktaannames waar de hele projectie op draait — per gebruiker afgeleid in
    // `lib/fire-params.ts`, exact de drie die /toekomst/voorkeuren naast elkaar toont
    // (Inflatie · rendement · SWR). Ze bereikten het model eerder NIET, terwijl de
    // DNA-basisprompt het model wél vertelt dat ze in dit overzicht staan — het model
    // vulde dat gat met eigen kennis (7% / ~3%) i.p.v. de profielwaarden (UR3-06
    // geval 4, eigenaarskeuze optie A: de velden alsnog leveren).
    `Aannames (uit je profiel, /toekomst/voorkeuren): bruto rendement ${formatPercentage(coreData.fireParams.grossReturn * 100)} | inflatie ${formatPercentage(coreData.fireParams.inflationRate * 100)} | veilig opnamepercentage (SWR) ${formatPercentage(coreData.fireParams.effectiveSwr * 100)}. Noem deze percentages letterlijk; gebruik NOOIT een standaardaanname (geen 7%, geen 4%-regel).`,
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
      // De ECHTE kernel-vrijheidsleeftijd, fractioneel (drempel — nooit afgerond,
      // WF-CANON-03). Stond hardgecodeerd op `null`, waardoor het levensfase-vangnet
      // alleen nog op vrijheids-% ≥ 100 kon vallen en niet op "leeftijd voorbij de
      // vrijheidsleeftijd" — precies de situatie op het account uit UR3-06.
      // Guard eerst: de horizon-parkeerstand (leeftijd 100) mag de drempel niet voeden.
      fireAge: guardFreedomAge(kernelFireAgeFractional).ok ? kernelFireAgeFractional : null,
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
