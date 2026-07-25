---
id: 0061-lokaal-actievoorstel-tool-calling-substituut
title: "C2c: lokaal tekst-geparst actievoorstel als tool-calling-substituut"
status: aanvaard
date: 2026-07-25
elements: [t-lokale-ai, as-coach]
---

De lokale (on-device) Fin-chat kan een gestructureerd actievoorstel emitten als
een fenced tekstblok (` ```fin-actie `) in zijn antwoord. Dit is GEEN autonome
function-invocation — LiteRT-LM JS heeft geen tool-calling-API — maar een
tekst-intent die fail-closed geparst wordt, altijd mens-in-de-lus-bevestigd
moet worden, en waarvan de cijfers nooit van het model komen.

## Context

Een eerdere variant (destijds intern C2d genoemd) die het lokale model direct
een actie liet aanmaken — zonder tussenkomst van de gebruiker en met door het
model zelf berekende cijfers — is afgewezen: een klein on-device model kan geen
betrouwbare financiële cijfers afleiden, en autonome writes zonder bevestiging
passen niet bij een assistief, review-UI-only ontwerp (zie ook de
categorisatie-precedent in ADR 0043).

C2c kiest een andere vorm: het model mag een intentie uitspreken in platte
tekst, de app parseert die intentie, en de gebruiker bevestigt expliciet
voordat er iets geschreven wordt.

## Besluit

- **Parsing is fail-closed.** `lib/ai/local/parse-intent.ts` herkent alleen een
  welgevormd ` ```fin-actie ` blok; bij geen match of een malformed blok wordt
  er GEEN kaart getoond — geen gok, geen halve kaart.
- **Cijfer-guardrail is asymmetrisch t.o.v. cloud.** In de cloud levert de
  `suggestAction`-tool (tool-calling) zelf cijfers aan. Lokaal geldt het
  omgekeerde: `resolveFinActionIntent` NEGEERT elke door het model geleverde
  `freedom_days_impact`/`euro_impact_monthly` volledig en leidt de cijfers
  deterministisch af uit het bestaande `LocalChatOverview`
  (consume-don't-recompute). Is er geen canonieke match voor de genoemde
  actie, dan verschijnt er GEEN kaart — nooit een misleidende "0 dagen"-kaart.
- **Bevestiging is verplicht en loopt via bestaande UI.** De al bestaande
  `ActionSuggestionCard`/`handleAddAction`-flow wordt hergebruikt (geen tweede
  variant); er is geen automatische toepassing.
- **Schrijfpad = bestaande API-route, met provenance.** De write gaat via
  `POST /api/ai/actions` (zod + `parseBody` + envelope-helpers, own-row RLS
  ongewijzigd) met een nieuw `metadata.origin:'local-chat'`-veld. De
  `source`-CHECK-constraint/enum is niet gewijzigd.
- **Dit is geen tool-calling.** Het is een tekst-geparste, mens-in-de-lus-
  bevestigde substituut-vorm, gekozen omdat LiteRT-LM JS geen tool-API biedt.

## Gevolgen

- De feature is momenteel dormant: het lokale model emit nog geen fences — dat
  vergt een aparte, latere prompt-DNA-ronde (P1/`lokale-prompt-parity` +
  `ai-specialist-prompt-dna`) om het model te instrueren.
- Zodra die ronde landt, blijft de guardrail-asymmetrie de garantie: een lokaal
  model mag intenties uitspreken, nooit cijfers.
