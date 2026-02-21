# Fase 5 — Inter-Account Transfers

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 3 (parallel)*

---

## Doel

Verfijning van de inter-account transfer detectie en het categoriseren van eigen-rekening overschrijvingen. Het basisframework is recent geïmplementeerd (commit met TransferConfirmSheet en PendingTransferBanner).

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F5-01 | Als gebruiker wil ik een overboeking tussen eigen rekeningen herkennen | Hoog |
| F5-02 | Als gebruiker wil ik zien dat een transfer niet telt als uitgave of inkomen | Hoog |
| F5-03 | Als gebruiker wil ik transfers handmatig kunnen markeren | Middel |
| F5-04 | Als gebruiker wil ik spaar-sweeps (overschot naar spaarrekening) zien als budgetactie | Middel |
| F5-05 | Als gebruiker wil ik transfers in de Sankey/Boom visualisaties kunnen uitsluiten | Laag |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Transfer detectie (counterparty IBAN = eigen IBAN) | ✅ Bestaat | `isOwnAccountTransfer()` in `lib/parsers/categorize.ts` |
| TransferConfirmSheet modal | ✅ Bestaat | `components/app/transfer-confirm-sheet.tsx` |
| PendingTransferBanner | ✅ Bestaat | `components/app/pending-transfer-banner.tsx` |
| Transfer uitsluiten van budgetberekeningen | ✅ Bestaat | `transaction_type = 'transfer'` filter in cash/page.tsx |
| Transfer-koppeling (debet ↔ credit) | ⚠️ Deels | Geen expliciete linked_transfer_id kolom |
| Spaar-sweep als budgetactie | ❌ Ontbreekt | Geen automatische savings-sweep verwerking |
| Transfer uitsluiten uit visualisaties | ⚠️ Deels | Cash-pagina filtert, Sankey filtert niet altijd |

---

## Architectuurbeslissing

### Linked transfers
Voeg `linked_transfer_id` toe aan `transactions` voor bidirectionele koppeling:
```sql
ALTER TABLE transactions ADD COLUMN linked_transfer_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
```

---

## Implementatiestappen

### Stap 5.1 — DB migratie: linked_transfer_id
Zie architectuurbeslissing.

### Stap 5.2 — Transfer-matching verfijnen
In `TransferConfirmSheet`, bij bevestiging:
- Sla `linked_transfer_id` op voor beide transacties
- Update beide transacties naar `transaction_type = 'transfer'`

### Stap 5.3 — Spaar-sweep detectie
Bij transfer naar `budget_role = 'registered'` rekening:
- Optioneel: vraag of dit een savings-sweep is
- Koppel aan `invest-sweep` rollover type voor het bronbudget

### Stap 5.4 — Visualisatie-uitsluiting
In `BudgetSankey` en `BudgetTree`:
- Filter transacties met `transaction_type = 'transfer'` uit spending berekeningen
- (Sankey toont momenteel alle transacties via spending-map)

---

## Verificatie

- [ ] Eigen-rekening transfers worden correct gedetecteerd
- [ ] linked_transfer_id wordt opgeslagen bij bevestiging
- [ ] Transfers tellen niet mee in budget spending
- [ ] Sankey toont geen transfers als uitgaven

---

## Handoff Context → Fase 6

### DB schema na Fase 5
```sql
-- transactions tabel
linked_transfer_id UUID REFERENCES transactions(id) ON DELETE SET NULL
```

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
