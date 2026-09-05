/**
 * Chart-tips factory-functies — pure data, geen runtime-fetches.
 *
 * Eén export per chart-type. Functies accepteren een context-object met
 * gebruiker-specifieke leeftijden/flags en retourneren een `string[]` met
 * 3-5 korte tips. Eerste tip = spotlight (wordt gebruikt als preview bij
 * ingeklapte staat in `<ChartTips>`).
 *
 * Conventies:
 * - Tips zijn 1 zin elk, max ~80 tekens, Nederlands, geen onuitgelegd jargon.
 * - Refereer aan eigen leeftijden/bedragen, niet aan absolute jaartallen.
 * - Conditionele tips: alleen toevoegen als de chart-feature actief is.
 */

// ─────────────────────────────────────────────────────────────────
// FIRE-projectie / Vermogenspad (SimChart)
// ─────────────────────────────────────────────────────────────────

export interface FireProjectionTipContext {
  fireAge: number | null
  aowAge: number
  currentAge: number
  hasMonteCarlo: boolean
  hasScenario: boolean
  hasBaseline: boolean
  planningMode: 'fire' | 'pensioen'
  /**
   * Het stopmoment ligt VAST (ADR 0129: aow/now/age — `isFixedAnchor(plan)`). Dan is
   * `fireAge` het anker en geen vrijheidsmoment: de spotlight zegt niet "op 47 bereik
   * je financiële vrijheid" (bevinding 6) maar noemt het gekozen stopmoment. Optioneel/
   * additief: weggelaten ⇒ het bestaande gedrag.
   */
  stopAnchorFixed?: boolean
  /** Het stopmoment als leeftijd (bv. 58,5), voor de spotlight onder een vast anker. */
  stopAge?: number | null
}

export function getFireProjectionTips(ctx: FireProjectionTipContext): string[] {
  const tips: string[] = []

  // Spotlight (eerste tip = preview bij ingeklapt)
  if (ctx.stopAnchorFixed) {
    const stop = ctx.stopAge ?? ctx.fireAge
    tips.push(
      stop != null
        ? `Je stopmoment ligt vast op ${Number.isInteger(stop) ? stop : stop.toFixed(1).replace('.', ',')} — vanaf daar onttrek je uit je vermogen`
        : 'Je stopmoment ligt vast — vanaf daar onttrek je uit je vermogen',
    )
  } else if (ctx.fireAge != null && ctx.fireAge >= ctx.currentAge) {
    tips.push(
      `Op leeftijd ${ctx.fireAge} bereik je financiële vrijheid — vanaf hier ga je onttrekken uit je vermogen`,
    )
  } else {
    tips.push(
      `De spike rond leeftijd ${ctx.aowAge} is je AOW-uitkering die start`,
    )
  }

  // Structurele leesinstructie
  tips.push('De donkere lijn is je verwachte vermogenspad over de tijd')

  if (ctx.hasBaseline) {
    tips.push('Spookrand = je baseline (huidige plan), volle lijn = je scenario')
  }

  if (ctx.hasScenario) {
    tips.push('Oranje overlay toont een opgeslagen scenario ter vergelijking')
  }

  if (ctx.hasMonteCarlo) {
    // Grondslag én breedte moeten kloppen met wat de grafiek écht tekent: sinds
    // 2026-08-09 is dat de middelste helft (p25–p75) van maximaal
    // MARKTCHECK_MAX_RUNS (200) doorgerekende marktverlopen — geen p10–p90 en
    // geen "duizenden simulaties".
    tips.push(
      'De gearceerde band is de middelste helft van de doorgerekende marktverlopen (p25–p75)',
    )
  }

  // Markers — onder een vast anker is de stippellijn je stopmoment, geen FIRE-leeftijd.
  if (ctx.fireAge != null && ctx.planningMode === 'fire' && !ctx.stopAnchorFixed) {
    tips.push(`Verticale stippellijn op leeftijd ${ctx.fireAge} = je FIRE-leeftijd`)
  }
  if (ctx.planningMode === 'pensioen') {
    tips.push(`Verticale stippellijn op leeftijd ${ctx.aowAge} = je AOW-startleeftijd`)
  }

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Vermogensopbouw (WealthCompositionChart)
// ─────────────────────────────────────────────────────────────────

export interface WealthCompositionTipContext {
  fireAge: number | null
  aowAge: number
  currentAge: number
}

export function getWealthCompositionTips(
  ctx: WealthCompositionTipContext,
): string[] {
  const tips: string[] = [
    'Elke kleur is een vermogenscategorie — eigen bijdragen, rendement, schulden',
    'Hoe hoger de stack, hoe groter je netto vermogen op die leeftijd',
    'Schulden steken onder de nullijn — ze drukken je netto vermogen omlaag',
    'Rendement (compounding) groeit exponentieel naarmate je langer doorbouwt',
  ]

  if (ctx.fireAge != null && ctx.fireAge >= ctx.currentAge) {
    tips.push(
      `Vanaf leeftijd ${ctx.fireAge} stopt opbouw uit eigen bijdragen — alleen rendement bouwt nog`,
    )
  }

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Inkomen & Uitgaven (IncomeExpenseChart)
// ─────────────────────────────────────────────────────────────────

export interface IncomeExpenseTipContext {
  fireAge: number | null
  aowAge: number
  viewMode: 'lines' | 'breakdown'
}

export function getIncomeExpenseTips(ctx: IncomeExpenseTipContext): string[] {
  const tips: string[] = []

  if (ctx.viewMode === 'lines') {
    tips.push(
      `Waar de groene lijn (inkomen) onder de rode (uitgaven) zakt, ga je interen`,
    )
    tips.push('Groene lijn = totaal inkomen per jaar, rode lijn = totale uitgaven')

    if (ctx.fireAge != null) {
      tips.push(
        `Op leeftijd ${ctx.fireAge} valt salaris weg — dan moet je onttrekking het overnemen`,
      )
    }
    tips.push(`Plotse stijging rond leeftijd ${ctx.aowAge} = AOW-uitkering kicks in`)
  } else {
    tips.push(
      'Bronnen-modus splitst inkomen op (salaris, AOW, pensioen, onttrekking) en uitgaven (vast, variabel, schulden)',
    )
    tips.push('Hoe hoger een gestapelde balk, hoe groter de stroom in dat jaar')
    tips.push(
      `Salaris-blok verdwijnt na leeftijd ${ctx.fireAge ?? ctx.aowAge}, AOW-blok verschijnt op leeftijd ${ctx.aowAge}`,
    )
    tips.push('Schulden-balk (rood) krimpt naarmate je aflost')
  }

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Geldstroom-Sankey (HorizonCashflowSankey)
// ─────────────────────────────────────────────────────────────────

export interface CashflowSankeyTipContext {
  fireAge: number | null
  currentAge: number
}

export function getCashflowSankeyTips(
  ctx: CashflowSankeyTipContext,
): string[] {
  const tips: string[] = [
    'Scrub door de jaren met de slider om te zien hoe je geldstroom verandert',
    'Links = inkomstenbronnen, rechts = uitgaven-categorieën',
    'De dikte van een stroom = de hoogte van het bedrag in dat jaar',
  ]

  if (ctx.fireAge != null && ctx.fireAge > ctx.currentAge) {
    tips.push(
      `Vóór leeftijd ${ctx.fireAge}: salaris voedt je vermogen. Erna: onttrekking voedt je uitgaven`,
    )
  } else {
    tips.push('Tijdens onttrekkingsfase verdwijnt salaris en verschijnt portfolio-onttrekking')
  }

  tips.push(
    'Schulden-aflossing en investeringen zijn aparte categorieën — niet alles is consumptie',
  )

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Backtest (BacktestingModal)
// ─────────────────────────────────────────────────────────────────

export interface BacktestTipContext {
  successRate: number // 0–1
  swrPercent: number // bv. 4
  pathCount: number
}

export function getBacktestTips(ctx: BacktestTipContext): string[] {
  const successPct = Math.round(ctx.successRate * 100)
  const tips: string[] = [
    `${successPct}% van de ${ctx.pathCount} historische periodes overleefde — inclusief crashes uit '73, '00 en '08`,
    'Elke dunne lijn is een historisch startjaar (1970–2024) met daadwerkelijke marktrendementen',
    `SWR (Safe Withdrawal Rate) ${ctx.swrPercent.toFixed(1)}% = je onttrekking als % van startvermogen`,
    'Lijnen die naar nul duiken = scenarios waarin het vermogen voortijdig opraakte',
    'Hoe meer lijnen overleven, hoe robuuster je strategie tegen historische schokken',
  ]

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Surplus-Gap (SurplusGapChart) — diverging bars per leeftijd
// ─────────────────────────────────────────────────────────────────

export interface SurplusGapTipContext {
  kantelpuntAge: number | null
  fireAge: number | null
  aowAge: number
  planningMode: 'fire' | 'pensioen'
}

export function getSurplusGapTips(ctx: SurplusGapTipContext): string[] {
  const tips: string[] = []

  if (ctx.kantelpuntAge != null) {
    tips.push(
      `Op leeftijd ${ctx.kantelpuntAge} slaat opbouw om in inteer — daar verandert de balkkleur`,
    )
  } else {
    tips.push('Groene staven = je bouwt op in dat jaar, rode staven = je teert in')
  }

  tips.push('Lengte van de staaf = jaar-saldo (langer = grotere stroom in dat jaar)')

  const phaseLine =
    ctx.planningMode === 'pensioen'
      ? `Stippellijn op leeftijd ${ctx.aowAge} = AOW-startleeftijd (begin onttrekking)`
      : ctx.fireAge != null
      ? `Stippellijn op leeftijd ${ctx.fireAge} = je FIRE-leeftijd (begin onttrekking)`
      : null
  if (phaseLine) tips.push(phaseLine)

  tips.push('Driehoeken (▲▼) duiden uitschieters die buiten de schaal vallen')
  tips.push(
    'Hover/tap op een staaf voor de exacte aanvulling, onttrekking en saldo van dat jaar',
  )

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Schulden — DebtPayoffStrategy (snowball vs avalanche trajectory)
// ─────────────────────────────────────────────────────────────────

export interface DebtPayoffStrategyTipContext {
  strategy: 'snowball' | 'avalanche' | 'highest_balance' | 'custom' | 'current'
  debtCount: number
  hasFocusDebt: boolean
}

export function getDebtPayoffStrategyTips(
  ctx: DebtPayoffStrategyTipContext,
): string[] {
  const tips: string[] = [
    'Donkere lijn = avalanche (hoogste rente eerst), lichtere = snowball (kleinste schuld eerst)',
    'X-as = maanden tot je schuldenvrij bent; Y-as = totaal openstaand saldo',
    'Gevulde gebieden tonen welke strategie sneller naar nul daalt',
  ]

  if (ctx.debtCount > 1) {
    tips.push(
      `Met ${ctx.debtCount} schulden zie je per-schuld lijntjes onderin — kleur per schuld`,
    )
  }

  if (ctx.strategy === 'avalanche') {
    tips.push('Avalanche bespaart doorgaans het meest aan rente — actieve keuze')
  } else if (ctx.strategy === 'snowball') {
    tips.push('Snowball levert sneller psychologische winsten op (één schuld weg)')
  }

  tips.push('Pas de extra-aflos-slider aan om te zien hoe je sneller schuldenvrij wordt')

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Schulden — DebtTrajectoryChart (werkelijk vs verwacht per schuld)
// ─────────────────────────────────────────────────────────────────

export interface DebtTrajectoryTipContext {
  repaymentType:
    | 'mortgage'
    | 'personal_loan'
    | 'student_loan'
    | 'car_loan'
    | 'credit_card'
    | 'revolving_credit'
    | 'payment_plan'
    | 'belastingschuld'
    | 'familielening'
    | 'dga_schuld'
    | 'aflossingsvrij'
    | 'annuitair'
    | 'lineair'
    | 'other'
    | string
  hasValuations: boolean
}

export function getDebtTrajectoryTips(
  ctx: DebtTrajectoryTipContext,
): string[] {
  const tips: string[] = [
    'Vol gebied (links) = werkelijke saldo-historie op basis van je waarderingen',
    'Gestippeld gebied (rechts) = verwacht aflos-pad volgens je aflossingstype',
    'Verticale stippellijn = vandaag — links is geschiedenis, rechts is projectie',
  ]

  if (!ctx.hasValuations) {
    tips.push('Geen waarderingen geregistreerd — projectie start vanaf je huidige saldo')
  } else {
    tips.push('Voeg waarderingen toe (saldo-history) om de werkelijke trajectorie aan te scherpen')
  }

  if (ctx.repaymentType === 'aflossingsvrij') {
    tips.push('Aflossingsvrij: saldo blijft gelijk — alleen rente wordt betaald')
  } else if (ctx.repaymentType === 'annuitair' || ctx.repaymentType === 'mortgage') {
    tips.push('Annuïtair: betaling blijft gelijk; aflossing groeit, rente krimpt')
  } else if (ctx.repaymentType === 'lineair') {
    tips.push('Lineair: aflossing per maand vast, totaal-betaling daalt over tijd')
  }

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Horizon fase-analyse — FanChart (Monte Carlo percentile bands)
// ─────────────────────────────────────────────────────────────────

export interface FanChartTipContext {
  startAge: number
  years: number
  hasFireTarget: boolean
  phaseLabel: 'opbouw' | 'overgang' | 'onttrekking'
}

export function getFanChartTips(ctx: FanChartTipContext): string[] {
  const tips: string[] = [
    'Donkere middenlijn = mediaan-pad (p50): de helft van de simulaties ligt erboven, helft eronder',
    'Lichtere band = p25–p75: 50% van de simulaties valt binnen dit gebied',
    'Lichtste band = p10–p90: bijna alle simulaties (80%) blijven hierin',
  ]

  if (ctx.hasFireTarget) {
    tips.push('Gestippelde horizontale lijn = je FIRE-target — boven = vrijheid bereikt')
  }

  tips.push(
    `Gebaseerd op 1.000+ random-walk simulaties van ${ctx.years} jaar vanaf leeftijd ${ctx.startAge}`,
  )

  if (ctx.phaseLabel === 'onttrekking') {
    tips.push('In onttrekkingsfase: hoe smaller de fan, hoe stabieler je vermogenspad')
  }

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Horizon fase-analyse — PhaseChartZoom (uitgesneden fase-trajectorie)
// ─────────────────────────────────────────────────────────────────

export interface PhaseChartZoomTipContext {
  phase: 'accumulation' | 'transition' | 'withdrawal'
  hasAnnotations: boolean
}

export function getPhaseChartZoomTips(
  ctx: PhaseChartZoomTipContext,
): string[] {
  const phaseLabel =
    ctx.phase === 'accumulation'
      ? 'opbouw'
      : ctx.phase === 'transition'
      ? 'overgang'
      : 'onttrekking'

  const tips: string[] = [
    `Gekleurde lijn = je vermogen tijdens de ${phaseLabel}-fase, ingezoomd`,
    'Lichtgrijze achtergrondlijn = volledige levensloop ter context',
    'Het gevulde gebied helpt je de groei of afname per fase visueel te zien',
  ]

  if (ctx.hasAnnotations) {
    tips.push('Verticale stippellijnen = mijlpalen (FIRE-leeftijd, AOW-leeftijd, etc.)')
  }

  if (ctx.phase === 'accumulation') {
    tips.push('Opbouwfase: je inkomen voedt je vermogen — focus op spaarquote')
  } else if (ctx.phase === 'withdrawal') {
    tips.push('Onttrekkingsfase: je vermogen voedt je uitgaven — focus op duurzaamheid')
  } else {
    tips.push('Overgangsfase: salaris valt weg, AOW/pensioen kicks in — kwetsbare jaren')
  }

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Vermogensprognose — BucketProjectionChart (4 view-modes)
// ─────────────────────────────────────────────────────────────────

export interface BucketProjectionTipContext {
  view: 'nom_reeel' | 'opbouw' | 'inkomen' | 'box3'
  totalYears: number
}

export function getBucketProjectionTips(
  ctx: BucketProjectionTipContext,
): string[] {
  const tips: string[] = []

  if (ctx.view === 'nom_reeel') {
    tips.push('Donkere lijn = nominaal vermogen (zonder inflatie-correctie)')
    tips.push('Lichte lijn = reëel vermogen (gecorrigeerd voor inflatie — koopkracht)')
    tips.push('Het verschil tussen lijnen toont hoeveel inflatie aan je vermogen knaagt')
  } else if (ctx.view === 'opbouw') {
    tips.push('Gestapelde lagen tonen welke asset-types samen je vermogen vormen')
    tips.push('Schulden steken onder de nullijn — netto vermogen = bezittingen − schulden')
    tips.push('Hoe gevarieerder de stack, hoe diverser je portefeuille')
  } else if (ctx.view === 'inkomen') {
    tips.push('Stippellijn = je inkomen per jaar; vol = je spaarquote')
    tips.push('Spaarquote = inkomen − uitgaven, het deel dat naar vermogen vloeit')
  } else if (ctx.view === 'box3') {
    tips.push('Balken = jaarlijkse Box 3-belasting op je vermogen boven de heffingsvrije voet')
    tips.push('Box 3 stijgt naarmate je vermogen groeit — een succes-belasting')
    tips.push('Kies forfaitair vs werkelijk rendement via Berekeningsparameters')
  }

  tips.push(`Projectie loopt over ${ctx.totalYears} jaar — wissel van view via de tabs`)

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Vermogen — BalanceHistoryChart (entity-stacked saldo-historie)
// ─────────────────────────────────────────────────────────────────

export interface BalanceHistoryTipContext {
  entityCount: number
  hasDebts: boolean
  monthCount: number
}

export function getBalanceHistoryTips(
  ctx: BalanceHistoryTipContext,
): string[] {
  const tips: string[] = [
    'Elke kleur is een rekening of asset — gestapeld voor totaal vermogen',
    'Hoogte van de stack = totaal positief vermogen op die maand',
  ]

  if (ctx.hasDebts) {
    tips.push('Schulden steken onder de nullijn — netto vermogen is alles boven minus alles onder')
  }

  if (ctx.entityCount > 5) {
    tips.push(`Met ${ctx.entityCount} entities zie je je verspreiding — diversificatie helpt risico spreiden`)
  }

  tips.push(`Toont ${ctx.monthCount} maanden geschiedenis — hover voor details per maand`)

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Beleggen — BenchmarkComparisonChart (portfolio vs benchmarks + alpha)
// ─────────────────────────────────────────────────────────────────

export interface BenchmarkComparisonTipContext {
  activePeriod: string
  benchmarkCount: number
  hasOutperformance: boolean | null
}

export function getBenchmarkComparisonTips(
  ctx: BenchmarkComparisonTipContext,
): string[] {
  const tips: string[] = [
    'Gele lijn = jouw portfolio; gekleurde lijnen = benchmarks (AEX, obligaties, cash)',
    `Periode-selector kiest het tijdvenster — nu actief: ${ctx.activePeriod}`,
    'Alle lijnen starten op 100 zodat je relatieve groei vergelijkt, niet absolute bedragen',
  ]

  if (ctx.hasOutperformance === true) {
    tips.push('Je portfolio ligt boven de benchmark — positieve alpha (outperformance)')
  } else if (ctx.hasOutperformance === false) {
    tips.push('Je portfolio ligt onder de benchmark — negatieve alpha (underperformance)')
  }

  tips.push(
    `${ctx.benchmarkCount} benchmarks ter vergelijking — een passieve strategie volgt vaak de breedste markt-index`,
  )

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Generiek — TrendChart (line/area/bar multi-series met projected overlay)
// ─────────────────────────────────────────────────────────────────

export interface TrendChartTipContext {
  mode: 'line' | 'area' | 'bar'
  seriesCount: number
  hasProjected: boolean
  yAxisLabel?: string
}

export function getTrendChartTips(ctx: TrendChartTipContext): string[] {
  const tips: string[] = []

  const modeLabel =
    ctx.mode === 'line'
      ? 'lijn'
      : ctx.mode === 'area'
      ? 'gevuld gebied'
      : 'staaf'

  tips.push(`Elke ${modeLabel} is een serie — kleur identificeert de bron`)

  if (ctx.seriesCount > 1) {
    tips.push(
      `${ctx.seriesCount} series in beeld — vergelijk ontwikkelingen naast elkaar`,
    )
  }

  if (ctx.hasProjected) {
    tips.push('Vol = werkelijke data, gestippeld/lichter = projectie naar de toekomst')
  }

  if (ctx.yAxisLabel) {
    tips.push(`Y-as toont ${ctx.yAxisLabel} — schaal past zich aan aan de waardenrange`)
  }

  tips.push('Hover/tap op een datapunt voor de exacte waarde + datum')

  return tips
}

// ─────────────────────────────────────────────────────────────────
// Cashflow — CashFlowForecastChart (3-6 maands kassaldo-prognose)
// ─────────────────────────────────────────────────────────────────

export interface CashflowForecastTipContext {
  monthCount: number
  alertCount: number
  warningThreshold: number
}

export function getCashflowForecastTips(
  ctx: CashflowForecastTipContext,
): string[] {
  const tips: string[] = [
    'Lijn = je verwachte banksaldo per maand op basis van vaste inkomsten en uitgaven',
    `Roodgekleurde zone onder €${ctx.warningThreshold} = waarschuwing voor liquiditeitsproblemen`,
    'Beginpunt = je huidige saldo; vanaf daar projecteert de chart vooruit',
  ]

  if (ctx.alertCount > 0) {
    tips.push(
      `${ctx.alertCount} ${ctx.alertCount === 1 ? 'maand' : 'maanden'} met alerts — onder de chart staat wat je kunt doen`,
    )
  } else {
    tips.push('Geen alerts in beeld — je saldo blijft boven de waarschuwingsgrens')
  }

  tips.push(
    `Projectie loopt ${ctx.monthCount} maanden vooruit — inkomsten en uitgaven uit je terugkerende transacties`,
  )

  return tips
}
