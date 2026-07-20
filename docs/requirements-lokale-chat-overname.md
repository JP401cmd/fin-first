# Requirements — C2a/C2b: privé-modus neemt de Will-chat over (WillHome/ChatPanel lokaal)

> Pijplijn: `ai-feature`, stap 2 (Requirement Specialist). Werkt op basis van
> `docs/plan-lokale-ai-fase2-litert-mobiel-chat-kennis.md` §Fase C2 (status: "gepland — nog geen
> bouw-akkoord") en het vastgestelde raamwerk in `docs/requirements-lokale-categorisatie.md`
> (ADR 0043, scope A). Dit document zet C2a (chat-overname) en C2b (context-parity) om in
> toetsbare requirements. **C2c (voorstellen & acties) en Fase P (prompt-parity-skill) zijn
> expliciet BUITEN dit document** — zie §8. Geen implementatie in dit document.

**Vastgestelde naad (niet heronderhandelbaar — uit de deep-dive):** de gedeelde interface is
AI SDK v6 `ChatTransport<UIMessage>` (`node_modules/ai/dist/index.d.ts:3693` —
`sendMessages(...): Promise<ReadableStream<UIMessageChunk>>` +
`reconnectToStream(...): Promise<ReadableStream<UIMessageChunk> | null>`), dezelfde interface die
`DefaultChatTransport` vandaag implementeert. C2a bouwt `LocalChatTransport implements
ChatTransport<UIMessage>` die `createChatSession` (`lib/ai/local/litert-runtime.ts:327`) wrapt en
in **components/app/chat/chat-panel.tsx:475-478** (de bestaande `transport`-`useMemo`) wordt
verwisseld op `privacy_mode`. Alles ná die `useMemo` (useChat, rendering, WftDisclaimer,
foutbanner, quick-chips) blijft **ongewijzigd**. Alle chat-ingangen die via `ChatProvider`
(`components/app/chat/chat-provider.tsx`) open/openWithMessage/pendingMessage/autoOpenMessage
gebruiken, erven de omschakeling automatisch — dat is exact hetzelfde
enige-omschakelpunt-principe als de categorisatie-resolver in ADR 0043.

---

## 1. Doel & waarde

**Ik wil (business-owner)** dat wanneer een gebruiker privé-modus aanzet, niet alleen
transactie-categorisatie maar **dé Will-chat zelf** (WillHome/ChatPanel — het gesprek dat de
gebruiker al kent) volledig op het eigen toestel draait, **zodat** het soevereiniteitsverhaal
(ADR 0001, "jij bent eigenaar van je data") zich uitstrekt naar het meest zichtbare AI-oppervlak
van de app, zonder dat de gebruiker een aparte, tweede chat-pagina hoeft te leren.

Pijler: **Kern** (financiële cijfers/context) met een sterke **Wil**-dimensie (vertrouwen,
controle — de belofte "dit gesprek verlaat je toestel niet"), uitgevoerd via het bestaande
Will-personage; geen nieuw vrijheidstijd-cijfer, wel ongewijzigde vrijheidstijd-framing in de
gegenereerde antwoorden (die komt uit de gedeelde cijferbron, zie C2b).

---

## 2. Scope-precedent: dit is een BEWUSTE, gedocumenteerde uitbreiding van scope A

`docs/requirements-lokale-categorisatie.md` §3 koos Optie A ("smalle belofte": alleen
`/api/ai/categorize` wordt lokaal-gegate) en legde vast dat elke nieuwe route bewust moet kiezen
of scope A blijft gelden. C2a is die bewuste keuze voor een **tweede** route: `/api/ai/chat`
krijgt nu ook een server-side privacy-gate (§4, AC-3b). Dit is nog steeds geen Optie B (er is geen
centrale, alle-routes-dekkende guard) — het is scope A die groeit van 1 naar 2 expliciet
benoemde routes. `lib/ai/privacy-gate-scan.ts` (FR-1.3-mechanisme) moet dit textueel afdwingen,
niet alleen een los stukje code.

---

## 3. Functionele requirements (C2a — chat-overname)

**FR-C2a.1 — Transport-swap-punt.** `chat-panel.tsx`'s bestaande `transport`-`useMemo` (regel
475-478) krijgt een extra afhankelijkheid: is privé-modus aan én is het toestel gereed
(`resolveLocalReadiness` → `ready: true`), dan levert de `useMemo` een `LocalChatTransport`-
instantie; anders (uit, of aan-maar-niet-gereed) blijft het de bestaande `DefaultChatTransport`.
Geen ander onderdeel van `ChatPanel` verandert.

**FR-C2a.2 — Privé-modus client-side beschikbaar.** `ChatPanel` leest `profiles.privacy_mode`
op dezelfde manier als de bestaande `ai-categorize-sheet.tsx:445-453` (own-row select via de
anon/RLS-client, `.eq('id', user.id).maybeSingle()`, fallback `false` bij ontbrekende kolom/rij) —
**geen nieuwe gedeelde provider**, mirror het bestaande, al geteste patroon. Gecombineerd met
`checkLocalAiCapability()` + `getLocalModelState()` → `resolveLocalReadiness()`
(`lib/ai/local/local-readiness.ts:71`), exact zoals `local-chat-panel.tsx:61-62` het al doet.

**FR-C2a.3 — `LocalChatTransport`-contract.**
- `sendMessages({ messages, abortSignal })`: geeft uitsluitend het **laatste** user-bericht door
  aan `LocalChatSession.send` (niet de volledige `messages`-array) — de sessie zelf houdt de
  beurten native bij (`litert-runtime.ts:71-93`, "natieve multi-turn").
- Eerste aanroep in een sessie: bouwt de systeemprompt via `buildLocalChatSystemPrompt({ overview,
  question: <eerste userbericht>, knowledgeItems })` en opent één `LocalChatSession` via
  `createChatSession(systemPrompt)`. Deze sessie wordt in een **ref** bewaard (niet in React
  state) zodat re-renders 'm niet vernietigen en zodat kennis-selectie **eenmalig** gebeurt op de
  eerste vraag — spiegelt exact `components/mijn/local-chat-panel.tsx:124-130`.
- Elke volgende aanroep binnen dezelfde chat-sessie (`useChat({ id: 'chat-will' })`) hergebruikt
  dezelfde geref'te `LocalChatSession` — **geen** nieuwe `createChatSession` per beurt.
- `onDelta`-callbacks worden vertaald naar `UIMessageChunk`'s van het type `text-delta` (+ een
  slot-open/slot-end-paar) op de `ReadableStream`-controller, zodat `useChat` exact hetzelfde
  streaming-gedrag ziet als bij de cloud-transport.
- Werpt `LocalChatSession.send` (fail-closed uit `litert-runtime.ts`), dan sluit
  `LocalChatTransport` de stream af met een error-chunk/`controller.error(...)` zodat `useChat`'s
  `status === 'error'` triggert — **nooit** een stille retry op `DefaultChatTransport`.
- `reconnectToStream` retourneert altijd `null` (geen server om een onderbroken stream te
  hervatten) — expliciet vastgelegd als non-goal, geen stream-resumption na page-refresh in dit
  document (zie §6, buiten scope).

**FR-C2a.4 — Sessie-lifecycle bij transport-wissel.** Wanneer de `useMemo` van transport wisselt
(privé-modus aan→uit of uit→aan, of toestel-gereedheid verandert tussen renders), wordt een
eventueel lopende `LocalChatSession` via `dispose()` afgesloten (geen lekkende WebGPU-resources)
vóórdat de nieuwe transport in gebruik genomen wordt.

**FR-C2a.5 — Zichtbare context-breuk bij mid-gesprek-wissel.** Omdat de zichtbare
berichtengeschiedenis in `useChat` (gekoppeld aan `id: 'chat-will'`) blijft staan bij een
transport-wissel, maar de nieuwe `LocalChatSession` GEEN kennis heeft van eerdere cloud-beurten
(en vice versa), toont de chat een korte, niet-interactieve systeemregel op het omschakelmoment
("Vanaf hier draait dit gesprek lokaal op je toestel — Will kent het bovenstaande gesprek niet
meer" / omgekeerd bij terugschakelen naar cloud). Dit voorkomt dat de gebruiker aanneemt dat de
lokale Will de cloud-context (of omgekeerd) onthoudt.

**FR-C2a.6 — Server-side fail-closed op `/api/ai/chat` (laag 3, beslissend).** Spiegel
`app/api/ai/categorize/route.ts:45-87`: direct ná de auth-check en VÓÓR `checkTierGate`,
`checkCreditBudget` en `getModel(...)`, leest de route `profiles.privacy_mode` (own-row,
anon-client) en retourneert bij `true`:
```json
{ "error": "Privé-modus actief: de chat draait lokaal op je apparaat.", "code": "privacy_mode_active" }
```
met status 403. Dit is de **beslissende** laag: een client-race (bv. `autoOpenMessage` vuurt
vóórdat `privacyMode`/`readiness` client-side geladen is, of een verlopen/gemanipuleerde
client-state) mag de financiële context (`buildContext`/`buildSystemPrompt`, regels 137-142 van
de route) NOOIT alsnog richting de cloud-provider laten gaan.

**FR-C2a.7 — Scanner-uitbreiding.** `lib/ai/privacy-gate-scan.ts` verandert van een
single-route-constante naar een lijst:
```ts
export const PRIVACY_GATED_ROUTES = [
  'app/api/ai/categorize/route.ts',
  'app/api/ai/chat/route.ts',
] as const
```
`hasPrivacyGateBeforeModelCall` wordt per route in de lijst getoetst. De bestaande
"scope A: geen andere consumer draagt het gate-anker"-test (`privacy-gate-scan.test.ts:72-83`)
sluit voortaan **beide** routes uit i.p.v. alleen categorize. `KNOWN_GETMODEL_CONSUMERS` (de
pin-test, regel 60-70) blijft ongewijzigd qua aantal — er komt geen nieuw bestand bij, alleen een
bestaand bestand (`app/api/ai/chat/route.ts`) krijgt het gate-anker.

**FR-C2a.8 — Kennisbank-injectie, ongewijzigd hergebruikt.** `LocalChatTransport` roept bij de
eerste-bericht-sessie-opbouw dezelfde `selectKnowledgeForQuestion` + `KNOWLEDGE_FENCE_START/END`
aan als `local-chat-prompt.ts:97-114` — geen tweede promptvariant. `ChatPanel` haalt de
kennisbank op via `GET /api/local-knowledge` (bestaande route), **niet-blokkerend**: faalt de
fetch, dan bouwt de sessie zonder kennisinjectie (zelfde try/catch-patroon als
`local-chat-panel.tsx:74-82`).

**FR-C2a.9 — Labeling.** Zolang privé-modus actief is én de transport lokaal is:
1. `ChatPanel` toont een "experimenteel — lokaal"-badge in de header (zelfde stijl als de
   amber-badge in `local-chat-panel.tsx:165-167`), zichtbaar zolang de sessie lokaal draait.
2. Een eerlijke traagheids-hint bij de eerste (koude) sessie, gelijk aan `FIRST_USE_HINT`
   (`local-chat-panel.tsx:40-41`).
3. `AiPrivacyIndicator` (`components/app/ai-privacy-indicator.tsx`) wordt privacy-mode-bewust:
   de huidige, statische copy "Deze functie gebruikt AI — je data wordt geanonimiseerd
   verstuurd." (regel 62 + 76) is **onwaar** wanneer de chat lokaal draait (er wordt niets
   verstuurd, laat staan geanonimiseerd). Het component accepteert een nieuwe, optionele
   `mode?: 'cloud' | 'local'`-prop; bij `'local'` toont het "Deze functie draait lokaal op je
   toestel — er verlaat niets je apparaat." `ChatPanel` geeft de juiste mode door op basis van
   de actieve transport.

**FR-C2a.10 — Kill-switch-consistentie (vastgelegde beslissing, geen open vraag).** Vandaag
controleert **noch** `ChatPanel`, **noch** `app/api/ai/chat/route.ts` de `ai_enabled`-
hoofdschakelaar — alleen `/mijn/lokale-chat` (de aparte C1b-pagina) gate't server-side op
`ai_enabled` vóórdat de pagina rendert. C2a introduceert **geen nieuwe** `ai_enabled`-check in
`ChatPanel` voor uitsluitend het lokale pad: dat zou een averechtse asymmetrie creëren (lokaal
geblokkeerd, cloud toegankelijk, terwijl `ai_enabled=false` juist "alle AI uit" zou moeten
betekenen). Dit is een **bevestigd pre-existing gat** dat verder reikt dan C2a/C2b — gevlagd in
§9 als aanbeveling voor een aparte, kleine vervolg-feature (`ai_enabled`-afdwinging op
`ChatPanel`/`/api/ai/chat` voor zowel cloud als lokaal tegelijk), niet als blocker voor dit
document.

**FR-C2a.11 — Whatif blijft buiten deze overname (vastgelegde beslissing).**
`components/app/horizon/whatif-chat.tsx` is een **eigen** component met een **eigen**
`useChat({ id: 'whatif-chat' })` en een **eigen** `DefaultChatTransport`-instantie (regel
204-219) — het gaat NOOIT via `ChatProvider`/`ChatPanel` (geen `open()`/`openWithMessage()`-pad).
Het valt daarmee **buiten** de scope van de transport-swap in `chat-panel.tsx` zonder dat er iets
extra's voor gebouwd hoeft te worden — het blijft simpelweg cloud, ongewijzigd, ook als
privé-modus aan staat. **Om privacy-theater te vermijden** (een gebruiker met privé-modus aan
verwacht redelijkerwijs dat "de Will-chat" overal lokaal is): `WhatIfChat` krijgt een zichtbare,
niet-blokkerende `AiPrivacyIndicator`/label met `mode: 'cloud'`-achtige tekst wanneer
`privacy_mode=true` ("Dit wat-als-gesprek gebruikt cloud-AI en valt buiten privé-modus — je
scenariogegevens gaan naar de AI-provider."), zodat de gebruiker een bewuste, geïnformeerde keuze
kan maken i.p.v. een stille aanname. Dit label is de **enige** wijziging aan `WhatIfChat` in dit
document — geen gating, geen blokkade, geen lokale variant (dat is een toekomstige C2-uitbreiding,
niet dit document).

**FR-C2a.12 — Tools zijn structureel afwezig, niet tijdelijk vergeten.** `getTools(...)` wordt
door `LocalChatTransport` nooit aangeroepen — er is geen tool-laag on-device (LiteRT-LM JS heeft
geen tool-API; `docs/plan-lokale-ai-fase2-litert-mobiel-chat-kennis.md` §C2d wijst
tool-parity bewust af ten gunste van "alles-in-context"). `ChatPanel`'s render-laag
(`renderAssistantMessage`, `findToolInvocation` voor `suggestAction`/`suggestRecommendation`/
`showVisualization`) blijft ongewijzigd: bij lokale antwoorden bevatten de `parts` domweg geen
tool-invocations, dus er verschijnen geen actiekaarten/visualisaties — geen crash, geen lege
kaart, gewoon platte tekst. Dit is **gewenst, permanent gedrag voor C2a/C2b**, geen bug en geen
POC-beperking die "later" verdwijnt zonder nieuw werk (dat nieuwe werk is expliciet C2c, buiten
dit document).

---

## 4. Functionele requirements (C2b — context-parity)

**FR-C2b.1 — Gedeelde, pure extractor.** Er komt één functie
`buildWillFinancialFacts(coreData, profile) → WillFacts` (locatie voorstel:
`lib/ai/context/will-financial-facts.ts`) die de **canonieke cijfer-afleiding** bevat die vandaag
dubbel bestaat:
- `lib/ai/context/shared-context.ts:92-126` (cloud: `netWorth`, `freedomYears`/`freedomMonths`,
  `freedomPercentage` via `computeFreedomProgressWithBasis`, `displayFireGoal`,
  `savingsRate6m`/`swrPct` etc., ADR 0009-grondslag).
- `lib/ai/local/local-chat-context.ts:132-185` (lokaal: dezelfde afleiding, ander outputformaat).

Beide bestanden roepen voortaan `buildWillFinancialFacts` aan voor de **cijfers**; elk bestand
behoudt zijn eigen **rendering** (cloud: uitgebreide secties met labels/toelichting; lokaal:
compact, `LocalChatOverview`-vorm binnen het 8.192-tokenbudget).

**FR-C2b.2 — Parity is van de CIJFERS, niet van de volledige context.** `WillFacts` bevat minimaal:
`nettoVermogen`, `vrijheidsPct` (ADR 0009-grondslag), `fireDoel` (zelfde grondslag als
`vrijheidsPct`), `spaarquotePct` (`savingsRate6m`), `swrPct` (`effectiveSwr`), `dagtarief`
(`dailyExpenseRate`), `maandinkomen`, `maanduitgaven`. De **volledige** cloud-context (identiteit,
must-uitgaven, levensfase-signaal, aanvullende vrije-tekst-context, budgetteringsstatus, etc.)
blijft cloud-only rendering — de lokale renderer condenseert bewust (token-budget), maar leest de
kern-cijfers uit dezelfde `WillFacts`.

**FR-C2b.3 — Jaarruimte blijft bewust buiten `WillFacts`.** De bestaande, expliciete uitzondering
in `local-chat-context.ts:25-34` (jaarruimte vereist `computeJaarruimte`/
`resolvePensionFactorA`, niet onderdeel van `loadCoreData`) blijft gelden: `WillFacts` bevat GEEN
jaarruimte-veld tenzij een aparte, toekomstige feature dit expliciet toevoegt aan zowel de
extractor als beide renderers tegelijk. Geen enkele renderer mag jaarruimte zelf berekenen of
verzinnen.

**FR-C2b.4 — Overview-hydratie voor `ChatPanel` (client).** `buildLocalChatOverview` (en straks
`buildWillFinancialFacts`) is server-side (neemt een `SupabaseClient`). `ChatPanel` draait
client-side. Gekozen vorm: **nieuwe route `GET /api/local-chat-overview`** die:
- auth verplicht (`unauthorized()` bij geen sessie, zelfde patroon als alle `/api/ai/*`-routes);
- de bestaande `hasSubscription(subs, 'ai')`-tier-gate + `ai_enabled`-check toepast, gespiegeld
  aan de server-gate op `/mijn/lokale-chat/page.tsx:43-51` (403 met de bestaande
  tier-foutcode-vorm, resp. een duidelijke "AI staat uit"-foutmelding) — **niet** de
  privacy-gate uit FR-C2a.6 (deze route levert júist de data die de lokale modus nodig heeft;
  blokkeren zou de eigen feature breken);
- `buildLocalChatOverview(supabase)` aanroept en het resultaat als JSON teruggeeft.
- **Eigen data, eigen browser, own-row RLS** (dezelfde scope als `loadCoreData` intern al
  afdwingt) — geen service-role, geen cross-user-toegang, **geen egress naar een externe
  AI-provider** (dit is dezelfde soort dataflow als elke `/overzicht`-pagina-load, niet een
  AI-aanroep). Deze route valt daarom **buiten** de scope van `privacy-gate-scan.ts` (geen
  `getModel(...)`-aanroep) — expliciet vastgelegd om verwarring met FR-C2a.7 te voorkomen.

`ChatPanel` roept deze route aan zodra privé-modus + gereedheid bekend zijn (niet bij elke
paneel-open — eenmalig per gemount paneel, zelfde granulariteit als de bestaande
kennisbank-fetch).

---

## 5. Acceptatiecriteria (Given/When/Then)

| # | AC | Given / When / Then |
|---|---|---|
| AC-1 | Transport-swap | **Given** `privacy_mode=true` en `resolveLocalReadiness(...).ready === true`, **when** de gebruiker de Will-chat opent en een bericht stuurt, **then** gebruikt `ChatPanel` `LocalChatTransport` (generatie via `createChatSession`, on-device) en gaat er GEEN `POST /api/ai/chat` de deur uit (netwerktab/mock-fetch bevestigt 0 aanroepen). |
| AC-2 | Cloud ongewijzigd | **Given** `privacy_mode=false` (default), **when** dezelfde chat gebruikt wordt, **then** is het gedrag pixel-voor-pixel gelijk aan vóór C2a (`DefaultChatTransport`, `/api/ai/chat`). |
| AC-3 | Multi-turn-continuïteit | **Given** een lokale sessie met al 1 beantwoord bericht, **when** de gebruiker een tweede/derde bericht stuurt, **then** blijft dezelfde `LocalChatSession` (uit de ref) in gebruik — geen nieuwe `createChatSession`-aanroep — en het antwoord toont kennis van het eerdere gesprek (geen "vergeten"-gedrag). |
| AC-4a | Fail-closed (client) | **Given** `privacy_mode=true` maar `resolveLocalReadiness(...).ready === false` (bv. geen WebGPU, model niet gedownload), **when** de gebruiker een bericht probeert te sturen, **then** toont de chat de concrete `LocalReadiness.message` (kind `capability`/`model-missing`) en wordt GEEN cloud-fallback aangeboden binnen deze chat-sessie. |
| AC-4b | Fail-closed (server) | **Given** `privacy_mode=true` op het profiel, **when** `POST /api/ai/chat` toch wordt aangeroepen (bv. een client-race vóór `privacyMode` geladen is, of een gemanipuleerd verzoek), **then** retourneert de route 403 met `code: 'privacy_mode_active'`, **vóórdat** `getModel(...)`, `buildContext`/`buildSystemPrompt` of enige transactiedata wordt aangeroepen/opgebouwd. |
| AC-4c | Scanner-dekking | **Given** `lib/ai/privacy-gate-scan.ts` met `PRIVACY_GATED_ROUTES` uitgebreid naar categorize + chat, **when** de vitest-suite (`privacy-gate-scan.test.ts`) draait, **then** slaagt de anker-vóór-`getModel`-check voor beide routes en sluit de "geen andere consumer draagt het anker"-test beide routes uit van de negatieve check. |
| AC-5 | Kennisbank-fencing | **Given** actieve kennisitems die matchen op de eerste vraag van een lokale sessie, **when** de systeemprompt wordt opgebouwd, **then** bevat deze de `KNOWLEDGE_FENCE_START`/`_END`-omkadering rond de geselecteerde items, identiek aan `local-chat-prompt.ts`. **Given** geen matchende items (of een gefaalde `/api/local-knowledge`-fetch), **when** dezelfde opbouw gebeurt, **then** ontbreekt het kennisblok geheel — geen lege fence, geen crash. |
| AC-6 | Labeling | **Given** een actieve lokale chat-sessie, **when** het paneel gerenderd wordt, **then** toont de header het "experimenteel — lokaal"-label en toont `AiPrivacyIndicator` de `mode: 'local'`-copy ("draait lokaal — niets verlaat je toestel"). **Given** cloud-modus, **when** hetzelfde paneel rendert, **then** toont de indicator ongewijzigd de bestaande cloud-copy. |
| AC-7 | Kill-switch-consistentie | **Given** `ai_enabled=false`, **when** de gebruiker de Will-chat opent (cloud of lokaal), **then** is het gedrag identiek aan vóór C2a (vandaag geen server-side blokkade in `ChatPanel`/`/api/ai/chat`) — C2a introduceert géén nieuwe, uitsluitend-lokale `ai_enabled`-check. Dit is een expliciet vastgelegde, bewuste keuze (FR-C2a.10), geen vergeten requirement. |
| AC-8 | Whatif-scope | **Given** `privacy_mode=true`, **when** de gebruiker `/toekomst`'s wat-als-chat (`WhatIfChat`) gebruikt, **then** blijft deze chat volledig cloud-based (eigen transport, ongewijzigd) én toont een `AiPrivacyIndicator`/label dat expliciet meldt dat dit gesprek buiten privé-modus valt. |
| AC-9 | Tools afwezig, geen crash | **Given** een lokaal antwoord zonder tool-invocations, **when** `renderAssistantMessage` de `parts` rendert, **then** verschijnt platte tekst zonder actiekaart/visualisatiekaart en zonder rendering-fout. |
| AC-10 | Overview-hydratie | **Given** een ingelogde gebruiker met `ai`-abonnement en `ai_enabled=true`, **when** `ChatPanel` `GET /api/local-chat-overview` aanroept, **then** retourneert de route 200 met een `LocalChatOverview`-vormig object dat 1-op-1 overeenkomt met wat `/mijn/lokale-chat` server-side voor dezelfde gebruiker zou tonen. **Given** geen `ai`-abonnement of `ai_enabled=false`, **when** dezelfde route wordt aangeroepen, **then** retourneert deze een 403 met de bestaande tier-/kill-switch-foutvorm. |
| AC-11 | Overview-load faalt (fail-closed) | **Given** `GET /api/local-chat-overview` faalt (netwerk/500) terwijl privé-modus aan staat, **when** de gebruiker een bericht probeert te sturen, **then** toont de chat een eerlijke foutmelding ("kon je financiële overzicht niet laden — probeer opnieuw") en wordt GEEN sessie gestart en GEEN cloud-fallback aangeboden. |
| AC-12 | Cijferpariteit (parity-test) | **Given** dezelfde testgebruiker/fixture, **when** zowel `buildSharedContext` (cloud) als `buildLocalChatOverview` (lokaal) via `buildWillFinancialFacts` dezelfde cijfers lezen, **then** bevestigt een vitest-parity-test dat `nettoVermogen`, `vrijheidsPct`, `fireDoel`, `spaarquotePct`, `swrPct`, `dagtarief` numeriek identiek zijn tussen beide paden — vóór én ná de C2b-refactor (regressie-slot: de bestaande cijfers mogen niet verschuiven). |
| AC-13 | Sessie-lifecycle bij wissel | **Given** een lopende lokale sessie, **when** de gebruiker privé-modus mid-gesprek uitzet (of het toestel wordt tussentijds niet-gereed, bv. eviction), **then** wordt de `LocalChatSession` gedisposet, verschijnt de systeemregel uit FR-C2a.5, en het eerstvolgende bericht gebruikt de andere transport zonder crash. |
| AC-14 | Regressie — 23 ingangen | **Given** alle bestaande open/openWithMessage/pendingMessage/autoOpenMessage-ingangen naar `ChatPanel` (23 stuks, via `ChatProvider`), **when** `privacy_mode=false`, **then** functioneert elke ingang exact zoals vóór C2a (geen ingang direct gekoppeld aan een lokaal-only pad). |

---

## 6. Niet-functionele requirements

- **Performance:** geen nieuwe harde eis; erft de bestaande, eerlijk-gecommuniceerde
  streaming-snelheid van `createChatSession`/LiteRT-LM (zelfde runtime als C1b). Eerste (koude)
  sessie toont de bestaande traagheids-hint.
- **Toegankelijkheid:** de nieuwe systeemregel (FR-C2a.5) en labeling (FR-C2a.9) volgen de
  bestaande `aria-live="polite"`-regio in `chat-panel.tsx:912` — geen tweede, losse live-regio.
- **Responsive/mobile-first:** geen nieuwe layout-elementen buiten het bestaande
  badge-/indicator-patroon; volgt de bestaande `ChatPanel`-responsive-opzet (mobiel full-screen,
  desktop gepind paneel).
- **Security/privacy:** géén financiële data verlaat het toestel zolang de lokale transport
  actief is (client) én de server-side 403 (FR-C2a.6) is het beslissende vangnet tegen elke
  client-race. `GET /api/local-chat-overview` stuurt uitsluitend de eigen gebruiker zijn eigen
  cijfers naar zijn eigen browser — geen cross-user-blootstelling, geen externe provider.
- **RLS/ownership:** alle nieuwe/geraakte lezingen zijn own-row (`auth.uid() = id` op `profiles`,
  bestaande policy) via de anon/RLS-client — nooit service-role. Geen nieuwe migratie nodig (
  `profiles.privacy_mode` bestaat al sinds
  `supabase/migrations/20260716120000_add_profiles_privacy_mode.sql`).
- **Gating:** `LocalChatTransport` is alleen bereikbaar via het bestaande privé-modus-toggle-pad
  (`/mijn/privacy`, zelfde 'ai'-tier-gate als vandaag). `GET /api/local-chat-overview` erft
  dezelfde 'ai'-tier + `ai_enabled`-gate als `/mijn/lokale-chat`.
- **i18n:** alle nieuwe copy Nederlands, informeel je/jij, consistent met de bestaande
  Will-/privacy-toon.
- **Wft-compliance:** geen wijziging aan de DNA-inhoud in dit document — `LOCAL_CHAT_DNA`
  (`local-chat-prompt.ts:29-33`) blijft de bron; C2a hergebruikt 'm ongewijzigd. Promptwoording
  is domein van `ai-specialist-prompt-dna`, niet van dit document of van Fase P (buiten scope,
  zie §8).

---

## 7. Randgevallen & foutpaden

| Situatie | Verwacht gedrag |
|---|---|
| Privé-modus aan, toestel niet gereed | AC-4a: concrete `LocalReadiness`-melding, geen invoer mogelijk, geen cloud-fallback. |
| Privé-modus mid-gesprek aan/uit gezet | AC-13: dispose + systeemregel (FR-C2a.5); zichtbare geschiedenis blijft staan, nieuwe beurten lopen via de nieuwe transport zonder context van de oude. |
| Toestel wordt tijdens een lokale sessie niet-gereed (bv. modelcache-eviction, WebGPU device-loss) | De eerstvolgende `send()` werpt (bestaand fail-closed gedrag van `litert-runtime.ts`); `LocalChatTransport` sluit de stream met een fout af → `useChat`-foutbanner met retry, géén stille cloud-overstap. Geen continue achtergrond-poll nodig (mirror bestaand `local-chat-panel.tsx`-gedrag: gereedheid wordt gecheckt bij sessiestart, niet doorlopend). |
| Kennisbank leeg / `/api/local-knowledge` faalt | AC-5: sessie start zonder kennisblok, geen crash, geen lege fence. |
| `GET /api/local-chat-overview` faalt | AC-11: fail-closed, eerlijke melding, geen sessie-start. |
| Gebruiker heeft geen `ai`-abonnement / `ai_enabled=false` | Bestaande upsell (`AiSubscriptionUpsell`)/gedrag in `ChatPanel` blijft leidend vóór elke lokaal/cloud-keuze — ongewijzigd (zie ook AC-7). |
| Wat-als-chat (`WhatIfChat`) tijdens privé-modus | AC-8: blijft cloud, toont een expliciet "dit valt buiten privé-modus"-label — geen stille aanname van lokale dekking. |
| Nieuwe AI-generatie-callsite toegevoegd na C2a, privacy-gate vergeten | Afgevangen door de uitgebreide `privacy-gate-scan.ts`-pin-test (FR-C2a.7/AC-4c) — een nieuw bestand in `KNOWN_GETMODEL_CONSUMERS` dwingt een bewuste beslissing af, exact zoals bij categorize. |

---

## 8. Scope — in / uit

**In scope (dit document):**
- C2a: transport-swap in `ChatPanel`, server-side privacy-gate op `/api/ai/chat`, scanner-
  uitbreiding, labeling, kennisbank-hergebruik, whatif-labeling, kill-switch-beslissing
  (vastgelegd, geen wijziging).
- C2b: gedeelde `buildWillFinancialFacts`-extractor, `GET /api/local-chat-overview`,
  cijferpariteit-test.

**Uit scope (expliciet, met verwijzing):**
- **C2c — Voorstellen & acties** (`docs/plan-lokale-ai-fase2-litert-mobiel-chat-kennis.md` §C2c):
  gestructureerde intents/bevestigings-UI/client-side writes vanuit lokale antwoorden. Aparte
  requirement-ronde wanneer dat werk start.
- **C2d — Tool-parity**: afgewezen (zie FR-C2a.12) — geen tool-laag on-device in dit of een
  volgend document zonder een fundamenteel sterker lokaal model.
- **Fase P — Prompt-parity-skill + beheer-inzicht**: de wóórding van `LOCAL_CHAT_DNA` blijft
  ongewijzigd in dit document; een toekomstige skill-run (P1) mag de prompt zelf verfijnen, maar
  dat is expliciet niet dit werk.
- **Stream-resumption** na page-refresh/netwerkonderbreking voor de lokale transport
  (`reconnectToStream` blijft `null`) — geen "hervat waar ik gebleven was"-functionaliteit.
- **Volledige `ai_enabled`-afdwinging** op `ChatPanel`/`/api/ai/chat` voor zowel cloud als lokaal
  — bevestigd pre-existing gat (FR-C2a.10), aparte, kleine vervolgfeature.
- **Mobiele geschiktheid** van de lokale chat — volgt de bestaande capability-gate
  (`resolveLocalReadiness`); geen apart mobiel-beleid in dit document (dat is Fase L3, los
  spoor).
- **`WhatIfChat` zelf lokaal maken** — enige wijziging aan dat component is het label uit
  FR-C2a.11.

---

## 9. Afhankelijkheden & aannames

**Afhankelijkheden:**
- `components/app/chat/chat-panel.tsx` (transport-`useMemo`, regel 475-478) — enige wijzigpunt.
- `lib/ai/local/litert-runtime.ts` (`createChatSession`, `LocalChatSession`) — ongewijzigd
  hergebruikt, niet aangepast door dit werk.
- `lib/ai/local/local-readiness.ts` (`resolveLocalReadiness`) — ongewijzigd hergebruikt.
- `lib/ai/local/local-chat-prompt.ts` (`buildLocalChatSystemPrompt`, `LOCAL_CHAT_DNA`,
  `KNOWLEDGE_FENCE_*`) — ongewijzigd hergebruikt.
- `lib/ai/local/knowledge-context.ts` (`selectKnowledgeForQuestion`) + bestaande
  `GET /api/local-knowledge`.
- `lib/ai/local/local-chat-context.ts` (`buildLocalChatOverview`) — wordt in C2b intern
  omgebouwd op `buildWillFinancialFacts`, output-vorm (`LocalChatOverview`) blijft gelijk.
- `lib/ai/context/shared-context.ts` — wordt in C2b intern omgebouwd op
  `buildWillFinancialFacts` voor de kern-cijfers.
- `app/api/ai/categorize/route.ts:45-87` als het bewezen fail-closed-patroon voor FR-C2a.6.
- `lib/ai/privacy-gate-scan.ts` + `lib/ai/privacy-gate-scan.test.ts` — uit te breiden, niet te
  vervangen.
- `components/app/ai-privacy-indicator.tsx` — uit te breiden met een `mode`-prop.
- `supabase/migrations/20260716120000_add_profiles_privacy_mode.sql` — bestaande kolom, geen
  nieuwe migratie nodig.

**Aannames (risico's gevlagd):**
- **Risicovol:** `UIMessageChunk`/`ReadableStream`-vertaling van `LocalChatSession.send`'s
  delta-callback is Early-Preview-gevoelig (zelfde AI-SDK-v6-vlag als elders in de codebase) —
  geen brede documentatie over een handgeschreven `ChatTransport`-implementatie; dit vergt een
  kleine spike/prototype vóór de volledige bouw om de exacte chunk-vorm (start/delta/end +
  message-id-toewijzing) te bevestigen. Niet gevalideerd in dit document.
- **Risicovol:** de FR-C2a.5-systeemregel (context-breuk bij transport-wissel) is een nieuwe
  UX-beslissing zonder bestaand precedent in de codebase — de exacte copy/plaatsing is een
  ontwerpkeuze voor `frontend-ui-builder`/`ux-review-expert`, dit document legt alleen het
  functionele "moet zichtbaar zijn"-gedrag vast.
- Aangenomen dat `GET /api/local-chat-overview` als losse route de juiste vorm is (i.p.v.
  provider-injectie vanuit de server-layout) — gekozen omdat `ChatPanel` een client component
  is dat overal in de app kan mounten (niet alleen achter een server-page zoals
  `/mijn/lokale-chat`), en een losse, eenmalige fetch het kleinste, meest expliciete
  wijzigpunt is.
- Aangenomen dat de bestaande `profiles`-RLS-policy (eigen-rij) zonder wijziging volstaat voor
  de nieuwe leespaden — geen nieuwe kolom, geen nieuwe policy nodig.

---

## 10. Guardrail-checklist (lokaal chat-pad t.o.v. de standaard ai-feature-checklist)

| Checklist-punt | Van toepassing? | Toelichting |
|---|---|---|
| Kill-switch (`ai_enabled`) | **N.v.t. voor dit document (bevestigd, FR-C2a.10)** | Geen nieuwe, uitsluitend-lokale check — bestaand gat blijft symmetrisch tussen cloud/lokaal. Vervolgfeature, zie §9. |
| Tier-gate | **Ja, ongewijzigd** | Bestaande 'ai'-tier via `hasSubscription`/`checkTierGate` blijft gelden vóór elke lokaal/cloud-keuze. |
| `getModel()` + provider-config | **Nee (lokaal pad)** | Geen provider-aanroep on-device; cloud-pad (`/api/ai/chat` bij `privacy_mode=false`) ongewijzigd. |
| Token-/usage-logging (`recordAiUsage`) | **Nee (lokaal pad)** | Geen kosten, geen credit-budget-gate lokaal; cloud-pad ongewijzigd. |
| `sanitizeForAI` | **Nee (bewust, lokaal pad)** | Geen verzending — zelfde redenering als ADR 0043 §5. Cloud-pad ongewijzigd. |
| `maskPIIInOutput` | **Nee (lokaal pad)** | Geen provider-respons om te filteren. Cloud-pad ongewijzigd. |
| Server-side afdwinging (laag 3) | **Ja — kern van FR-C2a.6/AC-4b** | Nieuwe 403-gate op `/api/ai/chat`, vóór `getModel`. |
| Scanner-dekking (FR-1.3-mechanisme) | **Ja — uitgebreid, FR-C2a.7/AC-4c** | `PRIVACY_GATED_ROUTES` wordt een lijst i.p.v. een enkele constante. |
| Output-validatie tegen toegestane waarden | **N.v.t.** | Chat is vrije tekst, geen slug/enum-validatie zoals categorisatie; bestaande Wft-DNA-regels blijven de guardrail. |
| Wft-compliance | **Ja, ongewijzigd** | `LOCAL_CHAT_DNA` bevat de compliance-regels al (regel 31); geen wijziging in dit document. |
| Kennis-fencing (K1-equivalent) | **Ja, ongewijzigd hergebruikt** | `KNOWLEDGE_FENCE_START/END`. |
| Tool-guardrails | **N.v.t. (structureel, FR-C2a.12)** | Geen tools on-device; C2d expliciet afgewezen. |

---

## 11. Definition of Done

- Alle AC's in §5 groen (handmatig of via test), inclusief de nieuwe vitest-parity-test (AC-12)
  en de uitgebreide `privacy-gate-scan.test.ts` (AC-4c).
- `npx tsc --noEmit` en de relevante vitest-paden (`chat-panel`-gerelateerd,
  `privacy-gate-scan.test.ts`, een nieuwe `local-chat-transport.test.ts`,
  `will-financial-facts.test.ts` of gelijkwaardig) groen.
- Cloud-chat aantoonbaar ongewijzigd: alle 23 ingangen, whatif, tools, streaming,
  tier-/credit-gates (AC-2, AC-14) — geen regressie in bestaande chat-tests.
- `/mijn/lokale-chat` blijft functioneren (nu via `buildWillFinancialFacts` intern, output
  identiek) — geen zichtbaar verschil voor de gebruiker van die pagina.
- Categorisatie-privacy-pad (`/api/ai/categorize`) aantoonbaar ongemoeid — bestaande
  `privacy-gate-scan.test.ts`-assertie voor die route blijft slagen.
- Geen Wft-advies geïntroduceerd; vrijheidstijd-framing (via `buildWillFinancialFacts` →
  beide renderers) intact in gegenereerde antwoorden.
- `AiPrivacyIndicator` toont correcte, waarheidsgetrouwe copy per actieve transport (cloud vs.
  lokaal) — geen "geanonimiseerd verstuurd"-tekst meer bij een lokale sessie.
- Architectuurdocumentatie (`/beheer/architectuur`) bijgewerkt door
  `architecture-docs-keeper`/`architect` als deze wijziging een nieuw data-object,
  applicatieservice-relatie of concern toevoegt (bv. de nieuwe `/api/local-chat-overview`-
  relatie, of het bijwerken van het bestaande "lokale AI"-element) — DoD-vinkje bij oplevering,
  geen taak van dit document.
- Business-owner heeft FR-C2a.10 (kill-switch) en FR-C2a.11 (whatif-labeling) gezien en
  bevestigd als aanvaardbare, bewuste scope-keuzes vóórdat C2a in productie gaat (geen
  onopgemerkte aannames).

---

## Open beslissingen voor de business-owner (samenvatting)

1. **Kill-switch-asymmetrie** (FR-C2a.10) — akkoord om dit BUITEN C2a te houden (bestaand gat,
   symmetrisch tussen cloud/lokaal), met een aparte vervolgfeature voor volledige
   `ai_enabled`-afdwinging op de chat? Aanbeveling: ja, akkoord.
2. **Whatif-labeling in plaats van gating** (FR-C2a.11) — akkoord dat `WhatIfChat` cloud blijft
   tijdens privé-modus, mits duidelijk gelabeld, i.p.v. volledig geblokkeerd/gated? Aanbeveling:
   ja — volledige gating zou een aparte, grotere feature zijn (eigen transport ombouwen) die
   niet in verhouding staat tot de ~1,5 sessie die C2a+C2b kost.
3. **`GET /api/local-chat-overview` als losse route** (§9) — akkoord met dit ontwerp i.p.v.
   server-layout-injectie? Aanbeveling: ja, kleinste wijzigpunt gegeven dat `ChatPanel` overal
   kan mounten.
