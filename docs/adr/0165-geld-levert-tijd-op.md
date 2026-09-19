---
id: 0165-geld-levert-tijd-op
title: 'Geld levert tijd op — de leus "geld is opgeslagen tijd" en de koop-/verkoop-metafoor vervallen'
status: aanvaard
date: 2026-09-19
elements: [as-coach, t-aigateway, sp-inzicht]
---

# 0165 — Geld levert tijd op

Eigenaarsbesluit van 19 september 2026 op Notion-kaart B-051
(`2026-09-18-testbug-d901ad`), keuzes K1 t/m K6. Dit is **fase 0** van een
gefaseerd spoor: de norm gaat eerst, de kopij-sweep volgt.

## Context

TriFinity droeg sinds het begin één leus: *"Geld is opgeslagen tijd — elke euro
vertegenwoordigt een stukje levenstijd."* Daaromheen was een koop-/verkoop-
metafoor gegroeid: vrijheid werd *vrijgekocht*, schulden waren *vrijheid die je
terugkoopt*, een transactie was *gekochte of verkochte tijd*, en na pensionering
leefde je van *teruggekochte levenstijd*.

Een testgebruiker meldde dat dit niet klopt en te ingewikkeld is: geld kán tijd
opleveren, maar tijd kopen of terugverkopen is geen eerlijke voorstelling van
zaken. De eigenaar deelde die lezing.

Bij het onderzoek bleek de formulering op drie plekken te leven met een
verschillende opdracht:

| Laag | Voorbeelden | Besluit |
|---|---|---|
| **Functionaliteit** — geld → tijd omrekenen | `formatWithFreedom`, vrijheidstijd/vrijheidsdagen, dagtarief, `freedomDaysAtAge` | **Blijft.** Dit ís "geld levert tijd op". |
| **De leus als claim** | "Geld is opgeslagen tijd", "elke euro vertegenwoordigt een stukje levenstijd", "nu leef je van opgeslagen tijd" | **Vervalt.** |
| **De koop-/verkoop-metafoor** | "vrijgekocht", "Al vrijgekocht", "vrijheid die je terugkoopt", "gekochte of verkochte tijd", "teruggekochte levenstijd" | **Vervalt.** |

De tijdvertaling zelf is precies wat TriFinity onderscheidt (zie het
positioneringsonderzoek van september 2026: nul van 34 vergeleken aanbieders
doet het). Het besluit raakt dus de taal, niet de functionaliteit.

## Besluit

**De leus is: "Geld levert tijd op."** Elk bedrag staat voor tijd waarin de
uitgaven gedekt zijn. De oude leus en de koop-/verkoop-metafoor worden niet meer
gebruikt — niet in de app, niet in prompts, niet in agent- en skill-definities.

Canonieke vervangtaal (eigenaarskeuzes K1 t/m K5):

| Oud | Nieuw |
|---|---|
| "Geld is opgeslagen tijd." | "Geld levert tijd op." (K1-A) |
| "elke euro vertegenwoordigt een stukje levenstijd" | "elk bedrag staat voor tijd waarin je uitgaven gedekt zijn" |
| "vrijgekocht" / "Al vrijgekocht" | "opgebouwd" / "Al opgebouwd" (K3) |
| "Ik kocht al X vrijheid" | "Ik heb al X vrijheid opgebouwd" |
| "vrijheid die je terugkoopt" (schulden) | neutraal "schulden die je aflost", met de positieve regel "elke aflossing levert tijd op" (K2-C) |
| "Elke transactie is gekochte of verkochte tijd" | "Elke transactie kost of levert tijd op" |
| "teruggekochte levenstijd" (onttrekking) | "tijd die je vermogen je nu oplevert" |
| DNA-regel *"gebruik 'vrijgekocht' i.p.v. 'gespaard'"* | *"gebruik 'opgebouwd'"* + een **expliciet verbod** op koop-/verkoop-werkwoorden |
| context-label "Vrijgekochte tijd:" | "Opgebouwde vrijheidstijd:" |

Het losse woord *levenstijd* zonder koop-werkwoord blijft toegestaan (K5).

**Het verbod staat expliciet in het DNA, niet alleen impliciet.** De modellen
hebben de koop-taal jarenlang in hun systeemprompt gehad; zonder een regel die
de woorden bij naam noemt, schrijven ze 'm terug.

**"Levert tijd op" is geen rendementsuitspraak.** Het gaat uitsluitend over de
vertaling van een bedrag naar dagen uitgaven uit het `FINANCIEEL OVERZICHT`.
De Wft-grens verschuift niet: inzicht mag, vergunningsplichtig advies niet, en
de schulden-regel blijft beschrijvend ("elke aflossing levert je tijd op") en
nooit aansporend ("los dit af"). Getoetst via `compliance-check` op 19-09-2026.

## Fasering

- **Fase 0 (dit ADR).** De norm eerst: `lib/ai/dna/base.ts` (§ KERNFILOSOFIE +
  § FRAMING), `kern.ts`/`wil.ts`, het context-label in `shared-context.ts`, de
  vijf losse cloud-prompts, de vijf gecondenseerde `LOCAL_*_DNA`, de
  agent- en skill-definities onder `.claude/` en de spec in `CLAUDE.md`.
  Daarna `npm run merkstem:scan` en `npm run parity:rebaseline`.
- **Fase 1.** De app-brede kopij-sweep (onboarding, welkomst, overzicht,
  toekomst, widgets, rapportages, deelteksten, signup, `manifest.json`), de
  `app_settings`-sleutels die kopij buiten git dragen (`local_knowledge`,
  `guide_help_content`), en de tests/UAT die de oude woorden letterlijk
  asserten.
- **Fase 2.** Landing en publiek (`components/landing/**`, `/over`, SEO-meta,
  OG-image, de /check-funnel) — via `compliance-check`, aparte kaart.
- **Fase 3.** De architectuurplaten en `README.md`, mee met fase 1.

De volgorde is niet vrijblijvend. De leus leeft in zeven prompts, vijf lokale
artefacten, een DB-kennisset én vijftien `.claude/`-bestanden. Wordt de norm
niet als eerste omgezet, dan schrijft het volgende stuk UI-werk de oude leus
weer voor — niet door iemand die dat wil, maar door de norm die het voorschrijft.

## Gevolgen

- `npm run merkstem:check` blokkeert na elke wijziging aan § FRAMING/§ TOON tot
  `npm run merkstem:scan` opnieuw attesteert. Dat hoort bij de wijziging, niet
  bij de nazorg.
- `npm run parity:check` valt om zodra een bron-DNA wijzigt zonder dat de
  on-device varianten mee-hercondenseerd zijn. Fase 0 doet beide in één beurt.
- Het schulden-frame verliest zijn positieve draai ("terugkopen" maakte aflossen
  een winst). De vervanger moet die draai dragen; daarom is "elke aflossing
  levert tijd op" onderdeel van het besluit en niet alleen van de copy.
- `app_settings` draagt kopij die een PR niet raakt. Dat is de plek waar de oude
  leus blijft hangen nadat "alles" gefixt is; fase 1 pakt 'm expliciet.
- De dode rij `ai_system_prompt_override_backup_pre_fin_rename` wordt via een
  `change-request` opgeruimd (K6) — buiten de PR.

## Alternatieven

- **"Je geld, vertaald naar tijd." (K1-B)** — accurater maar beschrijvend; mist
  de belofte.
- **Geen leus (K1-C)** — lost het probleem op door het weg te laten, maar de
  tijdvertaling is juist het onderscheidende idee.
- **Alleen de koop-metafoor schrappen, leus behouden** — "opgeslagen tijd"
  draagt dezelfde onjuistheid ("je hebt die tijd al gewerkt en ingeleverd"), dus
  half werk.
