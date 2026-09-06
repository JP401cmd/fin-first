# Cashflow-pagina verfijningen — Implementatieplan (ronde 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verfijn de cashflow-landing: gelijke breedte voor het rekeningen-deel, de échte bezittingen-kaart mét edit/herwaardeer-acties, fix de verdwijnende gedeelde rekening (perspectief), een simpeler budget-tracked cash-bewerkscherm met rendement-in-prognose, en drie kassabonnen (inkomen/uitgaven/spaarquote) met berekend-vs-handmatig dat overal in de prognose doorwerkt.

**Architecture:** Hergebruik de perspectief-loader (`loadPerspectiveData`) + `VermogenAssetCard` op de cashflow-rekeningenlijst (fixt bug + uniformeert de kaart). Een nieuwe gedeelde resolver `resolveEffectiveIncomeExpenses` vervangt de inline fallback-logica in alle data-loaders zodat handmatige overrides (via `income_source`/`expenses_source`) globaal doorwerken. Een pure interdependentie-helper drijft de drie kassabonnen.

**Tech Stack:** Next.js 16 (server + client), React 19, Supabase, Tailwind v4, Vitest.

---

## Bestandsoverzicht

**Nieuw:**
- `lib/effective-financials.ts` + `lib/effective-financials.test.ts` — `resolveEffectiveIncomeExpenses` (manual-wint / auto-fallback). Pure, getest.
- `lib/cashflow-overrides.ts` + `lib/cashflow-overrides.test.ts` — `recomputeTriple` (interdependentie inkomen/uitgaven/spaarquote). Pure, getest.
- `supabase/migrations/20260606010000_add_income_expense_source.sql` — lokale spiegel.

**Gewijzigd:**
- `app/(app)/overzicht/budget/page.tsx` — width-fix (geen dubbele wrapper).
- `components/core/vermogen-asset-card.tsx` — `hideActions`-prop i.p.v. harde cash-conditie.
- `components/core/assets-client.tsx` — geef `hideActions={type === 'cash'}` mee; (un-force cash `expected_return`).
- `components/app/cash-overview.tsx` — broad mode: `loadPerspectiveData` + `VermogenAssetCard` + ValuationModal; verwijder eigen card-markup.
- `lib/core-data-loader.ts`, `lib/horizon-data-loader.ts`, `lib/dashboard-data-loader.ts` — gebruik de resolver + voeg `income_source,expenses_source` aan profile-select toe.
- `app/api/parameters/route.ts` + `lib/cashflow-settings.ts` + `lib/cashflow-settings-data.ts` — source-velden lezen/schrijven.
- `components/overview/cashflow-instellingen-blok.tsx` — drie kassabonnen + interdependentie + markeringen.
- `components/app/cash-account-view.tsx` — simpeler `AssetEditForm` (naam / bank-koppeling+status / saldo+herwaarderen / verwacht rendement); persisteer `expected_return`.

**Verwijderd (cleanup):**
- `lib/cash-rekeningen.ts` + `lib/cash-rekeningen.test.ts` — onbruikbaar na de CashOverview-rework (VermogenAssetCard rendert direct uit het asset). Alleen verwijderen na grep-bevestiging.

---

## Task 1: Breedte rekeningen-deel gelijktrekken

**Files:** Modify `app/(app)/overzicht/budget/page.tsx`

> CashOverview's eigen root is al `mx-auto max-w-6xl px-4 sm:px-6`; de extra page-sectie eromheen verdubbelt de padding.

- [ ] **Step 1: Verwijder de dubbele wrapper.** Vervang het sectie-blok dat `<CashOverview>` omhult:
```tsx
<section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
  <CashOverview embedded showAllCashAccounts />
</section>
```
door (geen wrapper-section; CashOverview levert zelf de breedte):
```tsx
<CashOverview embedded showAllCashAccounts />
```
Laat de instellingen-sectie eronder ongewijzigd.

- [ ] **Step 2: Verifieer.** Run `npx tsc --noEmit 2>&1 | grep -i "overzicht/cashflow/page"` → leeg. Start `npm run dev`, open `/overzicht/budget`: de Rekeningen + geldstroom lijnen nu links/rechts gelijk met de 4 hefboom-kaarten en het instellingen-blok.

- [ ] **Step 3: Commit**
```bash
git add "app/(app)/overzicht/budget/page.tsx"
git commit -m "fix(cashflow): rekeningen-deel zelfde breedte als boven/onder (geen dubbele wrapper)"
```
(Eindig elke commit-body met: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 2: `hideActions`-prop op VermogenAssetCard

**Files:** Modify `components/core/vermogen-asset-card.tsx`, `components/core/assets-client.tsx`

- [ ] **Step 1: Voeg de prop toe aan de interface.** In `VermogenAssetCardProps` (na `aggregated?: boolean`, ~r.113) voeg toe:
```ts
  /** Verberg de bewerk-/herwaardeer-actierij (bv. cash op bezittingen — beheer loopt via cashflow). */
  hideActions?: boolean
```

- [ ] **Step 2: Destructure de prop.** In de component-signature (~r.118-132), voeg `hideActions = false,` toe na `aggregated = false,`.

- [ ] **Step 3: Vervang de harde cash-conditie door de prop.** Vervang:
```tsx
{asset.asset_type !== 'cash' && (
  <div
    role="group"
    aria-label={`Acties voor ${asset.name}`}
```
door:
```tsx
{!hideActions && (
  <div
    role="group"
    aria-label={`Acties voor ${asset.name}`}
```
(laat de inner buttons + de sluitende `)}` ongewijzigd.)

- [ ] **Step 4: Bezittingen geeft hideActions voor cash.** In `components/core/assets-client.tsx`, in de `<VermogenAssetCard .../>`-aanroep (~r.822-839), voeg een prop toe:
```tsx
    aggregated={asset._aggregated}
    hideActions={type === 'cash'}
```
(`type` is de groep-AssetType in de omliggende `.map((type) => ...)`.)

- [ ] **Step 5: Verifieer.** `npx tsc --noEmit 2>&1 | grep -iE "vermogen-asset-card|assets-client"` → geen nieuwe fouten. Bezittingen-cash-kaarten blijven zonder acties; andere types onveranderd.

- [ ] **Step 6: Commit**
```bash
git add components/core/vermogen-asset-card.tsx components/core/assets-client.tsx
git commit -m "refactor(vermogen-card): hideActions-prop i.p.v. harde cash-conditie"
```

---

## Task 3: CashOverview broad mode — perspectief-loader + VermogenAssetCard

**Files:** Modify `components/app/cash-overview.tsx`

> Fixt de verdwijnende gedeelde rekening (item 3) én toont de échte kaart met acties (item 2). Render `VermogenAssetCard` uit perspectief-gestempelde cash-assets i.p.v. de eigen markup.

- [ ] **Step 1: Imports.** Vervang de round-1 imports
```ts
import { buildCashRekeningen, type CashRekening } from '@/lib/cash-rekeningen'
import { AssetPane } from '@/components/app/core/assets/asset-pane'
import type { Asset } from '@/lib/asset-data'
```
door:
```ts
import { AssetPane } from '@/components/app/core/assets/asset-pane'
import { ValuationModal } from '@/components/core/assets-client'
import { VermogenAssetCard } from '@/components/core/vermogen-asset-card'
import { loadPerspectiveData } from '@/lib/household/perspective-loader'
import type { Asset } from '@/lib/asset-data'
```

- [ ] **Step 2: State.** Vervang de broad-mode state
```ts
const [cashAssets, setCashAssets] = useState<Asset[]>([])
const [allBankAccounts, setAllBankAccounts] = useState<Account[]>([])
const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
```
door:
```ts
// Perspectief-gestempelde cash-assets (eigen + gedeeld, met _provenance/_myShareFraction).
const [cashAssets, setCashAssets] = useState<Array<Asset & { _provenance?: import('@/lib/household-data').Provenance; _myShareFraction?: number; _aggregated?: boolean }>>([])
// Map asset.id -> bank_account.id voor budget-tracked rekeningen (klik-routing + geldstroom).
const [bankByAsset, setBankByAsset] = useState<Record<string, string>>({})
const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
const [revalueAsset, setRevalueAsset] = useState<Asset | null>(null)
```

- [ ] **Step 3: Loader.** Vervang `loadAllCashRekeningen` (r.148-169) door:
```ts
const loadAllCashRekeningen = useCallback(async () => {
  if (!showAllCashAccounts) return
  const supabase = createClient()
  // Perspectief-loader: RLS levert eigen + gedeelde items; gestempeld met
  // _provenance/_myShareFraction. Zelfde bron als de bezittingen-pagina, zodat
  // gedeelde rekeningen ook in het persoonlijke perspectief zichtbaar blijven.
  const pd = await loadPerspectiveData(supabase, perspective)
  const cash = pd.assets.filter(
    (a) => (a as { asset_type?: string }).asset_type === 'cash' && (a as { is_active?: boolean }).is_active !== false,
  )
  setCashAssets(cash as Array<Asset & { _provenance?: import('@/lib/household-data').Provenance; _myShareFraction?: number; _aggregated?: boolean }>)

  // Bank-koppeling voor klik-routing: alleen budget-tracked telt voor de detail-modal.
  const { data: banks } = await supabase
    .from('bank_accounts')
    .select('id, linked_asset_id, linked_asset:assets!bank_accounts_linked_asset_id_fkey(has_budget_tracking)')
    .eq('is_active', true)
  const map: Record<string, string> = {}
  for (const b of (banks ?? []) as Array<{ id: string; linked_asset_id: string | null; linked_asset?: { has_budget_tracking?: boolean | null } | null }>) {
    if (b.linked_asset_id && b.linked_asset?.has_budget_tracking === true) map[b.linked_asset_id] = b.id
  }
  setBankByAsset(map)
}, [showAllCashAccounts, perspective])
```

- [ ] **Step 4: Verwijder de oude memos.** Verwijder de `rekeningen` useMemo (r.351-370) en `rekeningenTotal` (r.372). Voeg in plaats van rekeningenTotal een asset-totaal toe (voor het focus-effect dependency):
```ts
const cashAssetsTotal = useMemo(
  () => cashAssets.reduce((s, a) => s + (Number(a.current_value) || 0), 0),
  [cashAssets],
)
```

- [ ] **Step 5: Hash-focus effect.** Vervang de dependency `rekeningen` door `cashAssets` in het hash-focus `useEffect` (r.377-390):
```ts
}, [showAllCashAccounts, cashAssets])
```
en de guard `if (!showAllCashAccounts || rekeningen.length === 0) return` → `if (!showAllCashAccounts || cashAssets.length === 0) return`.

- [ ] **Step 6: Render VermogenAssetCard.** Vervang het `showAllCashAccounts ? rekeningen.map(...) : accounts.map(...)`-blok (r.689-746 voor de broad tak) door — voor de broad tak — een wrapper + VermogenAssetCard per asset:
```tsx
{showAllCashAccounts
  ? cashAssets.map((a) => (
      <div key={a.id} id={`rekening-${a.id}`} className="scroll-mt-24">
        <VermogenAssetCard
          asset={a as Asset}
          onClick={(asset) => {
            const bankId = bankByAsset[asset.id]
            if (bankId) setDetailAccountId(bankId)
            else setEditingAsset(asset)
          }}
          onEditClick={(asset) => {
            const bankId = bankByAsset[asset.id]
            if (bankId) setDetailAccountId(bankId)
            else setEditingAsset(asset)
          }}
          onRevalueClick={(asset) => setRevalueAsset(asset)}
          perspective={perspective}
          provenance={a._provenance}
          shareFraction={a._myShareFraction}
          aggregated={a._aggregated}
        />
      </div>
    ))
  : accounts.map((acc) => {
      /* bestaande legacy-tak ongewijzigd */
```
(Behoud de legacy `accounts.map`-tak letterlijk. `VermogenAssetCard` toont de "Gezamenlijk"-badge + "Jouw aandeel"-subline automatisch via `provenance`/`shareFraction`. Acties zijn zichtbaar want `hideActions` wordt niet meegegeven.)

- [ ] **Step 7: Render de ValuationModal.** Naast het `{editingAsset && <AssetPane .../>}`-blok (r.1150-1156), voeg toe:
```tsx
{revalueAsset && (
  <ValuationModal
    entityId={revalueAsset.id}
    entityType="asset"
    entityName={revalueAsset.name}
    entitySubtype={revalueAsset.asset_type}
    netWorthInclusionPct={(revalueAsset as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100}
    currentValue={Number(revalueAsset.current_value)}
    onClose={() => setRevalueAsset(null)}
    onSaved={() => { setRevalueAsset(null); void loadAllCashRekeningen() }}
  />
)}
```

- [ ] **Step 8: Type-check + tests.** `npx tsc --noEmit 2>&1 | grep -i "cash-overview"` → leeg. `npx vitest run components/overview` → groen (geen regressie). Note: `loadPerspectiveData` is een server-/client-veilige functie die de browser-Supabase-client accepteert — bevestig dat het importeren in een `'use client'`-component compileert; zo niet, rapporteer NEEDS_CONTEXT.

- [ ] **Step 9: Commit**
```bash
git add components/app/cash-overview.tsx
git commit -m "feat(cashflow): rekeningenlijst via perspectief-loader + VermogenAssetCard (fix gedeelde rekening + acties)"
```

---

## Task 4: Migratie — income_source / expenses_source

**Files:** apply_migration (remote) + Create `supabase/migrations/20260606010000_add_income_expense_source.sql`

- [ ] **Step 1: Pas toe (remote).** MCP `mcp__supabase__apply_migration`, name `add_income_expense_source`, query:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS income_source text NOT NULL DEFAULT 'auto';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expenses_source text NOT NULL DEFAULT 'auto';
```

- [ ] **Step 2: Verifieer.** `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, column_default from information_schema.columns
where table_name='profiles' and column_name in ('income_source','expenses_source');
```
Verwacht: twee `text`-rijen, default `'auto'`.

- [ ] **Step 3: Lokale spiegel.** Maak `supabase/migrations/20260606010000_add_income_expense_source.sql`:
```sql
-- Override-bron voor inkomen/uitgaven op de cashflow-kassabonnen.
-- 'auto' = berekend (transacties, met profiel-fallback); 'manual' = handmatig bedrag wint overal.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS income_source text NOT NULL DEFAULT 'auto';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expenses_source text NOT NULL DEFAULT 'auto';
```

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260606010000_add_income_expense_source.sql
git commit -m "feat(cashflow): income_source/expenses_source kolommen voor handmatige override"
```

---

## Task 5: Pure resolver `resolveEffectiveIncomeExpenses`

**Files:** Create `lib/effective-financials.ts`, `lib/effective-financials.test.ts`

- [ ] **Step 1: Falende test** `lib/effective-financials.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveEffectiveIncomeExpenses } from './effective-financials'

describe('resolveEffectiveIncomeExpenses', () => {
  it('auto: transacties winnen wanneer > 0', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 3000, estimated_monthly_expenses: 2000, income_source: 'auto', expenses_source: 'auto' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 4000, expenses: 2500 })
  })

  it('auto: profiel-fallback wanneer geen transacties', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 3000, estimated_monthly_expenses: 2000, income_source: 'auto', expenses_source: 'auto' },
      0, 0,
    )
    expect(r).toEqual({ income: 3000, expenses: 2000 })
  })

  it('manual: handmatig wint ook met transacties', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 5000, estimated_monthly_expenses: 1500, income_source: 'manual', expenses_source: 'manual' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 5000, expenses: 1500 })
  })

  it('gemengd: inkomen manual, uitgaven auto', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 5000, estimated_monthly_expenses: 1500, income_source: 'manual', expenses_source: 'auto' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 5000, expenses: 2500 })
  })
})
```

- [ ] **Step 2: Run → faalt.** `npx vitest run lib/effective-financials.test.ts` → FAIL (import).

- [ ] **Step 3: Implementeer** `lib/effective-financials.ts`:
```ts
export interface IncomeExpenseSources {
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
  income_source?: string | null
  expenses_source?: string | null
}

/**
 * Bepaalt het effectieve maandinkomen en de maanduitgaven. Een expliciete
 * handmatige bron ('manual') wint altijd over de berekende transactie-waarde;
 * bij 'auto' winnen transacties wanneer aanwezig, anders de profiel-schatting.
 */
export function resolveEffectiveIncomeExpenses(
  profile: IncomeExpenseSources,
  txIncome: number,
  txExpenses: number,
): { income: number; expenses: number } {
  const manualIncome = Number(profile.net_monthly_income ?? 0)
  const manualExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const income = profile.income_source === 'manual' ? manualIncome : (txIncome > 0 ? txIncome : manualIncome)
  const expenses = profile.expenses_source === 'manual' ? manualExpenses : (txExpenses > 0 ? txExpenses : manualExpenses)
  return { income, expenses }
}
```

- [ ] **Step 4: Run → slaagt.** `npx vitest run lib/effective-financials.test.ts` → PASS (4).

- [ ] **Step 5: Commit**
```bash
git add lib/effective-financials.ts lib/effective-financials.test.ts
git commit -m "feat(cashflow): pure resolveEffectiveIncomeExpenses (manual-wint / auto-fallback)"
```

---

## Task 6: Resolver inbedden in de data-loaders

**Files:** Modify `lib/core-data-loader.ts`, `lib/horizon-data-loader.ts`, `lib/dashboard-data-loader.ts`

> Vervang in elk de inline `monthlyX > 0 ? monthlyX : profileX`-logica door de resolver, en voeg de twee source-kolommen aan de profile-select toe zodat overrides globaal doorwerken.

- [ ] **Step 1: core-data-loader.ts.** Voeg de import toe (bovenaan): `import { resolveEffectiveIncomeExpenses } from './effective-financials'`. Vervang r.435-438:
```ts
const profileMonthlyIncome = Number(profileResult.data?.net_monthly_income ?? 0)
const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
const effectiveMonthlyIncome = monthlyIncome > 0 ? monthlyIncome : profileMonthlyIncome
const effectiveMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : profileMonthlyExpenses
```
door:
```ts
const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
  resolveEffectiveIncomeExpenses(profileResult.data ?? {}, monthlyIncome, monthlyExpenses)
```
Voeg `income_source, expenses_source` toe aan de profiles-select (r.404), aan het eind van de kolomlijst.

- [ ] **Step 2: horizon-data-loader.ts.** Import toevoegen. Vervang r.334-337 analoog (bron-object `profile`):
```ts
const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
  resolveEffectiveIncomeExpenses(profile ?? {}, monthlyIncome, monthlyExpenses)
```
Voeg `income_source, expenses_source` toe aan de profiles-select (r.237).

- [ ] **Step 3: dashboard-data-loader.ts.** Import toevoegen. Vervang r.226-229 analoog (bron `profileResult.data`). Voeg `income_source, expenses_source` toe aan de profiles-select (r.169).

- [ ] **Step 4: Verifieer.** `npx tsc --noEmit 2>&1 | grep -iE "core-data-loader|horizon-data-loader|dashboard-data-loader|effective-financials"` → geen nieuwe fouten. `npx vitest run` voor de relevante suites blijft groen (geen `profileMonthlyIncome`/`profileMonthlyExpenses` referenties achtergebleven — verwijder ongebruikte locals als tsc daarover klaagt).

- [ ] **Step 5: Commit**
```bash
git add lib/core-data-loader.ts lib/horizon-data-loader.ts lib/dashboard-data-loader.ts
git commit -m "refactor(financials): centrale income/expenses-resolver met override-doorwerking"
```

---

## Task 7: API + sanitize + settings-data — source-velden

**Files:** Modify `lib/cashflow-settings.ts`, `app/api/parameters/route.ts`, `lib/cashflow-settings-data.ts`

- [ ] **Step 1: Sanitize uitbreiden.** In `lib/cashflow-settings.ts`, voeg aan `SanitizedCashSettings` toe: `income_source?: string` en `expenses_source?: string`. In `sanitizeCashSettingsInput`, vóór `return out`, voeg toe:
```ts
for (const key of ['income_source', 'expenses_source'] as const) {
  if (body[key] !== undefined) {
    const v = String(body[key])
    if (v === 'auto' || v === 'manual') out[key] = v
  }
}
```

- [ ] **Step 2: API GET.** In `app/api/parameters/route.ts` GET-select (r.19) voeg `, income_source, expenses_source` toe aan de kolomlijst; voeg aan het GET-response-object toe:
```ts
income_source: data?.income_source ?? 'auto',
expenses_source: data?.expenses_source ?? 'auto',
```
(De PUT schrijft ze al mee via `Object.assign(updateData, sanitizeCashSettingsInput(body))`.)

- [ ] **Step 3: settings-data.** In `lib/cashflow-settings-data.ts` profile-select (r.45-47) voeg `, income_source, expenses_source` toe. Voeg aan `CashflowSettingsData` toe: `incomeSource: 'auto' | 'manual'`, `expensesSource: 'auto' | 'manual'`, en `computedMonthlyExpenses: number` (de transactie-berekende uitgaven, los van de opgeslagen handmatige `estimatedMonthlyExpenses`). In de return:
```ts
incomeSource: (profile?.income_source as 'auto' | 'manual') ?? 'auto',
expensesSource: (profile?.expenses_source as 'auto' | 'manual') ?? 'auto',
computedMonthlyExpenses: rf.monthlyExpenses,
```
Belangrijk onderscheid (om de "berekend"-waarde correct te tonen):
- `estimatedAnnualIncome` (= `rf.extrapolatedIncome`, 12-mnd) → BEREKEND inkomen. `netMonthlyIncome` (= `profile.net_monthly_income`) → opgeslagen HANDMATIG inkomen.
- `computedMonthlyExpenses` (= `rf.monthlyExpenses`, transactie-som) → BEREKENDE uitgaven. `estimatedMonthlyExpenses` (= `profile.estimated_monthly_expenses`) → opgeslagen HANDMATIGE uitgaven.
- `savingsRate6m` → BEREKENDE spaarquote (bestaat al).

- [ ] **Step 4: Verifieer.** `npx tsc --noEmit 2>&1 | grep -iE "cashflow-settings|api/parameters"` → leeg. `npx vitest run lib/cashflow-settings.test.ts` → groen (bestaande tests blijven kloppen; de nieuwe source-velden breken de bestaande asserties niet — controleer de `toEqual` in de eerste test, die mag de nieuwe optionele velden niet onverwacht bevatten omdat de testinput ze niet meegeeft).

- [ ] **Step 5: Commit**
```bash
git add lib/cashflow-settings.ts app/api/parameters/route.ts lib/cashflow-settings-data.ts
git commit -m "feat(cashflow): income_source/expenses_source via parameters-API + settings-data"
```

---

## Task 8: Pure interdependentie-helper `recomputeTriple`

**Files:** Create `lib/cashflow-overrides.ts`, `lib/cashflow-overrides.test.ts`

- [ ] **Step 1: Falende test** `lib/cashflow-overrides.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { recomputeTriple } from './cashflow-overrides'

describe('recomputeTriple', () => {
  it('bewerk uitgaven → spaarquote herberekent (inkomen anker)', () => {
    const r = recomputeTriple({ monthlyIncome: 4000, monthlyExpenses: 3000, savingsRate: 0 }, 'expenses', 'expenses')
    expect(r.next.savingsRate).toBeCloseTo(25)
    expect(r.next.monthlyExpenses).toBe(3000)
    expect(r.lastEdited).toBe('expenses')
  })

  it('bewerk spaarquote → uitgaven herberekent', () => {
    const r = recomputeTriple({ monthlyIncome: 4000, monthlyExpenses: 0, savingsRate: 25 }, 'savingsRate', 'expenses')
    expect(r.next.monthlyExpenses).toBe(3000)
    expect(r.lastEdited).toBe('savingsRate')
  })

  it('bewerk inkomen met lastEdited=savingsRate → uitgaven volgt het % mee', () => {
    const r = recomputeTriple({ monthlyIncome: 8000, monthlyExpenses: 3000, savingsRate: 25 }, 'income', 'savingsRate')
    expect(r.next.monthlyExpenses).toBe(6000) // 8000 × (1−0.25)
    expect(r.next.savingsRate).toBe(25)
  })

  it('bewerk inkomen met lastEdited=expenses → spaarquote herberekent', () => {
    const r = recomputeTriple({ monthlyIncome: 5000, monthlyExpenses: 3000, savingsRate: 0 }, 'income', 'expenses')
    expect(r.next.savingsRate).toBeCloseTo(40)
    expect(r.next.monthlyExpenses).toBe(3000)
  })
})
```

- [ ] **Step 2: Run → faalt.** `npx vitest run lib/cashflow-overrides.test.ts` → FAIL.

- [ ] **Step 3: Implementeer** `lib/cashflow-overrides.ts`:
```ts
export type LastEdited = 'expenses' | 'savingsRate'

export interface Triple {
  monthlyIncome: number
  monthlyExpenses: number
  savingsRate: number // procent
}

/**
 * Optie C: inkomen is anker; uitgaven ⇄ spaarquote zijn duaal gegeven inkomen.
 * `current` bevat de zojuist-bewerkte waarde in `edited`; deze functie herberekent
 * de afhankelijke. Bij bewerken van inkomen blijft de laatst-bewerkte van
 * {uitgaven, spaarquote} leidend en herberekent de ander.
 */
export function recomputeTriple(
  current: Triple,
  edited: 'income' | 'expenses' | 'savingsRate',
  lastEdited: LastEdited,
): { next: Triple; lastEdited: LastEdited } {
  const I = current.monthlyIncome
  const rateFromExpenses = () => (I > 0 ? ((I - current.monthlyExpenses) / I) * 100 : 0)
  const expensesFromRate = () => I * (1 - current.savingsRate / 100)

  if (edited === 'expenses') {
    return { next: { ...current, savingsRate: rateFromExpenses() }, lastEdited: 'expenses' }
  }
  if (edited === 'savingsRate') {
    return { next: { ...current, monthlyExpenses: expensesFromRate() }, lastEdited: 'savingsRate' }
  }
  // edited === 'income'
  if (lastEdited === 'savingsRate') {
    return { next: { ...current, monthlyExpenses: expensesFromRate() }, lastEdited }
  }
  return { next: { ...current, savingsRate: rateFromExpenses() }, lastEdited }
}
```

- [ ] **Step 4: Run → slaagt.** `npx vitest run lib/cashflow-overrides.test.ts` → PASS (4).

- [ ] **Step 5: Commit**
```bash
git add lib/cashflow-overrides.ts lib/cashflow-overrides.test.ts
git commit -m "feat(cashflow): pure interdependentie-helper inkomen/uitgaven/spaarquote"
```

---

## Task 9: Kassabonnen + rework CashflowInstellingenBlok

**Files:** Modify `components/overview/cashflow-instellingen-blok.tsx`

> Vervang de drie inline-edit-kaartjes door drie klikbare kaarten die elk een kassabon-BottomSheet openen met berekend-vs-handmatig. State via `recomputeTriple`; markering berekend/handmatig per kaart; live FIRE-banner blijft.

- [ ] **Step 1: Schrijf de component.** Vervang de hele component-body. Belangrijkste structuur (volledige implementatie):
```tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import { TrendingUp, Target, ShoppingCart, Check, PencilLine } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { recomputeFireFromSettings } from '@/lib/cashflow-settings'
import { recomputeTriple, type LastEdited } from '@/lib/cashflow-overrides'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

type Sheet = null | 'income' | 'expenses' | 'savings'

export function CashflowInstellingenBlok({ data }: { data: CashflowSettingsData }) {
  // Berekende referentiewaarden (per maand) — los van de opgeslagen handmatige waarden.
  const computedIncome = Math.round(data.estimatedAnnualIncome / 12)
  const computedExpenses = data.computedMonthlyExpenses // transactie-berekend (NIET de manual estimatedMonthlyExpenses)
  const computedRate = data.savingsRate6m

  const [triple, setTriple] = useState({
    monthlyIncome: data.incomeSource === 'manual' && data.netMonthlyIncome > 0 ? data.netMonthlyIncome : computedIncome,
    monthlyExpenses: data.expensesSource === 'manual' ? data.estimatedMonthlyExpenses : computedExpenses,
    savingsRate: computedRate,
  })
  const [lastEdited, setLastEdited] = useState<LastEdited>('expenses')
  const [incomeManual, setIncomeManual] = useState(data.incomeSource === 'manual')
  const [expensesManual, setExpensesManual] = useState(data.expensesSource === 'manual')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [saving, setSaving] = useState(false)

  const persist = useCallback(async (patch: Record<string, number | string | null>) => {
    setSaving(true)
    try {
      await fetch('/api/parameters', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
    } finally { setSaving(false) }
  }, [])

  // Bewerk een veld + herbereken de afhankelijke; markeer bron handmatig.
  const editField = (field: 'income' | 'expenses' | 'savingsRate', value: number) => {
    const base = { ...triple }
    if (field === 'income') base.monthlyIncome = value
    if (field === 'expenses') base.monthlyExpenses = value
    if (field === 'savingsRate') base.savingsRate = value
    const { next, lastEdited: le } = recomputeTriple(base, field, lastEdited)
    setTriple(next); setLastEdited(le)
    if (field === 'income') { setIncomeManual(true); void persist({ net_monthly_income: Math.round(next.monthlyIncome), income_source: 'manual' }) }
    if (field === 'expenses' || field === 'savingsRate') { setExpensesManual(true); void persist({ estimated_monthly_expenses: Math.round(next.monthlyExpenses), expenses_source: 'manual' }) }
  }

  const useComputed = (field: 'income' | 'expenses') => {
    if (field === 'income') {
      const next = recomputeTriple({ ...triple, monthlyIncome: computedIncome }, 'income', lastEdited)
      setTriple(next.next); setIncomeManual(false); void persist({ income_source: 'auto' })
    } else {
      const { next } = recomputeTriple({ ...triple, monthlyExpenses: computedExpenses }, 'expenses', lastEdited)
      setTriple(next); setExpensesManual(false); void persist({ expenses_source: 'auto' })
    }
  }

  const projection = useMemo(() => recomputeFireFromSettings(
    data.fireInput,
    { monthlyIncome: triple.monthlyIncome, monthlyExpenses: triple.monthlyExpenses },
    {
      grossReturn: data.grossReturn, effectiveSwr: data.effectiveSwr, inflationRate: data.inflationRate,
      retirementMethod: data.retirementExpenseMethod, retirementCustomAmount: data.retirementCustomAmount,
      budgetingActive: data.budgetingActive, yearlyMustExpenses: data.fireInput.yearlyMustExpenses,
      fireStrategy: data.fireStrategy,
    },
  ), [data, triple])

  return (
    <section className="mt-5 sm:mt-8">
      <div className="mb-4"><Kicker>Instellingen &amp; toekomst</Kicker></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <SettingCard icon={<TrendingUp className="h-4 w-4" />} label="Geschat jaarinkomen"
          value={<MaskedAmount value={triple.monthlyIncome * 12} tone="kern" />} manual={incomeManual}
          sub={`€${Math.round(triple.monthlyIncome).toLocaleString('nl-NL')}/mnd`} onClick={() => setSheet('income')} />
        <SettingCard icon={<Target className="h-4 w-4" />} label="Spaarquote"
          value={`${Math.round(triple.savingsRate)}%`} manual={expensesManual}
          sub={data.budgetingActive ? '6-mnd gemiddelde' : 'schatting'} onClick={() => setSheet('savings')} />
        <SettingCard icon={<ShoppingCart className="h-4 w-4" />} label="Geschatte uitgaven"
          value={<MaskedAmount value={triple.monthlyExpenses} tone="kern" />} manual={expensesManual}
          sub="per maand" onClick={() => setSheet('expenses')} />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[var(--r)] border-l-2 border-[var(--module-active-500)] bg-[var(--subtle)]/40 px-3 py-2">
        <span className="text-sm">&#x26A1;</span>
        <p className="text-sm text-[var(--ink-2)]">
          Met deze waarden bereik je volledige vrijheid{' '}
          <strong className="font-semibold text-[var(--ink)]">
            {projection.fireAge != null ? `rond je ${Math.round(projection.fireAge)}e (${projection.fireDate})` : projection.fireDate}
          </strong>
          {saving && <span className="ml-2 text-[11px] text-[var(--ink-4)]">opslaan…</span>}
        </p>
      </div>

      {/* Inkomen-kassabon */}
      <BottomSheet open={sheet === 'income'} onClose={() => setSheet(null)} title="Geschat jaarinkomen">
        <div className="p-4 space-y-3">
          <KassabonShell>
            <div className="flex items-center justify-between"><span>Berekend (12 mnd)</span>
              <span className="font-bold tabular-nums">{<MaskedAmount value={data.estimatedAnnualIncome} tone="kern" />}</span></div>
            <p className="mt-1 text-[10px] text-[var(--ink-4)]">≈ €{computedIncome.toLocaleString('nl-NL')}/mnd</p>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (€${computedIncome.toLocaleString('nl-NL')}/mnd)`}
            isManual={incomeManual} onUseComputed={() => useComputed('income')}
            manualValue={Math.round(triple.monthlyIncome)} onManual={(v) => editField('income', v)} unit="€/mnd" />
        </div>
      </BottomSheet>

      {/* Uitgaven-kassabon */}
      <BottomSheet open={sheet === 'expenses'} onClose={() => setSheet(null)} title="Geschatte uitgaven">
        <div className="p-4 space-y-3">
          <KassabonShell>
            <div className="flex items-center justify-between"><span>Berekend</span>
              <span className="font-bold tabular-nums">{<MaskedAmount value={computedExpenses} tone="kern" />}</span></div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (€${Math.round(computedExpenses).toLocaleString('nl-NL')}/mnd)`}
            isManual={expensesManual} onUseComputed={() => useComputed('expenses')}
            manualValue={Math.round(triple.monthlyExpenses)} onManual={(v) => editField('expenses', v)} unit="€/mnd" />
        </div>
      </BottomSheet>

      {/* Spaarquote-kassabon */}
      <BottomSheet open={sheet === 'savings'} onClose={() => setSheet(null)} title="Spaarquote">
        <div className="p-4 space-y-3">
          <KassabonShell>
            <div className="flex items-center justify-between"><span>Inkomen</span><span className="tabular-nums">{<MaskedAmount value={triple.monthlyIncome} tone="kern" />}</span></div>
            <div className="flex items-center justify-between"><span>Uitgaven</span><span className="tabular-nums">−{<MaskedAmount value={triple.monthlyExpenses} tone="kern" />}</span></div>
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-2 font-bold">
              <span>Spaarquote</span><span className="tabular-nums">{Math.round(triple.savingsRate)}%</span></div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (${Math.round(computedRate)}%)`}
            isManual={expensesManual} onUseComputed={() => useComputed('expenses')}
            manualValue={Math.round(triple.savingsRate)} onManual={(v) => editField('savingsRate', v)} unit="%" />
          <p className="text-[11px] text-[var(--ink-4)]">Een handmatige spaarquote past je geschatte uitgaven aan (inkomen blijft gelijk).</p>
        </div>
      </BottomSheet>
    </section>
  )
}

function SettingCard({ icon, label, value, sub, manual, onClick }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; manual: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="card-editorial p-4 text-left transition-all hover:shadow-[var(--s1)]">
      <div className="mb-1 flex items-center gap-1.5 text-[var(--ink-3)]">
        {icon}<span className="text-xs font-semibold uppercase tracking-[0.08em]">{label}</span>
        {manual && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--module-active-100)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--module-active-700)]"><PencilLine className="h-2.5 w-2.5" />handmatig</span>}
      </div>
      <p className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[11px] italic text-[var(--ink-4)]">{sub}</p>
    </button>
  )
}

function ChoiceRow({ computedLabel, isManual, onUseComputed, manualValue, onManual, unit }: {
  computedLabel: string; isManual: boolean; onUseComputed: () => void; manualValue: number; onManual: (v: number) => void; unit: string
}) {
  const [draft, setDraft] = useState(String(manualValue))
  return (
    <div className="space-y-2">
      <button type="button" onClick={onUseComputed}
        className={`flex w-full items-center gap-2 rounded-[var(--r)] border px-3 py-2 text-sm ${!isManual ? 'border-kern-400 bg-kern-50 text-[var(--ink)]' : 'border-[var(--border-md)] text-[var(--ink-2)]'}`}>
        {!isManual && <Check className="h-4 w-4 text-kern-600" />}{computedLabel}
      </button>
      <div className={`flex items-center gap-2 rounded-[var(--r)] border px-3 py-2 ${isManual ? 'border-kern-400 bg-kern-50' : 'border-[var(--border-md)]'}`}>
        <span className="text-sm text-[var(--ink-2)]">Eigen {unit === '%' ? 'percentage' : 'bedrag'}</span>
        <input type="number" value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const n = Number(draft); if (Number.isFinite(n)) onManual(n) }}
          className="ml-auto w-28 border-b border-kern-400 bg-transparent text-right font-mono tabular-nums outline-none" />
        <span className="text-xs text-[var(--ink-3)]">{unit}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check.** `npx tsc --noEmit 2>&1 | grep -i "cashflow-instellingen-blok"` → leeg. Bevestig dat `BottomSheet` de props `open`/`onClose`/`title` accepteert (zoals in cash-overview.tsx) en `Kicker`/`MaskedAmount`/`KassabonShell` zoals eerder. Pas import/props aan indien afwijkend.

- [ ] **Step 3: Handmatige check.** `/overzicht/budget`: drie kaarten openen elk een kassabon; "gebruik berekend"/"eigen bedrag" wisselt de bron; de "handmatig"-badge verschijnt op de kaart; bewerk uitgaven → spaarquote verandert (en omgekeerd); de FIRE-zin herberekent; herlaad → keuze bewaard; check dat Horizon/dashboard dezelfde override gebruiken.

- [ ] **Step 4: Commit**
```bash
git add components/overview/cashflow-instellingen-blok.tsx
git commit -m "feat(cashflow): kassabonnen voor inkomen/uitgaven/spaarquote met berekend-vs-handmatig"
```

---

## Task 10: Simpeler budget-tracked cash-bewerkscherm + rendement

**Files:** Modify `components/app/cash-account-view.tsx`

> Versimpel `AssetEditForm` tot: naam · bank-koppeling/status · saldo + herwaarderen · verwacht rendement. Persisteer `expected_return`.

- [ ] **Step 1: Imports.** Voeg toe (bovenaan): `import { ValuationModal } from '@/components/core/assets-client'`. (SyncStatusBadge/ConnectedAccountCard zijn al aanwezig voor de bank-status; hergebruik die.)

- [ ] **Step 2: Breid `linkedAsset`-shape + load uit met `expected_return`.** Waar `linkedAsset` wordt geladen (`loadLinkedAsset`), voeg `expected_return` toe aan de select en aan het state-type (`{ id; name; current_value; institution; account_number; subtype; net_worth_inclusion_pct; expected_return }`).

- [ ] **Step 3: Vereenvoudig `AssetEditForm`.** Vervang de props + body zodat het toont: naam (tekst), bank-sectie (indien gekoppeld: bestaande `ConnectedAccountCard`/SyncStatusBadge + ontkoppelen; anders een "Koppel een bank"-link naar `/core/cash/connect`), saldo (read-only weergave) + een "Herwaardeer"-knop die `ValuationModal` opent, en een input "Verwacht rendement (% p.j.)". Verwijder de IBAN/banknaam/type/net-worth-velden uit het formulier (IBAN/banknaam read-only tonen indien aanwezig). `onSave` levert `{ name, expected_return }` (saldo loopt via ValuationModal, niet via dit formulier).

- [ ] **Step 4: Pas `handleSaveAsset` aan.** Schrijf alleen `name` + `expected_return` naar `assets` (en `name` naar `bank_accounts`); laat saldo-updates via de ValuationModal/sync lopen:
```ts
await supabase.from('assets').update({ name: formData.name, expected_return: formData.expected_return }).eq('id', linkedAsset.id)
await supabase.from('bank_accounts').update({ name: formData.name }).eq('id', account.id)
```
Behoud `handleDisconnectTracking` ongewijzigd.

- [ ] **Step 5: Render de ValuationModal** in deze view (state `showRevalue`), getriggerd door de "Herwaardeer"-knop, met `entityType="asset"`, `entityId={linkedAsset.id}`, `currentValue={linkedAsset.current_value}`, `onSaved` → `loadAccount()` + `loadLinkedAsset()`.

- [ ] **Step 6: Verifieer.** `npx tsc --noEmit 2>&1 | grep -i "cash-account-view"` → leeg. Handmatig: open een budget-tracked rekening → "Rekening bewerken" toont alleen de vier secties; rendement opslaan persisteert; herwaarderen werkt.

- [ ] **Step 7: Commit**
```bash
git add components/app/cash-account-view.tsx
git commit -m "feat(cashflow): vereenvoudigd cash-bewerkscherm (bank/saldo/herwaarderen/rendement)"
```

---

## Task 11: Cash mag een rendement dragen (un-force expected_return)

**Files:** Modify `components/core/assets-client.tsx`

- [ ] **Step 1: Vervang de forcering.** In de `AssetForm` save-payload (r.2818), vervang:
```ts
expected_return: isCashType ? 0 : (depreciationRate && Number(depreciationRate) > 0 ? 0 : Number(expectedReturn) || 0),
```
door:
```ts
expected_return: (depreciationRate && Number(depreciationRate) > 0 ? 0 : Number(expectedReturn) || 0),
```
(Cash krijgt nu het ingevoerde rendement; default voor cash-subtypes blijft laag via `TYPICAL_RETURNS`.)

- [ ] **Step 2: Verifieer.** `npx tsc --noEmit 2>&1 | grep -i "assets-client"` → geen nieuwe fouten. Een cash-asset bewaart nu een niet-nul rendement; `projectPortfolio` neemt het mee in de FIRE/lange-termijn-projectie.

- [ ] **Step 3: Commit**
```bash
git add components/core/assets-client.tsx
git commit -m "feat(assets): cash mag verwacht rendement dragen (telt mee in prognose)"
```

---

## Task 12: Cleanup — verwijder ongebruikte buildCashRekeningen

**Files:** Delete `lib/cash-rekeningen.ts`, `lib/cash-rekeningen.test.ts`

- [ ] **Step 1: Bevestig ongebruikt.** `grep -rn "cash-rekeningen\|buildCashRekeningen" --include=*.ts --include=*.tsx .` → na Task 3 mag er GEEN functionele import meer zijn (alleen evt. de eigen bestanden). Als er nog een import is, STOP en rapporteer.

- [ ] **Step 2: Verwijder.**
```bash
git rm lib/cash-rekeningen.ts lib/cash-rekeningen.test.ts
```

- [ ] **Step 3: Verifieer.** `npx tsc --noEmit 2>&1 | grep -i "cash-rekeningen"` → leeg.

- [ ] **Step 4: Commit**
```bash
git commit -m "chore(cashflow): verwijder ongebruikte buildCashRekeningen na VermogenAssetCard-rework"
```

---

## Task 13: Volledige verificatie

- [ ] **Step 1: Type-check.** `npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l` → 142 (de pre-existing household-WIP baseline). `npx tsc --noEmit 2>&1 | grep -iE "cash|cashflow|parameters|effective-financials|vermogen|perspective|instellingen"` → geen NIEUWE fouten in cash-werk-bestanden.

- [ ] **Step 2: Tests.** `npx vitest run lib/effective-financials.test.ts lib/cashflow-overrides.test.ts lib/cashflow-settings.test.ts` → groen. Voor de volle suite: `npx vitest run 2>&1 | grep -E "FAIL" | grep -v "worktrees"` → enkel evt. de bekende load-flaky perf-test (verifieer los: `npx vitest run --exclude "**/.claude/**" --exclude "**/.worktrees/**" test/unified-projection-parity.test.ts`).

- [ ] **Step 3: Handmatige E2E-checklist.** (a) cashflow rekeningen-deel zelfde breedte; (b) gedeelde rekening zichtbaar in persoonlijk perspectief mét "Jouw aandeel"; (c) VermogenAssetCard met edit+herwaarderen op cashflow, display-only op bezittingen; (d) klik budget-tracked → detail-modal, handmatig → AssetPane, ⟳ → ValuationModal; (e) simpel bewerkscherm; (f) cash-rendement zichtbaar in FIRE; (g) drie kassabonnen met berekend/handmatig + "handmatig"-markering, override werkt door in Horizon/dashboard.

- [ ] **Step 4: Commit spec + plan.**
```bash
git add docs/superpowers/specs/2026-06-06-cashflow-verfijningen-design.md docs/superpowers/plans/2026-06-06-cashflow-verfijningen.md
git commit -m "docs(cashflow): spec + plan ronde-2 verfijningen"
```

---

## Notities & bewuste keuzes
- **Override-doorwerking (globaal):** de gedeelde resolver in Task 5/6 zorgt dat een handmatige keuze (`*_source='manual'`) overal in de prognose wint. "Gebruik berekend" zet de bron terug op `'auto'`.
- **Spaarquote-opslag:** geen eigen kolom; een handmatige spaarquote vertaalt naar `estimated_monthly_expenses` (= inkomen×(1−%)) met `expenses_source='manual'`. `target_savings_rate` (doel) blijft het losse veld uit ronde 1.
- **Rendement in prognose:** loopt via `projectPortfolio`/FIRE (lange termijn), niet via de 6-mnd lineaire cashflow-forecast (bewust ongewijzigd).
- **`loadPerspectiveData` in een client-component:** het wordt al client-side gebruikt door `assets-client.tsx`; daarom veilig in `cash-overview.tsx`. Mocht een server-only import meekomen, val terug op de RPC-aanpak die assets-client gebruikt.
