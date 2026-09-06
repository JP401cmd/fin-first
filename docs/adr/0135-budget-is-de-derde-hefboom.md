---
id: 0135-budget-is-de-derde-hefboom
title: 'Budget is de derde hefboom; de cashflow-laag vervalt'
status: aanvaard
date: 2026-09-06
elements: [as-budget, as-transacties, sp-budget]
---

# 0135 — Budget is de derde hefboom; de cashflow-laag vervalt

## Context

Budgetteren is voor het grip-segment de dagelijkse handeling, maar zat drie
lagen diep: `/overzicht` → `/overzicht/cashflow` → `/overzicht/cashflow/budget`.
Even diep als de fiscale optimizer, die bijna niemand opent. Uit het
beginner-onderzoek van september 2026 (Notion UR3-28, "De scheve diepte"): een
persona had vijf klikken nodig om een budget toe te voegen, vond geen knop
"Budget toevoegen" maar "Plan bewerken" met een lijst van 26 regels, en zag zijn
nieuwe budget pas na uitklappen.

De tussenlaag — de cashflow-hub — bestond omdat "cashflow" ooit één ding was:
rekeningen, geldstroom, budgetten en vaste lasten bij elkaar. Die bundeling was
niet meer waar. Rekeningen zijn bezittingen, geldstroom zijn transacties, en
budget is het onderwerp waar mensen voor terugkomen.

## Besluit

De cashflow-hub wordt opgeheven. Zijn inhoud verhuist naar de plek waar hij
thuishoort, en de budgetpagina neemt slot 3 in de hefbomenrij over.

| Wat | Waarheen |
|---|---|
| Rekeningen, rekeningdetail, archief, bank koppelen | `/overzicht/bezittingen/cash` |
| Geldstroom, kassabonnen, daggrafiek, versheidsmelding, inflatiekaart, grondslagblok | `/overzicht/budget/transacties` |
| De drie overige kaarten (transacties, vaste lasten, forecast) | bovenaan `/overzicht/budget` |
| De hub zelf | redirect naar `/overzicht/budget` |

De vier hefbomen blijven vier: `bezittingen · schulden · budget · belasting`.

## Overwegingen

**De interne sleutel blijft `cashflow`.** Alleen het zichtbare label en de
bestemming veranderen. Die sleutel staat in de scoreberekening (`LeverScores`),
in de briefing-tags, in `HEFBOOM_FOR_RECOMMENDATION` en in de `data-tour`-id's
van de rondleiding — deels in opgeslagen rijen. Hem hernoemen is een tweede,
riskantere verbouwing en geen onderdeel van een indelingswijziging.

**De setup-gate op de budgetpagina vervalt.** Die verving de hele pagina tot de
inrichting voltooid was, zonder overslaan-knop. Een hefboom die soms een
formulier is in plaats van een hefboom, is geen hefboom: budgetteren is
basisfunctionaliteit, net als bezittingen en schulden. Wie niets heeft ingericht
krijgt de lege staat van `BudgetsClient`; de inrichtflow blijft bestaan en
bereikbaar, hij is alleen geen voorwaarde meer. Budgetteren verdwijnt daarmee uit
`OVERVIEW_APP_SUBROUTES`.

**De status-duiding schuift mee omhoog.** `/overzicht/budget` wordt in
`ROUTE_FAMILY` familie `lever` — de lichte `loadLeverScores`, gedeeld met de
sidebar-dots — in plaats van `cashflow`, de zware kaart-loaderset. De drie
onderdelen blijven wel die familie: die krijgen hun status uit de kaart waar ze
bij horen. De budget-KAART blijft gebouwd worden, want zijn status voedt de
hefboomtegel op `/overzicht` en de sidebar-dot.

**De geldstroom volgt de periodekiezer.** Eigenaarsbesluit, met een bekend
gevolg: de verhuisde cijfers beschrijven nu de gekozen periode (standaard rollend
30 dagen) in plaats van kalendermaand-tot-nu-toe. De vier-koloms KPI-strip is
niet meeverhuisd omdat de transactiepagina die getallen al droeg, met dezelfde
spaarquote-drempels; alleen de doorklik naar de kassabonnen ontbrak en die is
overgenomen. De daggrafiek rendert uitsluitend bij periode "maand": hij is
gebouwd op maanddagen (`dayOfMonth`, `isCurrentMonth`, forecastpad tot
maandeinde), en periode-onafhankelijk maken zou de forecastmotor herschrijven.

## Gevolgen

- **Alle oude URL's blijven werken** via vijf redirects in `next.config.ts`,
  inclusief de deeplinks met `?budget=`, `?maand=`, `?limit=` en `?rekening=` die
  in meldingen, briefing-mails en gedeelde links rondgaan.
- **`components/app/cash-overview.tsx` (2182 regels) is verdwenen.** Zijn inhoud
  zit verdeeld over de bezittingen en de transactiepagina; er waren geen
  consumenten meer over.
- **Cash gedraagt zich als elke andere bezitgroep.** De vier uitzonderingen die
  het naar de hub wegduwden — groepskop, verborgen kaartacties, wegnavigerende
  klik en een harde redirect op `/overzicht/bezittingen/cash` — zijn opgeheven.
  De tweewegkeuze (rijk rekeningdetail bij een bankkoppeling of budgetteren,
  anders het gewone bezitformulier) is ongewijzigd; alleen de plek waar hij
  gemount is verschoof.
- **Een defect kwam bovendrijven en is apart gerepareerd:**
  `lib/transaction-insights.ts` sloot `joint_transfer` niet uit, waardoor een
  overboeking tussen partners op de transactiepagina als echt inkomen én echte
  uitgave meetelde. Elke andere motor sloot beide al uit. Zie de calc
  "Transactie-inzichten" in `lib/architecture/calculations.ts`.

## Valkuil bij de uitvoering, voor de volgende keer

De routeverhuizing raakte ruim 500 route-teksten in ~200 bestanden, en die vangt
`tsc` niet — het zijn string-literals. Drie plekken hielden na de veeg twee
entries onder dezelfde sleutel over, waar de laatste stil zou winnen:
`ROUTE_FAMILY`, `PAGE_STATUS_COPY` en `PAGE_INFO`. Twee dingen moesten juist
*niet* mee: de redirect-BRONNEN in `next.config.ts`, en
`/api/overzicht/cashflow-settings`, dat `/overzicht/cashflow` als deelstring
bevat.
