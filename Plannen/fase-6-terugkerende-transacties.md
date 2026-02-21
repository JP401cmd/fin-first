# Fase 6 — Terugkerende Transacties

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 4*

---

## Doel

Uitbreiding en verfijning van het terugkerende transacties systeem voor automatische categorisering en cashflow-voorspelling.

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F6-01 | Als gebruiker wil ik terugkerende transacties aanmaken (maandelijks, wekelijks, jaarlijks) | Hoog |
| F6-02 | Als gebruiker wil ik zien wanneer de volgende afschrijving verwacht wordt | Hoog |
| F6-03 | Als gebruiker wil ik terugkerende transacties koppelen aan een budget | Hoog |
| F6-04 | Als gebruiker wil ik een melding krijgen als een terugkerende transactie is gemist | Middel |
| F6-05 | Als gebruiker wil ik terugkerende transacties automatisch herkennen uit importhistorie | Laag |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Terugkerende transacties CRUD | ✅ Bestaat | `recurring_transactions` tabel + UI in cash/page.tsx |
| Frequentie-types (monthly/weekly/yearly/biweekly/quarterly) | ✅ Bestaat | `FREQUENCY_LABELS` in `lib/recurring-data.ts` |
| Budget koppeling op recurring | ✅ Bestaat | `budget_id` kolom op `recurring_transactions` |
| Cashflow forecast | ✅ Bestaat | `CashFlowForecastChart` + `/api/cashflow-forecast` |
| Volgende-datum weergave | ✅ Bestaat | `getNextOccurrence()` in `lib/recurring-data.ts` |
| Gemist-detectie | ❌ Ontbreekt | Vergelijking recurring verwacht vs. werkelijk ontvangen |
| Auto-herkenning uit import | ❌ Ontbreekt | Patroon-detectie bij import |
| Budget-impact van recurring | ⚠️ Deels | Cashflow forecast gebruikt recurring, budget spending niet |

---

## Architectuurbeslissing

### Gemist-detectie
Bereken per recurring: verwacht in periode vs. gevonden transacties met zelfde tegenpartij/bedrag.
Geen nieuwe tabel nodig — berekening in API.

---

## Implementatiestappen

### Stap 6.1 — Gemiste recurring banner
In `app/(app)/core/cash/page.tsx`:
- Vergelijk `recurring_transactions` met transacties in huidige maand
- Toon banner: "3 verwachte betalingen zijn nog niet binnengekomen"
- Link naar recurring-lijst met gemiste items gemarkeerd

### Stap 6.2 — Budget-impact in recurring-lijst
In de recurring-sectie van cash/page.tsx:
- Toon budget-naam naast elke recurring
- Toon totale maandlast van alle recurrings per budget

### Stap 6.3 — Auto-herkenning bij import
In `app/(app)/core/cash/import/page.tsx`:
- Na import: analyseer patronen (zelfde tegenpartij, vergelijkbaar bedrag, regelmatig)
- Suggestie: "We herkennen een maandelijkse betaling aan X. Wil je dit als terugkerend markeren?"

---

## Verificatie

- [ ] Gemiste recurrings worden gedetecteerd en getoond
- [ ] Budget-impact per recurring is zichtbaar
- [ ] Import-suggestie verschijnt na patroon-detectie

---

## Handoff Context → Fase 7

### DB schema na Fase 6
Geen wijzigingen — alles via bestaande `recurring_transactions` tabel.

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
