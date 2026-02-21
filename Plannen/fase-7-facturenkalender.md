# Fase 7 — Facturenkalender

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 6*

---

## Doel

Een kalenderweergave van verwachte inkomsten en uitgaven, gebouwd op de bestaande `recurring_transactions` en cashflow forecast data.

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F7-01 | Als gebruiker wil ik een kalenderoverzicht zien van verwachte betalingen | Hoog |
| F7-02 | Als gebruiker wil ik per dag zien welke betalingen verwacht worden | Hoog |
| F7-03 | Als gebruiker wil ik het verwachte saldo per dag van de maand zien | Middel |
| F7-04 | Als gebruiker wil ik "drukke weken" in de kalender herkennen | Laag |
| F7-05 | Als gebruiker wil ik facturen handmatig toevoegen aan de kalender | Laag |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Recurring transactions als databron | ✅ Bestaat | `recurring_transactions` + `getNextOccurrence()` |
| Cashflow forecast per dag | ✅ Bestaat | `/api/cashflow-forecast` geeft dagpunten |
| Kalender UI component | ❌ Ontbreekt | Geen kalendercomponent in de app |
| Dag-saldo visualisatie | ❌ Ontbreekt | Wel in CashFlowForecastChart (lijn), niet als kalender |
| Handmatige facturen | ❌ Ontbreekt | Geen apart "factuur" concept |

---

## Architectuurbeslissing

Geen nieuwe database-tabel nodig voor basis-implementatie. Kalender bouwt op bestaande data:
- Recurring transactions: verwachte betalingen
- Cashflow forecast API: verwacht saldo per dag
- Bestaande transacties: bevestigde betalingen

---

## Implementatiestappen

### Stap 7.1 — Kalendercomponent
Nieuw component `components/app/bill-calendar.tsx`:
- Maand-grid (7 kolommen)
- Per dag: badges voor verwachte betalingen (recurring)
- Kleurcodering: inkomen (groen), uitgave (rood), transfer (grijs)

### Stap 7.2 — Dag-saldo lijn
In de kalender, onder het grid:
- Kleine sparkline per dag met verwacht einde-dag-saldo
- Waarschuwingsindicator bij negatief verwacht saldo

### Stap 7.3 — Integratie in cash/page.tsx
Voeg tabblad "Kalender" toe aan de cash-pagina naast de transactielijst.

---

## Verificatie

- [ ] Kalender toont recurring betalingen op juiste datums
- [ ] Dag-saldo lijn is zichtbaar en klopt met cashflow forecast
- [ ] Kalender is responsief op mobiel

---

## Handoff Context → Fase 8

Geen DB-wijzigingen in Fase 7.

---

> ⚠️ **MODELADVIES — schakel over naar Opus 4.6 vóór je Fase 8 start.**
>
> Fase 8 (Huishouden & Multi-user) bevat complexe Row Level Security policies voor gedeelde data tussen gebruikers. Een fout in RLS heeft directe beveiligingsimplicaties (gebruiker A ziet data van gebruiker B). Opus 4.6 redeneert beter over security edge cases en policy-conflicten dan Sonnet.
>
> Schakel terug naar Sonnet 4.6 na afronding van Fase 8.

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
