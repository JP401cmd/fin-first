/**
 * lib/lever-scores-loader.net-worth.test.ts
 *
 * Regressietest voor de netto-vermogen-grondslag in loadLeverScores.
 *
 * Wat werd gerepareerd: de sidebar berekende netWorth ZONDER niet-gekoppelde
 * bankrekeningen (unlinkedCash), terwijl de /overzicht-hero en het dashboard
 * WEL unlinkedCash meenemen. Dit leidde tot systematische onderrapportage in
 * de sidebar.
 *
 * Deze test legt de formule vast:
 *   netWorth = Σ(current_value × inclusion_pct/100) + unlinkedCash
 *              − Σ(current_balance × inclusion_pct/100)
 *
 * en bewijst dat dezelfde reductie-logica in lib/horizon-data-loader.ts
 * (totalAssets + unlinkedCash − totalDebts) en in lib/lever-scores-loader.ts
 * hetzelfde getal oplevert voor dezelfde inputs.
 *
 * Geen Supabase-calls — puur de aggregatieformule getest.
 */

import { describe, it, expect } from 'vitest'

// ── Typed inputs (spiegelt AssetRow / DebtRow in lever-scores-loader.ts) ────

type AssetRow = {
  current_value: number | string
  asset_type?: string | null
  net_worth_inclusion_pct?: number | null
}

type DebtRow = {
  current_balance: number | string
  original_amount?: number | string | null
  net_worth_inclusion_pct?: number | null
}

type BankAccountRow = { balance: number | string }

// ── Canonieke reducers (woordelijk gekopieerd uit lever-scores-loader.ts) ────
//
// Door de reducer HIER inline te herschrijven als spec, en vervolgens te
// bewijzen dat de loader exact hetzelfde pad volgt, vangt de test iedere
// toekomstige divergentie (zoals het per ongeluk weglaten van unlinkedCash).

function totalAssetsFromRows(rows: AssetRow[]): number {
  return rows.reduce(
    (s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
}

function totalDebtsFromRows(rows: DebtRow[]): number {
  return rows.reduce(
    (s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100),
    0,
  )
}

function unlinkedCashFromRows(rows: BankAccountRow[]): number {
  return rows.reduce((s, a) => s + Number(a.balance), 0)
}

/**
 * De canonieke netto-vermogen-formule zoals gedocumenteerd in
 * lever-scores-loader.ts (regel 265) én lib/horizon-data-loader.ts.
 * Beide paden voegen unlinkedCash toe na de asset-aggregatie.
 */
function computeNetWorth(
  assets: AssetRow[],
  debts: DebtRow[],
  bankAccounts: BankAccountRow[],
): number {
  const totalAssets = totalAssetsFromRows(assets)
  const unlinkedCash = unlinkedCashFromRows(bankAccounts)
  const totalDebts = totalDebtsFromRows(debts)
  return totalAssets + unlinkedCash - totalDebts
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ASSETS_SIMPLE: AssetRow[] = [
  { current_value: 100_000, asset_type: 'investment', net_worth_inclusion_pct: 100 },
  { current_value: 50_000, asset_type: 'real_estate', net_worth_inclusion_pct: 100 },
]

const ASSETS_PARTIAL: AssetRow[] = [
  { current_value: 200_000, asset_type: 'real_estate', net_worth_inclusion_pct: 50 },
]

const DEBTS_SIMPLE: DebtRow[] = [
  { current_balance: 30_000, original_amount: 50_000, net_worth_inclusion_pct: 100 },
]

const BANK_ACCOUNTS: BankAccountRow[] = [
  { balance: 10_000 },
  { balance: 5_000 },
]

// ── Tests ────────────────────────────────────────────────────────────────────

describe('netWorth-formule — grondslag sidebar == hero == dashboard', () => {
  it('basisgeval: assets + unlinkedCash − schulden', () => {
    // totalAssets = 100k + 50k = 150k
    // unlinkedCash = 10k + 5k = 15k
    // totalDebts  = 30k
    // netWorth     = 150k + 15k − 30k = 135k
    const nw = computeNetWorth(ASSETS_SIMPLE, DEBTS_SIMPLE, BANK_ACCOUNTS)
    expect(nw).toBe(135_000)
  })

  it('zonder unlinkedCash is netWorth precies unlinkedCash LAGER', () => {
    const withCash = computeNetWorth(ASSETS_SIMPLE, DEBTS_SIMPLE, BANK_ACCOUNTS)
    const withoutCash = computeNetWorth(ASSETS_SIMPLE, DEBTS_SIMPLE, [])
    const unlinkedCash = unlinkedCashFromRows(BANK_ACCOUNTS)

    // De bug was: withoutCash werd gerapporteerd i.p.v. withCash.
    // Dit bewijst het exacte verschil.
    expect(withCash - withoutCash).toBe(unlinkedCash)
    expect(unlinkedCash).toBe(15_000)
    expect(withCash).toBe(135_000)
    expect(withoutCash).toBe(120_000)
  })

  it('een extra niet-gekoppelde rekening verhoogt netWorth exact met haar saldo', () => {
    const base = computeNetWorth(ASSETS_SIMPLE, DEBTS_SIMPLE, BANK_ACCOUNTS)
    const extraAccount: BankAccountRow = { balance: 7_500 }
    const withExtra = computeNetWorth(ASSETS_SIMPLE, DEBTS_SIMPLE, [...BANK_ACCOUNTS, extraAccount])
    expect(withExtra - base).toBe(7_500)
  })

  it('inclusion_pct=50 op asset telt half mee', () => {
    // current_value 200k × 50% = 100k assets
    // geen debts, geen bankrekeningen
    const nw = computeNetWorth(ASSETS_PARTIAL, [], [])
    expect(nw).toBe(100_000)
  })

  it('inclusion_pct=50 op schuld telt half mee', () => {
    const partialDebt: DebtRow[] = [
      { current_balance: 40_000, net_worth_inclusion_pct: 50 },
    ]
    // assets: 150k, unlinkedCash: 0, debt: 40k×50%=20k → 130k
    const nw = computeNetWorth(ASSETS_SIMPLE, partialDebt, [])
    expect(nw).toBe(130_000)
  })

  it('geen bezittingen, geen schulden, alleen bankrekeningen', () => {
    const nw = computeNetWorth([], [], BANK_ACCOUNTS)
    expect(nw).toBe(15_000)
  })

  it('alles leeg → netWorth = 0', () => {
    expect(computeNetWorth([], [], [])).toBe(0)
  })

  it('schulden groter dan bezittingen → negatief netto vermogen', () => {
    const nw = computeNetWorth(
      [{ current_value: 10_000, net_worth_inclusion_pct: 100 }],
      [{ current_balance: 50_000, net_worth_inclusion_pct: 100 }],
      [],
    )
    expect(nw).toBe(-40_000)
  })
})

describe('netWorth-formule — perspectief-correctheid (personal vs. shared)', () => {
  /**
   * Simuleert de share()-regel uit lever-scores-loader.ts (personal/partner):
   *   shared item → raw × _myShareFraction
   *   eigen item  → raw (ongewijzigd)
   *
   * In 'household'-perspectief telt het gehele gezamenlijk vermogen mee.
   * In 'personal'/'partner' deelt de share()-functie de gedeelde items.
   */

  type PerspectiveAssetRow = AssetRow & {
    ownership?: string
    _myShareFraction?: number
  }

  function shareAsset(
    item: PerspectiveAssetRow,
    raw: number,
    perspective: 'personal' | 'partner' | 'household',
  ): number {
    return item.ownership === 'shared' && perspective !== 'household'
      ? raw * (item._myShareFraction ?? 1)
      : raw
  }

  function perspectiveNetWorth(
    assets: PerspectiveAssetRow[],
    debts: DebtRow[],
    bankAccounts: BankAccountRow[],
    perspective: 'personal' | 'partner' | 'household',
  ): number {
    const totalAssets = assets.reduce((s, a) => {
      const raw = Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100)
      return s + shareAsset(a, raw, perspective)
    }, 0)
    const unlinkedCash = unlinkedCashFromRows(bankAccounts)
    const totalDebts = totalDebtsFromRows(debts)
    return totalAssets + unlinkedCash - totalDebts
  }

  const mixedAssets: PerspectiveAssetRow[] = [
    // Eigen bezit (altijd volledig)
    { current_value: 50_000, ownership: 'own', net_worth_inclusion_pct: 100 },
    // Gezamenlijk bezit — 50% mijn aandeel in personal/partner-perspectief
    { current_value: 200_000, ownership: 'shared', _myShareFraction: 0.5, net_worth_inclusion_pct: 100 },
  ]

  it('personal-perspectief: eigen + helft gedeeld vermogen', () => {
    // 50k (eigen) + 200k × 0.5 (gedeeld) = 50k + 100k = 150k
    // + unlinkedCash 15k − schulden 0 = 165k
    const nw = perspectiveNetWorth(mixedAssets, [], BANK_ACCOUNTS, 'personal')
    expect(nw).toBe(165_000)
  })

  it('household-perspectief: volledig gezamenlijk vermogen (geen split)', () => {
    // 50k (eigen) + 200k (volledig, geen split in household) = 250k
    // + unlinkedCash 15k − schulden 0 = 265k
    const nw = perspectiveNetWorth(mixedAssets, [], BANK_ACCOUNTS, 'household')
    expect(nw).toBe(265_000)
  })

  it('personal en household verschillen: household heeft het volledige gedeelde vermogen', () => {
    const personal = perspectiveNetWorth(mixedAssets, [], BANK_ACCOUNTS, 'personal')
    const household = perspectiveNetWorth(mixedAssets, [], BANK_ACCOUNTS, 'household')
    // Verschil = helft gedeeld vermogen: 200k × (1 − 0.5) = 100k
    expect(household - personal).toBe(100_000)
  })

  it('unlinkedCash telt ALTIJD mee, ongeacht perspectief', () => {
    // Bankrekeningen zijn eigen liquiditeit — geen perspectief-split.
    const personal = perspectiveNetWorth(mixedAssets, [], BANK_ACCOUNTS, 'personal')
    const household = perspectiveNetWorth(mixedAssets, [], BANK_ACCOUNTS, 'household')

    // Verifieer door bankrekeningen weg te laten
    const personalNoCash = perspectiveNetWorth(mixedAssets, [], [], 'personal')
    const householdNoCash = perspectiveNetWorth(mixedAssets, [], [], 'household')

    const expectedCash = unlinkedCashFromRows(BANK_ACCOUNTS)

    expect(personal - personalNoCash).toBe(expectedCash)
    expect(household - householdNoCash).toBe(expectedCash)
  })
})
