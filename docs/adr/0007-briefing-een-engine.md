---
id: 0007-briefing-een-engine
title: Eén briefing-engine — deterministische feiten, AI als redacteur
status: aanvaard
date: 2026-06-11
elements: [as-coach, t-aigateway, sp-inzicht]
---

De wekelijkse briefing op /overzicht heeft één engine: de deterministische `buildBriefingEntries` (lib/briefing/engine.ts) levert alle cijfers en briefjes; de LLM mag uitsluitend **redigeren** (kop-zin + tekst-herschrijving) via `lib/briefing/redactie.ts`, met een harde nummer-guard — elk getal uit de brontekst moet letterlijk terugkomen en er mogen geen nieuwe getallen bij, anders valt dat briefje terug op de deterministische tekst.

## Context
De briefing-analyse van 2026-06-11 (`docs/briefing-analyse.md`) vond twee volledig gescheiden briefing-systemen: de levende deterministische week-briefing en een onbereikbaar geworden AI-systeem ("DAIshboard": `/api/briefing/compose`, 18 kaart-tools, eigen prompt, localStorage-geheugen). De beheer-directives op /beheer/briefing voedden alleen het dode systeem, AI-cijfers werden nergens numeriek gevalideerd, en de fallback-engine was dode code.

## Besluit
Het DAIshboard-systeem is verwijderd (39 bestanden, compose/history-API's, `briefing_history`-tabel via drop-migratie). De herbruikbare delen zijn herbestemd: de directives (temporeel + functioneel, /beheer/briefing) sturen nu de redactie-laag, functionele condities worden vooraf geëvalueerd tegen metrics uit de engine-input (`buildEngineMetrics`) in plaats van regex op een tekst-summary. De engine-vulling is verbreed (aandachtspunten-bus, noodfonds, vaste lasten, Box 3, fondskosten, hypotheek-vs-beleggen, check-in-reflectie) met domein-spreiding (max 2 per hefboom).

## Gevolgen
AI mag in de briefing nooit cijfers produceren — alleen formuleren. Nieuwe briefing-inhoud = een nieuwe deterministische generator in engine.ts (met drempel + test), nooit een prompt-uitbreiding die data verzint. Elke AI-fout degradeert stil naar de deterministische teksten; de briefing kan niet breken op een model-storing.
