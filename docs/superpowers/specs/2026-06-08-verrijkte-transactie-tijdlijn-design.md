# Verrijkte transactie-tijdlijn — ontwerp

**Datum:** 2026-06-08
**Route:** `/overzicht/cashflow/transacties`
**Module:** De Kern (amber/bruin)
**Status:** ontwerp goedgekeurd via visuele iteratie; klaar voor implementatieplan

---

## 1. Doel & context

De transactielijst op `/overzicht/cashflow/transacties` is nu een dag-gegroepeerde lijst
(`components/app/transacties-feed.tsx`) met type/zoek/rekening/**budget**-filters. Hij leest als een
tabel: ruwe banknamen (`BCK*SHELL T KEMPKE`), bedrag, weinig hiërarchie.

Doel: vervang de lijst door een **verrijkte, redactionele "Tijdlijn"-lens** die de bank-data leesbaar
maakt — opgeschoonde winkelnaam, transactietype, locatie·tijd, lopend saldo, terugkerend-detectie,
vreemde valuta — in de Editorial-Finance huisstijl, en die **filtering/zoeken** vlot maakt.

Marktonderzoek (Monzo, Copilot, Apple Card, Lunch Money, Emma, Monarch) bevestigde de hoogst-renderende
patronen: merchant-verrijking, tabulaire rechts-uitgelijnde bedragen, sticky dag-koppen met subtotaal,
quick-filter-chips + faceted bottom-sheet, smart-search, terugkerend-badges, bottom-sheet-detail.

### Kernbeslissingen (door gebruiker bevestigd)

1. **Scope = alleen de transactielijst + filtering/zoeken.** Niet de gauge/heatmap/inzichtblokken op
   dezelfde pagina.
2. **Budgetten spelen GEEN rol in dit overzicht.** Geen categorie-weergave, geen budget-filter, geen
   budget-afhankelijke groepering of iconografie. Categorisatie blijft een aparte laag elders.
3. **Data-scope = "alles in één":** zowel de UI als de **import-uitbreiding** (Rabobank-parser +
   migratie) zitten in deze spec, zodat lopend saldo, type-glyph, betrouwbaar-terugkerend en FX direct
   beschikbaar zijn.

### Wat de gebruiker écht heeft (Rabobank-CSV) — geverifieerd

De Rabobank-import (`lib/parsers/index.ts`, preset `rabobank`) mapt nu maar 6 velden. De bank lévert
meer dan TriFinity bewaart:

| Stored nu | Niet gemapt (in CSV aanwezig) |
|---|---|
| `date`, `amount`, `currency`, `is_income` | `Code` (transactietype) — kolom `transaction_type` bestaat maar wordt op `null` gezet |
| `counterparty_name` (ruw, `BCK*SHELL…`) | `Saldo na trn` (lopend saldo) |
| `counterparty_iban` | `Incassant ID` (vaste incassant) |
| `description` (= Omschrijving-1, locatie·tijd) | `Oorspr bedrag/munt/Koers` (FX) |
| `reference` (= Machtigingskenmerk) | Omschrijving-2/3, Reden retour, Betalingskenmerk |

> ⚠️ De `transactions`-tabel bevat nu **demo-data** (Albert Heijn/Lidl/… — al schoon). De
> merchant-opschoning is nodig zodra de échte Rabobank-CSV wordt geïmporteerd.

---

## 2. Scope

**In scope**
- Nieuwe `TransactieTijdlijn`-component die `TransactiesFeed` vervangt binnen `TransactiesAnalyse`.
- Lens-schakelaar-scaffold (alleen **Tijdlijn** actief; Kassabonnen/Kalender als latere, aparte specs).
- Pure displaylogica in nieuwe `lib/transaction-display.ts` (volledig unit-getest).
- Import-uitbreiding: migratie + `ParsedTransaction` + Rabobank-preset + `parseCSV` + import-persistentie.
- Filtering (quick-chips + Filters-bottom-sheet) + smart-search + URL-filterstate.

**Out of scope (expliciet)**
- Kassabonnen-lens en Kalender-heatmap-lens (gevalideerd in showcase, maar aparte specs).
- Budget/categorie-toewijzing en -filtering in deze lens.
- Echte merchant-logo's (privacy/extern); we gebruiken **monogram-initialen** + type-glyph.
- AI/LLM-smart-search (we doen een lichte regex-parser; LLM is later).

---

## 3. Huisstijl-conformiteit (Editorial Finance)

- **Scherpe hoeken** overal; alleen monogram blijft een scherp vierkant (geen `rounded-*`).
- **Fonts:** Playfair Display (winkelnaam), Source Serif 4 (italic sub/meta), DM Mono (bedragen, kickers,
  saldo) met `tabular-nums`.
- **Kleur:** Kern-module-accent (`--module-active-*` binnen Kern-context). Bedragen: `--ink` voor uit,
  `--positive` voor in; **nooit alleen kleur** — teken (`+`/`−`) en glyph dragen de betekenis mee.
- **Kicker-streep** (28×1px Kern-500) op sectie-/lens-labels.
- **Dag-kop** als dunne ink-onderlijn; **dubbele-lijn-finale** niet per dag (te druk) — wel optioneel als
  periode-eindtotaal onderaan de feed.
- **Privacy-masking:** bedragen via `useMaskedAmounts()` / `MaskedAmount` (per `reference_privacy_masking`).
- **Vrijheidstijd** in italic Source Serif, Kern-700.

---

## 4. Datamodel-wijzigingen (Tier B, "alles in één")

### 4.1 Migratie — `transactions`
Voeg toe (allemaal nullable; bestaande/demo-rijen blijven geldig):

```sql
alter table public.transactions
  add column running_balance numeric,        -- Saldo na trn
  add column creditor_id     text,           -- Incassant ID (SEPA creditor)
  add column fx_amount        numeric,       -- Oorspr bedrag
  add column fx_currency      text,          -- Oorspr munt
  add column fx_rate          numeric;       -- Koers
-- transaction_type bestaat al; gaan we nu vullen.
```

Via `mcp__supabase__apply_migration` (DDL gaat direct naar remote; lokale migrations-map is drift —
zie `reference_supabase_migration_drift`). Kolommen/RPC's vóór bouwen verifiëren.

### 4.2 `ParsedTransaction` (`lib/parsers/shared.ts`)
Breid uit met: `running_balance`, `creditor_id`, `fx_amount`, `fx_currency`, `fx_rate` (alle `… | null`).
`transaction_type` bestaat al.

### 4.3 `CSVPreset` + `parseCSV` (`lib/parsers/index.ts`, `lib/parsers/csv.ts`)
- Voeg optionele kolomindices toe aan `CSVPreset`: `balanceColumn`, `typeColumn`, `creditorColumn`,
  `fxAmountColumn`, `fxCurrencyColumn`, `fxRateColumn`.
- Vul ze voor de **Rabobank**-preset: `balanceColumn: 7`, `typeColumn: 13`, `creditorColumn: 17`,
  `fxAmountColumn: 23`, `fxCurrencyColumn: 24`, `fxRateColumn: 25`.
- `parseCSV` leest ze (indien aanwezig) en zet ze op `ParsedTransaction`. Andere banken laten ze `null`.
- `transaction_type` = `Code`-waarde (bv. `bc`, `ei`, `id`).

### 4.4 Import-persistentie (`app/(app)/core/cash/import/page.tsx`)
Het insert-statement schrijft de nieuwe kolommen mee. Ontbrekende waarden → `null`.

### 4.5 Perspectief-loader (RISICO — verifiëren)
`TransactiesAnalyse` laadt via `loadPerspectiveTransactions` (dual-use RPC, `lib/household/perspective-loader.ts`).
De nieuwe kolommen moeten in de RPC-select/het item terugkomen. **Vóór bouwen checken** of de RPC `select *`
doet (dan gratis) of een vaste kolomlijst (dan RPC/migratie aanpassen). Eigendoms-/privacy-aggregatie ongemoeid.

---

## 5. Pure displaylogica — `lib/transaction-display.ts`

Spiegelt `lib/transaction-insights.ts`: pure functies, geen Supabase, volledig unit-getest. Geen
budget-afhankelijkheid.

- `cleanMerchantName(raw): string` — verwijder PSP-prefixes (`BCK*`, `CCV*`, `PAY.nl*`, `ZTL*`, `iZ `),
  strip trailing winkelnummers/locaties (`Albert Heijn 1032` → `Albert Heijn`; `Hornbach Duiven` →
  `Hornbach`), title-case, kleine bekende-merchant-map (`SHELL`→`Shell`, `Esso …`→`Esso`,
  `PayPal …`→`PayPal`). Ruwe naam blijft bewaard voor de sub-regel/detail.
- `deriveType(code, counterparty, iban): { kind, glyph, label }` — Code-mapping:
  `bc`/`ba`→pin (`↘`), `ei`→incasso (`⟳`), `id`→iDEAL (`↘`), `bg`→overboeking (`→`),
  `cb`→bijschrijving (`↗`), `bv`→betaalverzoek (`↔`), `db`→bankkosten. Fallback-heuristiek uit
  `counterparty`/`description` wanneer `code` ontbreekt (oudere/andere imports).
- `parseLocationTime(description, kind): { place?, time? }` — uit Omschrijving-1-pinformaat
  (`ELST GLD, 6661KK, NLD, 09:39` → `{ place: 'Elst', time: '09:39' }`).
- `avgDailyExpense(txns, windowDays): number` — gemiddelde dag-uitgave over het zichtbare venster
  (totaal uitgaven ÷ dagen). **Budget-vrije** basis voor vrijheidstijd.
- `freedomDays(amount, avgDailyExpense): number` — via bestaande `calculateFreedomTime`.
- `detectRecurring(txns): Set<id>` — primair op `creditor_id` (≥2 voorkomens, ~maandcadans, stabiel
  bedrag ±15%); fallback op counterparty-key-cadans wanneer `creditor_id` ontbreekt.
- `groupByDay(txns): DayGroup[]` — dag-buckets met `{ date, rows, expenseTotal, incomeTotal }`, gesorteerd
  nieuw→oud.
- `parseSmartQuery(q): { text, amountMin?, amountMax?, dateFrom?, dateTo?, type? }` — herkent
  `boven/onder/> /< €X`, maandnamen + "vorige maand/dit jaar", type-woorden; valt terug op vrije tekst.
- `monogram(name): string` — 1–2 initialen uit de opgeschoonde naam.

---

## 6. Componenten

### 6.1 `components/overview/transacties/transactie-tijdlijn.tsx` (NIEUW)
Vervangt het gebruik van `TransactiesFeed` in `TransactiesAnalyse`. Pure presentatie; krijgt verrijkte
`AnalysisTransaction[]` + handlers. Verantwoordelijk voor lens-scaffold, smart-search, quick-chips,
Filters-sheet-trigger, dag-groepering, rij-rendering, states, empty/loading.

### 6.2 `AnalysisTransaction` (`lib/transaction-insights.ts`)
Breid het type uit met de ruwe extra velden: `running_balance`, `transaction_type`, `creditor_id`,
`fx_amount`, `fx_currency`, `fx_rate`. Displayvelden (cleanName, typeInfo, locationTime, isRecurring,
monogram) worden in een `useMemo` via `transaction-display`-helpers afgeleid — niet in de DB.

### 6.3 `transacties-analyse.tsx` (WIJZIGEN)
- `mapRow` draagt de nieuwe velden mee uit het `PerspectiveItem`.
- De data-load-`select` neemt de nieuwe kolommen mee (zie 4.5).
- Vervang `<TransactiesFeed … budgetOptions={…} />` door `<TransactieTijdlijn … />` **zonder**
  `budgetOptions` (budget speelt geen rol). `budgetGroups`/budget-afgeleiden blijven voor de andere
  blokken op de pagina, niet voor de tijdlijn.

### 6.4 Detail bij tik
Rij-klik → bestaand `TransactionForm` (bewerken) blijft. De rij-sub-regel toont al de rijke context
(type, locatie·tijd, ruwe omschrijving). Optioneel (nice-to-have, niet blokkerend): een read-only
detail-kop in de sheet met lopend saldo, `creditor_id`, FX en IBAN.

---

## 7. Rij-anatomie (definitief)

```
[ MONOGRAM ] | Winkelnaam (Playfair 14.5) · type-glyph · [🔁]/[↔]      |  − €70,76   ← DM Mono, centen gedimd
[ scherp □ ] | locatie · tijd  (italic Source Serif, ruw als titel)    |  saldo €901,63  ← gedimd, als aanwezig
             | [FX: CHF 1,00 @ 0,935]  (alleen bij fx_*)               |
```

- Monogram: 33px scherp vierkant, `--kern-50` bg, DM Mono initialen `--kern-700`.
- Inkomst/terugbetaling: naam + bedrag in `--positive`, glyph `↗`.
- Overboeking (`linked_transfer_id` of betaalverzoek): glyph `↔`.
- Terugkerend: `🔁`-badge (klein, mono, Kern-200-rand).
- **Graceful degradation:** ontbreekt `running_balance`/`transaction_type`/`fx_*` (bv. demo-data of
  ING-import) → die elementen renderen simpelweg niet. De rij blijft kloppen ("Tier A"-look); na
  her-import van de echte Rabobank-CSV lichten ze vanzelf op.

## 8. Dag-kop

```
DO 5 JUN  ───────────────────────────────  − €82,40 · ≈ 0,9 vrijheidsdag
```
Mono kicker links (sticky bij scroll), rechts subtotaal (`−`/`+`) + vrijheidstijd. Bij netto-inkomst-dag:
`+ €…`. Vrijheidstijd-basis = `avgDailyExpense` (budget-vrij); label blijft eerlijk ("≈").

## 9. Filtering & zoeken

- **Quick-chips** (sharp, ink-actief): Alles · Uitgaven · Inkomsten · 🔁 Terugkerend · ↔ Overboekingen.
  **Geen** budget/categorie-chips.
- **Filters-bottom-sheet** (`ShellOverlay kind="sheet"`): type (in/uit/alles), bedrag-range (slider met
  module-thumb), periode (presets `deze maand/vorige/dit jaar` + aangepast), rekening (multi), sorteer
  (datum/bedrag/winkel). Live resultaat-aantal.
- **Smart-search**: `parseSmartQuery` → facetten; fallback vrije tekst over `cleanName` + ruwe
  omschrijving + counterparty.
- **URL-filterstate**: actieve filters in query-params (deelbaar, terug-knop herstelt) — conform
  huisstijl search/filter-regel. Actieve filters als verwijderbare chips + "Alles wissen".

## 10. States, edge cases, foutafhandeling

- **Empty:** first-use ("Nog geen transacties — koppel of importeer"), no-results ("Geen resultaten. Wis
  filters."). Onderscheiden copy + CTA.
- **Loading:** skeleton dat de feed-layout matcht (geen layout-shift), geen spinner+skeleton tegelijk.
- **Privacy/perspectief:** bedragen al perspectief-geschaald door parent; partner-"totalen"-melding blijft.
- **Merchant-opschoning false-positives:** ruwe naam altijd bewaard (sub-regel/detail) zodat niets
  "verdwijnt".
- **Toegankelijkheid:** rijen klikbaar als `<button text-left>`, focus-ring, 44px targets, glyph+teken
  naast kleur, dag-koppen als headings/`aria`.

## 11. Teststrategie

- **Unit** (`lib/transaction-display.test.ts`): cleaning (Rabobank-formaten), deriveType (alle codes +
  fallback), parseLocationTime, detectRecurring (creditor + fallback), avgDailyExpense/freedomDays,
  parseSmartQuery, groupByDay, monogram.
- **Parser** (`lib/parsers/csv.test.ts` / fixture): Rabobank-rij → `running_balance`, `transaction_type`,
  `creditor_id`, `fx_*` correct gemapt; andere banken → `null`.
- **Component** (`transactie-tijdlijn.test.tsx`): groepering, subtotaal, quick-chips, smart-search-fallback,
  graceful degradation (null Tier-B-velden), income/transfer/recurring states.
- `npx tsc --noEmit` + relevante vitest-paden groen (worktrees uitgesloten, zie
  `reference_vitest_worktree_exclude`).

## 12. Bouwvolgorde (binnen deze spec)

1. **Data-fundament:** migratie (5 kolommen) → `ParsedTransaction` → `CSVPreset`/`parseCSV` →
   import-persistentie. Verifieer perspectief-RPC-velden (4.5).
2. **Pure lib:** `lib/transaction-display.ts` via TDD.
3. **Component:** `TransactieTijdlijn` + integratie in `TransactiesAnalyse` (vervang `TransactiesFeed`,
   breid `mapRow` + load-select uit). Graceful degradation eerst — werkt ook op huidige demo-data.
4. **Filters & zoeken:** quick-chips + Filters-sheet + smart-search + URL-state.
5. **Polish:** privacy-masking, empty/loading/a11y, optioneel rijk detail.
6. **Verificatie:** tests + tsc + visuele check op `/overzicht/cashflow/transacties` (én na een echte
   Rabobank-import).

## 13. Risico's & open punten

- **Perspectief-RPC** moet de nieuwe kolommen teruggeven (4.5) — kan een RPC-update vergen.
- **Her-import** nodig om Tier-B-velden te vullen; bestaande rijen blijven Tier-A tot her-import. Bewust
  geaccepteerd (graceful degradation).
- **Code-mapping `bg`/`cb`/`ba`** semantiek bij randgevallen (retour `ba` = positief; `cb` = diverse
  bijschrijvingen) — vastleggen in `deriveType`-tests met echte voorbeelden.
- **Recurring-heuristiek** kan in het begin (1 maand data) weinig detecteren; `creditor_id` lost dit op
  zodra meerdere maanden geïmporteerd zijn.
```
