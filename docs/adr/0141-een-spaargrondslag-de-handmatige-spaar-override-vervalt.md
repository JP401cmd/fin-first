---
id: 0141-een-spaargrondslag-de-handmatige-spaar-override-vervalt
title: 'Eén spaargrondslag: de handmatige spaar-override (monthly_savings_override) vervalt'
status: aanvaard
date: 2026-09-13
elements: [as-planning, as-budget, fn-budgetteren]
---

# 0141 — Eén spaargrondslag: de handmatige spaar-override vervalt

## Context

Sinds ADR 0121 is de **effectieve spaarquote** (`resolveSavingsSource(...)`, de
grondslag-geresolveerde quote van ADR 0103) hét spaargetal op elk oppervlak, en
`baseAnnualSavings` (= inkomen × die quote) de €-stroom die de FIRE-prognose
voedt. Daarnaast bestond nog een oudere, tweede spaarbron:
`profiles.monthly_savings_override` (migratie 20260513000002), een handmatig
maandbedrag dat in `buildHorizonInput` vóór de effectieve grondslag ging
("override → cashflow-spaarquote → asset-aggregaat").

Het onderzoek Plan-review Toekomst (13-09-2026, bijvangst 5 / TPR-08) liet zien
dat die override een **halve grootheid** was geworden:

- Hij voedde uitsluitend de *metadata*-tak — `UnifiedProjectionInput.annualSavings`
  en de housing-trigger-basis in de horizon-loader — maar **niet de kern**. De
  horizon-kernel leidt sparen zelf af als netto jaarinkomen − geschatte jaaruitgaven
  op de grondslag-geresolveerde profielrij (`kernel-profile-basis.ts`). Een
  gebruiker die zijn spaarbedrag handmatig zette, zag dat niet terug in de
  hoofdlijn — gedocumenteerd als "bekende afwijking 1" in
  `lib/horizon-kernel/adapter/whatif-varianten.ts`.
- De spaarquote-widget, het instellingenblok en de gezondheidsscore rekenden al met
  de effectieve grondslag (ADR 0121); stond de override, dan spaarde "de prognose"
  een ander bedrag dan de widget toonde. Precies de drift die 0121 hoort uit te
  sluiten.
- Het enige invoerveld ervoor (`FireSavingsPanel`) werd nergens meer gemount. De
  waarde kon dus niet meer gezet of gewist worden, maar accounts die 'm ooit
  zetten droegen hem nog wél.

## Besluit

1. **Eén spaargrondslag, app-breed.** Dashboard, `/toekomst`, wat-als,
   gebeurtenissen-preview, totaalplan-rapport en de vrijheidsmijlpalen rekenen
   allemaal met `baseAnnualSavings` uit `resolveSavingsSource` (ADR 0121); alleen
   zónder bruikbare grondslag valt de metadata terug op het asset-aggregaat
   (`Σ assets.monthly_contribution × 12`). Een spaarbedrag aanpassen gaat via de
   grondslagkeuze van inkomen/uitgaven (ADR 0103), niet via een losse override.
2. **`profiles.monthly_savings_override` wordt nergens meer gelezen of
   geschreven.** `buildHorizonInput` kent de parameter niet meer;
   `GET/PUT /api/fire-settings` leest noch schrijft het veld (een meegestuurde
   waarde wordt genegeerd); de horizon-, dashboard- en wat-als-paden lezen de
   kolom niet meer. Het dode `components/horizon/fire-savings-panel.tsx` is
   verwijderd.
3. **De kolom blijft in de database.** Geen destructieve migratie: de kolom is
   inert, kost niets en een drop is een aparte, bewuste schemawijziging.
4. **Divergentie opgeheven.** "Bekende afwijking 1" in `whatif-varianten.ts` is
   herschreven als opgelost: kern en metadata delen dezelfde grondslag.

## Gevolgen

- **Accounts met een gezette waarde kunnen een verschuiving zien.** Voor wie ooit
  een override invulde die afweek van inkomen × spaarquote, veranderen de
  FIRE-leeftijd/vrijheids-% op de *metadata*-tak (housing-trigger, mijlpalen,
  `annualSavings` in wat-als-overlays) — de kernel-hoofdlijn rekende al zonder de
  override, dus die verschuift niet. Aanvaard: het getal dat de widget toont is
  nu hetzelfde getal waarmee de prognose rekent.
- `HorizonRawData`, `HorizonFireSimInput`, `KernelInputBundle`, `KernelSimData`
  en `BuildHorizonInputParams` verliezen het veld `monthlySavingsOverride`; de
  compiler wijst elke achtergebleven consument aan.
- De skill `woonstrategie-check` noemt `monthly_savings_override:null` nog als
  voorbeeld-body voor `PUT /api/fire-settings`; dat voorbeeld werkt nog (het veld
  wordt genegeerd) maar is achterhaald — bijwerken loopt via de hoofdthread
  (`.claude/` wordt niet door een drain-agent geraakt).

## Alternatieven

- **De override alsnog de kern in leiden** (via `kernel-profile-basis.ts` een
  geforceerd spaarbedrag boven de grondslag). Afgewezen: het voegt een derde
  grondslag toe bovenop budget/transactie/handmatig, terwijl de handmatige
  grondslag (`income_source`/`expenses_source = 'manual'`) hetzelfde doel al
  dient. Twee knoppen voor één getal is de drift van 0121 opnieuw.
- **Kolom droppen.** Afgewezen voor nu: onomkeerbaar, geen functionele winst;
  kan later als eigen schemawijziging.
