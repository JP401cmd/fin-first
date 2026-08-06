/**
 * Vermogensstromen breakdown engine.
 *
 * Transforms UnifiedProjectionRow data into chart-ready stacked structures
 * showing flows TO and FROM net worth.
 *
 * Inflows (aanvulling): Besparingen, Rendement, positive life events
 * Outflows (onttrekking): Box 3, Rente per schuld, Levensonderhoud, negative life events
 *
 * Uses UnifiedProjectionRow for rich data (debt interest, Box 3 per type).
 * Falls back to SimRow when unified data is not available.
 */

import type { SimRow } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { Debt } from '@/lib/debt-data'

// ── Layer & row types ───────────────────────────────────────

export interface BreakdownLayer {
  id: string
  label: string
  color: string
  isFixed: boolean
}

export interface BreakdownRow {
  age: number
  phase: 'accumulation' | 'retirement'
  incomeBySource: Record<string, number>
  expenseBySource: Record<string, number>
  totalIncome: number
  totalExpenses: number
  surplus: number
}

export interface BreakdownResult {
  rows: BreakdownRow[]
  incomeLayers: BreakdownLayer[]
  expenseLayers: BreakdownLayer[]
}

// ── Color palettes ──────────────────────────────────────────

const FIXED_COLORS: Record<string, string> = {
  savings: 'var(--horizon-400, #c4a06b)',
  growth: 'var(--horizon-600, #8a6e42)',
  salaris: 'var(--horizon-300, #d8be93)',
  'gebeurtenis-baten': 'var(--horizon-500, #b3894e)',
  withdrawal: 'var(--kern-400, #a07860)',
  box3: 'var(--kern-600, #6b4339)',
}

const FIXED_LABELS: Record<string, string> = {
  savings: 'Besparingen',
  growth: 'Rendement',
  salaris: 'Salaris & werk',
  'gebeurtenis-baten': 'AOW & pensioen',
  // Levensonderhoud toont ná box3-ontdubbeling alléén het niet-fiscale deel van
  // de onttrekking; Box 3 staat als eigen post ernaast (zie buildBreakdown).
  withdrawal: 'Levensonderhoud via onttrekking',
  box3: 'Box 3 belasting',
}

/** Blues/purples — complementary to the gold horizon palette */
const INCOME_EVENT_PALETTE = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a78bfa', '#7dd3fc', '#818cf8', '#38bdf8',
]

/** Ambers/oranges — complementary to the brown kern palette */
const EXPENSE_EVENT_PALETTE = [
  '#f59e0b', '#d97706', '#b45309', '#f97316', '#ea580c', '#fbbf24', '#fb923c',
]

/** Reds for debt interest */
const DEBT_INTEREST_COLOR = '#ef4444'

const FIXED_INCOME_IDS: Set<string> = new Set(['savings', 'growth', 'salaris', 'gebeurtenis-baten'])
const FIXED_EXPENSE_IDS: Set<string> = new Set(['withdrawal', 'box3'])

// ── Helpers ─────────────────────────────────────────────────

function buildLayer(id: string, label: string, color: string, isFixed: boolean): BreakdownLayer {
  return { id, label, color, isFixed }
}

function pickEventColor(palette: string[], index: number): string {
  return palette[index % palette.length]
}

// ── Main: unified rows (rich data) ─────────────────────────

/**
 * Build a chart-ready vermogensstromen breakdown from UnifiedProjectionRow data.
 *
 * Uses the rich unified data for:
 * - Per-schuld rentekosten (interestPaid)
 * - Totale Box 3 belasting
 * - Per-asset rendement
 * - Besparingen, onttrekking
 *
 * SimRows provide per-cashflow breakdown (life event names).
 */
export function buildBreakdown(
  unifiedRows: UnifiedProjectionRow[],
  simRows: SimRow[],
  debts?: Debt[],
): BreakdownResult {
  if (!unifiedRows.length) {
    return { rows: [], incomeLayers: [], expenseLayers: [] }
  }

  // Build debt name lookup
  const debtNames = new Map<string, string>()
  if (debts) {
    for (const d of debts) debtNames.set(d.id, d.name)
  }

  // Build SimRow lookup by age for cashflow breakdown items
  const simByAge = new Map<number, SimRow>()
  for (const sr of simRows) simByAge.set(sr.age, sr)

  // ── Pass 1: discover all unique source IDs ──

  const incomeEventIds: string[] = []
  const expenseEventIds: string[] = []
  const incomeLabels = new Map<string, string>()
  const expenseLabels = new Map<string, string>()
  const debtIds: string[] = []

  for (const uRow of unifiedRows) {
    // Discover debt IDs
    for (const [dId, detail] of Object.entries(uRow.debtBalances)) {
      if (detail.interestPaid > 0 && !debtNames.has(dId) === false) {
        // Already in debtNames
      }
      if (detail.interestPaid > 0 && !debtIds.includes(dId)) {
        debtIds.push(dId)
      }
    }

    // Discover cashflow event IDs from SimRow breakdown
    const sr = simByAge.get(uRow.age)
    if (sr?.incomeBreakdown) {
      for (const item of sr.incomeBreakdown) {
        if (!FIXED_INCOME_IDS.has(item.id) && !incomeLabels.has(item.id)) {
          incomeEventIds.push(item.id)
        }
        incomeLabels.set(item.id, item.label)
      }
    }
    if (sr?.expenseBreakdown) {
      for (const item of sr.expenseBreakdown) {
        if (!FIXED_EXPENSE_IDS.has(item.id) && !expenseLabels.has(item.id)) {
          expenseEventIds.push(item.id)
        }
        expenseLabels.set(item.id, item.label)
      }
    }
  }

  // Build candidate layers
  const candidateIncomeLayers: BreakdownLayer[] = [
    buildLayer('salaris', FIXED_LABELS.salaris, FIXED_COLORS.salaris, true),
    buildLayer('gebeurtenis-baten', FIXED_LABELS['gebeurtenis-baten'], FIXED_COLORS['gebeurtenis-baten'], true),
    buildLayer('savings', FIXED_LABELS.savings, FIXED_COLORS.savings, true),
    buildLayer('growth', FIXED_LABELS.growth, FIXED_COLORS.growth, true),
    ...incomeEventIds.map((id, i) =>
      buildLayer(id, incomeLabels.get(id)!, pickEventColor(INCOME_EVENT_PALETTE, i), false),
    ),
  ]

  const candidateExpenseLayers: BreakdownLayer[] = [
    buildLayer('withdrawal', FIXED_LABELS.withdrawal, FIXED_COLORS.withdrawal, true),
    buildLayer('box3', FIXED_LABELS.box3, FIXED_COLORS.box3, true),
    // Debt interest layers — one per debt
    ...debtIds.map((dId, i) =>
      buildLayer(
        `debt-interest-${dId}`,
        `Rente ${debtNames.get(dId) ?? 'schuld'}`,
        i === 0 ? DEBT_INTEREST_COLOR : pickEventColor(EXPENSE_EVENT_PALETTE, expenseEventIds.length + i),
        false,
      ),
    ),
    ...expenseEventIds.map((id, i) =>
      buildLayer(id, expenseLabels.get(id)!, pickEventColor(EXPENSE_EVENT_PALETTE, i), false),
    ),
  ]

  // Track which layers actually have data
  const incomeIdsWithData = new Set<string>()
  const expenseIdsWithData = new Set<string>()

  // ── Pass 2: build BreakdownRow per age ──

  const breakdownRows: BreakdownRow[] = unifiedRows.map((uRow) => {
    const incomeBySource: Record<string, number> = {}
    const expenseBySource: Record<string, number> = {}
    const sr = simByAge.get(uRow.age)
    const phase = uRow.phase === 'withdrawal' ? 'retirement' : 'accumulation'

    // -- Inflows --

    // Besparingen (only in accumulation)
    if (uRow.savings > 0 && phase === 'accumulation') {
      incomeBySource['savings'] = Math.round(uRow.savings)
    }

    // Rendement — RAUW rendement rechtstreeks uit de kernel-bridge. De oude
    // `+ totalBox3`-opplussing stamt uit de v2-engine (waar totalGrowth
    // box3-genet was); de kernel levert `totalGrowth` nu al rauw, dus opplussen
    // zou het rendement met het box3-bedrag opblazen (dubbeltelling — box3 zit
    // óók in de aparte Box 3-expensepost).
    //
    // GRONDSLAG: dit is een VERMOGENSSTROMEN-view, dus we tonen het BESTEEDBARE
    // rendement — `totalGrowthLiquide` (rendement exclusief de niet-liquide
    // categorieën, vandaag de eigen woning bij een niet-meetellen-woonstrategie).
    // `totalGrowth` telt de waardestijging van het huis mee; die euro's duwen de
    // vermogenslijn omhoog maar zijn niet onttrekbaar — ze hier als instroom tonen
    // is de tweede dubbeltelling (naast de box3-opplussing hierboven). Fallback op
    // `totalGrowth` voor rijen zonder het veld (bij 'Meerekenen' zijn ze gelijk).
    const growth = uRow.totalGrowthLiquide ?? uRow.totalGrowth
    if (growth > 0) {
      incomeBySource['growth'] = Math.round(growth)
    }

    // Salaris/werk + AOW & pensioen — bruto-inkomen-bronnen uit de bridge-split
    // (CF!D = salaris, CF!H = gebeurtenis-baten incl. AOW/pensioen).
    //
    // GATE: `withdrawal > 0 && !(savings > 0)`. Dit is een VERMOGENSstromen-view
    // (flows naar/uit netto vermogen). In pure opbouwjaren vloeit het salaris NIET
    // volledig het vermogen in — alleen het spaaroverschot, dat al als `savings`
    // staat; salaris én savings samen zou dubbeltellen. Zodra er zuiver onttrokken
    // wordt (retirement met withdrawal > 0, savings === 0) stort de kernel CF!D +
    // CF!H wél volledig in de potten terwijl de onttrekking de volle behoefte dekt
    // — dán zijn het volwaardige instromen (bv. deeltijdwerk-strategie, AOW).
    //
    // Het GEMENGDE FIRE-overgangsjaar (`savings > 0` ÉN `withdrawal > 0`) is de
    // uitzondering: daar is `phase === 'accumulation'` (de savings-laag toont het
    // pre-FIRE-spaaroverschot) terwijl `withdrawalNeed` óók al onttrekt, en de
    // bridge-`salaris` (CF!D) telt álle maanden van dat jaar incl. het pre-FIRE-
    // salaris — dat pre-FIRE-deel zit al in `savings`. Salaris tonen zou dat jaar
    // een fantoom-instroom (dubbeltelling) opleveren. We onderdrukken de laag daar
    // bewust: één jaar lichte ONDER- i.p.v. OVERtelling, wat in een vermogens-
    // stromen-view de veiliger keuze is.
    const gib = uRow.grossIncomeBySource
    if (gib && uRow.withdrawal > 0 && !(uRow.savings > 0)) {
      if (gib.salaris > 0) incomeBySource['salaris'] = Math.round(gib.salaris)
      if (gib.gebeurtenisBaten > 0) {
        incomeBySource['gebeurtenis-baten'] = Math.round(gib.gebeurtenisBaten)
      }
    }

    // Positive life event cashflows from SimRow breakdown
    if (sr?.incomeBreakdown) {
      for (const item of sr.incomeBreakdown) {
        if (!FIXED_INCOME_IDS.has(item.id) && item.amount > 0) {
          incomeBySource[item.id] = (incomeBySource[item.id] ?? 0) + item.amount
        }
      }
    }

    // -- Outflows --

    // Levensonderhoud via onttrekking — met box3-ONTDUBBELING. De onttrekking
    // (Ont!D) bevat de Box 3-heffing al als component (CF!K), en Box 3 wordt
    // hieronder óók als eigen expensepost getoond → zonder correctie telt box3
    // dubbel. Trek daarom het box3-deel van de onttrekking af zodat de post
    // alleen het niet-fiscale levensonderhoud toont; `box3` blijft apart staan.
    //
    // LET OP — één-maand-lag: `withdrawalNeed.box3` = Σ CF!K = Σ Bel!N(m−1) (de
    // heffing van de vórige maand, over de post-FIRE-maanden), terwijl `totalBox3`
    // = Σ Bel!N(m) (heffing van de lopende maand, hele jaar). De twee dekken
    // dezelfde heffing maar één maand verschoven, dus de ontdubbeling is exact tot
    // op ~één maand box3 na (~€100–200) — geen float-exacte nul, wél verwaarloosbaar
    // t.o.v. de dubbeltelling die hij wegneemt.
    //
    // Terugval: ontbreekt `withdrawalNeed` (geen decompositie beschikbaar), dan
    // blijft de post ongewijzigd de volledige onttrekking (geen dedup mogelijk).
    if (uRow.withdrawal > 0) {
      const box3InWithdrawal = uRow.withdrawalNeed?.box3 ?? 0
      const levensonderhoud = Math.max(0, uRow.withdrawal - box3InWithdrawal)
      if (levensonderhoud > 0) {
        expenseBySource['withdrawal'] = Math.round(levensonderhoud)
      }
    }

    // Box 3 belasting (eigen post; ontdubbeld uit de onttrekking hierboven)
    if (uRow.totalBox3 > 0) {
      expenseBySource['box3'] = Math.round(uRow.totalBox3)
    }

    // Rente per schuld
    for (const [dId, detail] of Object.entries(uRow.debtBalances)) {
      if (detail.interestPaid > 0) {
        expenseBySource[`debt-interest-${dId}`] = Math.round(detail.interestPaid)
      }
    }

    // Negative life event cashflows from SimRow breakdown
    if (sr?.expenseBreakdown) {
      for (const item of sr.expenseBreakdown) {
        if (!FIXED_EXPENSE_IDS.has(item.id) && item.amount > 0) {
          expenseBySource[item.id] = (expenseBySource[item.id] ?? 0) + item.amount
        }
      }
    }

    // Track active sources
    for (const [id, val] of Object.entries(incomeBySource)) {
      if (val > 0) incomeIdsWithData.add(id)
    }
    for (const [id, val] of Object.entries(expenseBySource)) {
      if (val > 0) expenseIdsWithData.add(id)
    }

    const totalIncome = Object.values(incomeBySource).reduce((s, v) => s + v, 0)
    const totalExpenses = Object.values(expenseBySource).reduce((s, v) => s + v, 0)

    return {
      age: uRow.age,
      phase,
      incomeBySource,
      expenseBySource,
      totalIncome,
      totalExpenses,
      surplus: totalIncome - totalExpenses,
    }
  })

  // Filter layers to only those with data
  const incomeLayers = candidateIncomeLayers.filter(l => incomeIdsWithData.has(l.id))
  const expenseLayers = candidateExpenseLayers.filter(l => expenseIdsWithData.has(l.id))

  return { rows: breakdownRows, incomeLayers, expenseLayers }
}

// ── Fallback: SimRow-only (for regression tests / legacy paths) ─────────

/**
 * Simplified breakdown using only SimRow data (no debt interest detail).
 * Used when UnifiedProjectionRow data is not available.
 *
 * GRONDSLAG-NOTE (bekende afwijking t.o.v. `buildBreakdown`). De 'growth'-instroom
 * komt hier uit `SimRow.growth` = de TOTALE `totalGrowth`, inclusief de
 * waardestijging van een niet-liquide eigen woning. De rijke route hierboven
 * consumeert sinds 2026-08-05 het besteedbare `totalGrowthLiquide`. `SimRow` draagt
 * dat veld bewust niet (het is het vermogens-/compositiecontract, dat op de
 * netWorth-grondslag incl. woning staat), dus de enige consument van dit pad — de
 * wat-als-pagina, die alleen `SimRow[]` heeft — toont het rendement nog op het
 * totaal. Structureel op te lossen door `SimRow` het liquide veld te laten dragen;
 * dat raakt het bredere simulatie-contract en valt buiten deze fix.
 */
export function buildBreakdownFromSimRows(rows: SimRow[]): BreakdownResult {
  if (!rows.length) {
    return { rows: [], incomeLayers: [], expenseLayers: [] }
  }

  const incomeEventIds: string[] = []
  const expenseEventIds: string[] = []
  const incomeLabels = new Map<string, string>()
  const expenseLabels = new Map<string, string>()

  for (const row of rows) {
    if (row.incomeBreakdown) {
      for (const item of row.incomeBreakdown) {
        if (!FIXED_INCOME_IDS.has(item.id) && !incomeLabels.has(item.id)) {
          incomeEventIds.push(item.id)
        }
        incomeLabels.set(item.id, item.label)
      }
    }
    if (row.expenseBreakdown) {
      for (const item of row.expenseBreakdown) {
        if (!FIXED_EXPENSE_IDS.has(item.id) && !expenseLabels.has(item.id)) {
          expenseEventIds.push(item.id)
        }
        expenseLabels.set(item.id, item.label)
      }
    }
  }

  const candidateIncomeLayers: BreakdownLayer[] = [
    buildLayer('savings', FIXED_LABELS.savings, FIXED_COLORS.savings, true),
    buildLayer('growth', FIXED_LABELS.growth, FIXED_COLORS.growth, true),
    ...incomeEventIds.map((id, i) =>
      buildLayer(id, incomeLabels.get(id)!, pickEventColor(INCOME_EVENT_PALETTE, i), false),
    ),
  ]
  const candidateExpenseLayers: BreakdownLayer[] = [
    buildLayer('withdrawal', FIXED_LABELS.withdrawal, FIXED_COLORS.withdrawal, true),
    buildLayer('box3', FIXED_LABELS.box3, FIXED_COLORS.box3, true),
    ...expenseEventIds.map((id, i) =>
      buildLayer(id, expenseLabels.get(id)!, pickEventColor(EXPENSE_EVENT_PALETTE, i), false),
    ),
  ]

  const incomeIdsWithData = new Set<string>()
  const expenseIdsWithData = new Set<string>()

  const breakdownRows: BreakdownRow[] = rows.map((row) => {
    const incomeBySource: Record<string, number> = {}
    const expenseBySource: Record<string, number> = {}

    if (row.incomeBreakdown && row.incomeBreakdown.length > 0) {
      for (const item of row.incomeBreakdown) {
        incomeBySource[item.id] = (incomeBySource[item.id] ?? 0) + item.amount
      }
    } else {
      if (row.savings > 0) incomeBySource['savings'] = row.savings
      if (row.growth > 0) incomeBySource['growth'] = row.growth
    }

    if (row.expenseBreakdown && row.expenseBreakdown.length > 0) {
      for (const item of row.expenseBreakdown) {
        expenseBySource[item.id] = (expenseBySource[item.id] ?? 0) + item.amount
      }
    } else {
      if (row.withdrawal > 0) expenseBySource['withdrawal'] = row.withdrawal
    }

    for (const [id, val] of Object.entries(incomeBySource)) {
      if (val > 0) incomeIdsWithData.add(id)
    }
    for (const [id, val] of Object.entries(expenseBySource)) {
      if (val > 0) expenseIdsWithData.add(id)
    }

    const totalIncome = Object.values(incomeBySource).reduce((s, v) => s + v, 0)
    const totalExpenses = Object.values(expenseBySource).reduce((s, v) => s + v, 0)

    return {
      age: row.age,
      phase: row.phase,
      incomeBySource,
      expenseBySource,
      totalIncome,
      totalExpenses,
      surplus: totalIncome - totalExpenses,
    }
  })

  const incomeLayers = candidateIncomeLayers.filter(l => incomeIdsWithData.has(l.id))
  const expenseLayers = candidateExpenseLayers.filter(l => expenseIdsWithData.has(l.id))

  return { rows: breakdownRows, incomeLayers, expenseLayers }
}
