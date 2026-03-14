# Cash Rekeningen Navigatie & Totaaloverzicht

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maak individuele cash-rekeningen openbaar vanuit de "Alle rekeningen" modal op /core, met een totaaloverzicht bovenaan en per-rekening navigatie. Bank koppelen verhuist naar individuele rekeningen.

**Architecture:** De bestaande `CashAccountView` component werkt al in twee modi: combined (geen `accountId`) en single (`accountId` meegegeven). We voegen een nieuw "accounts overzicht" sectie toe aan de combined modus: een lijst van alle rekeningen met saldo, klikbaar om naar de individuele view te switchen. De component krijgt een `onNavigateToAccount` callback zodat de parent (core/page.tsx FullScreenModal) de `accountId` kan wisselen zonder de modal te sluiten.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS v4, Supabase client

---

## File Structure

| Bestand | Actie | Verantwoordelijkheid |
|---------|-------|---------------------|
| `components/app/cash-account-view.tsx` | Modify | Accounts overzicht sectie in combined mode, `onNavigateToAccount` callback, bank-koppelen verbergen in combined mode |
| `app/(app)/core/page.tsx` | Modify | activeModal state uitbreiden zodat cash accountId dynamisch gewisseld kan worden |

---

## Chunk 1: Accounts overzicht + navigatie

### Task 1: Voeg `onNavigateToAccount` callback toe aan CashAccountView

De `CashAccountView` heeft al een `accountId` prop. We voegen een optionele callback toe zodat de parent weet wanneer de gebruiker naar een specifieke rekening wil navigeren. Dit is het enige contract tussen parent en child.

**Files:**
- Modify: `components/app/cash-account-view.tsx:85-94` (props interface)

- [ ] **Step 1: Extend de props met `onNavigateToAccount`**

In de props interface (regel 85-94), voeg `onNavigateToAccount` toe:

```tsx
export function CashAccountView({
  accountId,
  backHref = '/core/assets',
  backLabel = 'Assets',
  embedded = false,
  onNavigateToAccount,
}: {
  accountId?: string
  backHref?: string
  backLabel?: string
  embedded?: boolean
  onNavigateToAccount?: (accountId: string | undefined) => void
}) {
```

- [ ] **Step 2: Commit**

```bash
git add components/app/cash-account-view.tsx
git commit -m "feat(cash): add onNavigateToAccount callback prop to CashAccountView"
```

---

### Task 2: Voeg accounts overzicht sectie toe aan combined mode

In de combined mode (`isCombined === true`) voegen we direct na de account header sectie (regel ~986) een nieuw blok toe: een lijst van alle individuele rekeningen met saldo en type, klikbaar om naar die rekening te navigeren.

**Files:**
- Modify: `components/app/cash-account-view.tsx:986` (na account header section, voor action bar)

- [ ] **Step 1: Voeg accounts overzicht toe na de header section**

Zoek het einde van de `{/* Account header */}` section (na regel `</section>` rond regel 986). Voeg daarna een nieuw blok toe, **alleen in combined mode**:

```tsx
      {/* Accounts overview — combined mode only, only when navigation callback is provided */}
      {isCombined && allAccounts.length > 0 && onNavigateToAccount && (
        <section className="mt-3 sm:mt-6" data-testid="accounts-overview">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
            {/* Totaal header */}
            <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-kern-500" />
                <span className="text-sm font-semibold text-[var(--ink-2)]">Rekeningoverzicht</span>
              </div>
              <div className="text-right">
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(Number(account.balance))}
                </span>
                <span className="ml-2 text-xs text-[var(--ink-3)]">totaal</span>
              </div>
            </div>

            {/* Per-account rows */}
            {allAccounts.map((acc, idx) => {
              const typeLabel = ACCOUNT_TYPES.find(t => t.value === acc.account_type)?.label ?? acc.account_type
              return (
                <button
                  key={acc.id}
                  onClick={() => onNavigateToAccount?.(acc.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)] ${
                    idx < allAccounts.length - 1 ? 'border-b border-[var(--border-ed)]' : ''
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50">
                    <Wallet className="h-4 w-4 text-kern-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">{acc.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--ink-3)]">{typeLabel}</span>
                      {acc.iban && (
                        <span className="text-xs text-[var(--ink-4)]">{acc.iban}</span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                    Number(acc.balance) >= 0 ? 'text-[var(--ink)]' : 'text-red-600'
                  }`}>
                    {formatCurrency(Number(acc.balance))}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                </button>
              )
            })}
          </div>
        </section>
      )}
```

**Let op:** `ACCOUNT_TYPES` is al geimporteerd bovenaan het bestand (regel 38): `import { AccountFormModal, ACCOUNT_TYPES, type Account } from '@/components/app/account-form-modal'`. `ChevronRight` is ook al geimporteerd (regel 7). `Wallet` is ook al geimporteerd (regel 8).

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/app/cash-account-view.tsx
git commit -m "feat(cash): add accounts overview section in combined mode"
```

---

### Task 3: Voeg terug-navigatie toe voor embedded single-account mode

Wanneer `CashAccountView` in embedded + single-account mode draait (heeft `accountId` en `embedded === true`), moet er een "Terug naar alle rekeningen" knop zijn die `onNavigateToAccount(undefined)` aanroept om terug te gaan naar de combined view.

**Files:**
- Modify: `components/app/cash-account-view.tsx:892-903` (back button area)

- [ ] **Step 1: Voeg embedded terug-knop toe**

Zoek het `{/* Back button */}` blok (regel ~894). Voeg een extra conditie toe **voor** de bestaande `!embedded` check:

```tsx
      {/* Back to combined — embedded single account */}
      {embedded && !isCombined && onNavigateToAccount && (
        <button
          onClick={() => onNavigateToAccount(undefined)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-sm font-medium text-[var(--ink-2)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Alle rekeningen
        </button>
      )}
```

Dit verschijnt boven de account header wanneer je vanuit de core-page modal een specifieke rekening bekijkt.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/app/cash-account-view.tsx
git commit -m "feat(cash): add back-to-all navigation button in embedded single-account mode"
```

---

### Task 4: Verberg "Bank koppelen" in combined mode

De bank-koppeling (`/core/cash/connect` link en de "Bankverbindingen" sectie) mag alleen zichtbaar zijn in single-account mode. In combined mode verbergen we deze sectie.

**Files:**
- Modify: `components/app/cash-account-view.tsx:1038-1086` (bank connections section)

- [ ] **Step 1: Wrap de bank connections sectie in een `!isCombined` check**

De huidige code op regel ~1039 is:
```tsx
      {gcEnabled && (
        <section className="mt-3 sm:mt-6">
```

Wijzig naar:
```tsx
      {gcEnabled && !isCombined && (
        <section className="mt-3 sm:mt-6">
```

Dit verbergt de volledige bankverbindingen sectie (inclusief ConnectedAccountCard en "Bank koppelen" link) in combined mode. Gebruikers moeten eerst een specifieke rekening openen om bankverbindingen te beheren.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/app/cash-account-view.tsx
git commit -m "feat(cash): hide bank connections section in combined mode"
```

---

### Task 5: Wire up core/page.tsx om accountId dynamisch te wisselen

De `activeModal` state in core/page.tsx is al `{ type, itemId? }`. We moeten een callback meegeven aan `DynCashAllView` zodat klikken op een rekening in het overzicht de `itemId` update zonder de modal te sluiten.

**Files:**
- Modify: `app/(app)/core/page.tsx:1424-1431` (cash FullScreenModal)

- [ ] **Step 1: Voeg `onNavigateToAccount` callback toe aan DynCashAllView**

Zoek het cash modal blok (momenteel):
```tsx
      <FullScreenModal
        open={activeModal?.type === 'cash'}
        onClose={() => setActiveModal(null)}
        title="Cash"
        href="/core/cash"
      >
        <DynCashAllView embedded accountId={activeModal?.type === 'cash' ? activeModal.itemId : undefined} />
      </FullScreenModal>
```

Wijzig naar:
```tsx
      <FullScreenModal
        open={activeModal?.type === 'cash'}
        onClose={() => setActiveModal(null)}
        title="Cash"
        href="/core/cash"
      >
        <DynCashAllView
          key={activeModal?.type === 'cash' ? activeModal.itemId ?? 'combined' : 'combined'}
          embedded
          accountId={activeModal?.type === 'cash' ? activeModal.itemId : undefined}
          onNavigateToAccount={(id) => setActiveModal(id !== undefined ? { type: 'cash', itemId: id } : { type: 'cash' })}
        />
      </FullScreenModal>
```

**Hoe het werkt:**
- User klikt op rekening in overzicht → `onNavigateToAccount('uuid')` → `setActiveModal({ type: 'cash', itemId: 'uuid' })` → CashAccountView her-rendert met die accountId → single-account view
- User klikt "Alle rekeningen" → `onNavigateToAccount(undefined)` → `setActiveModal({ type: 'cash' })` → CashAccountView her-rendert zonder accountId → combined view
- Modal blijft open de hele tijd, alleen de content wisselt
- De `key` prop zorgt voor een volledige remount bij navigatie, zodat scroll positie en interne state (maand, filters, expanded sections) schoon worden gereset

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/(app)/core/page.tsx
git commit -m "feat(core): wire up cash account navigation in mission control modal"
```

---

## Verificatie

Na alle tasks:

1. **Combined view:** Open Cash modal via missie controle kaart → ziet rekeningoverzicht met individuele rekeningen en totaalsaldo bovenaan. Geen "Bank koppelen" sectie zichtbaar.
2. **Navigatie naar rekening:** Klik op een individuele rekening → view wisselt naar single-account met transacties, bankverbindingen, etc. "Terug: Alle rekeningen" knop verschijnt.
3. **Terug navigatie:** Klik "Alle rekeningen" → terug naar combined view met overzicht.
4. **Item click vanuit missie controle:** Klik op een bank-rekening item in de Cash kaart op /core → modal opent direct met die specifieke rekening.
5. **Bank koppelen:** Alleen zichtbaar in single-account mode, niet in combined mode.
6. **Bestaand gedrag intact:** Standalone `/core/cash` pagina werkt nog — geen `onNavigateToAccount` meegegeven, dus het accounts overzicht wordt niet getoond (guard: `onNavigateToAccount &&`).
7. **Scroll reset:** Bij navigatie tussen combined en single-account view reset de scroll positie en interne state dankzij de `key` prop op `DynCashAllView`.
