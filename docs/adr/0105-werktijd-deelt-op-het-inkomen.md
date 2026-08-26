---
id: 0105-werktijd-deelt-op-het-inkomen
title: Werktijd deelt op het inkomen, vrijheidstijd op de uitgaven
status: aanvaard
date: 2026-08-26
elements: [as-belasting, as-budget]
---

De app kende één tijd-metafoor: **vrijheidstijd** — een bedrag gedeeld door het
uitgaven-dagtarief ("hoeveel dagen van mijn levensstijl koopt dit"). Twee
oppervlakken presenteerden dat getal echter met **werktijd-taal** ("die je werkt
om te betalen", "per jaar opgeofferd aan belasting"). Vrijheidstijd-getallen zijn
onafhankelijke uitgaven-aandelen en dus niet optelbaar tot een werkjaar, waardoor
`/overzicht/belasting` ("9 maanden per jaar") en
`/overzicht/cashflow/vaste-lasten` ("9 maanden") samen **achttien maanden per
jaar** claimden. Besluit: werktijd wordt een aparte, canonieke grootheid die
deelt op het **bruto dagelijks inkomen** — één noemer voor alle werktijd-claims,
zodat ze delen van dezelfde taart zijn.

## Context

Bevinding C5 van het onafhankelijke UX-testpanel (24-08-2026, S0-blocker):

> Belasting: "€34.144 — 9 maanden per jaar" naast "EFFECTIEF 36,6%". Vaste
> lasten: "€34.628 — 9 maanden". Samen achttien.

Code-onderzoek bevestigde het mechanisme en corrigeerde de hypothese: er was
**geen rekenfout**. `dailyExpenseRate` (`lib/format.ts`) en de 12-maands rolling
grondslag (`lib/expense-rate.ts`) zijn app-breed de bewuste canonieke bron voor
€→vrijheidstijd, en dat blijft zo. Vier oppervlakken gebruikten exact dezelfde
formule; twee met correcte uitgaven-taal ("kost je ≈ X aan vrijheid" —
`/overzicht/belasting/box1`, `box3-heffingsvrij.tsx`) en twee met werktijd-taal:

- `components/overview/belasting/hub-totale-druk.tsx` — "… per jaar opgeofferd
  aan belasting", en dat pal naast het écht inkomen-relatieve "Effectief 36,6%"
  op dezelfde kaart. Een lezer legt die twee onvermijdelijk op dezelfde schaal:
  "9 van 12" leest dan als 75% druk.
- `components/overview/vaste-lasten-insights.tsx` — "… die je werkt om je vaste
  lasten te betalen".

De teller (belasting zit doorgaans niet als afschrijving in de transactie-feed)
noch de noemer (totale uitgaven, inclusief de vaste lasten zelf) heeft iets met
een werkjaar te maken. De taal beloofde een verdeling van één jaar; het getal
leverde twee onafhankelijke aandelen.

## Besluit

**Twee grootheden, elk met een eigen noemer, eigen module en eigen taal.**

| | Vrijheidstijd | Werktijd |
|---|---|---|
| Vraag | "hoeveel dagen leven koopt dit bedrag?" | "welk deel van mijn werkjaar gaat hier naartoe?" |
| Noemer | uitgaven-dagtarief (12-mnd rolling) | **bruto** dagelijks inkomen |
| Conversie | `lib/format.ts#calculateFreedomTime` | `lib/work-time.ts#calculateWorkTime` |
| Bron van de noemer | `lib/expense-rate.ts` | `lib/income-rate.ts` |
| Toegestane taal | "kost je ≈ X vrijheid" | "je werkt ≈ X van je jaar hiervoor" |
| Optelbaar? | nee | ja — tot ten hoogste 12 maanden |

1. **`lib/income-rate.ts` is de enige bron van het dagelijks-inkomentarief.** Het
   bruto jaarinkomen komt uitsluitend uit `resolveBox1GrossIncome`
   (`lib/box1-income.ts`) — de canonieke bruto Box 1-grondslag van ADR 0086
   (handmatige `profiles.box1_gross_income`-override wint, anders het effectieve
   netto jaarinkomen van ADR 0103 via `grossFromNet`). Er komt géén tweede weg
   naar bruto inkomen bij; dat zou precies de fout herhalen die C5 opleverde.
2. **Bruto, niet netto.** Belasting wordt uit het bruto inkomen betaald. Met
   netto als noemer telt de belastingclaim tegen een taart waar hij zelf al uit
   is gehaald, en komt "belasting + vaste lasten" opnieuw boven de twaalf
   maanden uit (op de PDF-cijfers: 6,9 + 7,0 = 13,9 maanden). Bruto is de enige
   noemer waaronder de claims per constructie delen van hetzelfde jaar zijn.
3. **De noemer staat in de tekst.** De canonieke formulering is
   `"4,4 van de 12 maanden"` (`formatWorkTimeString`). Een lezer ziet daarmee
   meteen dat het om een deel van hetzelfde werkjaar gaat.
4. **Geen basis → geen claim.** Zonder bekend bruto jaarinkomen is
   `dailyRate = 0` en `hasBasis = false`; het oppervlak toont dan de
   vrijheidstijd-formulering in plaats van een verzonnen werktijd-claim. Dit
   spiegelt de bestaande `dailyExpenseRate ?? 0`-conventie: 0 betekent "geen
   eerlijke basis", niet "reken maar iets uit".
5. **Overschrijding is een alarm, geen afkap.** `shareOfWorkYear` en `workDays`
   blijven ongeknipt; `exceedsWorkYear` markeert een bedrag boven het hele
   werkjaar. Alleen de *getoonde* maanden zijn geknipt op
   `WORK_TIME_DISPLAY_MAX_MONTHS = 99`, tegen ruis bij een degenereerde noemer.

## Gevolgen

- **Nieuwe bestanden.** `lib/work-time.ts` (puur, client-veilig: conversie +
  formattering) en `lib/income-rate.ts` (server: de canonieke rate-bron).
  Dezelfde tweedeling als `lib/format.ts` / `lib/expense-rate.ts`.
- **Nieuwe constanten** in `lib/constants.ts`: `DAYS_PER_YEAR`,
  `WORK_YEAR_MONTHS`, `WORK_TIME_DISPLAY_MAX_MONTHS`.
- **De belasting-hub betaalt niets extra.** `kansen.grossYearly` *is* al
  `resolveBox1GrossIncome`; de hub gebruikt daarom de pure variant
  `dailyIncomeRateFromGrossYearly` — zelfde grondslag, nul extra queries.
- **`/overzicht/cashflow/vaste-lasten` krijgt één extra parallelle loader.**
  `getCanonicalDailyIncomeRate` trekt via `loadCashflowSettingsData` de
  `loadCoreData`-bundel binnen. Dat is dezelfde koppeling die het aandachtspunt
  `bruto-box1-grondslag-meervoudig` al registreert (opvolgactie: override-first
  met lazy estimate); er komt geen nieuwe koppeling bij. De aanroep draait
  parallel met de drie bestaande loaders en faalt zacht: bij een fout verdwijnt
  de werktijd-regel, niet de pagina. Bewust géén goedkopere afleiding uit
  `kpis.monthlyIncome` — dat is netto én een andere grondslag, en zou dit scherm
  een ánder werkjaar geven dan de belasting-hub.
- **Vrijheidstijd is ongewijzigd.** `calculateFreedomTime`, `dailyExpenseRate`,
  `lib/expense-rate.ts` en de gate `scripts/check-freedom-time-basis.mjs` zijn
  niet aangeraakt. De twee al-correcte oppervlakken (box1-hero,
  box3-heffingsvrij) blijven zoals ze waren — die waren de referentie.
- **Regel voor nieuwe oppervlakken:** werktijd-taal ("werken voor", "opofferen
  aan", "X maanden per jaar") mag alleen boven een `WorkTimeBreakdown` staan.
  Staat er een `FreedomTimeBreakdown` onder, dan hoort er uitgaven-taal bij
  ("kost je ≈ X vrijheid").
- **Vastgelegd in** `lib/work-time.test.ts` (degeneraties, de C5-cijfers, de
  som-invariant, de display-cap) en `lib/vaste-lasten-insights.test.ts` (werktijd
  beweegt niet mee met het uitgaven-dagtarief; zonder inkomen geen claim).
  Catalogus-entry: `werktijd` in `lib/architecture/calculations.ts`.
