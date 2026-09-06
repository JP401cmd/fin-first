# Cash-consolidatie op de cashflow-pagina — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maak `/overzicht/budget` de enige thuisbasis voor cash-rekeningen — overzicht, geldstroom, bewerken én instellingen (jaarinkomen, spaarquote, geschatte uitgaven) met live FIRE-impact — terwijl bezittingen cash blijft tonen als waarde en doorklikt naar cashflow. Ruim de dubbele rekening-verdieping (`/core/assets/cash`) op.

**Architecture:** De bestaande cashflow-landing (server component, hub met 4 hefboom-kaarten + inspiratieblok) krijgt onder het inspiratieblok twee nieuwe secties: (1) een verbrede `CashOverview` die álle cash-rekeningen toont met per-rekening anker `#rekening-<assetId>`, en (2) een nieuw client-blok `CashflowInstellingenBlok` met inline-bewerkbaar inkomen/uitgaven + doel-spaarquote + live herberekende FIRE-projectie. Pure data-transformaties komen in losse, geteste lib-modules. `/core/assets/cash` en de per-rekening detailroute redirecten naar de cashflow-landing.

**Tech Stack:** Next.js 16 (App Router, server + client components), React 19, Supabase (PostgreSQL), Tailwind CSS v4, Vitest + Testing Library. Domeintaal: Nederlands.

---

## Bestandsoverzicht

**Nieuw:**
- `lib/cash-rekeningen.ts` — pure `buildCashRekeningen(cashAssets, bankAccounts)` → uniforme, asset-gedreven rekeningenlijst. Getest.
- `lib/cash-rekeningen.test.ts`
- `lib/cashflow-settings.ts` — pure `sanitizeCashSettingsInput(body)` + `recomputeFireFromSettings(base, overrides, params)`. Getest.
- `lib/cashflow-settings.test.ts`
- `lib/cashflow-settings-data.ts` — server-loader `loadCashflowSettingsData(supabase)` → props-bundle voor het instellingen-blok.
- `components/overview/cashflow-instellingen-blok.tsx` — client-component (info + inline edit + live FIRE-impact).
- `supabase/migrations/20260606000000_add_target_savings_rate.sql` — lokale spiegel van de migratie.

**Gewijzigd:**
- `app/api/parameters/route.ts` — GET + PUT uitbreiden met de cash-settings-velden.
- `components/app/cash-overview.tsx` — `showAllCashAccounts`-prop; verbrede rekeningenlijst; anker + hash-focus; AssetPane voor handmatige cash-assets.
- `app/(app)/overzicht/budget/page.tsx` — twee nieuwe secties onder het inspiratieblok.
- `components/core/assets-client.tsx` — `handleAssetClick` cash-tak + cash-categorie-header href.
- `components/core/vermogen-asset-card.tsx` — actie-rij (bewerken/herwaarderen) verbergen voor `asset_type === 'cash'`.
- `app/(app)/core/assets/[type]/page.tsx` — cash → redirect naar cashflow.
- `app/(app)/core/assets/cash/[accountId]/page.tsx` — server-redirect met accountId→assetId-mapping.
- `app/(app)/core/cash/page.tsx` — redirect direct naar cashflow.
- `components/core/category-deepening-registry.ts` — cash-entry + component-mapping + import verwijderen.
- Diverse callers van `/core/assets/cash[?tab=budgetteren]` (sidebar, banners, widgets) → cashflow-equivalent.

**Verwijderd:**
- `components/core/deepenings/cash-budgetteren-tab.tsx` (dood na registry-verwijdering).

---

## Task 1: Migratie — `profiles.target_savings_rate`

**Files:**
- Apply (remote): via MCP `mcp__supabase__apply_migration`
- Create: `supabase/migrations/20260606000000_add_target_savings_rate.sql`

> Achtergrond: lokale migratie-map ≠ remote (drift). De waarheid is de remote DB; we passen DDL toe via `apply_migration` én leggen een lokaal spiegelbestand vast voor repo-consistentie. Kolom bestaat nog niet (geverifieerd).

- [ ] **Step 1: Pas de migratie toe op de remote DB**

Gebruik de tool `mcp__supabase__apply_migration` met:
- `name`: `add_target_savings_rate`
- `query`:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_savings_rate numeric;
COMMENT ON COLUMN profiles.target_savings_rate IS 'Door gebruiker ingesteld doel-spaarquote in procenten (0-100), NULL = geen doel.';
```

- [ ] **Step 2: Verifieer dat de kolom bestaat**

Gebruik `mcp__supabase__execute_sql` met:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'profiles' and column_name = 'target_savings_rate';
```
Verwacht: één rij, `data_type` = `numeric`.

- [ ] **Step 3: Leg de lokale spiegel vast**

Maak `supabase/migrations/20260606000000_add_target_savings_rate.sql`:
```sql
-- Doel-spaarquote (target savings rate) voor het cashflow-instellingen-blok.
-- In procenten (0-100). NULL = gebruiker heeft geen doel ingesteld.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_savings_rate numeric;
COMMENT ON COLUMN profiles.target_savings_rate IS 'Door gebruiker ingesteld doel-spaarquote in procenten (0-100), NULL = geen doel.';
```

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260606000000_add_target_savings_rate.sql
git commit -m "feat(cashflow): add profiles.target_savings_rate column"
```

---

## Task 2: Pure lib — cashflow-settings (validatie + live FIRE-herberekening)

**Files:**
- Create: `lib/cashflow-settings.ts`
- Test: `lib/cashflow-settings.test.ts`

- [ ] **Step 1: Schrijf de falende test**

`lib/cashflow-settings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { sanitizeCashSettingsInput, recomputeFireFromSettings } from './cashflow-settings'
import type { FinancialInput } from './core-metrics'

describe('sanitizeCashSettingsInput', () => {
  it('whitelist en clamp: accepteert geldige getallen, negeert rommel', () => {
    const out = sanitizeCashSettingsInput({
      net_monthly_income: '3500',
      estimated_monthly_expenses: 2800,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 30000,
      target_savings_rate: 30,
      // @ts-expect-error extra veld wordt genegeerd
      hack: 'DROP TABLE',
    })
    expect(out).toEqual({
      net_monthly_income: 3500,
      estimated_monthly_expenses: 2800,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 30000,
      target_savings_rate: 30,
    })
  })

  it('weigert ongeldige method en out-of-range waarden', () => {
    const out = sanitizeCashSettingsInput({
      net_monthly_income: -5,
      retirement_expense_method: 'nonsense',
      target_savings_rate: 250,
    })
    expect(out).toEqual({})
  })

  it('staat target_savings_rate = null toe (doel wissen)', () => {
    expect(sanitizeCashSettingsInput({ target_savings_rate: null })).toEqual({
      target_savings_rate: null,
    })
  })
})

describe('recomputeFireFromSettings', () => {
  const base: FinancialInput = {
    totalAssets: 100_000,
    totalDebts: 0,
    monthlyIncome: 3000,
    monthlyExpenses: 2000,
    yearlyMustExpenses: 24_000,
    monthlyContributions: 1000,
    dateOfBirth: '1990-01-01',
  }
  const params = {
    grossReturn: 0.07,
    effectiveSwr: 0.035,
    inflationRate: 0.02,
    retirementMethod: 'essential_budgets' as const,
    retirementCustomAmount: 0,
    budgetingActive: true,
    yearlyMustExpenses: 24_000,
    fireStrategy: { strategy: 'perpetual' as const, endAge: 95 },
  }

  it('hoger inkomen → eerdere of gelijke FIRE-leeftijd', () => {
    const low = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 2000 }, params)
    const high = recomputeFireFromSettings(base, { monthlyIncome: 5000, monthlyExpenses: 2000 }, params)
    expect(low.fireAge).not.toBeNull()
    expect(high.fireAge).not.toBeNull()
    expect((high.fireAge as number)).toBeLessThanOrEqual(low.fireAge as number)
  })

  it('zonder budgetteren: uitgaven-schatting voedt het FIRE-doel', () => {
    const noBudget = { ...params, budgetingActive: false }
    const cheap = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 1500 }, noBudget)
    const pricey = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 3000 }, noBudget)
    // Hogere uitgaven → hoger FIRE-doel → later (of gelijk) FIRE.
    expect(pricey.fireTarget).toBeGreaterThan(cheap.fireTarget)
  })
})
```

- [ ] **Step 2: Run om te zien dat het faalt**

Run: `npx vitest run lib/cashflow-settings.test.ts`
Verwacht: FAIL — "Failed to resolve import './cashflow-settings'".

- [ ] **Step 3: Implementeer `lib/cashflow-settings.ts`**

```ts
import { computeFireProjection, type FireProjection } from './horizon-data'
import type { FinancialInput } from './core-metrics'
import { computeRetirementExpenses, type RetirementExpenseMethod } from './budget-utils'

const METHODS: readonly RetirementExpenseMethod[] = [
  'essential_budgets',
  'custom_amount',
  'current_income',
]

export interface SanitizedCashSettings {
  net_monthly_income?: number
  estimated_monthly_expenses?: number
  retirement_expense_method?: RetirementExpenseMethod
  retirement_expense_custom_amount?: number
  target_savings_rate?: number | null
}

/**
 * Whitelist + clamp voor de cash-settings die via PUT /api/parameters
 * binnenkomen. Onbekende velden en out-of-range waarden worden genegeerd
 * (niet meegeschreven), zodat de DB nooit met rommel wordt geüpdatet.
 */
export function sanitizeCashSettingsInput(body: Record<string, unknown>): SanitizedCashSettings {
  const out: SanitizedCashSettings = {}

  if (body.net_monthly_income !== undefined) {
    const n = Number(body.net_monthly_income)
    if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) out.net_monthly_income = n
  }
  if (body.estimated_monthly_expenses !== undefined) {
    const n = Number(body.estimated_monthly_expenses)
    if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) out.estimated_monthly_expenses = n
  }
  if (body.retirement_expense_method !== undefined) {
    const m = String(body.retirement_expense_method)
    if ((METHODS as readonly string[]).includes(m)) {
      out.retirement_expense_method = m as RetirementExpenseMethod
    }
  }
  if (body.retirement_expense_custom_amount !== undefined) {
    const n = Number(body.retirement_expense_custom_amount)
    if (Number.isFinite(n) && n >= 0 && n <= 10_000_000) out.retirement_expense_custom_amount = n
  }
  if (body.target_savings_rate !== undefined) {
    if (body.target_savings_rate === null) {
      out.target_savings_rate = null
    } else {
      const n = Number(body.target_savings_rate)
      if (Number.isFinite(n) && n >= 0 && n <= 100) out.target_savings_rate = n
    }
  }

  return out
}

export interface CashSettingsOverrides {
  monthlyIncome: number
  monthlyExpenses: number
}

export interface FireRecomputeParams {
  grossReturn: number
  effectiveSwr: number
  inflationRate: number
  retirementMethod: RetirementExpenseMethod
  retirementCustomAmount: number
  /** Wanneer false vallen de jaaruitgaven terug op (maanduitgaven × 12). */
  budgetingActive: boolean
  /** Jaarlijkse must-expenses uit essentiële budgetten (alleen relevant als budgetingActive). */
  yearlyMustExpenses: number
  fireStrategy: {
    strategy: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
    endAge: number
  }
}

/**
 * Herberekent de FIRE-projectie op basis van live-bewerkte inkomen/uitgaven.
 * Spiegelt de constructie in dashboard-data-loader (regel 536-582): de
 * jaarlijkse retirement-uitgaven worden bepaald via computeRetirementExpenses,
 * met de maanduitgaven × 12 als fallback wanneer er geen budgetten zijn.
 */
export function recomputeFireFromSettings(
  base: FinancialInput,
  overrides: CashSettingsOverrides,
  params: FireRecomputeParams,
): FireProjection {
  const estimatedYearly = overrides.monthlyExpenses * 12
  const yearlyMust = params.budgetingActive ? params.yearlyMustExpenses : estimatedYearly
  const yearlyRetirement = computeRetirementExpenses(
    params.retirementMethod,
    yearlyMust,
    overrides.monthlyIncome * 12,
    params.retirementCustomAmount,
    estimatedYearly,
  )

  const input: FinancialInput = {
    ...base,
    monthlyIncome: overrides.monthlyIncome,
    monthlyExpenses: overrides.monthlyExpenses,
    yearlyMustExpenses: yearlyRetirement,
  }

  return computeFireProjection(
    input,
    params.grossReturn,
    params.effectiveSwr,
    params.inflationRate,
    { strategy: params.fireStrategy.strategy, endAge: params.fireStrategy.endAge },
  )
}
```

- [ ] **Step 4: Run om te zien dat het slaagt**

Run: `npx vitest run lib/cashflow-settings.test.ts`
Verwacht: PASS (alle 5 tests).

> Als `computeRetirementExpenses` of `FinancialInput` niet exact zo importeren, controleer de exports in `lib/budget-utils.ts` (regel 109) en `lib/core-metrics.ts` (regel 154) en pas de import aan.

- [ ] **Step 5: Commit**
```bash
git add lib/cashflow-settings.ts lib/cashflow-settings.test.ts
git commit -m "feat(cashflow): pure cash-settings validatie + live FIRE-herberekening"
```

---

## Task 3: API — `/api/parameters` GET + PUT uitbreiden

**Files:**
- Modify: `app/api/parameters/route.ts`

> Huidige PUT slaat alleen `expected_return`, `inflation_rate`, `box3_method`, `marginaal_tarief` op via `supabase.from('profiles').upsert(updateData)`. We voegen de cash-settings toe via `sanitizeCashSettingsInput`, en GET geeft ze terug.

- [ ] **Step 1: Voeg de import toe (bovenaan het bestand)**

Voeg toe bij de imports:
```ts
import { sanitizeCashSettingsInput } from '@/lib/cashflow-settings'
```

- [ ] **Step 2: Breid de GET-select uit**

Zoek de `profiles`-select in de GET-handler (rond regel 18). Vervang de select-kolomlijst zodat de nieuwe velden meekomen. Bijvoorbeeld, als de select nu is:
```ts
.select('expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income')
```
maak er van:
```ts
.select('expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income, estimated_monthly_expenses, retirement_expense_method, retirement_expense_custom_amount, target_savings_rate')
```

Breid het GET-response-object uit met dezelfde velden + sensible defaults:
```ts
estimated_monthly_expenses: Number(data?.estimated_monthly_expenses ?? 0),
retirement_expense_method: data?.retirement_expense_method ?? 'essential_budgets',
retirement_expense_custom_amount: Number(data?.retirement_expense_custom_amount ?? 0),
target_savings_rate: data?.target_savings_rate ?? null,
```

> Let op de bestaande fallback-query (zonder `marginaal_tarief`) voor niet-gemigreerde DB's: `target_savings_rate` bestaat nu (Task 1), dus de hoofd-select werkt. Laat de bestaande fallback intact.

- [ ] **Step 3: Schrijf de cash-settings in de PUT-handler**

In de PUT-handler, nadat `updateData` is opgebouwd en vóór de `upsert`-call, merge de gesaneerde cash-settings erin:
```ts
const cashSettings = sanitizeCashSettingsInput(body)
Object.assign(updateData, cashSettings)
```
(De bestaande `upsert(updateData)` schrijft de samengevoegde set weg. `sanitizeCashSettingsInput` voegt alleen geldige velden toe, dus ongeldige input verandert niets.)

Breid het PUT-response-object uit zodat de client de opgeslagen waarden terugkrijgt:
```ts
...cashSettings,
```
(spread in het bestaande success-JSON-object).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Verwacht: geen nieuwe fouten in `app/api/parameters/route.ts`.

- [ ] **Step 5: Handmatige rooktest**

Start de app (`npm run dev`), log in, en in de browser-console:
```js
await fetch('/api/parameters', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ net_monthly_income: 3456, target_savings_rate: 35 }) }).then(r => r.json())
await fetch('/api/parameters').then(r => r.json())
```
Verwacht: GET geeft `net_monthly_income: 3456` en `target_savings_rate: 35` terug.

- [ ] **Step 6: Commit**
```bash
git add app/api/parameters/route.ts
git commit -m "feat(api): parameters slaat inkomen/uitgaven/doel-spaarquote op"
```

---

## Task 4: Pure lib — `buildCashRekeningen`

**Files:**
- Create: `lib/cash-rekeningen.ts`
- Test: `lib/cash-rekeningen.test.ts`

> Reden: de Rekeningen-lijst op cashflow moet asset-gedreven zijn (anker = `assetId`, want bezittingen linkt op `asset.id`). Een bank_account koppelt via `linked_asset_id` aan een asset. Deze pure functie verenigt cash-assets met hun (optionele) bank_account.

- [ ] **Step 1: Schrijf de falende test**

`lib/cash-rekeningen.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCashRekeningen } from './cash-rekeningen'

describe('buildCashRekeningen', () => {
  const assets = [
    { id: 'a1', name: 'Spaarrekening', current_value: 12000, institution: 'ASN', has_budget_tracking: true },
    { id: 'a2', name: 'Contant geld', current_value: 200, institution: null, has_budget_tracking: false },
  ]
  const banks = [
    { id: 'b1', name: 'ASN Betaal', balance: 12500, iban: 'NL01ASN', bank_name: 'ASN Bank', linked_asset_id: 'a1' },
  ]

  it('koppelt bank_account aan asset en prefereert bank-saldo', () => {
    const rows = buildCashRekeningen(assets, banks)
    const a1 = rows.find((r) => r.assetId === 'a1')!
    expect(a1.bankAccountId).toBe('b1')
    expect(a1.balance).toBe(12500) // bank-saldo wint van current_value
    expect(a1.name).toBe('ASN Betaal') // bank-naam wint
    expect(a1.iban).toBe('NL01ASN')
    expect(a1.budgetTracked).toBe(true)
    expect(a1.source).toBe('bank')
  })

  it('handmatige cash-assets zonder bank_account verschijnen als manual', () => {
    const rows = buildCashRekeningen(assets, banks)
    const a2 = rows.find((r) => r.assetId === 'a2')!
    expect(a2.bankAccountId).toBeNull()
    expect(a2.balance).toBe(200)
    expect(a2.name).toBe('Contant geld')
    expect(a2.source).toBe('manual')
    expect(a2.budgetTracked).toBe(false)
  })

  it('één rij per asset, in invoervolgorde', () => {
    const rows = buildCashRekeningen(assets, banks)
    expect(rows.map((r) => r.assetId)).toEqual(['a1', 'a2'])
  })
})
```

- [ ] **Step 2: Run om te zien dat het faalt**

Run: `npx vitest run lib/cash-rekeningen.test.ts`
Verwacht: FAIL — import niet resolvebaar.

- [ ] **Step 3: Implementeer `lib/cash-rekeningen.ts`**

```ts
export interface CashAssetRow {
  id: string
  name: string
  current_value: number
  institution?: string | null
  has_budget_tracking?: boolean | null
}

export interface BankAccountRow {
  id: string
  name: string
  balance: number
  iban?: string | null
  bank_name?: string | null
  linked_asset_id: string | null
}

export interface CashRekening {
  /** assets.id — dé sleutel voor het focus-anker (#rekening-<assetId>). */
  assetId: string
  name: string
  balance: number
  iban: string | null
  bankName: string | null
  /** bank_accounts.id wanneer gekoppeld, anders null (handmatig). */
  bankAccountId: string | null
  /** assets.has_budget_tracking — bepaalt of de geldstroom-detailweergave beschikbaar is. */
  budgetTracked: boolean
  source: 'bank' | 'manual'
}

/**
 * Verenigt cash-assets met hun (optionele) gekoppelde bank_account tot één
 * asset-gedreven rekeningenlijst. Bank-saldo en bank-naam winnen wanneer een
 * koppeling bestaat; anders vallen we terug op de asset zelf (handmatige cash).
 */
export function buildCashRekeningen(
  cashAssets: CashAssetRow[],
  bankAccounts: BankAccountRow[],
): CashRekening[] {
  const bankByAssetId = new Map<string, BankAccountRow>()
  for (const b of bankAccounts) {
    if (b.linked_asset_id) bankByAssetId.set(b.linked_asset_id, b)
  }

  return cashAssets.map((a) => {
    const bank = bankByAssetId.get(a.id) ?? null
    return {
      assetId: a.id,
      name: bank?.name ?? a.name,
      balance: bank ? Number(bank.balance) : Number(a.current_value),
      iban: bank?.iban ?? null,
      bankName: bank?.bank_name ?? a.institution ?? null,
      bankAccountId: bank?.id ?? null,
      budgetTracked: a.has_budget_tracking === true,
      source: bank ? 'bank' : 'manual',
    }
  })
}
```

- [ ] **Step 4: Run om te zien dat het slaagt**

Run: `npx vitest run lib/cash-rekeningen.test.ts`
Verwacht: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add lib/cash-rekeningen.ts lib/cash-rekeningen.test.ts
git commit -m "feat(cashflow): pure buildCashRekeningen (asset-gedreven rekeningenlijst)"
```

---

## Task 5: `CashOverview` verbreden — alle cash-rekeningen + anker + focus + edit

**Files:**
- Modify: `components/app/cash-overview.tsx`

> Doel: met de nieuwe prop `showAllCashAccounts` toont `CashOverview` álle cash-rekeningen (bank-gekoppeld én handmatig), elk met `id="rekening-<assetId>"`, scrollt/markeert bij matchende URL-hash, en biedt bewerken: bank-gekoppelde rekeningen via de bestaande detail-modal, handmatige cash-assets via `AssetPane`. De geldstroom-aggregatie (Inkomen/Uitgaven/Saldo/Spaarquote + grafiek) blijft ongewijzigd op de budget-tracked rekeningen. Bestaande embed-sites (zonder de prop) blijven exact werken.

- [ ] **Step 1: Voeg imports toe (bovenaan, bij de bestaande imports)**

```ts
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { buildCashRekeningen, type CashRekening } from '@/lib/cash-rekeningen'
import { AssetPane } from '@/components/app/core/assets/asset-pane'
import type { Asset } from '@/lib/asset-data'
```
> `createClient` is al geïmporteerd (regel 10); gebruik die — voeg geen dubbele import toe. Voeg alleen `buildCashRekeningen`, `AssetPane` en `Asset` toe.

- [ ] **Step 2: Breid de props uit**

In de component-signature (regel 52-62), voeg `showAllCashAccounts` toe:
```ts
export function CashOverview({
  embedded = false,
  onNavigateToAccount,
  hideAccountsSection = false,
  hideQuickActions = false,
  showAllCashAccounts = false,
}: {
  embedded?: boolean
  onNavigateToAccount?: (accountId: string) => void
  hideAccountsSection?: boolean
  hideQuickActions?: boolean
  showAllCashAccounts?: boolean
}) {
```

- [ ] **Step 3: Voeg state toe voor cash-assets + bewerk-pane**

Na de bestaande `const [accounts, setAccounts] = useState<Account[]>([])` (regel 63), voeg toe:
```ts
// Volledige cash-assets (asset-gedreven rekeningenlijst) + alle bank_accounts
// (ongefilterd op budget-tracking) — alleen geladen wanneer showAllCashAccounts.
const [cashAssets, setCashAssets] = useState<Asset[]>([])
const [allBankAccounts, setAllBankAccounts] = useState<Account[]>([])
// Handmatige cash-asset die in de AssetPane wordt bewerkt (null = dicht).
const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
```

- [ ] **Step 4: Laad cash-assets + alle bank_accounts wanneer `showAllCashAccounts`**

Voeg een nieuwe `useCallback` toe naast `loadAccounts` (na regel 134):
```ts
const loadAllCashRekeningen = useCallback(async () => {
  if (!showAllCashAccounts) return
  const supabase = createClient()

  let assetsQ = supabase
    .from('assets')
    .select('*')
    .eq('asset_type', 'cash')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (perspective === 'personal') assetsQ = assetsQ.eq('ownership', 'personal')

  let banksQ = supabase
    .from('bank_accounts')
    .select('id, name, balance, iban, bank_name, linked_asset_id')
    .eq('is_active', true)
  if (perspective === 'personal') banksQ = banksQ.eq('ownership', 'personal')

  const [{ data: assetsData }, { data: banksData }] = await Promise.all([assetsQ, banksQ])
  if (assetsData) setCashAssets(assetsData as Asset[])
  if (banksData) setAllBankAccounts(banksData as Account[])
}, [showAllCashAccounts, perspective])
```

Roep 'm aan in het bestaande mount/perspective-effect waar `loadAccounts()` wordt aangeroepen (zoek `loadAccounts()` in een `useEffect`), voeg ernaast toe:
```ts
void loadAllCashRekeningen()
```
en voeg `loadAllCashRekeningen` toe aan de dependency-array van dat effect.

- [ ] **Step 5: Bereken de te tonen rekeningenlijst**

Voeg een `useMemo` toe (bij de andere memo's, na regel 140):
```ts
const rekeningen = useMemo<CashRekening[]>(() => {
  if (!showAllCashAccounts) return []
  return buildCashRekeningen(
    cashAssets.map((a) => ({
      id: a.id,
      name: a.name,
      current_value: Number(a.current_value),
      institution: a.institution ?? null,
      has_budget_tracking: (a as { has_budget_tracking?: boolean | null }).has_budget_tracking ?? null,
    })),
    allBankAccounts.map((b) => ({
      id: b.id,
      name: b.name,
      balance: Number(b.balance),
      iban: (b as { iban?: string | null }).iban ?? null,
      bank_name: (b as { bank_name?: string | null }).bank_name ?? null,
      linked_asset_id: (b as { linked_asset_id?: string | null }).linked_asset_id ?? null,
    })),
  )
}, [showAllCashAccounts, cashAssets, allBankAccounts])

const rekeningenTotal = useMemo(
  () => rekeningen.reduce((s, r) => s + r.balance, 0),
  [rekeningen],
)
```

- [ ] **Step 6: Hash-focus effect (scroll + highlight)**

Voeg dit effect toe (na de bestaande effects), het draait wanneer de rekeningen geladen zijn:
```ts
// Focus op een specifieke rekening wanneer de URL een #rekening-<assetId>-hash
// bevat (klik vanaf bezittingen). Scroll in beeld + tijdelijke highlight.
useEffect(() => {
  if (!showAllCashAccounts || rekeningen.length === 0) return
  if (typeof window === 'undefined') return
  const hash = window.location.hash
  if (!hash.startsWith('#rekening-')) return
  const el = document.getElementById(hash.slice(1))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-kern-400', 'ring-offset-2')
  const t = window.setTimeout(() => {
    el.classList.remove('ring-2', 'ring-kern-400', 'ring-offset-2')
  }, 2400)
  return () => window.clearTimeout(t)
}, [showAllCashAccounts, rekeningen])
```

- [ ] **Step 7: Render de verbrede rekeningenlijst**

Vervang het Rekeningen-`<section>`-blok (regel 601-670). Wanneer `showAllCashAccounts`, render uit `rekeningen`; anders het bestaande gedrag uit `accounts`. Concreet: laat het bestaande `accounts.map(...)`-blok staan voor de niet-`showAllCashAccounts`-tak, en voeg een nieuwe tak toe:

```tsx
{!hideAccountsSection && (
<section className="mt-5 sm:mt-8">
  <div className="mb-4">
    <Kicker>Rekeningen</Kicker>
  </div>

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
    {showAllCashAccounts
      ? rekeningen.map((r) => {
          const sharePct = rekeningenTotal > 0 ? (r.balance / rekeningenTotal) * 100 : 0
          const onClick = () => {
            if (r.bankAccountId) {
              setDetailAccountId(r.bankAccountId)
            } else {
              const asset = cashAssets.find((a) => a.id === r.assetId) ?? null
              setEditingAsset(asset)
            }
          }
          return (
            <button
              key={r.assetId}
              id={`rekening-${r.assetId}`}
              type="button"
              onClick={onClick}
              className="group card-editorial scroll-mt-24 overflow-hidden p-0 text-left transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
            >
              <div className="flex h-1 items-stretch">
                <div className="w-1 bg-kern-500" />
                <div className="flex-1" />
              </div>
              <div className="p-3 sm:p-5">
                <div className="mb-2 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                    <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-kern-600" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--ink-2)]">{r.name}</p>
                </div>

                {(r.iban || r.bankName) && (
                  <p className="mb-2 text-xs text-[var(--ink-3)]">
                    {r.iban}{r.iban && r.bankName ? ' · ' : ''}{r.bankName}
                  </p>
                )}

                <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                  <MaskedAmount value={r.balance} tone="kern" decimals />
                </p>

                <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div className="h-full rounded-full bg-kern-300" style={{ width: `${Math.max(sharePct, 2)}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                  {sharePct.toFixed(0)}% van totaal
                </p>

                <FreedomTimeBadge amount={r.balance} className="mt-2" />

                <div className="mt-3 flex items-center justify-between">
                  <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">
                    {r.bankAccountId ? 'Bekijk rekening' : 'Bewerk rekening'}
                  </span>
                  <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
                </div>
              </div>
            </button>
          )
        })
      : accounts.map((acc) => {
          /* ── bestaande, ongewijzigde render uit regel 609-668 ── */
          const sharePct = totalBalance > 0 ? (Number(acc.balance) / totalBalance) * 100 : 0
          const useCallbackNav = embedded && onNavigateToAccount
          const Wrapper = (embedded ? 'button' : Link) as any
          const wrapperProps = useCallbackNav
            ? { type: 'button' as const, onClick: () => onNavigateToAccount!(acc.id) }
            : embedded
              ? { type: 'button' as const, onClick: () => setDetailAccountId(acc.id) }
              : { href: `/core/assets/cash/${acc.id}` }
          return (
            <Wrapper key={acc.id} {...(wrapperProps as any)} className="group card-editorial overflow-hidden p-0 text-left transition-all hover:shadow-[var(--s1)] hover:-translate-y-px">
              {/* ... ongewijzigde card-inhoud ... */}
            </Wrapper>
          )
        })}
  </div>
</section>
)}
```
> Behoud de bestaande inner-JSX van de `accounts`-tak letterlijk (regel 614-666). Alleen de hernoeming van de lokale `useCallback`-variabele naar `useCallbackNav` is nodig (de naam `useCallback` botste met de React-hook-import — corrigeer dit ook in de bestaande code).

- [ ] **Step 8: Render de AssetPane voor handmatige cash-assets**

Aan het eind van de component, naast de bestaande detail-modal (`detailAccountId`), voeg toe:
```tsx
{editingAsset && (
  <AssetPane
    asset={editingAsset}
    onClose={() => setEditingAsset(null)}
    onChanged={() => {
      void loadAllCashRekeningen()
    }}
  />
)}
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Verwacht: geen nieuwe fouten in `components/app/cash-overview.tsx`. (Let op de `useCallback`-hernoeming uit Step 7.)

- [ ] **Step 10: Run bestaande tests die CashOverview raken**

Run: `npx vitest run components/overview`
Verwacht: bestaande cashflow-tests blijven groen (geen regressie; nieuw gedrag zit achter de default-false prop).

- [ ] **Step 11: Commit**
```bash
git add components/app/cash-overview.tsx
git commit -m "feat(cashflow): CashOverview toont alle cash-rekeningen met anker + edit"
```

---

## Task 6: Instellingen-blok — server-loader + client-component

**Files:**
- Create: `lib/cashflow-settings-data.ts`
- Create: `components/overview/cashflow-instellingen-blok.tsx`

> De loader stelt één serialiseerbare props-bundle samen uit `loadCoreData` + een gerichte profiel-read (voor `date_of_birth` en `target_savings_rate`). Het client-blok toont info, biedt inline bewerken (PUT /api/parameters) en herberekent de FIRE-projectie live via `recomputeFireFromSettings`.

- [ ] **Step 1: Implementeer `lib/cashflow-settings-data.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCoreData } from '@/lib/core-data-loader'
import { resolveFireParams } from '@/lib/fire-params'
import type { FinancialInput } from '@/lib/core-metrics'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'

export interface CashflowSettingsData {
  /** Afgeleid (geëxtrapoleerd) jaarinkomen, ter info. */
  estimatedAnnualIncome: number
  /** Opgeslagen profiel-maandinkomen (default voor de edit-input). */
  netMonthlyIncome: number
  /** Afgeleide spaarquote over 6 maanden (%). */
  savingsRate6m: number
  /** Ingesteld doel-spaarquote (%) of null. */
  targetSavingsRate: number | null
  /** Opgeslagen profiel-maanduitgaven (default voor de edit-input). */
  estimatedMonthlyExpenses: number
  retirementExpenseMethod: RetirementExpenseMethod
  retirementCustomAmount: number
  budgetingActive: boolean
  /** Baseline voor de FIRE-projectie (live herberekend bij wijzigingen). */
  fireInput: FinancialInput
  grossReturn: number
  effectiveSwr: number
  inflationRate: number
  fireStrategy: { strategy: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'; endAge: number }
}

export async function loadCashflowSettingsData(
  supabase: SupabaseClient,
): Promise<CashflowSettingsData | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const core = await loadCoreData(supabase)

  const { data: profile } = await supabase
    .from('profiles')
    .select('date_of_birth, target_savings_rate, net_monthly_income, estimated_monthly_expenses, retirement_expense_method, retirement_expense_custom_amount')
    .eq('id', user.id)
    .maybeSingle()

  const rf = core.rawFinancials
  const fireInput: FinancialInput = {
    totalAssets: rf.totalAssets,
    totalDebts: rf.totalDebts,
    monthlyIncome: rf.monthlyIncome,
    monthlyExpenses: rf.monthlyExpenses,
    yearlyMustExpenses: rf.yearlyRetirementExpenses ?? rf.yearlyMustExpenses,
    monthlyContributions: core.fullAssets.reduce(
      (s, a) => s + Number((a as { monthly_contribution?: number }).monthly_contribution ?? 0),
      0,
    ),
    dateOfBirth: profile?.date_of_birth ?? null,
    last12MonthsIncome: rf.extrapolatedIncome,
  }

  return {
    estimatedAnnualIncome: rf.extrapolatedIncome,
    netMonthlyIncome: Number(profile?.net_monthly_income ?? 0),
    savingsRate6m: core.savingsRate6m,
    targetSavingsRate: profile?.target_savings_rate ?? null,
    estimatedMonthlyExpenses: Number(profile?.estimated_monthly_expenses ?? 0),
    retirementExpenseMethod:
      (profile?.retirement_expense_method as RetirementExpenseMethod) ?? core.retirementMethodUsed,
    retirementCustomAmount: Number(profile?.retirement_expense_custom_amount ?? 0),
    budgetingActive: core.budgetingActive,
    fireInput,
    grossReturn: core.fireParams.grossReturn,
    effectiveSwr: core.fireParams.effectiveSwr,
    inflationRate: core.fireParams.inflationRate,
    fireStrategy: { strategy: core.fireStrategy.strategy, endAge: core.fireStrategy.endAge },
  }
}
```
> Controleer bij implementatie de exacte veldnamen op `CorePageData` (`lib/core-data-loader.ts` regel 37-183): `rawFinancials`, `savingsRate6m`, `fireParams`, `fireStrategy`, `retirementMethodUsed`, `budgetingActive`, `fullAssets`. Pas aan als een naam afwijkt.

- [ ] **Step 2: Implementeer `components/overview/cashflow-instellingen-blok.tsx`**

```tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import { Pencil, TrendingUp, Target } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { recomputeFireFromSettings } from '@/lib/cashflow-settings'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

export function CashflowInstellingenBlok({ data }: { data: CashflowSettingsData }) {
  const [monthlyIncome, setMonthlyIncome] = useState(
    data.netMonthlyIncome > 0 ? data.netMonthlyIncome : Math.round(data.estimatedAnnualIncome / 12),
  )
  const [monthlyExpenses, setMonthlyExpenses] = useState(data.estimatedMonthlyExpenses)
  const [targetRate, setTargetRate] = useState<number | null>(data.targetSavingsRate)
  const [editing, setEditing] = useState<null | 'income' | 'expenses' | 'target'>(null)
  const [saving, setSaving] = useState(false)

  const projection = useMemo(
    () =>
      recomputeFireFromSettings(
        data.fireInput,
        { monthlyIncome, monthlyExpenses },
        {
          grossReturn: data.grossReturn,
          effectiveSwr: data.effectiveSwr,
          inflationRate: data.inflationRate,
          retirementMethod: data.retirementExpenseMethod,
          retirementCustomAmount: data.retirementCustomAmount,
          budgetingActive: data.budgetingActive,
          yearlyMustExpenses: data.fireInput.yearlyMustExpenses,
          fireStrategy: data.fireStrategy,
        },
      ),
    [data, monthlyIncome, monthlyExpenses],
  )

  const persist = useCallback(
    async (patch: Record<string, number | null>) => {
      setSaving(true)
      try {
        await fetch('/api/parameters', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  return (
    <section className="mt-5 sm:mt-8">
      <div className="mb-4">
        <Kicker>Instellingen &amp; toekomst</Kicker>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {/* Geschat jaarinkomen */}
        <div className="card-editorial p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[var(--ink-3)]">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Geschat jaarinkomen</span>
          </div>
          {editing === 'income' ? (
            <input
              autoFocus
              type="number"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(Number(e.target.value))}
              onBlur={() => { setEditing(null); void persist({ net_monthly_income: monthlyIncome }) }}
              className="w-full border-b border-kern-400 bg-transparent font-mono text-xl tabular-nums outline-none"
            />
          ) : (
            <button type="button" onClick={() => setEditing('income')} className="group flex items-baseline gap-2">
              <span className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                <MaskedAmount value={monthlyIncome * 12} tone="kern" />
              </span>
              <Pencil className="h-3.5 w-3.5 text-[var(--ink-4)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-1 text-[11px] italic text-[var(--ink-4)]">€{monthlyIncome.toLocaleString('nl-NL')}/mnd</p>
        </div>

        {/* Spaarquote + doel */}
        <div className="card-editorial p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[var(--ink-3)]">
            <Target className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Spaarquote</span>
          </div>
          <p className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">{data.savingsRate6m.toFixed(0)}%</p>
          {editing === 'target' ? (
            <input
              autoFocus
              type="number"
              value={targetRate ?? ''}
              onChange={(e) => setTargetRate(e.target.value === '' ? null : Number(e.target.value))}
              onBlur={() => { setEditing(null); void persist({ target_savings_rate: targetRate }) }}
              className="mt-1 w-full border-b border-kern-400 bg-transparent text-sm outline-none"
            />
          ) : (
            <button type="button" onClick={() => setEditing('target')} className="group mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
              <span>doel: {targetRate != null ? `${targetRate}%` : 'instellen'}</span>
              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>

        {/* Geschatte uitgaven */}
        <div className="card-editorial p-4">
          <div className="mb-1 text-[var(--ink-3)]">
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Geschatte uitgaven</span>
          </div>
          {editing === 'expenses' ? (
            <input
              autoFocus
              type="number"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
              onBlur={() => { setEditing(null); void persist({ estimated_monthly_expenses: monthlyExpenses }) }}
              className="w-full border-b border-kern-400 bg-transparent font-mono text-xl tabular-nums outline-none"
            />
          ) : (
            <button type="button" onClick={() => setEditing('expenses')} className="group flex items-baseline gap-2">
              <span className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                <MaskedAmount value={monthlyExpenses} tone="kern" />
              </span>
              <Pencil className="h-3.5 w-3.5 text-[var(--ink-4)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-1 text-[11px] italic text-[var(--ink-4)]">
            {data.budgetingActive ? 'per maand' : 'schatting (geen budgetten)'}
          </p>
        </div>
      </div>

      {/* Live FIRE-impact */}
      <div className="mt-3 flex items-center gap-2 rounded-[var(--r)] border-l-2 border-[var(--module-active-500)] bg-[var(--subtle)]/40 px-3 py-2">
        <span className="text-sm">⚡</span>
        <p className="text-sm text-[var(--ink-2)]">
          Met deze waarden bereik je volledige vrijheid{' '}
          <strong className="font-semibold text-[var(--ink)]">
            {projection.fireAge != null ? `rond je ${projection.fireAge}e (${projection.fireDate})` : projection.fireDate}
          </strong>
          {saving && <span className="ml-2 text-[11px] text-[var(--ink-4)]">opslaan…</span>}
        </p>
      </div>
    </section>
  )
}
```
> Controleer dat `card-editorial`, `Kicker`, `MaskedAmount` en de `--module-active-*` / `kern-*` tokens bestaan (ze worden elders in `cash-overview.tsx` gebruikt — overgenomen patroon).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Verwacht: geen fouten in de twee nieuwe bestanden.

- [ ] **Step 4: Commit**
```bash
git add lib/cashflow-settings-data.ts components/overview/cashflow-instellingen-blok.tsx
git commit -m "feat(cashflow): instellingen-blok loader + component (info + edit + live FIRE)"
```

---

## Task 7: Cashflow-landing — secties onder het inspiratieblok

**Files:**
- Modify: `app/(app)/overzicht/budget/page.tsx`

> De landing is een server component. We voegen onder het inspiratieblok (regel 80-84) de verbrede `CashOverview` toe en het instellingen-blok (met server-geladen data).

- [ ] **Step 1: Voeg imports toe**

Bij de imports bovenaan:
```ts
import { CashOverview } from '@/components/app/cash-overview'
import { loadCashflowSettingsData } from '@/lib/cashflow-settings-data'
import { CashflowInstellingenBlok } from '@/components/overview/cashflow-instellingen-blok'
```

- [ ] **Step 2: Laad de settings-data server-side**

Voeg `loadCashflowSettingsData(supabase)` toe aan de bestaande `Promise.all` (regel 36-40):
```ts
const [dashboardResult, cashflow, vasteLasten, settings] = await Promise.all([
  loadDashboardData(supabase),
  loadCashflowData(supabase, perspective),
  loadVasteLastenSummary(supabase),
  loadCashflowSettingsData(supabase),
])
```

- [ ] **Step 3: Render de twee nieuwe secties onder het inspiratieblok**

Direct ná het `InflationImpactCard`-blok (regel 80-84), vóór de afsluitende `</>`:
```tsx
<section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
  <CashOverview embedded showAllCashAccounts />
</section>

{settings && (
  <section className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-6">
    <CashflowInstellingenBlok data={settings} />
  </section>
)}
```
> `embedded` voorkomt dat rekening-kaarten naar de (nu redirectende) `/core/assets/cash/[id]`-route linken; in embedded-modus opent de detail-modal in-place. `showAllCashAccounts` activeert de asset-gedreven lijst + ankers.

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit`
Verwacht: geen fouten.

- [ ] **Step 5: Handmatige verificatie**

`npm run dev`, ga naar `/overzicht/budget`. Verwacht: onder het inflatie-blok verschijnen Rekeningen (alle cash-rekeningen), de geldstroom-banner + grafiek, en het Instellingen & toekomst-blok. Bewerk het inkomen → de FIRE-zin onderaan herberekent live; herlaad de pagina → de waarde is bewaard.

- [ ] **Step 6: Commit**
```bash
git add app/(app)/overzicht/budget/page.tsx
git commit -m "feat(cashflow): rekeningen + geldstroom + instellingen op de landing"
```

---

## Task 8: Bezittingen — klik naar cashflow + cash-kaarten display-only

**Files:**
- Modify: `components/core/assets-client.tsx`
- Modify: `components/core/vermogen-asset-card.tsx`

- [ ] **Step 1: Cash-klik routeert naar cashflow-focus**

In `components/core/assets-client.tsx`, vervang `handleAssetClick` (regel 530-538):
```ts
function handleAssetClick(asset: Asset) {
  // Cash-rekeningen wonen op de cashflow-pagina: open daar met focus op de
  // gekozen rekening (#rekening-<assetId>). Andere asset-types openen de
  // detail-pane op hun categoriepagina zoals voorheen.
  if (asset.asset_type === 'cash') {
    router.push(`/overzicht/budget#rekening-${asset.id}`)
    return
  }
  router.push(`/core/assets/${asset.asset_type}?asset=${asset.id}`)
}
```

- [ ] **Step 2: Cash-categorie-header linkt naar cashflow**

In hetzelfde bestand, in de category-loop (regel ~808), maak de `href` conditioneel. Vervang:
```tsx
<CategoryGroupHeader
  href={`/core/assets/${type}`}
  label={ASSET_TYPE_LABELS[type]}
  iconName={groupIcon}
  iconColor={groupColor}
  total={group.total}
/>
```
door:
```tsx
<CategoryGroupHeader
  href={type === 'cash' ? '/overzicht/budget' : `/core/assets/${type}`}
  label={ASSET_TYPE_LABELS[type]}
  iconName={groupIcon}
  iconColor={groupColor}
  total={group.total}
/>
```

- [ ] **Step 3: Verberg bewerk/herwaardeer-acties voor cash-kaarten**

In `components/core/vermogen-asset-card.tsx`, de actie-rij (regel 321-348). Wikkel het hele `<div role="group" aria-label={...}>`-blok in een conditie zodat het niet rendert voor cash:
```tsx
{asset.asset_type !== 'cash' && (
  <div
    role="group"
    aria-label={`Acties voor ${asset.name}`}
    className="relative z-10 flex items-center justify-end gap-2 border-t border-[var(--border-md)]/40 px-3 py-2 sm:px-4"
  >
    {/* ... bestaande knoppen ongewijzigd ... */}
  </div>
)}
```
> Cash-kaarten verschijnen na dit plan alleen nog op bezittingen (de categoriepagina redirect weg), dus de conditie op `asset_type` is veilig en zelfverklarend. Bewerken van cash gebeurt op de cashflow-pagina.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Verwacht: geen fouten.

- [ ] **Step 5: Handmatige verificatie**

Ga naar `/overzicht/bezittingen`. Cash-kaarten tonen géén bewerk/herwaardeer-knoppen meer; klik op een cash-kaart → navigeert naar `/overzicht/budget` en scrollt/markeert die rekening. Klik op een niet-cash-kaart (bv. beleggingen) → opent zoals voorheen, mét knoppen.

- [ ] **Step 6: Commit**
```bash
git add components/core/assets-client.tsx components/core/vermogen-asset-card.tsx
git commit -m "feat(bezittingen): cash klikt door naar cashflow, kaarten display-only"
```

---

## Task 9: Redirects — `/core/assets/cash`, per-rekening detail, `/core/cash`

**Files:**
- Modify: `app/(app)/core/assets/[type]/page.tsx`
- Modify: `app/(app)/core/assets/cash/[accountId]/page.tsx`
- Modify: `app/(app)/core/cash/page.tsx`

- [ ] **Step 1: Cash-categorie redirect**

In `app/(app)/core/assets/[type]/page.tsx`, voeg `redirect` toe aan de bestaande `next/navigation`-import (naast `notFound`). Voeg direct ná `const { type } = await params` (regel ~85), vóór de `isValidAssetType`-check, toe:
```ts
if (type === 'cash') redirect('/overzicht/budget')
```

- [ ] **Step 2: Per-rekening detail → cashflow-focus (server-redirect)**

Vervang de volledige inhoud van `app/(app)/core/assets/cash/[accountId]/page.tsx` (was een client-component) door een server-component die accountId (bank_account.id) → linked_asset_id mapt:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * De per-rekening detailpagina is opgegaan in de cashflow-landing. We mappen
 * de bank_account-id naar zijn gekoppelde asset en sturen door naar de focus-
 * weergave op /overzicht/budget. Zonder mapping: gewoon de landing.
 */
export default async function CashAccountRedirect({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('bank_accounts')
    .select('linked_asset_id')
    .eq('id', accountId)
    .maybeSingle()

  if (data?.linked_asset_id) {
    redirect(`/overzicht/budget#rekening-${data.linked_asset_id}`)
  }
  redirect('/overzicht/budget')
}
```

- [ ] **Step 3: `/core/cash` direct naar cashflow**

In `app/(app)/core/cash/page.tsx`, vervang `redirect('/core/assets/cash')` door:
```ts
redirect('/overzicht/budget')
```
(en werk de doc-comment bij naar "…naar /overzicht/budget…").

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Verwacht: geen fouten. (De `[accountId]`-pagina is nu server-side; controleer dat er geen client-only imports achterblijven.)

- [ ] **Step 5: Handmatige verificatie**

Bezoek in de browser: `/core/assets/cash` → belandt op `/overzicht/budget`. Bezoek `/core/cash` → idem. Bezoek `/core/assets/cash/<een-bestaande-bank_account-id>` → belandt op `/overzicht/budget#rekening-<assetId>` met focus.

- [ ] **Step 6: Commit**
```bash
git add "app/(app)/core/assets/[type]/page.tsx" "app/(app)/core/assets/cash/[accountId]/page.tsx" "app/(app)/core/cash/page.tsx"
git commit -m "feat(cashflow): redirect cash-routes naar de cashflow-landing"
```

---

## Task 10: Opruimen — Budgetteren-verdieping op cash verwijderen

**Files:**
- Modify: `components/core/category-deepening-registry.ts`
- Delete: `components/core/deepenings/cash-budgetteren-tab.tsx`

> Budgetbeheer leeft al op `/overzicht/budget`. De cash-Budgetteren-tab is de dubbeling.

- [ ] **Step 1: Verwijder de cash-entry uit `CATEGORY_DEEPENINGS`**

In `components/core/category-deepening-registry.ts`, verwijder het cash-object (regel 104-114, het `{ type: 'cash', kind: 'asset', label: 'Budgetteren', ... }`-blok).

- [ ] **Step 2: Verwijder de cash-component-mapping**

In dezelfde file, in `DEEPENING_COMPONENTS` (rond regel 345), verwijder de regel `cash: CashBudgetterenTab,` uit de `asset:`-map.

- [ ] **Step 3: Verwijder de import**

Verwijder (rond regel 33):
```ts
import { CashBudgetterenTab } from './deepenings/cash-budgetteren-tab'
```

- [ ] **Step 4: Verwijder het tab-bestand**
```bash
git rm components/core/deepenings/cash-budgetteren-tab.tsx
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Verwacht: geen fouten (de tab werd alleen vanuit de registry geïmporteerd — geverifieerd).

- [ ] **Step 6: Commit**
```bash
git add components/core/category-deepening-registry.ts
git commit -m "refactor(cash): verwijder dubbele Budgetteren-verdieping (leeft op /overzicht/budget)"
```

---

## Task 11: Verouderde links bijwerken

**Files:**
- Modify: `components/app/shell/sidebar.tsx`
- Modify: `components/overview/koppel-rekening-banner.tsx`
- Modify: `components/overview/koppel-rekening-banner.test.tsx`
- Modify: `components/dashboard/cards/insight-card.tsx`
- Modify: `components/widgets/huishouden-activiteit-widget.tsx`
- Modify: `components/app/app-setup/configs/budgetteren.config.tsx`
- Modify: `components/app/budgets-client.tsx`

> Alle links naar `/core/assets/cash` werken nog via de redirect, maar we maken ze canoniek om dubbele hops en `?tab=budgetteren` (verwijderd) te vermijden.

- [ ] **Step 1: Sidebar Budgetteren-link**

In `components/app/shell/sidebar.tsx` (regel ~188), vervang `/core/assets/cash?tab=budgetteren` door `/overzicht/budget`.

- [ ] **Step 2: Koppel-rekening-banner**

In `components/overview/koppel-rekening-banner.tsx` (regel ~87), vervang de "manage accounts"-link `/core/assets/cash` door `/overzicht/budget`.
In `components/overview/koppel-rekening-banner.test.tsx` (regel ~42), werk de verwachte href bij naar `/overzicht/budget`.

- [ ] **Step 3: Overige `/core/assets/cash`-links**

Vervang `/core/assets/cash` → `/overzicht/budget` in:
- `components/dashboard/cards/insight-card.tsx` (regel ~32)
- `components/widgets/huishouden-activiteit-widget.tsx` (regel ~136)

Vervang `/core/assets/cash?tab=budgetteren` → `/overzicht/budget` in:
- `components/app/app-setup/configs/budgetteren.config.tsx` (regel ~94)
- `components/app/budgets-client.tsx` (regel ~1177 en ~1231)

- [ ] **Step 4: Type-check + tests**

Run: `npx tsc --noEmit`
Run: `npx vitest run components/overview/koppel-rekening-banner.test.tsx`
Verwacht: geen type-fouten; banner-test groen met de nieuwe href.

- [ ] **Step 5: Commit**
```bash
git add components/app/shell/sidebar.tsx components/overview/koppel-rekening-banner.tsx components/overview/koppel-rekening-banner.test.tsx components/dashboard/cards/insight-card.tsx components/widgets/huishouden-activiteit-widget.tsx components/app/app-setup/configs/budgetteren.config.tsx components/app/budgets-client.tsx
git commit -m "refactor(cash): canonieke cashflow-links i.p.v. /core/assets/cash"
```

---

## Task 12: Volledige verificatie

**Files:** (geen wijzigingen; verificatie + spec-commit)

- [ ] **Step 1: Type-check de hele app**

Run: `npx tsc --noEmit`
Verwacht: schoon (geen nieuwe fouten t.o.v. baseline).

- [ ] **Step 2: Draai de relevante test-suites**

Run:
```bash
npx vitest run lib/cashflow-settings.test.ts lib/cash-rekeningen.test.ts lib/asset-data.test.ts lib/fire-params.test.ts components/overview
```
Verwacht: alle groen.

- [ ] **Step 3: Volledige testrun (regressie)**

Run: `npx vitest run`
Verwacht: geen nieuwe falende tests t.o.v. baseline.

- [ ] **Step 4: Handmatige end-to-end checklist**

`npm run dev`, dan controleer:
1. `/overzicht/bezittingen`: cash-kaarten tonen waarde, géén bewerk-knoppen; klik → `/overzicht/budget#rekening-<id>` met scroll + highlight.
2. `/overzicht/budget`: onder het inflatie-blok staan Rekeningen (alle cash, incl. handmatige), geldstroom + grafiek, en Instellingen & toekomst.
3. Bewerk inkomen/uitgaven → FIRE-zin herberekent live; reload → bewaard.
4. Stel doel-spaarquote in → bewaard na reload.
5. Klik handmatige cash-rekening op cashflow → AssetPane opent (bewerken/herwaarderen).
6. Klik bank-gekoppelde rekening → detail-modal opent.
7. `/core/assets/cash`, `/core/cash`, `/core/assets/cash/<id>` redirecten correct.
8. Sidebar "Budgetteren" → `/overzicht/budget`.
9. Niet-cash asset-types op bezittingen: onveranderd (klik + knoppen intact).

- [ ] **Step 5: Commit de spec + dit plan**
```bash
git add docs/superpowers/specs/2026-06-06-cash-consolidatie-cashflow-design.md docs/superpowers/plans/2026-06-06-cash-consolidatie-cashflow.md
git commit -m "docs(cashflow): spec + implementatieplan cash-consolidatie"
```

---

## Notities & bewuste keuzes

- **Anker-sleutel = `assetId`** overal (bezittingen linkt op `asset.id`; cashflow-kaarten ankeren op `assetId` via `buildCashRekeningen`; de per-rekening redirect mapt `bank_account.id → linked_asset_id`).
- **Geldstroom-aggregatie** (Inkomen/Uitgaven/Saldo/Spaarquote + grafiek) blijft op de budget-tracked rekeningen — ongewijzigd. De verbrede lijst is puur voor weergave/anker/edit.
- **FIRE-blok = persoonlijk perspectief** (via `loadCoreData`), consistent met `/core`. Perspectief-bewuste FIRE is buiten scope.
- **`asset-category-page.tsx` cash-takken** worden dcode-dood (type==='cash' redirect ervoor), maar zijn ongevaarlijk; laten staan tenzij triviaal te verwijderen.
- **`cash-account-view.tsx`** blijft bestaan als embedded detail-modal binnen `CashOverview` (bank-gekoppelde rekeningen). Niet verwijderen.
