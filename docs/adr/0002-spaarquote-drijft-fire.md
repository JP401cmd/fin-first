---
id: 0002-spaarquote-drijft-fire
title: Spaarquote × inkomen drijft de FIRE-prognose
status: aanvaard
date: 2026-06-01
elements: [as-budget, as-planning, fn-toekomstplannen]
---

De sparen-invoer van de FIRE-prognose komt uit de cashflow-spaarquote maal het inkomen, niet uit een losse handmatige spaarwaarde. Eén bron van waarheid van transactie tot vrijheidsdatum.

## Context
Dashboard en /toekomst gebruikten verschillende sparen-aannames, wat tot uiteenlopende FIRE-datums leidde.

## Besluit
`lib/savings-source.ts` levert sparen = spaarquote × inkomen, geïndexeerd in de unified-engine, met een guard tegen dubbeltellen van aflossing.

## Gevolgen
De kernketen "transactie → vrijheid" is nu één pad. WhatIf is nog niet geünificeerd — zie het aandachtspunt op de planningsdienst.
