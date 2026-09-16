---
id: 0148-opeethypotheek-volgt-wanneer-nodig
title: 'Opeethypotheek volgt "Wanneer nodig": een app-only opeet-trigger naast de verkoop-only Excel-trigger'
status: aanvaard
date: 2026-09-16
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0148 — Opeethypotheek volgt "Wanneer nodig"

De opeethypotheek start in de horizon-kernel niet langer hard op een vaste leeftijd
wanneer de gebruiker "Wanneer nodig" kiest. Een apart, app-only veld
`WoningStrategieParams.opeetTrigger` laat de opeet-tak starten zodra het liquide
vermogen onder de behoefte-drempel zakt, met de ingestelde leeftijd als uiterste
vangnet. Het bestaande Excel-veld P!B58 (`trigger`) blijft verkoop-only; het
oracle-pad en de parity-suites zijn onaangetast.

## Context

- **Het scherm beloofde iets dat de kern niet deed.** Op het strategie-scherm
  (`components/future/strategie/housing-strategy-section.tsx`) staat bij
  Opeethypotheek + "Wanneer nodig": *"Automatisch op het moment dat je vermogen op
  raakt"*, met "uiterlijk op leeftijd" als fallback. De adapter vertaalde
  `on_depletion` echter naar `opeetStartleeftijdOpname = fallbackAge ?? triggerAge`, en
  `tables/bez.ts` activeerde de opeet-tak uitsluitend op `leeftijd ≥ die waarde`.
- **Excel kent de behoefte-trigger alleen voor Verkopen.** In het oracle-model geldt
  P!B58 ("Trigger verkoop") voor de AY-kolom (verkocht); de opeet-tak (BD/BE) start
  hard op P!B64. De fixture `huis-opeethypotheek` heeft P!B57 = Opeethypotheek,
  P!B58 = "Wanneer nodig" en P!B64 = 67 en verwacht een start op 67. De opeet-tak
  aan het bestaande `woning.trigger` hangen zou die fixture breken.
- **Gevolg in productie.** Bij een gebruiker raakte het liquide vermogen rond leeftijd
  50 op terwijl de opeethypotheek pas vanaf 67 startte; het gat van zeventien jaar
  vulde de synthetische tekort-lening (`rol 'tekortLening'`) met honderdduizenden
  euro's — een rekenkundig artefact, geen inzicht.
- **ADR 0029** maakte de opeethypotheek een echte grootboek-schuld; ADR 0032 legt de
  oracle-parity als harde randvoorwaarde vast; het gap-patroon V17/V19 (optioneel,
  inert-by-default `KernelInput`-veld dat het fixture-pad weglaat) is de beproefde
  vorm voor een bewuste afwijking van het oracle.

## Besluit

1. **Apart veld, app-only.** `WoningStrategieParams.opeetTrigger?: VerkoopTrigger`
   (`lib/horizon-kernel/types.ts`). Afwezig of `'Vaste leeftijd'` betekent exact het
   oracle-gedrag. `input-from-fixture.ts` zet het veld nooit. Alleen de app-adapter
   (`adapter/params.ts`, reverse_mortgage-tak) zet het op `'Wanneer nodig'` bij
   `on_depletion`, met `opeetStartleeftijdOpname` (= `fallbackAge ?? triggerAge`) als
   uiterste leeftijd en `drempelMaandenUitgave` via dezelfde marge-resolver als de
   downsize-tak (`resolveDepletionMarginYears`, TPR-06).
2. **Zelfde drempel als Verkopen.** De opeet-tak start in maand m zodra: al gestart
   (monotoon) ∨ (`leeftijd ≥ FIRE` ∧ `Prognose!J(m−1) < uitgaveNaPensioen/12 · idx ·
   drempelMaandenUitgave`) ∨ `leeftijd ≥ opeetStartleeftijdOpname`. Eén formule, één
   home (`tables/bez.ts#computeWoningblok`).
3. **De werkelijke start is engine-toestand.** Het woningblok draagt een virtuele,
   monotone kolom `opeetGestart` (patroon AY). Op de 0→1-overgang bevriest de engine
   `overwaardeBijOpeetStart` (overwaarde van m−1) en `opeetStartLeeftijd` (leeftijd
   in m) en geeft die via `BezWoningDep` door aan de maanden erna. In de startmaand
   zelf leest het blok exact dezelfde waarden uit zijn eigen m−1-invoer, zodat
   `bez.ts` een pure per-maand-functie blijft die uitsluitend m−1 leest.
4. **Spreiding over de werkelijke resterende levensverwachting.** De auto-opname
   spreidt de bevroren overwaarde-cap over `(90 − werkelijke startleeftijd)·12`
   maanden; bij een vaste leeftijd blijft dat `(90 − P!B64)·12`.
5. **`trigger` (P!B58) blijft verkoop-only.** De adapter zet 'm bij reverse_mortgage
   nog steeds mee (bestaand gedrag), maar de kern leest 'm alleen onder `'Verkopen'`.

## Gevolgen

- **Parity onaangetast.** Alle 19 fixtures, inclusief `huis-opeethypotheek`, draaien
  zonder `opeetTrigger` en blijven byte-identiek; geen rebaseline. De oracle-
  constante `opeetStartMonth` in `engine.ts` en de bevriezing op `mStart−1` blijven
  het pad voor `'Vaste leeftijd'`.
- **Gebruikers met Opeethypotheek + "Wanneer nodig"** zien de opname eerder starten
  en een kleinere (of geen) tekort-lening; FIRE-leeftijd, vrijheids-% en doelbedrag
  kunnen daardoor verschuiven — in de richting die het scherm al beloofde.
- **Catalogus.** `lib/architecture/calculations.ts`, calc `huis-strategie-trigger`
  (formule + constante) en de TPR-06-constante in calc "FIRE — horizon-kernel".
- **Vangnetten.** `lib/horizon-kernel/opeet-wanneer-nodig.test.ts` (vroege start,
  spreidingsformule, tekort-lening kleiner, vaste leeftijd byte-identiek, nooit-krap ≡
  vaste leeftijd op de uiterste leeftijd, Verkopen inert) en
  `adapter/instellingen-fase4.test.ts` (describe ADR 0148).
- **Buiten scope.** De preview-schatting van de maandopname in het strategie-scherm
  (`estimateReverseMortgagePayout`, 95 − triggerAge) is een app-zijdige indicatie en
  geen kernelwaarde; de UI-tekst hoeft niet te wijzigen omdat de kern nu doet wat de
  tekst al zei.
