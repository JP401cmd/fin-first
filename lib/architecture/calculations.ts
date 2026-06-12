// ── Berekeningen op de brongegevens (gecureerd) ──────────────────────────────
// De rekenmotoren die ruwe DB-gegevens omzetten naar de afgeleide cijfers die de
// gebruiker ziet (spaarquote, netto vermogen, belastingdruk, FIRE-datum). De
// betekenis hiervan is niet betrouwbaar te scannen, dus dit is een gecureerde
// catalogus. Houd 'm bij wanneer je een rekenmotor toevoegt, wijzigt of een
// constante/aanname verandert.
//
// `elementIds` koppelt elke berekening aan elementen op de ArchiMate-plaat;
// `validateCalculations` dwingt af dat die verwijzingen blijven kloppen.

import type { ArchimateModel } from './archimate-model'

export type CalcDomain = 'Cashflow' | 'Vermogen' | 'Belasting' | 'Toekomst (FIRE)'

export interface CalcConstant {
  label: string
  value: string
}

export interface Calculation {
  id: string
  title: string
  domain: CalcDomain
  summary: string
  /** Brongegevens (tabellen/velden of upstream-uitkomsten) */
  inputs: string[]
  /** Wat eruit komt */
  outputs: string[]
  /** Kernformule, beknopt */
  formula?: string
  /** Bestanden met de implementatie */
  files: string[]
  /** Belangrijkste functies */
  functions: string[]
  /** Vaste aannames/constanten */
  constants?: CalcConstant[]
  /** Gekoppelde plaat-elementen */
  elementIds: string[]
  note?: string
}

export const CALC_DOMAINS: CalcDomain[] = ['Cashflow', 'Vermogen', 'Belasting', 'Toekomst (FIRE)']

export const CALCULATIONS: Calculation[] = [
  // ── Cashflow ──
  {
    id: 'spaarquote',
    title: 'Spaarquote',
    domain: 'Cashflow',
    summary: 'Welk deel van het inkomen overblijft. De bron van de FIRE-prognose: sparen = spaarquote × inkomen.',
    inputs: ['transactions (inkomen, uitgaven)', 'budgets'],
    outputs: ['spaarquote %', 'sparen €/maand', 'sparen €/jaar'],
    formula: 'spaarquote = (inkomen − uitgaven) / inkomen',
    files: ['lib/savings-source.ts'],
    functions: ['resolveSavingsSource'],
    elementIds: ['as-budget', 'fn-budgetteren'],
    note: 'Aflossing wordt niet dubbel geteld; spaarquote × inkomen voedt de unified projection.',
  },
  {
    id: 'cashflow-forecast',
    title: 'Cashflow-prognose',
    domain: 'Cashflow',
    summary: 'Verwachte maandelijkse in- en uitstroom op basis van vaste lasten en budgetten.',
    inputs: ['recurring_transactions', 'budgets', 'transactions (lopende maand)'],
    outputs: ['maandprognose', 'verwacht saldo-einde maand'],
    files: ['lib/cashflow-forecast-math.ts'],
    functions: ['buildCashflowCards'],
    elementIds: ['as-budget'],
    note: 'Server-safe (geen Supabase-calls); maandgrenzen via lib/month-range.ts.',
  },
  {
    id: 'leverage-status',
    title: 'Hefboom-status',
    domain: 'Cashflow',
    summary: 'De vier hefbomen (cashflow, vermogen, schulden, belasting) vertaald naar een status-semantiek voor de kaarten.',
    inputs: ['spaarquote', 'netto vermogen', 'schulden', 'box 3-druk'],
    outputs: ['status per hefboom (groen/aandacht/…)'],
    files: ['lib/leverage-status.ts'],
    functions: ['computeLeverScores'],
    elementIds: ['as-budget', 'as-vermogen'],
    note: 'Canonieke statusbron — niet hand-rollen, anders ontstaat label-drift.',
  },

  // ── Vermogen ──
  {
    id: 'netto-vermogen',
    title: 'Netto vermogen (gewogen)',
    domain: 'Vermogen',
    summary: 'Bezittingen minus schulden, gewogen per inclusie-percentage. Wordt ook getoond als “jaren vrijheid”.',
    inputs: ['assets (current_value, net_worth_inclusion_pct)', 'debts (current_balance, net_worth_inclusion_pct)'],
    outputs: ['netto vermogen €', 'jaren/maanden vrijheid'],
    formula: 'Σ(asset × incl%) − Σ(debt × incl%)',
    files: ['lib/dashboard-data-loader.ts', 'lib/format.ts'],
    functions: ['calculateFreedomTime', 'formatFreedomTimeString'],
    elementIds: ['as-vermogen', 'fn-vermogensregistratie'],
    note: 'Cash-only fallback wanneer vermogensregistratie uit staat.',
  },
  {
    id: 'gezondheidsscore',
    title: 'Financiële gezondheidsscore (7-pijler)',
    domain: 'Vermogen',
    summary: 'Eén gewogen rapportcijfer (0–100) over zeven pijlers — spaarquote, schuldratio, noodfonds, FIRE-voortgang, diversificatie, budget-discipline en belastingoptimalisatie.',
    inputs: ['spaarquote (6m)', 'assets', 'debts', 'noodfonds-maanden', 'FIRE-voortgang (freedomPct)', 'asset-typen', 'budgetten', 'box 3-context'],
    outputs: ['gezondheidsgetal 0–100', 'label (Uitstekend…Kritiek)', 'score per pijler + verbetertip'],
    formula: 'Σ(pijlerscore × herverdeeld gewicht) over de actieve pijlers',
    files: ['lib/financial-health.ts', 'lib/health-score-input.ts'],
    functions: ['computeHealthScoreFromInputs', 'buildHealthScoreInput'],
    elementIds: ['as-budget', 'as-vermogen', 'as-belasting', 'as-planning'],
    note: 'Eén canonieke berekening (ADR 0008): het "huidige" getal wordt overal live berekend via het gedeelde input-pad (buildHealthScoreInput), gebruikt door loader, client-recompute én de drie snapshot-routes. net_worth_snapshots.resilience_score is uitsluitend historie voor de trendlijn op /toekomst — geen tweede waarheid voor het huidige getal.',
  },
  {
    id: 'allocatie-herbalancering',
    title: 'Allocatie & herbalancering',
    domain: 'Vermogen',
    summary: 'Verdeling over assetklassen en het verschil met de doelallocatie.',
    inputs: ['holdings', 'crypto_holdings', 'target_allocations', 'holding_prices'],
    outputs: ['huidige allocatie %', 'afwijking t.o.v. doel', 'herbalanceer-orders'],
    files: ['lib/portfolio-allocation.ts', 'lib/rebalancing.ts'],
    functions: ['computePortfolioAllocation'],
    elementIds: ['as-vermogen', 'fn-aandelenregistratie'],
  },

  // ── Belasting ──
  {
    id: 'box1',
    title: 'Box 1 — inkomen & jaarruimte',
    domain: 'Belasting',
    summary: 'Belasting in box 1 (schijven) en de fiscale jaarruimte voor pensioenopbouw.',
    inputs: ['inkomen', 'pensioenaangroei', 'AOW-status'],
    outputs: ['box 1-druk', 'jaarruimte €'],
    files: ['lib/box1-tax.ts'],
    functions: ['computeBox1Tax', 'computeJaarruimte'],
    constants: [{ label: 'Schijfgrenzen/tarieven', value: 'in box1-tax.ts (jaargebonden)' }],
    elementIds: ['as-belasting'],
  },
  {
    id: 'box3-forfaitair',
    title: 'Box 3 — forfaitair',
    domain: 'Belasting',
    summary: 'De wettelijke forfaitaire vermogensrendementsheffing over spaargeld en beleggingen.',
    inputs: ['box 3-bezittingen', 'box 3-schulden', 'heffingvrij vermogen'],
    outputs: ['forfaitair rendement', 'box 3-heffing €'],
    files: ['lib/horizon-data.ts'],
    functions: ['NL_FICTIEF_BELEGGINGEN', 'BOX3_TARIEF'],
    constants: [
      { label: 'Heffingvrij vermogen', value: '€57.684 (2025, alleenstaand)' },
      { label: 'Tarief & forfaits', value: 'wettelijk vast in horizon-data.ts' },
    ],
    elementIds: ['as-belasting'],
    note: 'Box 3-constanten zijn bewust hardcoded (wettelijk vast).',
  },
  {
    id: 'box3-tegenbewijs',
    title: 'Box 3 — tegenbewijs (werkelijk rendement)',
    domain: 'Belasting',
    summary: 'De tegenbewijsregeling: werkelijk behaald rendement i.p.v. het forfait, wanneer dat gunstiger is.',
    inputs: ['werkelijk rendement', 'box 3-vermogen'],
    outputs: ['heffing bij werkelijk rendement', 'voordeel t.o.v. forfait'],
    files: ['lib/box3-tegenbewijs.ts'],
    functions: ['computeBox3Tegenbewijs'],
    elementIds: ['as-belasting'],
  },
  {
    id: 'tax-overview',
    title: 'Belastingoverzicht (totaaldruk)',
    domain: 'Belasting',
    summary: 'Samenvattende belastingdruk over box 1/2/3 plus aandachtspunten op de fiscale kalender.',
    inputs: ['box 1', 'box 2', 'box 3'],
    outputs: ['totale belastingdruk', 'aandachtspunten'],
    files: ['lib/tax-overview.ts', 'lib/tax-calendar.ts'],
    functions: ['buildTaxOverview'],
    constants: [{ label: 'Box 2-tarief', value: '31% boven €68.843 (gecorrigeerd)' }],
    elementIds: ['as-belasting'],
  },

  // ── Toekomst (FIRE) ──
  {
    id: 'fire-params',
    title: 'FIRE-parameters resolver',
    domain: 'Toekomst (FIRE)',
    summary: 'Lost de rendements- en inflatie-aannames op uit het profiel; levert de effectieve veilige onttrekkingsvoet.',
    inputs: ['profiles (expected_return, inflation_rate)'],
    outputs: ['grossReturn', 'inflationRate', 'effectiveSwr'],
    files: ['lib/fire-params.ts'],
    functions: ['resolveFireParams'],
    constants: [{ label: 'NL_SWR', value: '4% (default veilige onttrekkingsvoet)' }],
    elementIds: ['as-planning'],
  },
  {
    id: 'unified-projection',
    title: 'FIRE — unified projection',
    domain: 'Toekomst (FIRE)',
    summary: 'De single source of truth voor de FIRE-prognose: vermogenspad tot en voorbij financiële onafhankelijkheid.',
    inputs: ['netto vermogen', 'sparen (spaarquote × inkomen)', 'life_events', 'FIRE-parameters'],
    outputs: ['FIRE-datum', 'vermogenspad', 'passief inkomen'],
    formula: 'jaarlijks: vermogen × (1+rendement) + sparen − onttrekking',
    files: ['lib/horizon-data.ts', 'lib/fire-simulation.ts'],
    functions: ['runUnifiedProjection', 'runSimulation', 'lifeEventsToCashflows'],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
    note: 'Wordt op álle pagina’s aangeroepen met lifeEventsToCashflows — nooit met [].',
  },
  {
    id: 'vrijheidsvoortgang',
    title: 'Vrijheidsvoortgang (FIRE-eligible)',
    domain: 'Toekomst (FIRE)',
    summary: 'Hoe ver je bent richting volledige vrijheid (0–100%). Zelfde grondslag als de “nog X jaar”-aftelling, zodat 100% nooit naast “nog jaren” verschijnt.',
    inputs: ['FIRE-eligible netto vermogen (huis gefilterd via housing-strategie)', 'benodigde portfolio uit unified projection (requiredFirePortfolio)'],
    outputs: ['vrijheidsvoortgang % (0–100)'],
    formula: 'min(100, max(0, FIRE-eligible vermogen / benodigde portfolio × 100)); 100% ⇔ doel bereikt',
    files: ['lib/core-metrics.ts', 'lib/dashboard-data-loader.ts', 'lib/horizon-data-loader.ts', 'lib/housing-strategy.ts'],
    functions: ['computeFreedomProgress', 'getFireEligibleNetWorth'],
    elementIds: ['as-planning', 'fn-toekomstplannen', 'as-vermogen'],
    note: 'Eén bron: FIRE-eligible vermogen ÷ benodigde portfolio uit runUnifiedProjection (fallback: strategie-bewust fireTarget op dezelfde grondslag). De fire-pijler van het gezondheidsgetal erft dit percentage via freedomPct, waardoor de live health-score voor huiseigenaren lager (correcter) uitvalt dan oude gepersisteerde snapshot-scores, die nog op het volledige vermogen rusten. De FIRE-prognose-widget erft het ook; de snapshot-historie (app/api/snapshots) houdt bewust een eigen, per-rij consistente definitie. Zie ADR 0009.',
  },
  {
    id: 'fire-range-scenarios',
    title: 'FIRE-range & scenario’s',
    domain: 'Toekomst (FIRE)',
    summary: 'Bandbreedte rond de FIRE-datum bij verschillende rendementsaannames (optimistisch/pessimistisch).',
    inputs: ['netto vermogen', 'sparen', 'rendements-offsets'],
    outputs: ['FIRE-range (jaren)', 'scenario-paden'],
    files: ['lib/horizon-data.ts'],
    functions: ['computeFireRange'],
    elementIds: ['as-planning'],
  },
  {
    id: 'backtest',
    title: 'Backtesting (historische paden)',
    domain: 'Toekomst (FIRE)',
    summary: 'Toetst het plan tegen historische marktreeksen en geeft een slaagkans.',
    inputs: ['vermogenspad', 'historische rendementen'],
    outputs: ['slaagkans %', 'named paths (best/mediaan/worst)'],
    files: ['lib/horizon-data.ts'],
    functions: ['runBacktest', 'ageAtDate'],
    elementIds: ['as-planning', 'fn-toekomstplannen'],
  },
  {
    id: 'retirement-expenses',
    title: 'Uitgaven na pensioen',
    domain: 'Toekomst (FIRE)',
    summary: 'De verwachte jaarlijkse uitgaven na FIRE — de basis voor het benodigde vermogen.',
    inputs: ['budgets', 'gekozen methode (NIBUD / huidige uitgaven / handmatig)'],
    outputs: ['jaarlijkse pensioenuitgave', 'benodigd vermogen (× 1/SWR)'],
    files: ['lib/budget-utils.ts'],
    functions: ['computeRetirementExpenses'],
    elementIds: ['as-planning'],
  },
]

/** Berekeningen gegroepeerd per domein, in vaste domein-volgorde. */
export function calculationsByDomain(): Array<{ domain: CalcDomain; items: Calculation[] }> {
  return CALC_DOMAINS.map((domain) => ({
    domain,
    items: CALCULATIONS.filter((c) => c.domain === domain),
  })).filter((g) => g.items.length > 0)
}

/** Berekeningen die een specifiek plaat-element raken. */
export function calculationsForElement(elementId: string): Calculation[] {
  return CALCULATIONS.filter((c) => c.elementIds.includes(elementId))
}

/** Valideert id-uniekheid en dat elke elementId in het model bestaat. */
export function validateCalculations(model: ArchimateModel): string[] {
  const ids = new Set(model.nodes.map((n) => n.id))
  const errors: string[] = []
  const seen = new Set<string>()
  for (const c of CALCULATIONS) {
    if (seen.has(c.id)) errors.push(`dubbele calc-id: ${c.id}`)
    seen.add(c.id)
    if (c.elementIds.length === 0) errors.push(`calc ${c.id} heeft geen elementen`)
    for (const e of c.elementIds) if (!ids.has(e)) errors.push(`calc ${c.id} verwijst naar onbekend element ${e}`)
    if (c.files.length === 0) errors.push(`calc ${c.id} heeft geen bronbestand`)
  }
  return errors
}
