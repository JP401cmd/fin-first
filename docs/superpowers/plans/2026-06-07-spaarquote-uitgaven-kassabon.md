# Spaarquote-herziening + uitgaven-berekening — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toon op de cashflow-pagina de canonieke 6-maands spaarquote (`savingsRate6m`, zelfde getal als de rest van de app) mét gecorrigeerde breakdown in de kassabon (blijft instelbaar), en voeg een 6-maands breakdown toe aan de geschatte-uitgaven-kassabon.

**Architecture:** Surface vier al-berekende 6-maands velden uit `core-data-loader` via `CashflowSettingsData`; pas dan `cashflow-instellingen-blok.tsx` aan: de "berekend"-referentie + kaartweergave + kassabon-uitkomst van de spaarquote worden `savingsRate6m`, de spaarquote-bon krijgt +sparen/+aflossing-regels, en de uitgaven-bon krijgt een per-maand breakdown. De editbare "eigen %"-lever blijft ongewijzigd.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4.

**Omgeving:** Een gelijktijdig auto-commit-proces draait op deze branch. Commit elke taak met een **expliciete pathspec** (`git commit -m "..." -- <file>`); geen `git reset`/`git add -A`/history-surgery.

---

## Bestandsoverzicht
- **Modify** `lib/cashflow-settings-data.ts` — 4 velden op `CashflowSettingsData` + return.
- **Modify** `components/overview/cashflow-instellingen-blok.tsx` — spaarquote-revisie + uitgaven-breakdown.

---

## Task 1: Surface 6-maands correctie-velden op CashflowSettingsData

**Files:** Modify `lib/cashflow-settings-data.ts`

Deze velden zijn al berekend op `CorePageData` (`core.savingsBudgetTotal6m`, `core.debtAflossingTotal6m`). We geven ze door. De per-maand-rijen + Σ in de bon komen uit de bestaande `monthlyBreakdown` (component-`sixMonth`-memo), dus een aparte 6m-inkomen/uitgaven hoeft NIET gesurfacet te worden.

- [ ] **Step 1: Breid de `CashflowSettingsData`-interface uit.** Voeg na `computedMonthlyExpenses: number` (in de interface, ~regel 25) toe:
```ts
  /** 6-maands spaarbudget-stortingen (correctie-component van savingsRate6m). */
  savingsBudgetTotal6m: number
  /** 6-maands schuldaflossing (correctie-component van savingsRate6m). */
  debtAflossingTotal6m: number
```

- [ ] **Step 2: Vul ze in het return-object.** Voeg na `monthlyBreakdown: core.monthlyIncomeExpenseSeries,` (~regel 114) toe:
```ts
    savingsBudgetTotal6m: core.savingsBudgetTotal6m,
    debtAflossingTotal6m: core.debtAflossingTotal6m,
```

- [ ] **Step 3: Type-check.** `npx tsc --noEmit 2>&1 | grep -i "cashflow-settings-data"` → EMPTY. (Repo heeft een bestaande baseline aan fouten elders — negeer die.) Bevestig dat `core.savingsBudgetTotal6m` en `core.debtAflossingTotal6m` op het `CorePageData`-type bestaan (regels 74/75 van `lib/core-data-loader.ts`). Pas de bron-namen aan als ze afwijken.

- [ ] **Step 4: Commit (pathspec)**
```
git commit -m "feat(cashflow): surface 6-maands spaarquote-componenten op CashflowSettingsData" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- lib/cashflow-settings-data.ts
```
Daarna `git show --stat HEAD --oneline | head` → alleen dit bestand.

---

## Task 2: Spaarquote = savingsRate6m (gecorrigeerde bon, blijft instelbaar) + uitgaven-breakdown

**Files:** Modify `components/overview/cashflow-instellingen-blok.tsx`

> READ het bestand eerst; regelnummers zijn indicatief en het bestand is recent gewijzigd.

- [ ] **Step 1: Splits de rauwe rate (voor de triple) van de getoonde rate.** Vervang de `computedRate`-declaratie (~regel 18-21):
```ts
  // Spaarquote = afgeleid van het getoonde inkomen − uitgaven, zodat "gebruik
  // berekend" precies op het getoonde % uitkomt (geen sprong). Dit blijft
  // consistent met de inkomen/uitgaven-driehoek (recomputeTriple).
  const computedRate = computedIncome > 0 ? ((computedIncome - computedExpenses) / computedIncome) * 100 : 0
```
door:
```ts
  // rawSavingsRate voedt de interactieve driehoek (recomputeTriple): rate =
  // (inkomen − uitgaven) / inkomen. De GETOONDE "berekend"-spaarquote is echter
  // de canonieke 6-maands savingsRate6m (zelfde getal als de rest van de app),
  // die ook spaarbudgetten + schuldaflossing meerekent.
  const rawSavingsRate = computedIncome > 0 ? ((computedIncome - computedExpenses) / computedIncome) * 100 : 0
```

- [ ] **Step 2: Init de triple met de rauwe rate.** In de `useState`-init van `triple` (~regel 37-41), wijzig `savingsRate: computedRate` → `savingsRate: rawSavingsRate`.

- [ ] **Step 3: Spaarquote-kaart toont savingsRate6m in auto, handmatige rate in override.** In de spaarquote-`SettingCard` (~regel 96-98), wijzig de `value`-prop:
```tsx
        <SettingCard icon={<Target className="h-4 w-4" />} label="Spaarquote"
          value={`${expensesManual ? Math.round(triple.savingsRate) : Math.round(data.savingsRate6m)}%`} manual={expensesManual}
          sub="laatste 6 maanden" onClick={() => setSheet('savings')} />
```

- [ ] **Step 4: Spaarquote-kassabon — gecorrigeerde breakdown + canonieke headline.** Vervang het Σ/uitkomst-blok in de savings-`BottomSheet` (het `<div className="mt-2 space-y-1 border-t border-dashed ...">`-blok, ~regel 170-176) door:
```tsx
            <div className="mt-2 space-y-1 border-t border-dashed border-[var(--border-md)] pt-2">
              <div className="flex items-center justify-between"><span>Σ Inkomen (6 mnd)</span><span className="tabular-nums"><MaskedAmount value={sixMonth.income} tone="kern" /></span></div>
              <div className="flex items-center justify-between"><span>Σ Uitgaven (6 mnd)</span><span className="tabular-nums">−<MaskedAmount value={sixMonth.expenses} tone="kern" /></span></div>
              {data.savingsBudgetTotal6m > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-3)]"><span>+ Sparen in budgetten</span><span className="tabular-nums"><MaskedAmount value={data.savingsBudgetTotal6m} tone="kern" /></span></div>
              )}
              {data.debtAflossingTotal6m > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-3)]"><span>+ Schuldaflossing</span><span className="tabular-nums"><MaskedAmount value={data.debtAflossingTotal6m} tone="kern" /></span></div>
              )}
              <div className="flex items-center justify-between"><span>Gespaard</span><span className="tabular-nums"><MaskedAmount value={sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m} tone="kern" signPrefix={(sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m) >= 0 ? '+' : ''} /></span></div>
              <div className="mt-1 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5 font-bold">
                <span>Spaarquote</span><span className="tabular-nums">{Math.round(data.savingsRate6m)}%</span></div>
            </div>
```
(De per-maand-netto-rijen erboven en de intro-`<p>` blijven ongewijzigd.)

- [ ] **Step 5: "Gebruik berekend"-knop toont savingsRate6m.** In de savings-`ChoiceRow` (~regel 178), wijzig `computedLabel`:
```tsx
          <ChoiceRow computedLabel={`Gebruik berekend (${Math.round(data.savingsRate6m)}%)`}
            isManual={expensesManual} onUseComputed={() => useComputed('expenses')}
            manualValue={Math.round(triple.savingsRate)} onManual={(v) => editField('savingsRate', v)} unit="%" />
```
(Alleen `computedLabel` verandert van `computedRate` → `data.savingsRate6m`; de rest van de ChoiceRow blijft — de "eigen percentage"-lever blijft dus volledig werken.)

- [ ] **Step 6: Uitgaven-kassabon — 6-maands breakdown toevoegen.** Vervang de inhoud van de expenses-`BottomSheet` `<div className="space-y-3 p-4">` (~regel 142-149, het `<KassabonShell>` met enkel de "Berekend"-regel + de ChoiceRow) door:
```tsx
        <div className="space-y-3 p-4">
          <p className="text-[11px] text-[var(--ink-3)]">Gemiddelde over je transacties van de afgelopen 6 maanden.</p>
          <KassabonShell>
            <div className="space-y-1.5">
              {data.monthlyBreakdown.slice(-6).map((m, i) => (
                <div key={`${m.label}-${i}`} className="flex items-center justify-between text-[var(--ink-3)]">
                  <span className="capitalize">{m.label}</span>
                  <span className="tabular-nums"><MaskedAmount value={m.expenses} tone="kern" className="text-[11px]" /></span>
                </div>
              ))}
              <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
                <div className="flex items-center justify-between font-bold">
                  <span>Σ Uitgaven (6 mnd)</span>
                  <span className="tabular-nums"><MaskedAmount value={data.monthlyBreakdown.slice(-6).reduce((s, m) => s + m.expenses, 0)} tone="kern" /></span>
                </div>
                <p className="mt-1 text-[10px] text-[var(--ink-4)]">≈ €{Math.round(computedExpenses).toLocaleString('nl-NL')}/mnd</p>
              </div>
            </div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (€${Math.round(computedExpenses).toLocaleString('nl-NL')}/mnd)`}
            isManual={expensesManual} onUseComputed={() => useComputed('expenses')}
            manualValue={Math.round(triple.monthlyExpenses)} onManual={(v) => editField('expenses', v)} unit="€/mnd" />
        </div>
```

- [ ] **Step 7: Type-check + tests.** `npx tsc --noEmit 2>&1 | grep -i "cashflow-instellingen-blok"` → EMPTY (negeer de bestaande baseline elders). `npx vitest run components/overview 2>&1 | grep FAIL | grep -v worktrees` → leeg.

- [ ] **Step 8: Commit (pathspec)**
```
git commit -m "feat(cashflow): spaarquote = canonieke savingsRate6m met gecorrigeerde bon + uitgaven-breakdown" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- components/overview/cashflow-instellingen-blok.tsx
```
Daarna `git show --stat HEAD --oneline | head` → alleen dit bestand.

---

## Task 3: Verificatie + docs

- [ ] **Step 1: tsc-baseline.** `npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l` → onveranderd t.o.v. de bestaande baseline; `... | grep -iE "cashflow-settings-data|cashflow-instellingen-blok"` → geen nieuwe fouten in deze bestanden.
- [ ] **Step 2: Tests.** `npx vitest run lib/cashflow-settings.test.ts lib/cashflow-overrides.test.ts lib/effective-financials.test.ts` → groen; `npx vitest run components/overview 2>&1 | grep FAIL | grep -v worktrees` → leeg.
- [ ] **Step 3: Handmatige check.** Spaarquote-kaart toont hetzelfde % als elders in de app; de bon toont per-maand netto + Σ + (alleen indien ≠0) +sparen/+aflossing → spaarquote = savingsRate6m; "eigen percentage" overschrijft nog steeds (handmatig-badge); uitgaven-bon toont 6 maand-rijen → Σ → ≈ €X/mnd.
- [ ] **Step 4: Commit spec + plan (pathspec).**
```
git add -- docs/superpowers/specs/2026-06-07-spaarquote-uitgaven-kassabon-design.md docs/superpowers/plans/2026-06-07-spaarquote-uitgaven-kassabon.md
git commit -m "docs(cashflow): spec + plan spaarquote-herziening + uitgaven-bon" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -- docs/superpowers/specs/2026-06-07-spaarquote-uitgaven-kassabon-design.md docs/superpowers/plans/2026-06-07-spaarquote-uitgaven-kassabon.md
```

---

## Notities
- **Headline = altijd `savingsRate6m`.** De per-maand-rijen + Σ + correctie-regels zijn de verklaring; voor gebruikers met ≥6 mnd data reconciliëren ze exact, voor <6 mnd kan er een kleine extrapolatie-marge tussen de losse rijen en `savingsRate6m` zitten (bewust; de headline blijft het canonieke getal).
- **Instelbaar ongewijzigd:** alleen de *berekend*-referentie verandert (`computedRate`→`savingsRate6m` voor weergave/knop); het handmatige pad (`editField('savingsRate', …)` → `recomputeTriple` → uitgaven, `expenses_source='manual'`) blijft exact zoals het was.
