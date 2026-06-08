# Verrijkte transactie-tijdlijn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de transactielijst op `/overzicht/cashflow/transacties` door een verrijkte, redactionele "Tijdlijn"-lens (budget-onafhankelijk) met rekening-selector, en breid de Rabobank-import uit zodat lopend saldo, type, terugkerend en FX worden bewaard.

**Architecture:** Pure displaylogica in nieuwe `lib/transaction-display.ts` (TDD). Datafundament: migratie + parser/import-uitbreiding. UI: nieuwe `TransactieTijdlijn`-component vervangt `TransactiesFeed` binnen `TransactiesAnalyse`. Geen budget/categorie in deze lens. Graceful degradation: ontbrekende Tier-B-velden (demo/ING-data) renderen niet.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind v4, Supabase (PostgreSQL), Vitest. Bron-spec: `docs/superpowers/specs/2026-06-08-verrijkte-transactie-tijdlijn-design.md`.

**Conventies:** test = `npx vitest run <pad>`; types = `npx tsc --noEmit`. Commit per taak. Migraties via de Supabase MCP `apply_migration` (DDL gaat direct naar remote; kolommen vóór bouwen verifiëren — `reference_supabase_migration_drift`).

**Scope-verfijning (leidend):**
- Deze wijziging **vervangt puur de transactietabel** op de pagina. **Géén proza** eromheen (geen
  masthead/deck/colofon/headline) — alleen **de tabel + filters + zoekbalk** in ui/ux-stijl. De
  showcase-mockups waren presentatie; de echte component is kaal.
- **De tijdsbepaling bovenaan de pagina (`PeriodeSelector`) is de enige tijdsbron.** De tabel krijgt
  **geen eigen periode-/datum-control**; hij rendert exact `currentTxns` van het gekozen venster.
  Smart-search past **alleen** tekst + bedrag + richting toe — **nooit** datum (anders vecht het met de
  periode bovenaan).
- **Iconen in editorial stijl:** Lucide-iconen (scherp, gedempt `--ink-3`, klein `h-3 w-3`), **geen
  emoji** — niet voor type, terugkerend, of rekening-bron.

---

## Fase 1 — Datafundament (migratie + import-uitbreiding)

### Task 1: Migratie — extra bankvelden op `transactions`

**Files:**
- Migration (remote, via MCP `apply_migration`, naam `add_transaction_bank_fields`)

- [ ] **Step 1: Pas de migratie toe**

Roep de Supabase MCP-tool `apply_migration` aan met name `add_transaction_bank_fields` en query:

```sql
alter table public.transactions
  add column if not exists running_balance numeric,
  add column if not exists creditor_id     text,
  add column if not exists fx_amount        numeric,
  add column if not exists fx_currency      text,
  add column if not exists fx_rate          numeric;
```

- [ ] **Step 2: Verifieer de kolommen**

Roep `execute_sql` aan:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='transactions'
  and column_name in ('running_balance','creditor_id','fx_amount','fx_currency','fx_rate');
```

Expected: 5 rijen. `transaction_type` bestond al.

- [ ] **Step 3: Genereer TS-types opnieuw (indien gebruikt)**

Als het project `lib/database.types.ts` gebruikt: roep MCP `generate_typescript_types` aan en vervang het bestand. Zo niet (de loaders gebruiken `Record<string, unknown>`), sla over en noteer dat in de commit.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): voeg running_balance/creditor_id/fx-velden toe aan transactions"
```

---

### Task 2: Breid `ParsedTransaction` uit

**Files:**
- Modify: `lib/parsers/shared.ts:5-14`

- [ ] **Step 1: Voeg velden toe aan het type**

Vervang het `ParsedTransaction`-type door:

```ts
export type ParsedTransaction = {
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  reference: string | null
  transaction_type: string | null
  running_balance: number | null
  creditor_id: string | null
  fx_amount: number | null
  fx_currency: string | null
  fx_rate: number | null
  import_hash: string
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: fouten in `lib/parsers/csv.ts`, `ofx.ts`, `mt940.ts` (ze bouwen `ParsedTransaction` zonder de nieuwe velden). Die fixen we in Task 3 (csv) en hier voor de andere parsers met defaults.

- [ ] **Step 3: Zet defaults in de andere parsers**

In `lib/parsers/ofx.ts` en `lib/parsers/mt940.ts`: voeg op elke plek waar een `ParsedTransaction`-object wordt gepusht de velden toe:
`running_balance: null, creditor_id: null, fx_amount: null, fx_currency: null, fx_rate: null` (en `transaction_type: null` indien nog niet aanwezig). Zoek met `grep -n "import_hash:" lib/parsers/ofx.ts lib/parsers/mt940.ts` naar de objectliteralen.

- [ ] **Step 4: Typecheck (csv blijft falen tot Task 3)**

Run: `npx tsc --noEmit lib/parsers/ofx.ts lib/parsers/mt940.ts` is niet betrouwbaar standalone; draai gewoon `npx tsc --noEmit` en bevestig dat alleen `csv.ts` nog klaagt.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/shared.ts lib/parsers/ofx.ts lib/parsers/mt940.ts
git commit -m "feat(parsers): ParsedTransaction met bank-extra-velden (defaults null)"
```

---

### Task 3: Rabobank-preset + `parseCSV` lezen de extra kolommen

**Files:**
- Modify: `lib/parsers/index.ts:36-85` (CSVPreset-type + rabobank-preset)
- Modify: `lib/parsers/csv.ts:99-148` (parseCSV)
- Test: `lib/parsers/csv.test.ts`

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `lib/parsers/csv.test.ts` (maak het bestand als het niet bestaat; importeer `parseCSV` + de rabobank-preset):

```ts
import { describe, it, expect } from 'vitest'
import { parseCSV } from './csv'
import { CSV_PRESETS } from './index'

const RABO = CSV_PRESETS.find((p) => p.id === 'rabobank')!

const HEADER =
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"'

// Incasso met incassant + EUR
const INCASSO =
  '"NL60RABO0330370596","EUR","RABONL2U","014705","2026-01-19","2026-01-19","-4,99","+936,35","LU89751000135104200E","PayPal Europe","","","PPLXLUL2","ei","","1047645677604","5W5J224MY3Z9C","LU96ZZZ0000000000000000058","","1047645677604/PAYPAL"," ","","","","",""'

// Pin in CHF met koers
const FX =
  '"NL60RABO0330370596","EUR","RABONL2U","012384","2024-02-05","2024-02-05","-1,09","+9852,07","","Passaggio Free Flow","","","","bc","","","","","","Bavois, 1372, CHE, 04-02-2024 10:25"," ","","","1,00","CHF","0,93457"'

describe('parseCSV rabobank extra velden', () => {
  it('mapt Code, Saldo, Incassant ID', async () => {
    const txns = await parseCSV([HEADER, INCASSO].join('\n'), RABO)
    expect(txns).toHaveLength(1)
    const t = txns[0]
    expect(t.transaction_type).toBe('ei')
    expect(t.running_balance).toBeCloseTo(936.35)
    expect(t.creditor_id).toBe('LU96ZZZ0000000000000000058')
    expect(t.fx_amount).toBeNull()
  })

  it('mapt FX-velden bij vreemde valuta', async () => {
    const txns = await parseCSV([HEADER, FX].join('\n'), RABO)
    const t = txns[0]
    expect(t.transaction_type).toBe('bc')
    expect(t.fx_amount).toBeCloseTo(1.0)
    expect(t.fx_currency).toBe('CHF')
    expect(t.fx_rate).toBeCloseTo(0.93457)
  })
})
```

- [ ] **Step 2: Run test → faalt**

Run: `npx vitest run lib/parsers/csv.test.ts`
Expected: FAIL (preset mist de kolommen; `transaction_type` is null, fx ontbreekt).

- [ ] **Step 3: Breid `CSVPreset` + rabobank-preset uit (`lib/parsers/index.ts`)**

Voeg aan het `CSVPreset`-type (na `statusFilterValue?`) toe:

```ts
  typeColumn?: number      // transactietype-code (Rabobank "Code")
  balanceColumn?: number   // lopend saldo ("Saldo na trn")
  creditorColumn?: number  // SEPA creditor ("Incassant ID")
  fxAmountColumn?: number  // "Oorspr bedrag"
  fxCurrencyColumn?: number // "Oorspr munt"
  fxRateColumn?: number    // "Koers"
```

Vervang in de rabobank-preset het blok door:

```ts
  {
    id: 'rabobank',
    label: 'Rabobank CSV',
    delimiter: ',',
    dateColumn: 4,
    amountColumn: 6,
    descriptionColumn: 19,
    counterpartyColumn: 9,
    ibanColumn: 8,
    referenceColumn: 16,
    dateFormat: 'YYYY-MM-DD',
    hasHeader: true,
    typeColumn: 13,
    balanceColumn: 7,
    creditorColumn: 17,
    fxAmountColumn: 23,
    fxCurrencyColumn: 24,
    fxRateColumn: 25,
  },
```

- [ ] **Step 4: Lees de kolommen in `parseCSV` (`lib/parsers/csv.ts`)**

Voeg vlak vóór de `transactions.push({` (regel ~135) toe:

```ts
    const typeVal = preset.typeColumn != null ? (fields[preset.typeColumn] ?? '').trim() : ''
    const balanceVal = preset.balanceColumn != null ? fields[preset.balanceColumn] ?? '' : ''
    const creditorVal = preset.creditorColumn != null ? (fields[preset.creditorColumn] ?? '').trim() : ''
    const fxAmtVal = preset.fxAmountColumn != null ? fields[preset.fxAmountColumn] ?? '' : ''
    const fxCurVal = preset.fxCurrencyColumn != null ? (fields[preset.fxCurrencyColumn] ?? '').trim() : ''
    const fxRateVal = preset.fxRateColumn != null ? fields[preset.fxRateColumn] ?? '' : ''
```

Vervang het push-object door:

```ts
    transactions.push({
      date,
      amount,
      description: cleanDescription,
      counterparty_name: counterparty?.trim() || null,
      counterparty_iban: iban?.trim() || null,
      reference: reference?.trim() || null,
      transaction_type: typeVal || null,
      running_balance: balanceVal.trim() ? parseAmount(balanceVal) : null,
      creditor_id: creditorVal || null,
      fx_amount: fxAmtVal.trim() ? parseAmount(fxAmtVal) : null,
      fx_currency: fxCurVal || null,
      fx_rate: fxRateVal.trim() ? parseAmount(fxRateVal) : null,
      import_hash: hash,
    })
```

- [ ] **Step 5: Run test → slaagt + typecheck**

Run: `npx vitest run lib/parsers/csv.test.ts`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit`
Expected: geen fouten.

- [ ] **Step 6: Commit**

```bash
git add lib/parsers/index.ts lib/parsers/csv.ts lib/parsers/csv.test.ts
git commit -m "feat(parsers): Rabobank-preset mapt type/saldo/creditor/FX + tests"
```

---

### Task 4: Import-persistentie schrijft de nieuwe velden

**Files:**
- Modify: `app/(app)/core/cash/import/page.tsx:1084` (`insertRows`-map)

- [ ] **Step 1: Breid het insert-object uit**

Bekijk regel ~1084 (`const insertRows = toImportDeduped.map((r) => ({ … }))`). Voeg in het object-literal, vlak na de bestaande velden (vóór de sluit-`}`), toe:

```ts
      transaction_type: r.transaction_type ?? null,
      running_balance: r.running_balance ?? null,
      creditor_id: r.creditor_id ?? null,
      fx_amount: r.fx_amount ?? null,
      fx_currency: r.fx_currency ?? null,
      fx_rate: r.fx_rate ?? null,
```

- [ ] **Step 2: Borg dat `r` de velden draagt**

`toImportDeduped`/`ImportRow` is afgeleid van `ParsedTransaction`. Zoek met `grep -n "ImportRow" app/(app)/core/cash/import/page.tsx` naar het type. Als `ImportRow` een eigen literal is (geen `extends ParsedTransaction`), voeg dezelfde 5 velden + `transaction_type` toe aan dat type, en borg dat ze bij het opbouwen van de rijen vanuit de parse-output worden meegespreid (`...parsed`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: geen fouten.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/core/cash/import/page.tsx"
git commit -m "feat(import): persisteer type/saldo/creditor/FX bij CSV-import"
```

---

## Fase 2 — Pure displaylogica (`lib/transaction-display.ts`, TDD)

> Alle functies budget-vrij, geen Supabase/React. Eén testbestand `lib/transaction-display.test.ts`.

### Task 5: `cleanMerchantName`

**Files:**
- Create: `lib/transaction-display.ts`
- Test: `lib/transaction-display.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```ts
import { describe, it, expect } from 'vitest'
import { cleanMerchantName } from './transaction-display'

describe('cleanMerchantName', () => {
  it('strip PSP-prefixes', () => {
    expect(cleanMerchantName('BCK*SHELL T KEMPKE')).toBe('Shell T Kempke')
    expect(cleanMerchantName('CCV*Gras Horeca B.V.')).toBe('Gras Horeca')
    expect(cleanMerchantName('PAY.nl*Sportbedrijf Ar')).toBe('Sportbedrijf Ar')
  })
  it('strip trailing winkelnummer', () => {
    expect(cleanMerchantName('Albert Heijn 1032')).toBe('Albert Heijn')
    expect(cleanMerchantName('Lidl 238 Arnhem')).toBe('Lidl')
  })
  it('bekende merchants', () => {
    expect(cleanMerchantName('Esso Arnhem IJsseloo')).toBe('Esso')
    expect(cleanMerchantName('PayPal Europe S.a.r.l. et Cie S.C.A')).toBe('PayPal')
  })
  it('lege invoer', () => {
    expect(cleanMerchantName(null)).toBe('Onbekend')
    expect(cleanMerchantName('   ')).toBe('Onbekend')
  })
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run lib/transaction-display.test.ts`
Expected: FAIL ("cleanMerchantName is not a function").

- [ ] **Step 3: Implementeer**

```ts
/**
 * Pure, budget-vrije displaylogica voor de verrijkte transactie-tijdlijn.
 * Geen React/Supabase. Zie transaction-display.test.ts.
 */

const KNOWN: { test: RegExp; name: string }[] = [
  { test: /\bshell\b/i, name: 'Shell' },
  { test: /\besso\b/i, name: 'Esso' },
  { test: /\btinq\b/i, name: 'Tinq' },
  { test: /\bpaypal\b/i, name: 'PayPal' },
  { test: /\bamazon\b/i, name: 'Amazon' },
  { test: /\bhornbach\b/i, name: 'Hornbach' },
  { test: /\bbol\.com\b/i, name: 'bol.com' },
  { test: /albert heijn/i, name: 'Albert Heijn' },
]

export function cleanMerchantName(raw: string | null): string {
  let s = (raw ?? '').trim()
  if (!s) return 'Onbekend'
  for (const k of KNOWN) if (k.test.test(s)) return k.name
  // PSP-prefix "BCK*", "CCV*", "PAY.nl*", "ZTL*", "iZ "
  s = s.replace(/^[A-Za-z.]{2,8}\*/, '').replace(/^iZ\s+/i, '').trim()
  // Suffix B.V. / N.V.
  s = s.replace(/\s+(b\.?v\.?|n\.?v\.?)$/i, '').trim()
  // Trailing winkelnummer (+ optioneel een plaatsnaam-woord)
  s = s.replace(/\s+\d{2,5}(\s+[A-Za-zÀ-ÿ]+)?$/, '').trim()
  if (!s) return 'Onbekend'
  return s.replace(/\s+/g, ' ')
}
```

- [ ] **Step 4: Run → slaagt**

Run: `npx vitest run lib/transaction-display.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/transaction-display.ts lib/transaction-display.test.ts
git commit -m "feat(transacties): cleanMerchantName (pure, getest)"
```

---

### Task 6: `deriveType`

**Files:**
- Modify: `lib/transaction-display.ts`
- Test: `lib/transaction-display.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```ts
import { deriveType } from './transaction-display'

describe('deriveType', () => {
  it('mapt Rabobank-codes', () => {
    expect(deriveType('bc', 'Shell', -10).kind).toBe('pin')
    expect(deriveType('ba', 'Hornbach', 23).kind).toBe('pin')
    expect(deriveType('ei', 'PayPal', -5).kind).toBe('incasso')
    expect(deriveType('id', 'bol.com', -19).kind).toBe('ideal')
    expect(deriveType('bg', 'KvK', -47).kind).toBe('overboeking')
    expect(deriveType('cb', 'Belastingdienst', 74).kind).toBe('bijschrijving')
    expect(deriveType('bv', 'Rabo Betaalverzoek', 120).kind).toBe('betaalverzoek')
    expect(deriveType('db', 'Rabobank', -3.45).kind).toBe('bankkosten')
  })
  it('fallback zonder code op teken', () => {
    expect(deriveType(null, 'Iets', 50).kind).toBe('bijschrijving')
    expect(deriveType(null, 'Iets', -50).kind).toBe('pin')
  })
  it('levert glyph + label', () => {
    const t = deriveType('ei', 'PayPal', -5)
    expect(t.glyph).toBeTruthy()
    expect(t.label).toMatch(/incasso/i)
  })
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run lib/transaction-display.test.ts -t deriveType`
Expected: FAIL.

- [ ] **Step 3: Implementeer (append in `transaction-display.ts`)**

```ts
export type TxKind =
  | 'pin' | 'incasso' | 'ideal' | 'overboeking'
  | 'bijschrijving' | 'betaalverzoek' | 'bankkosten' | 'onbekend'

export interface TypeInfo { kind: TxKind; glyph: string; label: string }

const TYPE_BY_KIND: Record<TxKind, Omit<TypeInfo, 'kind'>> = {
  pin:          { glyph: '↘', label: 'pinbetaling' },
  incasso:      { glyph: '⟳', label: 'incasso' },
  ideal:        { glyph: '↘', label: 'iDEAL' },
  overboeking:  { glyph: '→', label: 'overboeking' },
  bijschrijving:{ glyph: '↗', label: 'bijschrijving' },
  betaalverzoek:{ glyph: '↔', label: 'betaalverzoek' },
  bankkosten:   { glyph: '•', label: 'bankkosten' },
  onbekend:     { glyph: '·', label: '' },
}

const CODE_MAP: Record<string, TxKind> = {
  bc: 'pin', ba: 'pin', ga: 'pin', gm: 'pin',
  ei: 'incasso',
  id: 'ideal',
  bg: 'overboeking', ov: 'overboeking',
  cb: 'bijschrijving',
  bv: 'betaalverzoek',
  db: 'bankkosten',
}

export function deriveType(
  code: string | null,
  _counterpartyName: string | null,
  amount: number,
): TypeInfo {
  const c = (code ?? '').trim().toLowerCase()
  let kind: TxKind | undefined = c ? CODE_MAP[c] : undefined
  if (!kind) kind = amount >= 0 ? 'bijschrijving' : 'pin' // fallback op teken
  return { kind, ...TYPE_BY_KIND[kind] }
}
```

- [ ] **Step 4: Run → slaagt; Step 5: Commit**

Run: `npx vitest run lib/transaction-display.test.ts`
Expected: PASS.
```bash
git add lib/transaction-display.ts lib/transaction-display.test.ts
git commit -m "feat(transacties): deriveType uit Rabobank-Code + teken-fallback"
```

---

### Task 7: `parseLocationTime`

**Files:** Modify `lib/transaction-display.ts`; Test `lib/transaction-display.test.ts`

- [ ] **Step 1: Falende test**

```ts
import { parseLocationTime } from './transaction-display'

describe('parseLocationTime', () => {
  it('haalt plaats + tijd uit pin-omschrijving', () => {
    expect(parseLocationTime('ELST GLD, 6661KK, NLD, 09:39')).toEqual({ place: 'Elst Gld', time: '09:39' })
    expect(parseLocationTime('Zaandam, 1506BH, NLD, 13:11')).toEqual({ place: 'Zaandam', time: '13:11' })
  })
  it('null als geen match', () => {
    expect(parseLocationTime('1047645677604/PAYPAL')).toEqual({ place: null, time: null })
    expect(parseLocationTime(null)).toEqual({ place: null, time: null })
  })
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run lib/transaction-display.test.ts -t parseLocationTime` → FAIL.

- [ ] **Step 3: Implementeer**

```ts
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-zà-ÿ]/g, (c) => c.toUpperCase())
}

/** Pin-omschrijving "PLAATS, 1234AB, NLD, HH:mm" → { place, time }. */
export function parseLocationTime(description: string | null): { place: string | null; time: string | null } {
  const s = (description ?? '').trim()
  if (!s) return { place: null, time: null }
  const time = s.match(/\b(\d{2}:\d{2})\b/)?.[1] ?? null
  // plaats = eerste segment vóór een postcode-segment
  const m = s.match(/^([A-Za-zÀ-ÿ .'-]+?),\s*\d{4}\s?[A-Z]{2}\b/)
  const place = m ? titleCase(m[1].trim()) : null
  if (!place && !time) return { place: null, time: null }
  return { place, time }
}
```

- [ ] **Step 4: Run → slaagt; Step 5: Commit**

```bash
git add lib/transaction-display.ts lib/transaction-display.test.ts
git commit -m "feat(transacties): parseLocationTime uit pin-omschrijving"
```

---

### Task 8: `avgDailyExpense` + `freedomDays`

**Files:** Modify `lib/transaction-display.ts`; Test idem. Hergebruik `calculateFreedomTime` uit `lib/format.ts`.

- [ ] **Step 1: Falende test**

```ts
import { avgDailyExpense, freedomDays } from './transaction-display'

describe('avgDailyExpense + freedomDays', () => {
  const txns = [
    { amount: -90, transaction_type: null },
    { amount: -90, transaction_type: null },
    { amount: 1000, transaction_type: null },     // inkomst telt niet
    { amount: -50, transaction_type: 'transfer' }, // transfer telt niet
  ]
  it('gemiddelde dag-uitgave over venster', () => {
    expect(avgDailyExpense(txns, 2)).toBeCloseTo(90) // 180 uitgaven / 2 dagen
  })
  it('vrijheidsdagen = bedrag / dag-uitgave', () => {
    expect(freedomDays(180, 90)).toBeCloseTo(2)
    expect(freedomDays(100, 0)).toBe(0) // geen basis → 0
  })
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run lib/transaction-display.test.ts -t avgDailyExpense` → FAIL.

- [ ] **Step 3: Implementeer**

```ts
import { calculateFreedomTime } from '@/lib/format'

/** Gemiddelde dag-uitgave (budget-vrij): som uitgaven (excl. transfers) / dagen. */
export function avgDailyExpense(
  txns: { amount: number; transaction_type: string | null }[],
  windowDays: number,
): number {
  if (windowDays <= 0) return 0
  let expense = 0
  for (const t of txns) {
    if (t.transaction_type === 'transfer') continue
    if (t.amount < 0) expense += Math.abs(t.amount)
  }
  return expense / windowDays
}

/** Vrijheidsdagen voor een bedrag, gegeven de dag-uitgavenbasis. */
export function freedomDays(amount: number, dailyExpense: number): number {
  if (dailyExpense <= 0) return 0
  return calculateFreedomTime(Math.abs(amount), dailyExpense).totalDays
}
```

- [ ] **Step 4: Run → slaagt; Step 5: Commit**

```bash
git add lib/transaction-display.ts lib/transaction-display.test.ts
git commit -m "feat(transacties): avgDailyExpense + freedomDays (budget-vrij)"
```

---

### Task 9: `detectRecurring`

**Files:** Modify `lib/transaction-display.ts`; Test idem.

- [ ] **Step 1: Falende test**

```ts
import { detectRecurring } from './transaction-display'

describe('detectRecurring', () => {
  it('vlagt op creditor_id (≥2 voorkomens)', () => {
    const r = detectRecurring([
      { id: 'a', counterparty_name: 'PayPal', counterparty_iban: null, creditor_id: 'LU96ZZZ', amount: -4.99, date: '2026-01-05' },
      { id: 'b', counterparty_name: 'PayPal', counterparty_iban: null, creditor_id: 'LU96ZZZ', amount: -4.99, date: '2026-01-19' },
      { id: 'c', counterparty_name: 'Eenmalig', counterparty_iban: null, creditor_id: null, amount: -20, date: '2026-01-10' },
    ])
    expect(r.has('a')).toBe(true)
    expect(r.has('b')).toBe(true)
    expect(r.has('c')).toBe(false)
  })
  it('fallback op counterparty bij ≥3 met stabiel bedrag', () => {
    const r = detectRecurring([
      { id: '1', counterparty_name: 'Sportschool', counterparty_iban: null, creditor_id: null, amount: -30, date: '2026-01-01' },
      { id: '2', counterparty_name: 'Sportschool', counterparty_iban: null, creditor_id: null, amount: -30, date: '2026-02-01' },
      { id: '3', counterparty_name: 'Sportschool', counterparty_iban: null, creditor_id: null, amount: -31, date: '2026-03-01' },
    ])
    expect(r.has('2')).toBe(true)
  })
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run lib/transaction-display.test.ts -t detectRecurring` → FAIL.

- [ ] **Step 3: Implementeer**

```ts
import { counterpartyKey } from '@/lib/transaction-insights'

export interface RecurringInput {
  id: string
  counterparty_name: string | null
  counterparty_iban: string | null
  creditor_id?: string | null
  amount: number
  date: string
}

/** Set van transactie-ids die als terugkerend gelden. */
export function detectRecurring(txns: RecurringInput[]): Set<string> {
  const result = new Set<string>()
  // 1) creditor_id: ≥2 voorkomens = terugkerend
  const byCreditor = new Map<string, RecurringInput[]>()
  for (const t of txns) {
    const c = (t.creditor_id ?? '').trim()
    if (!c) continue
    ;(byCreditor.get(c) ?? byCreditor.set(c, []).get(c)!).push(t)
  }
  for (const group of byCreditor.values()) {
    if (group.length >= 2) for (const t of group) result.add(t.id)
  }
  // 2) fallback: counterparty met ≥3 voorkomens en stabiel bedrag (±15%)
  const byCp = new Map<string, RecurringInput[]>()
  for (const t of txns) {
    if (result.has(t.id)) continue
    if ((t.creditor_id ?? '').trim()) continue
    const k = counterpartyKey(t.counterparty_name, t.counterparty_iban)
    if (k === '__unknown__') continue
    ;(byCp.get(k) ?? byCp.set(k, []).get(k)!).push(t)
  }
  for (const group of byCp.values()) {
    if (group.length < 3) continue
    const avg = group.reduce((s, t) => s + Math.abs(t.amount), 0) / group.length
    const stable = group.every((t) => Math.abs(Math.abs(t.amount) - avg) <= avg * 0.15)
    if (stable) for (const t of group) result.add(t.id)
  }
  return result
}
```

- [ ] **Step 4: Run → slaagt; Step 5: Commit**

```bash
git add lib/transaction-display.ts lib/transaction-display.test.ts
git commit -m "feat(transacties): detectRecurring (creditor + cadans-fallback)"
```

---

### Task 10: `groupByDay`, `parseSmartQuery`, `monogram`

**Files:** Modify `lib/transaction-display.ts`; Test idem.

- [ ] **Step 1: Falende test**

```ts
import { groupByDay, parseSmartQuery, monogram } from './transaction-display'

describe('groupByDay', () => {
  it('groepeert + subtotalen, nieuw→oud', () => {
    const g = groupByDay([
      { date: '2026-01-02', amount: -10, transaction_type: null },
      { date: '2026-01-02', amount: 100, transaction_type: null },
      { date: '2026-01-01', amount: -5, transaction_type: 'transfer' },
    ])
    expect(g[0].date).toBe('2026-01-02')
    expect(g[0].expenseTotal).toBe(10)
    expect(g[0].incomeTotal).toBe(100)
    expect(g[1].expenseTotal).toBe(0) // transfer telt niet in subtotaal
  })
})

describe('parseSmartQuery', () => {
  const now = new Date(2026, 5, 8) // 8 jun 2026
  it('parst bedrag + tekst', () => {
    const q = parseSmartQuery('hornbach boven 50', now)
    expect(q.text).toBe('hornbach')
    expect(q.amountMin).toBe(50)
  })
  it('parst "vorige maand"', () => {
    const q = parseSmartQuery('vorige maand', now)
    expect(q.dateFrom).toBe('2026-05-01')
    expect(q.dateTo).toBe('2026-05-31')
  })
  it('lege query → alles null, text leeg', () => {
    expect(parseSmartQuery('', now)).toEqual({ text: '', amountMin: null, amountMax: null, dateFrom: null, dateTo: null, direction: null })
  })
})

describe('monogram', () => {
  it('1-2 initialen', () => {
    expect(monogram('Albert Heijn')).toBe('AH')
    expect(monogram('Shell')).toBe('SH')
  })
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run lib/transaction-display.test.ts -t groupByDay` → FAIL.

- [ ] **Step 3: Implementeer**

```ts
export interface DayGroup<T> { date: string; rows: T[]; expenseTotal: number; incomeTotal: number }

export function groupByDay<T extends { date: string; amount: number; transaction_type: string | null }>(
  txns: T[],
): DayGroup<T>[] {
  const map = new Map<string, DayGroup<T>>()
  for (const t of txns) {
    let g = map.get(t.date)
    if (!g) { g = { date: t.date, rows: [], expenseTotal: 0, incomeTotal: 0 }; map.set(t.date, g) }
    g.rows.push(t)
    if (t.transaction_type !== 'transfer') {
      if (t.amount < 0) g.expenseTotal += Math.abs(t.amount)
      else if (t.amount > 0) g.incomeTotal += t.amount
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
}

const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

export interface SmartQuery {
  text: string
  amountMin: number | null
  amountMax: number | null
  dateFrom: string | null
  dateTo: string | null
  direction: 'expense' | 'income' | null
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Lichte regex-parser; `now` wordt meegegeven (pure functie, geen Date.now). */
export function parseSmartQuery(query: string, now: Date): SmartQuery {
  let s = ` ${query.toLowerCase().trim()} `
  let amountMin: number | null = null
  let amountMax: number | null = null
  let dateFrom: string | null = null
  let dateTo: string | null = null
  let direction: 'expense' | 'income' | null = null

  const amt = (v: string) => parseFloat(v.replace('.', '').replace(',', '.'))
  s = s.replace(/\b(boven|>|meer dan)\s*€?\s*([\d.,]+)/g, (_, __, v) => { amountMin = amt(v); return ' ' })
  s = s.replace(/\b(onder|<|minder dan)\s*€?\s*([\d.,]+)/g, (_, __, v) => { amountMax = amt(v); return ' ' })

  if (/\bvorige maand\b/.test(s)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    dateFrom = isoOf(d.getFullYear(), d.getMonth(), 1)
    dateTo = isoOf(end.getFullYear(), end.getMonth(), end.getDate())
    s = s.replace(/\bvorige maand\b/, ' ')
  } else if (/\bdit jaar\b/.test(s)) {
    dateFrom = isoOf(now.getFullYear(), 0, 1); dateTo = isoOf(now.getFullYear(), 11, 31)
    s = s.replace(/\bdit jaar\b/, ' ')
  } else {
    for (let i = 0; i < 12; i++) {
      if (new RegExp(`\\b${NL_MONTHS[i]}\\b`).test(s)) {
        const end = new Date(now.getFullYear(), i + 1, 0)
        dateFrom = isoOf(now.getFullYear(), i, 1); dateTo = isoOf(now.getFullYear(), i, end.getDate())
        s = s.replace(new RegExp(`\\b${NL_MONTHS[i]}\\b`), ' ')
        break
      }
    }
  }
  if (/\buitgaven?\b/.test(s)) { direction = 'expense'; s = s.replace(/\buitgaven?\b/, ' ') }
  else if (/\binkomsten?\b/.test(s)) { direction = 'income'; s = s.replace(/\binkomsten?\b/, ' ') }

  return { text: s.replace(/\s+/g, ' ').trim(), amountMin, amountMax, dateFrom, dateTo, direction }
}

export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
```

- [ ] **Step 4: Run hele suite → slaagt**

Run: `npx vitest run lib/transaction-display.test.ts`
Expected: PASS (alle blokken).
Run: `npx tsc --noEmit` → geen fouten.

- [ ] **Step 5: Commit**

```bash
git add lib/transaction-display.ts lib/transaction-display.test.ts
git commit -m "feat(transacties): groupByDay + parseSmartQuery + monogram"
```

---

## Fase 3 — Datatype + parent-integratie

### Task 11: Breid `AnalysisTransaction` + `mapRow` + data-load uit

**Files:**
- Modify: `lib/transaction-insights.ts:19-32` (type)
- Modify: `components/overview/transacties/transacties-analyse.tsx` (`mapRow` r78-104; accounts-query r183-185)

- [ ] **Step 1: Breid het type uit**

Voeg in `AnalysisTransaction` (na `transaction_type: string | null`) toe:

```ts
  running_balance: number | null
  creditor_id: string | null
  fx_amount: number | null
  fx_currency: string | null
  fx_rate: number | null
```

- [ ] **Step 2: Vul ze in `mapRow`**

In `components/overview/transacties/transacties-analyse.tsx`, in het return-object van `mapRow` (na `transaction_type: …`), voeg toe:

```ts
    running_balance: item.running_balance != null ? Number(item.running_balance) : null,
    creditor_id: (item.creditor_id as string | null) ?? null,
    fx_amount: item.fx_amount != null ? Number(item.fx_amount) : null,
    fx_currency: (item.fx_currency as string | null) ?? null,
    fx_rate: item.fx_rate != null ? Number(item.fx_rate) : null,
```

(De data komt al binnen via `loadPerspectiveTransactions` → `select('*')`; geen query-wijziging nodig.)

- [ ] **Step 3: Breid de accounts-query uit (voor de rekening-selector)**

Vervang in hetzelfde bestand de accounts-query:

```ts
          supabase.from('bank_accounts').select('id, name'),
```
door:
```ts
          supabase.from('bank_accounts').select('id, name, bank_name, iban, sort_order').eq('is_active', true).order('sort_order', { ascending: true }),
          supabase.from('bank_connection_accounts').select('bank_account_id').eq('is_active', true),
```
en pas de `Promise.all`-destructuring + onderstaande verwerking aan: bouw naast `accMap` een
`accounts: AccountOption[]` en een `connectedIds: Set<string>` (uit `bank_connection_accounts`).
Definieer bovenin het bestand:

```ts
type AccountOption = { id: string; name: string; bankName: string | null; ibanTail: string | null; connected: boolean }
```

Zet beide in nieuwe state (`const [accounts, setAccounts] = useState<AccountOption[]>([])`) en geef ze door
aan `TransactieTijdlijn` (Task 13).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: fouten alleen waar `TransactiesFeed` nog `budgetOptions` verwacht (wordt vervangen in Task 13) — verder schoon.

- [ ] **Step 5: Commit**

```bash
git add lib/transaction-insights.ts "components/overview/transacties/transacties-analyse.tsx"
git commit -m "feat(transacties): AnalysisTransaction + mapRow + accounts-load voor tijdlijn"
```

---

## Fase 4 — Component

### Task 12: `TransactieTijdlijn` — rijen + dag-koppen (kern)

**Files:**
- Create: `components/overview/transacties/transactie-tijdlijn.tsx`
- Test: `components/overview/transacties/transactie-tijdlijn.test.tsx`

Props-contract:

```ts
import type { AnalysisTransaction } from '@/lib/transaction-insights'
type AccountOption = { id: string; name: string; bankName: string | null; ibanTail: string | null; connected: boolean }
interface Props {
  transactions: AnalysisTransaction[]     // reeds perspectief-geschaald
  windowDays: number                       // voor vrijheidstijd-basis
  accounts: AccountOption[]
  selectedAccountId: string | null         // null = alle
  onSelectAccount: (id: string | null) => void
  onSelect?: (tx: AnalysisTransaction) => void
}
```

- [ ] **Step 1: Falende test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TransactieTijdlijn } from './transactie-tijdlijn'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

const base: AnalysisTransaction = {
  id: '1', date: '2026-01-19', amount: -70.76, description: 'DUIVEN, 6921RJ, NLD, 14:10',
  counterparty_name: 'Hornbach Duiven', counterparty_iban: null, budget_id: null, category: null,
  account_id: 'acc1', account_name: 'Betaal', is_income: false, transaction_type: 'bc',
  running_balance: 901.63, creditor_id: null, fx_amount: null, fx_currency: null, fx_rate: null,
}

describe('TransactieTijdlijn', () => {
  it('toont opgeschoonde naam + dag-subtotaal', () => {
    render(
      <TransactieTijdlijn transactions={[base]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />,
    )
    expect(screen.getByText('Hornbach')).toBeInTheDocument()
    expect(screen.getByText(/€70,76/)).toBeInTheDocument()
  })
  it('toont lopend saldo alleen als aanwezig (graceful degradation)', () => {
    const { rerender } = render(
      <TransactieTijdlijn transactions={[base]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />,
    )
    expect(screen.getByText(/saldo/i)).toBeInTheDocument()
    rerender(
      <TransactieTijdlijn transactions={[{ ...base, running_balance: null }]} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />,
    )
    expect(screen.queryByText(/saldo/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run components/overview/transacties/transactie-tijdlijn.test.tsx` → FAIL ("Cannot find module").

- [ ] **Step 3: Implementeer (kern, zonder filters-sheet)**

Bouw `transactie-tijdlijn.tsx` met:
- `'use client'`, imports van `cleanMerchantName, deriveType, parseLocationTime, avgDailyExpense, freedomDays, detectRecurring, groupByDay, monogram` uit `@/lib/transaction-display`, `formatCurrency`/`formatFreedomTimeString`/`calculateFreedomTime` uit `@/lib/format`, `useMaskedAmounts` uit de masking-hook.
- `const daily = useMemo(() => avgDailyExpense(transactions, windowDays), …)`.
- `const recurring = useMemo(() => detectRecurring(transactions.map(t => ({ id: t.id, counterparty_name: t.counterparty_name, counterparty_iban: t.counterparty_iban, creditor_id: t.creditor_id, amount: t.amount, date: t.date }))), …)`.
- `const groups = useMemo(() => groupByDay(transactions), [transactions])`.
- **AccountSelector** bovenaan: segmented control "Alle rekeningen" + per account een knop `name` + bron-badge (`connected ? '🔗' : '📄'`), `aria-pressed`, 44px targets, scherpe hoeken. `onSelectAccount(id|null)`.
- **Dag-kop** (`groups.map`): mono kicker links `formatDayHeader(date)`, rechts `−/+ subtotaal` + `≈ X vrijheidsdag(en)` via `freedomDays(expenseTotal, daily)`.
- **Rij**: `<button>` met monogram (scherp vierkant, DM Mono initialen via `monogram(clean)`), `cleanMerchantName(counterparty_name)` in Playfair, type-glyph (`deriveType(...).glyph`), `🔁` als `recurring.has(id)`, sub-regel `parseLocationTime(description)` → "Plaats · tijd" anders ruwe `description`; rechts bedrag (DM Mono, centen gedimd, `text-[var(--positive)]` bij `amount > 0` met `+`), en — **alleen als `running_balance != null`** — `saldo {formatCurrency(running_balance)}` gedimd eronder. FX-badge alleen als `fx_amount != null`.
- Styling strikt Editorial: scherpe hoeken, `border-b border-dotted` tussen rijen, dag-kop `border-b border-[var(--ink)]`, bedragen `font-mono tabular-nums`. Bedragen door `MaskedAmount`/`formatMaskedCurrency`.
- Kleur nooit als enige drager: teken (`+`/`−`) en glyph naast kleur.

Schrijf de volledige component (≈180-220 regels). Begin met deze skelet-structuur en vul de helpers/JSX:

```tsx
'use client'
import { useMemo } from 'react'
import { Repeat, Link2, FileText, CreditCard, RefreshCw, Smartphone, ArrowLeftRight, ArrowDownLeft, Landmark } from 'lucide-react'
import {
  cleanMerchantName, deriveType, parseLocationTime, avgDailyExpense,
  freedomDays, detectRecurring, groupByDay, monogram, type TxKind,
} from '@/lib/transaction-display'
import { formatCurrency } from '@/lib/format'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

// Editorial iconen (Lucide, scherp, gedempt) — GEEN emoji. Type uit deriveType().kind.
const TYPE_ICON: Record<TxKind, typeof CreditCard | null> = {
  pin: CreditCard, incasso: RefreshCw, ideal: Smartphone, overboeking: ArrowLeftRight,
  bijschrijving: ArrowDownLeft, betaalverzoek: ArrowLeftRight, bankkosten: Landmark, onbekend: null,
}

type AccountOption = { id: string; name: string; bankName: string | null; ibanTail: string | null; connected: boolean }
interface Props {
  transactions: AnalysisTransaction[]
  windowDays: number
  accounts: AccountOption[]
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
  onSelect?: (tx: AnalysisTransaction) => void
}

const WD = ['ma','di','wo','do','vr','za','zo']
const MO = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
function dayHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
  return `${WD[dow]} ${d} ${MO[m - 1]}`
}
function freedomLabel(days: number): string {
  if (days <= 0) return ''
  const v = days.toFixed(1).replace('.', ',')
  return `≈ ${v} vrijheidsdag${days >= 2 ? 'en' : ''}`
}

export function TransactieTijdlijn({ transactions, windowDays, accounts, selectedAccountId, onSelectAccount, onSelect }: Props) {
  const daily = useMemo(() => avgDailyExpense(transactions, windowDays), [transactions, windowDays])
  const recurring = useMemo(
    () => detectRecurring(transactions.map((t) => ({ id: t.id, counterparty_name: t.counterparty_name, counterparty_iban: t.counterparty_iban, creditor_id: t.creditor_id, amount: t.amount, date: t.date }))),
    [transactions],
  )
  const groups = useMemo(() => groupByDay(transactions), [transactions])

  return (
    <section className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      {/* AccountSelector */}
      {accounts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1 text-xs" role="group" aria-label="Kies rekening">
          <AccountButton active={selectedAccountId === null} label="Alle rekeningen" onClick={() => onSelectAccount(null)} />
          {accounts.map((a) => (
            <AccountButton key={a.id} active={selectedAccountId === a.id} connected={a.connected}
              label={a.name} onClick={() => onSelectAccount(a.id)} />
          ))}
        </div>
      )}
      <div role="list" className="space-y-4">
        {groups.map((g) => (
          <div key={g.date}>
            <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">{dayHeader(g.date)}</span>
              <span className="font-mono text-[11px] text-[var(--ink-3)] tabular-nums">
                {g.incomeTotal - g.expenseTotal >= 0 ? '+' : '−'} {formatCurrency(Math.abs(g.incomeTotal - g.expenseTotal))}
                {daily > 0 && <span className="text-[var(--kern-700)]"> · {freedomLabel(freedomDays(g.expenseTotal, daily))}</span>}
              </span>
            </div>
            <ul className="divide-y divide-dotted divide-[var(--border-ed)]">
              {g.rows.map((t) => <Row key={t.id} t={t} recurring={recurring.has(t.id)} onSelect={onSelect} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function AccountButton({ active, label, onClick, connected }: { active: boolean; label: string; onClick: () => void; connected?: boolean }) {
  const SrcIcon = connected === undefined ? null : connected ? Link2 : FileText
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={['inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] border',
        active ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]' : 'bg-[var(--paper)] text-[var(--ink-3)] border-[var(--border-ed)]'].join(' ')}>
      {SrcIcon && <SrcIcon className="h-3 w-3" aria-hidden />}
      {label}
    </button>
  )
}

function Row({ t, recurring, onSelect }: { t: AnalysisTransaction; recurring: boolean; onSelect?: (tx: AnalysisTransaction) => void }) {
  const name = cleanMerchantName(t.counterparty_name)
  const type = deriveType(t.transaction_type, t.counterparty_name, t.amount)
  const TypeIcon = TYPE_ICON[type.kind]
  const loc = parseLocationTime(t.description)
  const sub = loc.place ? `${loc.place}${loc.time ? ` · ${loc.time}` : ''}` : t.description
  const income = t.amount > 0
  const content = (
    <>
      <span className="flex-none w-[33px] h-[33px] bg-[var(--kern-50)] border border-[var(--border-ed)] flex items-center justify-center font-mono text-[11px] text-[var(--kern-700)]" aria-hidden>
        {monogram(name)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-serif font-semibold text-[14.5px] text-[var(--ink)] truncate">{name}</span>
          {TypeIcon && <TypeIcon className="h-3 w-3 flex-none text-[var(--ink-3)]" aria-label={type.label} />}
          {recurring && <Repeat className="h-3 w-3 flex-none text-[var(--kern-700)]" aria-label="terugkerend" />}
        </span>
        <span className="block text-[11px] italic text-[var(--ink-3)] truncate">{sub}</span>
      </span>
      <span className="flex-none text-right">
        <span className={['block font-mono text-[14px] tabular-nums', income ? 'text-[var(--positive)]' : 'text-[var(--ink)]'].join(' ')}>
          {income ? '+' : '−'} {formatCurrency(Math.abs(t.amount))}
        </span>
        {t.running_balance != null && (
          <span className="block font-mono text-[10px] text-[var(--ink-4)] tabular-nums">saldo {formatCurrency(t.running_balance)}</span>
        )}
        {t.fx_amount != null && t.fx_currency && (
          <span className="block font-mono text-[9px] text-[var(--ink-4)]">{t.fx_currency} {t.fx_amount}{t.fx_rate ? ` @ ${t.fx_rate}` : ''}</span>
        )}
      </span>
    </>
  )
  if (onSelect) {
    return (
      <li>
        <button type="button" onClick={() => onSelect(t)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-[var(--subtle)] focus:outline-2 focus:outline-[var(--ink)]">
          {content}
        </button>
      </li>
    )
  }
  return <li className="flex items-center gap-3 py-2.5">{content}</li>
}
```

> Pas tokens (`--kern-50`, `--kern-200`, `--positive`) aan op de echte tokens in `app/globals.css` als de namen afwijken; gebruik bij twijfel `--module-active-*` binnen Kern-context.

- [ ] **Step 4: Run test → slaagt**

Run: `npx vitest run components/overview/transacties/transactie-tijdlijn.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "components/overview/transacties/transactie-tijdlijn.tsx" "components/overview/transacties/transactie-tijdlijn.test.tsx"
git commit -m "feat(transacties): TransactieTijdlijn — rijen + dag-koppen + rekening-selector"
```

---

### Task 13: Vervang `TransactiesFeed` in `TransactiesAnalyse`

**Files:**
- Modify: `components/overview/transacties/transacties-analyse.tsx` (import r23; render r429-434)

- [ ] **Step 1: Wissel de component**

Vervang de import `TransactiesFeed` door `TransactieTijdlijn`, en het render-blok:

```tsx
          <TransactiesFeed
            transactions={currentTxns}
            periodLabel={periodWindow.label}
            budgetOptions={budgetOptions}
            onSelect={openEdit}
          />
```
door:

```tsx
          <TransactieTijdlijn
            transactions={accountFiltered}
            windowDays={periodDays}
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            onSelect={openEdit}
          />
```

- [ ] **Step 2: Voeg state + afgeleiden toe**

Boven de render: `const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)`.
`const periodDays = useMemo(() => { const a = parseLocalDate(periodWindow.since); const b = parseLocalDate(periodWindow.until); return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1) }, [periodWindow.since, periodWindow.until])` (hergebruik een lokale `parseLocalDate` of inline split).
`const accountFiltered = useMemo(() => selectedAccountId ? currentTxns.filter((t) => t.account_id === selectedAccountId) : currentTxns, [currentTxns, selectedAccountId])`.
Verwijder `budgetOptions` (niet meer gebruikt door de tijdlijn) — laat staan als andere blokken het gebruiken; anders schoon op.

- [ ] **Step 3: Typecheck + visuele check**

Run: `npx tsc --noEmit` → schoon.
Start de app (`npm run dev`) en open `/overzicht/cashflow/transacties`: de feed toont opgeschoonde namen, dag-koppen met vrijheidstijd, en de rekening-selector. Op demo-data zijn saldo/FX afwezig (graceful).

- [ ] **Step 4: Commit**

```bash
git add "components/overview/transacties/transacties-analyse.tsx"
git commit -m "feat(transacties): TransactieTijdlijn vervangt TransactiesFeed in analyse"
```

---

## Fase 5 — Filters, zoeken, polish

### Task 14: Quick-chips + smart-search + Filters-bottom-sheet + URL-state

**Files:**
- Modify: `components/overview/transacties/transactie-tijdlijn.tsx`
- Test: `components/overview/transacties/transactie-tijdlijn.test.tsx`

- [ ] **Step 1: Falende test (filter-gedrag)**

```tsx
import { fireEvent } from '@testing-library/react'
it('filtert op Inkomsten-chip', () => {
  const txns = [
    { ...base, id: 'x', amount: -10, counterparty_name: 'Uitgave' },
    { ...base, id: 'y', amount: 50, counterparty_name: 'Inkomst', transaction_type: 'cb' },
  ]
  render(<TransactieTijdlijn transactions={txns} windowDays={30} accounts={[]} selectedAccountId={null} onSelectAccount={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /inkomsten/i }))
  expect(screen.getByText('Inkomst')).toBeInTheDocument()
  expect(screen.queryByText('Uitgave')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run → faalt**

Run: `npx vitest run components/overview/transacties/transactie-tijdlijn.test.tsx -t Inkomsten` → FAIL.

- [ ] **Step 3: Implementeer**

In `TransactieTijdlijn`:
- Lokale state `query`, `direction: 'all'|'expense'|'income'`, `onlyRecurring`, `amountMin/Max`, `sort`.
  **Geen datum-/periode-state** — de `PeriodeSelector` bovenaan de pagina is de enige tijdsbron.
- `const smart = useMemo(() => parseSmartQuery(query, new Date()), [query])` — gebruik **alleen**
  `smart.text`, `smart.amountMin/Max` en `smart.direction`. **Negeer `smart.dateFrom/dateTo` bewust**
  (datum komt van de periode bovenaan; nooit overschrijven).
- `const filtered = useMemo(() => transactions.filter(t => …), [transactions, query, direction, onlyRecurring, …])`: pas direction, bedrag-range, recurring (via `recurring`-set) en tekst (over `cleanMerchantName`, ruwe `description`, `counterparty_name`) toe. **Geen datum-filter.** Groepeer dan `filtered` i.p.v. `transactions`.
- **Quick-chips** boven de feed (platte tekstlabels, scherp, ink-actief): `Alles` · `Uitgaven` ·
  `Inkomsten` · `Terugkerend` · `Overboekingen` (laatste = `transaction_type==='transfer' || type.kind==='betaalverzoek'`)
  + een **Filters**-knop met Lucide `SlidersHorizontal` (`h-3 w-3`).
- **Zoekbalk** erboven (`type="search"`, italic placeholder met voorbeeld, `Search`-icoon van Lucide links,
  scherp, `border-[var(--border-ed)]`).
- **Filters-sheet** via `<ShellOverlay kind="sheet">` (of bestaande `BottomSheet`): bedrag-range-slider
  (module-thumb), sorteer-keuze (datum/bedrag/winkel), terugkerend-toggle, "Alles wissen". Live
  resultaat-aantal. **Geen periode-/datum-control in de sheet** (die zit bovenaan de pagina).
- **URL-state**: lees/schrijf `?rekening=&type=&zoek=` via `useSearchParams()` + `router.replace()`;
  `selectedAccountId` (uit Task 13) hoort hier ook in. Actieve filters als verwijderbare chips +
  "Alles wissen". **Geen** `?periode=` (eigendom van de pagina-`PeriodeSelector`).

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run components/overview/transacties/transactie-tijdlijn.test.tsx` → PASS.
Run: `npx tsc --noEmit` → schoon.

- [ ] **Step 5: Commit**

```bash
git add "components/overview/transacties/transactie-tijdlijn.tsx" "components/overview/transacties/transactie-tijdlijn.test.tsx"
git commit -m "feat(transacties): chips + smart-search + Filters-sheet + URL-state"
```

---

### Task 15: Polish — privacy-masking, empty/loading, a11y

**Files:**
- Modify: `components/overview/transacties/transactie-tijdlijn.tsx`

- [ ] **Step 1: Privacy-masking**

Vervang directe `formatCurrency`-calls op bedragen/saldo door `formatMaskedCurrency`/`MaskedAmount` (per `reference_privacy_masking`); haal de masker-status via `useMaskedAmounts()`.

- [ ] **Step 2: Empty-states**

Drie gevallen (per huisstijl Type 9): geen transacties (first-use, CTA "Koppel of importeer" → `/overzicht/bezittingen/cash`), geen resultaten van filter ("Geen resultaten. Wis filters." + knop), geen transacties op gekozen rekening. Gecentreerd, Playfair-kop + italic serif-zin + CTA.

- [ ] **Step 3: A11y**

Dag-koppen als `<h3 className="sr-only">` of `aria`-gelabeld; rijen `<button>` met toegankelijke naam (`{naam}, {bedrag}, {datum}`); rekening-selector `role="group"`; focus-ring zichtbaar; 44px targets op chips (verhoog `min-h`).

- [ ] **Step 4: Verifieer**

Run: `npx vitest run components/overview/transacties/` → PASS.
Run: `npx tsc --noEmit` → schoon.
Visuele check op `/overzicht/cashflow/transacties`: lege filter toont wis-CTA; oog-icoon maskeert bedragen én saldo.

- [ ] **Step 5: Commit**

```bash
git add "components/overview/transacties/transactie-tijdlijn.tsx"
git commit -m "feat(transacties): masking, empty-states en a11y voor tijdlijn"
```

---

### Task 16: Eindverificatie

- [ ] **Step 1: Volledige typecheck**

Run: `npx tsc --noEmit`
Expected: geen fouten.

- [ ] **Step 2: Relevante tests**

Run: `npx vitest run lib/transaction-display.test.ts lib/parsers/csv.test.ts components/overview/transacties/`
Expected: alle PASS.

- [ ] **Step 3: Echte-data-rooktest (handmatig)**

Importeer `CSV_A_NL60RABO0330370596_EUR_202601.csv` via `/core/cash/import` op een testrekening. Open
`/overzicht/cashflow/transacties`: `BCK*SHELL…` → "Shell", lopend saldo zichtbaar, ASR/PayPal `🔁`,
CHF-transactie toont FX-badge, rekening-selector schakelt correct. Bevestig dat budget/categorie nergens
in deze lens verschijnt.

- [ ] **Step 4: Commit (indien nog wijzigingen)**

```bash
git add -A
git commit -m "chore(transacties): eindverificatie verrijkte tijdlijn"
```

---

## Self-review (uitgevoerd)

- **Spec-dekking:** §4 datamodel → Tasks 1-4; §5 pure lib → Tasks 5-10; §6 component/type → Tasks 11-13;
  §9 filters + rekening-selector → Tasks 12 (selector) + 14 (chips/sheet/search); §10 states/empty/a11y →
  Task 15; §3 huisstijl → doorheen 12/14/15; §11 tests → elke fase + Task 16.
- **Placeholders:** geen "TBD/TODO"; code in elke code-stap. Task 12/14 bevatten substantiële maar
  expliciete component-code; de sheet-internals in Task 14 zijn beschreven met exacte props/gedrag.
- **Type-consistentie:** `AccountOption`, `AnalysisTransaction`-uitbreiding, `ParsedTransaction`-velden,
  `TypeInfo`/`TxKind`, `DayGroup<T>`, `SmartQuery`, `RecurringInput` consistent gebruikt tussen tasks.
- **Bekende open punten (niet-blokkerend):** partner-RPC-kolommen (alleen huishoud/partner-perspectief);
  token-namen in Task 12 verifiëren tegen `app/globals.css`.
```
