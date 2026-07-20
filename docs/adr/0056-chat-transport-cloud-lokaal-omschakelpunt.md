---
id: 0056-chat-transport-cloud-lokaal-omschakelpunt
title: 'Chat-transport = het cloud/lokaal-omschakelpunt voor Will-chat + gedeelde buildWillFinancialFacts als enige Will-cijferbron'
status: aanvaard
date: 2026-07-20
elements: [as-coach, t-aigateway, t-lokale-ai]
---

## Context

C2a/C2b breiden het lokale-AI-pad (ADR 0043) uit van transactiecategorisatie naar
de dagelijkse Will-chat (WillHome): bij `privacy_mode=true` moet het gesprek met
Will lokaal blijven draaien, zonder dat de gebruiker een aparte pagina of een
tweede chat-ervaring krijgt. De vraag was wáár het cloud/lokaal-onderscheid landt
— een nieuwe route, een aparte chat-component, of een omschakelpunt in de
bestaande transportlaag — en hoe de cijfers die Will in beide gevallen gebruikt
single-source blijven.

## Besluit

**1. Transport is de naad.** `LocalChatTransport` wordt geswapt op
`privacy_mode ∧ readiness` in de bestaande transport-`useMemo` van de chat-UI;
alles ná die keuze (rendering, geschiedenis, UI-conventies) blijft ongewijzigd.
Dit spiegelt ADR 0043 (resolver-omschakelpunt voor categorisatie) één laag hoger
in de stack: daar is het de resolver die wisselt, hier is het de transport — in
beide gevallen blijft er precies één plek die weet welk pad actief is, en blijft
de rest van de applicatie onwetend van het onderscheid.

**2. Dubbel fail-closed.** De client-side transport-swap is niet de enige
garantie: `POST /api/ai/chat` blokkeert vóór `getModel()` met een server-side 403
(`privacy_mode_active`) zodra `privacy_mode=true`. Dit loopt via dezelfde
`PRIVACY_GATED_ROUTES`-lijst als de categorisatie-gate uit ADR 0043 — scope A
groeit daarmee van 1 naar 2 routes, maar blijft expliciet **geen** Optie B (geen
centrale guard over alle ~21 AI-routes vooraf). Nieuwe AI-routes komen pas op de
lijst wanneer ze zelf een privacy-relevante casus krijgen, niet preventief.

**3. Eén Will-cijferbron voor beide transporten.** `buildWillFinancialFacts`
(`lib/ai/context/`) is de enige afleiding van de ADR 0009-cijfers die zowel de
cloud- als de lokale rendering van Will voedt. De functie consumeert de
canonieke `loadCoreData`-waarden (met-terugval-grondslag, eigenaarsbesluit) —
geen tweede berekening voor het lokale pad. Jaarruimte is bewust buiten de
struct gehouden (net als in de cloud-context): geen advies-gevoelig cijfer in
een pad dat nog geen Wft-review heeft gehad voor lokale inferentie.

**4. Bewuste scope-grenzen.**
- **Kill-switch-asymmetrie** (`ai_enabled` ontbreekt op `ChatPanel`/chat) is
  symmetrisch pre-existing aan beide transporten en dus geen nieuw gebrek van
  deze ADR — apart op te pakken als eigen follow-up, niet hier meegenomen.
- **What-if blijft cloud-only**, maar wordt in privé-modus **eerlijk geblokkeerd**
  in plaats van stil naar de cloud te lekken: geen automatische fallback die de
  privacy-belofte ondermijnt (zelfde fail-closed-principe als ADR 0043 §3).
- **Tools blijven structureel afwezig on-device** (C2d expliciet afgewezen):
  het lokale pad is en blijft antwoord-op-vraag over eigen cijfers, geen
  tool-calling runtime.

## Gevolgen

- **Geen nieuwe rekenmotor, geen nieuwe module.** `buildWillFinancialFacts` is
  een cijfer-aggregatie voor promptcontext, geen afgeleid kerngetal — de
  Berekeningen-view (`lib/architecture/calculations.ts`) blijft ongewijzigd.
- **ArchiMate**: `t-aigateway`-lead benoemt dat de 403-privacy-gate nu zowel
  `/api/ai/categorize` (ADR 0043) als `/api/ai/chat` (deze ADR) dekt;
  `as-coach`-lead benoemt dat de coachingsdienst bij privé-modus lokaal draait
  via `t-lokale-ai`. Het `t-lokale-ai`-element en de bestaande ENRICH-payload
  (die chat-antwoorden al noemt) waren al correct en blijven ongewijzigd.
- **Aandachtspunt**: `fragiele-webgpu-lokaal-ai` krijgt `as-coach` erbij in
  `elementIds` — de Early-Preview-runtime draagt nu ook de chat, niet alleen de
  categorisatie.
- **Praatplaat (HLD)**: de bestaande capability-tekst over lokale Will-chat is
  herschreven zodat een leek begrijpt dat dit de dagelijkse Will-chat (WillHome)
  is die van transport wisselt — geen aparte pagina/functionaliteit.
- **Cross-ref**: ADR 0043 (resolver-omschakelpunt voor categorisatie — orthogonale
  as: resolver vs. transport), ADR 0051 (motor-consumptie — dezelfde "één
  bron"-familie als `buildWillFinancialFacts` hier), ADR 0009 (grondslag van de
  onderliggende cijfers die `buildWillFinancialFacts` afleidt).
