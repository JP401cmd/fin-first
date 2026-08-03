// ── Briefing Directives ─────────────────────────────────────
// Admin-configurable editorial directives for Fin's briefing.
// Temporal directives: app_settings key 'briefing_directives'
// Functional directives: app_settings key 'briefing_functional_directives'

export interface BriefingDirective {
  id: string
  title: string
  instruction: string
  priority: 'low' | 'normal' | 'high'
  months: number[]        // [] = all months
  dayFrom?: number        // 1-31
  dayTo?: number          // 1-31
  enabled: boolean
}

/** Check if a directive is active for the given month/day. */
export function isDirectiveActive(
  d: BriefingDirective,
  month: number,
  dayOfMonth: number,
): boolean {
  if (!d.enabled) return false

  // Month filter: empty = all months
  if (d.months.length > 0 && !d.months.includes(month)) return false

  // Day range filter
  if (d.dayFrom != null && dayOfMonth < d.dayFrom) return false
  if (d.dayTo != null && dayOfMonth > d.dayTo) return false

  return true
}

/** Filter and sort directives: high priority first. */
export function getActiveDirectives(
  all: BriefingDirective[],
  month: number,
  dayOfMonth: number,
): BriefingDirective[] {
  const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 }
  return all
    .filter((d) => isDirectiveActive(d, month, dayOfMonth))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1))
}

/** Format active directives as a prompt block for Fin's system prompt. */
export function formatDirectivesForPrompt(directives: BriefingDirective[]): string {
  if (directives.length === 0) return ''

  const lines = directives.map((d) => {
    switch (d.priority) {
      case 'high':
        return `[PRIORITEIT] ${d.instruction}`
      case 'low':
        return `[optioneel] ${d.instruction}`
      default:
        return `- ${d.instruction}`
    }
  })

  return `== REDACTIONELE RICHTLIJNEN ==\n${lines.join('\n')}`
}

// ── Functional Directives ────────────────────────────────────
// Data-driven editorial guidance: triggered by financial conditions.
// Fin evaluates conditions against the user's data contextually.

export interface FunctionalDirective {
  id: string
  title: string
  metric: string            // key from DIRECTIVE_METRICS
  condition: string         // key from metric's conditions
  instruction: string       // editorial guidance for Fin
  priority: 'low' | 'normal' | 'high'
  enabled: boolean
}

export interface MetricCondition {
  id: string
  label: string
}

export interface DirectiveMetric {
  id: string
  label: string
  conditions: MetricCondition[]
}

export const DIRECTIVE_METRICS: DirectiveMetric[] = [
  {
    id: 'net_worth',
    label: 'Netto vermogen',
    conditions: [
      { id: 'rising', label: 'Stijgend' },
      { id: 'declining', label: 'Dalend' },
      { id: 'stagnant', label: 'Stagnerend' },
    ],
  },
  {
    id: 'savings_rate',
    label: 'Spaarquote',
    conditions: [
      { id: 'high', label: 'Hoog (>20%)' },
      { id: 'low', label: 'Laag (<10%)' },
      { id: 'improving', label: 'Verbeterend' },
      { id: 'declining', label: 'Dalend' },
    ],
  },
  {
    id: 'budget',
    label: 'Budget',
    conditions: [
      { id: 'on_track', label: 'Binnen limiet' },
      { id: 'over', label: 'Overschreden' },
      { id: 'warning', label: 'Bijna op (>75%)' },
    ],
  },
  {
    id: 'debt',
    label: 'Schulden',
    conditions: [
      { id: 'decreasing', label: 'Afnemend' },
      { id: 'increasing', label: 'Toenemend' },
      { id: 'nearly_paid', label: 'Bijna afgelost' },
      { id: 'none', label: 'Geen schulden' },
    ],
  },
  {
    id: 'fire',
    label: 'FIRE voortgang',
    conditions: [
      { id: 'on_track', label: 'Op schema' },
      { id: 'behind', label: 'Achterloopt' },
      { id: 'milestone_near', label: 'Mijlpaal nabij' },
    ],
  },
  {
    id: 'spending',
    label: 'Uitgaven',
    conditions: [
      { id: 'spike', label: 'Uitgavenpiek' },
      { id: 'decreasing', label: 'Dalend' },
      { id: 'stable', label: 'Stabiel' },
    ],
  },
  {
    id: 'emergency_fund',
    label: 'Noodfonds',
    conditions: [
      { id: 'sufficient', label: 'Voldoende (≥3 maanden)' },
      { id: 'insufficient', label: 'Onvoldoende' },
      { id: 'reached', label: 'Doel bereikt' },
    ],
  },
  {
    id: 'income',
    label: 'Inkomen',
    conditions: [
      { id: 'stable', label: 'Stabiel' },
      { id: 'variable', label: 'Wisselend' },
      { id: 'increased', label: 'Gestegen' },
    ],
  },
  {
    id: 'hypotheek',
    label: 'Hypotheek',
    conditions: [
      { id: 'has_mortgage', label: 'Heeft hypotheek' },
      { id: 'high_rate', label: 'Hoge rente (>4%)' },
      { id: 'beleggen_wint', label: 'Beleggen voordeliger' },
      { id: 'aflossen_wint', label: 'Aflossen voordeliger' },
    ],
  },
  {
    id: 'next_steps',
    label: 'Volgende stappen',
    conditions: [
      { id: 'available', label: 'Stappen beschikbaar' },
      { id: 'all_done', label: 'Alles afgerond' },
    ],
  },
  {
    id: 'discover',
    label: 'Ontdekbare features',
    conditions: [
      { id: 'unvisited_features', label: 'Onontdekte features' },
      { id: 'all_visited', label: 'Alles ontdekt' },
    ],
  },
]

/** Resolve human-readable labels for a metric + condition combo. */
export function resolveMetricLabels(metricId: string, conditionId: string): { metric: string; condition: string } {
  const metric = DIRECTIVE_METRICS.find((m) => m.id === metricId)
  const condition = metric?.conditions.find((c) => c.id === conditionId)
  return {
    metric: metric?.label ?? metricId,
    condition: condition?.label ?? conditionId,
  }
}

/** Extract key metrics from condensed dataSummary text for directive evaluation. */
export function extractMetricsFromSummary(dataSummary: string): Record<string, string | number | boolean | null> {
  const metrics: Record<string, string | number | boolean | null> = {}

  // Net worth delta
  const deltaMatch = dataSummary.match(/Vermogensdelta \(MoM\): ([+-]?)€\s?([\d.,]+)/)
  if (deltaMatch) {
    const sign = deltaMatch[1] === '-' ? -1 : 1
    const value = parseFloat(deltaMatch[2].replace(/\./g, '').replace(',', '.'))
    metrics.netWorthDelta = sign * value
  }

  // Consecutive growth months
  const growthMatch = dataSummary.match(/Opeenvolgende maanden groei: (\d+)/)
  metrics.consecutiveGrowthMonths = growthMatch ? parseInt(growthMatch[1]) : 0

  // Savings rate
  const savingsMatch = dataSummary.match(/Spaarquote: (-?\d+)%/)
  metrics.savingsRate = savingsMatch ? parseInt(savingsMatch[1]) : null

  // Savings rate trend
  const trendMatch = dataSummary.match(/Spaarquote trend: (\w+)/)
  metrics.savingsRateTrend = trendMatch ? trendMatch[1] : null

  // Budget expense percentage
  const budgetMatch = dataSummary.match(/Uitgaven: €\s?[\d.,]+ van €\s?[\d.,]+ \((\d+)%\)/)
  metrics.budgetExpensePct = budgetMatch ? parseInt(budgetMatch[1]) : null

  // Budget pressure
  metrics.budgetPressure = dataSummary.includes('Budget bijna op') || dataSummary.includes('Budget druk')
  metrics.budgetOver = dataSummary.includes('Budget bijna op')

  // Consumer debt
  metrics.hasConsumerDebt = dataSummary.includes('Consumentenschuld: ja')

  // Total debts
  const debtMatch = dataSummary.match(/Totale schulden: €\s?([\d.,]+)/)
  if (debtMatch) {
    metrics.totalDebts = parseFloat(debtMatch[1].replace(/\./g, '').replace(',', '.'))
  }

  // FIRE percentage
  const firePctMatch = dataSummary.match(/Vrijheidspercentage: (\d+)%/)
  metrics.freedomPct = firePctMatch ? parseInt(firePctMatch[1]) : null

  // Months buffer
  const bufferMatch = dataSummary.match(/Maanden buffer: ([\d.,]+)/)
  metrics.monthsBuffer = bufferMatch ? parseFloat(bufferMatch[1].replace(',', '.')) : null

  // Emergency fund status
  metrics.emergencyFundSufficient = dataSummary.includes('Status: voldoende')
  metrics.emergencyFundInsufficient = dataSummary.includes('Status: onvoldoende')

  // Previous month expenses comparison
  const prevExpMatch = dataSummary.match(/verschil: ([+-])€\s?([\d.,]+)/)
  if (prevExpMatch) {
    const sign = prevExpMatch[1] === '-' ? -1 : 1
    const value = parseFloat(prevExpMatch[2].replace(/\./g, '').replace(',', '.'))
    metrics.expenseDelta = sign * value
  }

  // Expense trend
  const expTrendMatch = dataSummary.match(/Uitgaven trend: (\w+)/)
  metrics.expenseTrend = expTrendMatch ? expTrendMatch[1] : null

  // Income
  const incomeMatch = dataSummary.match(/Maandinkomen: €\s?([\d.,]+)/)
  if (incomeMatch) {
    metrics.monthlyIncome = parseFloat(incomeMatch[1].replace(/\./g, '').replace(',', '.'))
  }

  // Next steps count
  const stepsMatch = dataSummary.match(/VOLGENDE STAPPEN: (\d+) kern, (\d+) wil, (\d+) horizon/)
  if (stepsMatch) {
    metrics.nextStepsTotal = parseInt(stepsMatch[1]) + parseInt(stepsMatch[2]) + parseInt(stepsMatch[3])
  }

  // Discoverable features
  const discoverMatch = dataSummary.match(/ONTDEKBARE FEATURES: (\d+) van (\d+) onontdekt/)
  if (discoverMatch) {
    metrics.unvisitedFeatures = parseInt(discoverMatch[1])
    metrics.totalDiscoverFeatures = parseInt(discoverMatch[2])
  }

  // Hypotheek vs Beleggen
  metrics.hasMortgage = dataSummary.includes('HYPOTHEEK VS BELEGGEN:')
  const hvbRenteMatch = dataSummary.match(/Hypotheekrente: ([\d.,]+)%/)
  metrics.hypotheekRente = hvbRenteMatch ? parseFloat(hvbRenteMatch[1].replace(',', '.')) : null
  const hvbAanbevelingMatch = dataSummary.match(/Aanbeveling.*?: (aflossen|beleggen|gelijk)/)
  metrics.hvbAanbeveling = hvbAanbevelingMatch ? hvbAanbevelingMatch[1] : null

  return metrics
}

/** Evaluate whether a functional directive's condition matches the data. */
export function evaluateFunctionalDirective(
  directive: FunctionalDirective,
  metrics: Record<string, string | number | boolean | null>,
): boolean {
  const { metric, condition } = directive

  switch (metric) {
    case 'net_worth': {
      const delta = metrics.netWorthDelta as number | undefined
      const growth = (metrics.consecutiveGrowthMonths as number) ?? 0
      if (condition === 'rising') return (delta != null && delta > 0) || growth >= 2
      if (condition === 'declining') return delta != null && delta < 0
      if (condition === 'stagnant') return delta != null && Math.abs(delta) < 100
      return false
    }
    case 'savings_rate': {
      const rate = metrics.savingsRate as number | null
      const trend = metrics.savingsRateTrend as string | null
      if (rate == null) return false
      if (condition === 'high') return rate > 20
      if (condition === 'low') return rate < 10
      if (condition === 'improving') return trend === 'stijgend' || trend === 'improving'
      if (condition === 'declining') return trend === 'dalend' || trend === 'declining'
      return false
    }
    case 'budget': {
      const pct = metrics.budgetExpensePct as number | null
      if (condition === 'on_track') return pct != null && pct <= 75
      if (condition === 'over') return pct != null && pct > 100
      if (condition === 'warning') return pct != null && pct > 75 && pct <= 100
      return false
    }
    case 'debt': {
      const hasDebt = metrics.hasConsumerDebt as boolean
      const totalDebts = (metrics.totalDebts as number) ?? 0
      if (condition === 'none') return !hasDebt && totalDebts === 0
      if (condition === 'decreasing') return hasDebt // Can't fully determine trend from snapshot alone
      if (condition === 'increasing') return false   // Would need historical data
      if (condition === 'nearly_paid') return hasDebt && totalDebts > 0 && totalDebts < 1000
      return false
    }
    case 'fire': {
      const pct = metrics.freedomPct as number | null
      if (pct == null) return false
      if (condition === 'on_track') return pct >= 50
      if (condition === 'behind') return pct < 25
      if (condition === 'milestone_near') {
        // Near a 25% milestone boundary
        const nextMilestone = Math.ceil(pct / 25) * 25
        return nextMilestone - pct <= 5 && nextMilestone <= 100
      }
      return false
    }
    case 'spending': {
      const expDelta = metrics.expenseDelta as number | undefined
      const trend = metrics.expenseTrend as string | null
      if (condition === 'spike') return (expDelta != null && expDelta > 0) || trend === 'stijgend'
      if (condition === 'decreasing') return (expDelta != null && expDelta < 0) || trend === 'dalend'
      if (condition === 'stable') return trend === 'stabiel' || trend === 'stable'
      return false
    }
    case 'emergency_fund': {
      const buffer = metrics.monthsBuffer as number | null
      const sufficient = metrics.emergencyFundSufficient as boolean
      const insufficient = metrics.emergencyFundInsufficient as boolean
      if (condition === 'sufficient') return sufficient || (buffer != null && buffer >= 3)
      if (condition === 'insufficient') return insufficient || (buffer != null && buffer < 3)
      if (condition === 'reached') return sufficient
      return false
    }
    case 'income': {
      const income = metrics.monthlyIncome as number | null
      if (income == null) return false
      if (condition === 'stable') return income > 0
      if (condition === 'variable') return false // Would need history
      if (condition === 'increased') return false // Would need history
      return false
    }
    case 'hypotheek': {
      const hasMortgage = metrics.hasMortgage as boolean
      const rente = metrics.hypotheekRente as number | null
      const aanbeveling = metrics.hvbAanbeveling as string | null
      if (condition === 'has_mortgage') return hasMortgage
      if (condition === 'high_rate') return hasMortgage && rente != null && rente > 4
      if (condition === 'beleggen_wint') return hasMortgage && aanbeveling === 'beleggen'
      if (condition === 'aflossen_wint') return hasMortgage && aanbeveling === 'aflossen'
      return false
    }
    case 'next_steps': {
      const total = metrics.nextStepsTotal as number | undefined
      if (total == null) return false
      if (condition === 'available') return total > 0
      if (condition === 'all_done') return total === 0
      return false
    }
    case 'discover': {
      const unvisited = metrics.unvisitedFeatures as number | undefined
      if (unvisited == null) return false
      if (condition === 'unvisited_features') return unvisited > 0
      if (condition === 'all_visited') return unvisited === 0
      return false
    }
    default:
      return false
  }
}

/** Format functional directives as a prompt block, with pre-evaluated conditions. */
export function formatFunctionalDirectivesForPrompt(
  directives: FunctionalDirective[],
  dataSummary?: string,
): string {
  const metrics = dataSummary ? extractMetricsFromSummary(dataSummary) : null
  return formatFunctionalDirectivesWithMetrics(directives, metrics)
}

/**
 * Zelfde prompt-blok, maar met een al-berekende metrics-record i.p.v. een
 * te regex-parsen tekst-summary. Dit is het pad voor de levende briefing
 * (redactie-laag): de metrics komen daar rechtstreeks uit de engine-input
 * (`buildEngineMetrics` in redactie.ts), zonder fragiele tekst-extractie.
 */
export function formatFunctionalDirectivesWithMetrics(
  directives: FunctionalDirective[],
  metrics: Record<string, string | number | boolean | null> | null,
  opts: { activeOnly?: boolean } = {},
): string {
  const enabled = directives.filter((d) => d.enabled)
  if (enabled.length === 0) return ''

  const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 }
  const sorted = [...enabled].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1),
  )

  // ALLEEN-ACTIEF (lokaal pad). Op het cloudpad krijgt het model álle regels
  // mét een [ACTIEF]/[INACTIEF]-label en mag het zelf wegen. Een 2B-model
  // on-device kan dat niet: elf regels die het moet NEGEREN zijn daar geen
  // context maar ruis — en kosten bovendien ~350 tokens van een venster van
  // 8192. Bij `activeOnly` sturen we daarom alleen de bevestigde regels mee,
  // zónder label (er valt niets meer te onderscheiden).
  const activeOnly = opts.activeOnly === true && metrics != null
  const selected = activeOnly
    ? sorted.filter((d) => evaluateFunctionalDirective(d, metrics))
    : sorted
  if (selected.length === 0) return ''

  const lines = selected.map((d) => {
    const { metric, condition } = resolveMetricLabels(d.metric, d.condition)
    const prefix =
      d.priority === 'high' ? '[PRIORITEIT]' :
      d.priority === 'low' ? '[optioneel]' : '-'

    if (activeOnly) {
      return `${prefix} ${d.instruction}`
    }

    // Pre-evaluate condition if data is available
    if (metrics) {
      const isActive = evaluateFunctionalDirective(d, metrics)
      const status = isActive ? '[ACTIEF]' : '[INACTIEF]'
      return `${prefix} ${status} Wanneer ${metric.toLowerCase()} ${condition.toLowerCase()}: ${d.instruction}`
    }

    return `${prefix} Wanneer ${metric.toLowerCase()} ${condition.toLowerCase()}: ${d.instruction}`
  })

  const header = activeOnly
    ? `== FUNCTIONELE RICHTLIJNEN ==
Deze richtlijnen zijn bevestigd op basis van actuele data:`
    : metrics
      ? `== FUNCTIONELE RICHTLIJNEN ==
Condities zijn vooraf geevalueerd. Geef prioriteit aan [ACTIEF] richtlijnen — deze zijn bevestigd op basis van actuele data. [INACTIEF] richtlijnen kun je negeren tenzij je eigen analyse anders uitwijst.`
      : `== FUNCTIONELE RICHTLIJNEN ==
Pas de volgende richtlijnen toe wanneer je de betreffende situatie herkent in de gebruikersdata:`

  return `${header}\n${lines.join('\n')}`
}

/** Default functional directive seeds. */
export function getDefaultFunctionalDirectives(): FunctionalDirective[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Vermogen groeit',
      metric: 'net_worth',
      condition: 'rising',
      instruction: 'Vier de vooruitgang en benoem de groeitrend. Frame als "vrijheid opbouwen".',
      priority: 'normal',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Vermogen daalt',
      metric: 'net_worth',
      condition: 'declining',
      instruction: 'Wees empathisch maar constructief. Focus op herstelacties en wat wél goed gaat. Geen paniek.',
      priority: 'high',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Budget overschreden',
      metric: 'budget',
      condition: 'over',
      instruction: 'Benoem de budgetoverschrijding prominent. Concrete bespaartips, niet veroordelend.',
      priority: 'high',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Lage spaarquote',
      metric: 'savings_rate',
      condition: 'low',
      instruction: 'Benadruk kleine verbeteringen. Elke extra euro gespaard = meer vrijheidstijd.',
      priority: 'normal',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Schulden nemen af',
      metric: 'debt',
      condition: 'decreasing',
      instruction: 'Vier de schuldenreductie. Frame als "vrijheid teruggewonnen" en benoem de voortgang.',
      priority: 'normal',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'FIRE mijlpaal nabij',
      metric: 'fire',
      condition: 'milestone_near',
      instruction: 'Benoem de mijlpaal prominent. Motivatieboost, concreet hoeveel er nog nodig is.',
      priority: 'high',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Noodfonds onvoldoende',
      metric: 'emergency_fund',
      condition: 'insufficient',
      instruction: 'Noodfonds opbouwen als prioriteit. Toon hoeveel maanden buffer er is, hoeveel er nog nodig is.',
      priority: 'normal',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Uitgavenpiek',
      metric: 'spending',
      condition: 'spike',
      instruction: 'Waarschuw voor ongebruikelijk hoge uitgaven, maar wees niet veroordelend. Bied context en vergelijking.',
      priority: 'normal',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Volgende stappen beschikbaar',
      metric: 'next_steps',
      condition: 'available',
      instruction: 'Wijs op de meest relevante volgende stap, passend bij de huidige financiële situatie.',
      priority: 'normal',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Alle stappen afgerond',
      metric: 'next_steps',
      condition: 'all_done',
      instruction: 'Feliciteer de gebruiker — alle volgende stappen zijn afgerond.',
      priority: 'low',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Onontdekte features',
      metric: 'discover',
      condition: 'unvisited_features',
      instruction: 'Wijs maximaal op één onontdekte functie die past bij de gebruikersfase en huidige behoeften.',
      priority: 'low',
      enabled: true,
    },
  ]
}

// ── Temporal Directive Defaults ──────────────────────────────

/** Default seed directives based on current hardcoded temporal logic. */
export function getDefaultDirectives(): BriefingDirective[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Belastingaangifte periode',
      instruction: 'Belastingseizoen: belastingaangifte deadline en box3 inzicht prominent tonen. Herinner gebruiker aan aangifte.',
      priority: 'high',
      months: [3, 4],
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Jaaroverzicht & feestdagen',
      instruction: 'December: jaaroverzicht-stijl briefing, reflectie op financieel jaar, feestdagen-budget alert.',
      priority: 'normal',
      months: [12],
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Eindejaarsuitgaven piek',
      instruction: 'Eindejaarsperiode: waarschuw voor uitgavenpiek, cadeaus en feestdagen. Budget-bewaking extra belangrijk.',
      priority: 'high',
      months: [12],
      dayFrom: 20,
      dayTo: 31,
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Nieuw jaar planning',
      instruction: 'Januari: goede voornemens, jaarplanning, schone lei. Stel financiële doelen voor het nieuwe jaar.',
      priority: 'normal',
      months: [1],
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Vakantiebudget plannen',
      instruction: 'Vakantieseizoen nadert: help gebruiker met vakantiebudget plannen en reserveringen.',
      priority: 'normal',
      months: [5, 6],
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Schoolkosten seizoen',
      instruction: 'Schoolkosten seizoen: denk aan schoolboeken, materialen en inschrijvingen.',
      priority: 'low',
      months: [8],
      dayFrom: 15,
      dayTo: 31,
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Energieafrekening periode',
      instruction: 'Energieafrekening periode: jaarafrekening energie verwacht. Check of er een buffer is.',
      priority: 'low',
      months: [1, 2],
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Begin van de maand',
      instruction: 'Begin van de maand: open met de maand-terugblik (vorige vs huidige maand) en het nieuwe budget-overzicht.',
      priority: 'normal',
      months: [],
      dayFrom: 1,
      dayTo: 5,
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Einde van de maand',
      instruction: 'Einde van de maand: budget-druk prominent benoemen, salaris in zicht.',
      priority: 'normal',
      months: [],
      dayFrom: 23,
      dayTo: 31,
      enabled: true,
    },
  ]
}
