# Requirements — Privé-modus: lokale transactie-categorisatie (Gemma 4 E2B, WebGPU)

> Pijplijn: `ai-feature`, stap 2 (Requirement Specialist). Werkt op basis van het vastgestelde
> plan `docs/plan-lokale-categorisatie-prive-modus.md` (branch
> `origin/claude/gemma-4-webgpu-webapp-omloxy`). Dit document zet dat plan om in toetsbare
> requirements + twee openstaande beslispunten voor de business-owner. Geen implementatie in
> dit document.

**Vastgesteld, niet heronderhandelbaar:** model = `onnx-community/gemma-4-E2B-it-ONNX`
(q4f16, tekst-only, ~3,1 GB). De eigenaar kiest bewust een generiek model, met het oog op
meer lokale AI-functies later (fase 5). Architectuur: geïnjecteerde `aiResolver` in
`runCombinedCategorization` (`lib/auto-categorize.ts:424-427`), drie garantielagen met
server-side 403 als beslissende laag, opt-in download bij het aanzetten van de toggle op
`/mijn/privacy`.

**Correcties op het oorspronkelijke plan (geverifieerd juli 2026 — leidend in dit document):**
- Tekst-only download ≈ **3,1 GB** (encoders weglaten scheelt slechts ~0,45 GB t.o.v. de
  volledige ~3,55 GB build — niet de eerdere "fors kleiner"-aanname).
- Doorvoer: prefill ~65 tok/s op een high-end desktop (PLE-penalty van de Gemma 4-architectuur);
  mobiel 4-17 tok/s decode. Bij een batch van 20 transacties + de volledige budgetlijst-prompt
  is **TTFT (time-to-first-token) op mobiel het kernrisico**, niet alleen doorvoer.
- iOS 26 Safari heeft WebGPU aan, maar `maxStorageBufferBindingSize` ligt op mobiel rond
  128 MB–1 GB — **iPhone is in v1 waarschijnlijk onhaalbaar**, tenzij fase 0 verrast.
- `onnxruntime` issue #26732 (het q4f16-overflowpatroon) is inmiddels opgelost — geen live
  blocker meer, maar metriek 9 (output-validiteit) blijft verplicht als vangnet voor
  toekomstige regressies.
- Licentie Gemma 4 = Apache 2.0 — geen gebruiksrestricties, alleen het trademark-beding.
- LiteRT-LM is het actuele Google-alternatief als runtime-fallback; MediaPipe LLM Inference
  is maintenance-only en is geen aan te raden secundaire stack meer.

---

## 1. Doel & waarde

**Ik wil (business-owner)** dat een gebruiker transactie-categorisatie volledig op het eigen
toestel kan laten draaien, **zodat** transactiedata voor die gebruiker nooit een externe
AI-provider bereikt — een concreet, verifieerbaar bewijs van het soevereiniteitsverhaal
(ADR 0001) en van de belofte "jij bent eigenaar van je data" die vandaag al op
`/mijn/privacy` staat (`components/mijn/ai-privacy-settings.tsx:173`).

Pijler: **Kern** (transactiedata/categorisatie) met een **Wil**-dimensie (vertrouwen,
controle, keuzevrijheid — geen vrijheidstijd-cijfer, wel een vrijheids-belofte in de UX-tekst:
"je data verlaat het toestel niet").

---

## 2. Fase-0 (POC) — acceptatiecriteria & go/no-go

Fase 0 is **geen productiecode** (losse spike-map, wegwerpcode). Het is niettemin een
formele stap met een keihard go/no-go-besluit — daarom hier volledig als requirement
vastgelegd, zodat "klaar" niet impliciet blijft.

### 2.1 Methodologie-eis (kritiek — bepaalt of de meting geldig is)

**FR-0.1** De gouden test-set (150-300 transacties) MOET uitsluitend bestaan uit
transacties die in stage 1 van `lib/auto-categorize.ts` (de lokale regelmotor,
`runCombinedCategorization` vóór de AI-fase) **niet** worden opgelost — d.w.z. transacties
die überhaupt de AI-batch bereiken in het bestaande cloud-pad. Reden: regelmotor-oplosbare
transacties zijn triviaal en zouden de accuracy van het lokale model kunstmatig optrekken.
Een gouden set die (deels) uit stage-1-hits bestaat, is voor dit doel **ongeldig** — het
meetrapport moet expliciet benoemen hoe de residu-selectie is afgedwongen (bv. door de set te
trekken uit transacties die in productie `category_source = 'ai'` kregen, niet `'rule'` of
`'transfer'`).

**FR-0.2** Elke test-transactie heeft een door de gebruiker bevestigd budget (leaf-slug uit
`BUDGET_SLUGS`, `lib/budget-data.ts:48`) als ground truth — geen aannames, geen synthetische
labels.

**FR-0.3** De set wordt vóór gebruik geanonimiseerd via de bestaande `sanitizeForAI`
(`lib/ai/sanitize.ts:85`) — uitsluitend omdat dit een wegwerp-testbestand op een
ontwikkelmachine is. Dit is niet representatief voor productiegedrag: het lokale pad in
productie sanitiseert juist NIET (zie §3, Scope-memo, laag 1).

### 2.2 Gemeten metrieken (AC per metriek — Given/When/Then)

| # | Metriek | Acceptatiecriterium |
|---|---|---|
| 1 | Accuracy | Given de gouden set (FR-0.1/0.2), when elke transactie door het lokale model loopt, then ≥ het go-drempel-percentage (zie §2.3) van de resultaten heeft een leaf-slug gelijk aan de ground truth. |
| 2 | Agreement met Claude | Given dezelfde set door het bestaande cloud-pad (`/api/ai/categorize`), when de labels vergeleken worden, then wordt het overlap-% en het patroon van afwijkingen (welke categorieën, welke richting) gerapporteerd — geen harde drempel, wel verplicht gerapporteerd. |
| 3 | Confidence-kalibratie | Given de confidence-drempel van 0,5 uit de bestaande prompt-conventie (`lib/ai/categorize-system-prompt.ts:59`), when resultaten worden gesplitst op confidence ≥0,5 vs. <0,5, then wordt het correct-% per groep gerapporteerd — bevestigt of een confidence-afkap bruikbaar is als kwaliteitsklep in fase 3. |
| 4 | Downloadomvang | Given de tekst-only q4f16-build, when de download wordt gemeten, then is de werkelijke bytegrootte vastgelegd (verwacht ≈3,1 GB; geen aanname meer toegestaan na deze meting). |
| 5 | Cold load | Given een lege cache, when het model voor het eerst geladen wordt tot bruikbaar, then is de tijd tot "klaar" gemeten en gerapporteerd per toestelklasse. |
| 6 | Doorvoer / TTFT | Given een batch van 20 transacties + de volledige budgetlijst-prompt (representatief voor `auto-categorize.ts:444`, batchgrootte-plafond 20), when de batch lokaal verwerkt wordt, then zijn TTFT én totale wandkloktijd gemeten op zowel desktop als een mid-range Android-toestel. |
| 7 | RAM/stabiliteit | Given N ≥ 10 opeenvolgende runs op hetzelfde toestel, when het model herhaald batches verwerkt, then treedt geen device-loss/crash/OOM op; piekgeheugen is gerapporteerd. |
| 8 | Bereik | Given de toestel-matrix (desktop Chrome, mid-range Android Chrome, iPhone Safari, optioneel ouder Android), when de capability-check + een volledige batch wordt uitgevoerd, then is per toestel vastgelegd: slaagt capability-check (ja/nee) en draait zonder crash (ja/nee). |
| 9 | Output-validiteit | Given elke modeloutput, when deze tegen de aangeboden budgetlijst gevalideerd wordt (dezelfde slug-validatie als `resolveSlug` in `app/api/ai/categorize/route.ts:155`), then is het percentage geldige/onzin-output gerapporteerd — vangt eventuele toekomstige overflow-regressie (het bekende #26732-patroon is opgelost, maar dit blijft het structurele vangnet). |

### 2.3 Uitkomstladder (verplicht — vervangt losse "indicatieve" drempels)

| Uitkomst | Voorwaarde | Consequentie |
|---|---|---|
| **GO** | Accuracy ≥ 85% op de residu-gouden-set (FR-0.1) **én** minstens desktop + mid-range Android slagen op metriek 7+8 (stabiel, geen device-loss) **én** TTFT bij batch-van-20 is UX-aanvaardbaar op minstens één mobiele klasse (drempel: business-owner bepaalt vóór dag 5 een concreet seconden-getal — zie open vraag hieronder) | Bouw fase 1-4 zoals gepland. |
| **Voorwaardelijk — desktop-only** | Accuracy 70-85% óf alleen desktop stabiel/snel genoeg (mobiel faalt op 6/7/8) | Fase 1-3 bouwen met **capability-gate die mobiel uitsluit** in v1 (desktop-only privé-modus); mobiel blijft cloud of "niet beschikbaar op dit toestel". Business-owner beslist expliciet of dit de moeite waard is vóór fase 1 start. |
| **Voorwaardelijk — confidence-drempel omhoog** | Accuracy 70-85% mét acceptabele agreement, maar met een duidelijk zwakke staart | Fase 3 voegt een hogere confidence-afkap toe (bv. alleen ≥0,7 automatisch toepassen, lager → "onbekend" in plaats van fout voorstel) i.p.v. het model te vervangen. |
| **NO-GO** | Accuracy < 70% óf structurele instabiliteit/overflow op alle geteste toestelklassen | Fase 1-4 worden niet gebouwd. Reden + metingen worden vastgelegd (dit meetrapport is de deliverable); privé-modus voor categorisatie wordt geparkeerd, niet stilzwijgend losgelaten. |

**Open vraag voor de business-owner (blokkeert het exacte GO-criterium van metriek 6):**
welk TTFT/wandkloktijd-getal voor een batch van 20 op mid-range Android is nog acceptabel
tijdens een import-flow? Zonder dit getal kan fase 0 een cijfermatige uitkomst rapporteren,
maar niet zelfstandig GO/Voorwaardelijk beslissen op snelheid alleen.

### 2.4 Definition of Done — Fase 0

- Meetrapport met alle 9 metrieken, per toestel uit de matrix, inclusief ruwe cijfers (niet
  alleen samenvattend oordeel).
- Expliciete GO / Voorwaardelijk-desktop-only / Voorwaardelijk-confidence / NO-GO-uitkomst
  met onderbouwing volgens §2.3.
- Bevestiging of de gouden set aan FR-0.1 voldoet (residu-only), met de gebruikte
  selectiemethode benoemd.
- Geen wijziging aan `app/`, `lib/` of migraties (spike blijft geïsoleerd).
- Business-owner heeft de uitkomst gezien en het vervolg (fase 1 starten / desktop-only
  scope / parkeren) expliciet bevestigd vóórdat fase 1 begint.

---

## 3. Scope-beslismemo A vs. B — beslispoort vóór fase 1

Dit is een **productbeslissing**, geen requirement — de business-owner moet kiezen vóórdat
fase 1 (de server-side 403-garantie) gebouwd wordt, omdat de keuze bepaalt WAT de guard in
§4 precies blokkeert.

### Optie A — "Transacties lokaal categoriseren" (smalle belofte)

De toggle op `/mijn/privacy` heet letterlijk zoiets als *"Categoriseer transacties lokaal op
dit toestel"*. `privacy_mode=true` beïnvloedt **uitsluitend** de resolver-keuze in
`runCombinedCategorization` (`components/app/ai-categorize-sheet.tsx:379-405`) en de
server-side 403 op `/api/ai/categorize` (`app/api/ai/categorize/route.ts:35`). Alle overige
AI-functies (chat, briefing, aanbevelingen, abonnement-detectie, what-if, etc.) blijven
ongewijzigd cloud-based, ook als de toggle aan staat.

- **Belofte-formulering:** smal en 100% waar te maken — "deze specifieke functie draait
  lokaal" is letterlijk het gebouwde gedrag.
- **UX-impact:** laag risico op verwarring; de gebruiker verliest geen andere functionaliteit.
- **Technische impact:** klein en additief — raakt precies de twee bestanden uit het plan
  (§0 "kern in één alinea").
- **Risico:** minder krachtig marketingverhaal ("privé-modus" klinkt breder dan wat het doet);
  een gebruiker die "privé-modus" aanzet in de veronderstelling dat álle AI lokaal/geblokkeerd
  is, wordt mogelijk misleid als de naam breder klinkt dan de werking.

### Optie B — "Privé-modus" als paraplu (brede belofte)

`privacy_mode=true` is een **globale schakelaar**: alle cloud-AI-routes geven 403 zodra hij
aan staat, niet alleen categorisatie. Op basis van de huidige `getModel()`-consumenten
(verificatie hieronder) raakt dit minimaal:

- Interactieve routes: `/api/ai/categorize`, `/api/ai/chat`, `/api/ai/recommendations`,
  `/api/ai/recommendations/initial`, `/api/whatif/suggest`, `/api/subscriptions/detect-ai`,
  `/api/subscriptions/advice`, `/api/subscriptions/analyse-ai`, `/api/onboarding/suggest-budgets`,
  `/api/pension/parse`, `/api/report`, `/api/ai/build-calculator`.
- **Server-geïnitieerd, zonder directe gebruikersactie:** `/api/briefing/refresh` (de
  wekelijkse briefing-cron leest transactiedata via `lib/ai/context/wil-context.ts` e.a.
  context-builders en roept `getModel` aan namens de gebruiker) en news-personalisatie
  (`lib/news-enrich.ts`, `/api/news`, `/api/news-ingest/cron`, `/api/admin/news-ingest`) —
  al is de laatste categorie deels systeembreed/redactioneel in plaats van per-gebruiker en
  vergt dus precisering welke news-routes daadwerkelijk *gebruikersdata* verwerken versus
  generieke artikel-verrijking.
- Verificatie in de codebase telt **~21 bestanden** met een `getModel(...)`-aanroep buiten
  `lib/ai/config.ts` zelf (documentatie/agent-md's niet meegerekend); het plan noemt "~17" —
  het exacte aantal hangt af van of news-ingest (systeembreed, geen individuele
  gebruikersdata) wordt meegeteld. **Dit aantal moet bij de start van fase 1 opnieuw geteld
  worden** (`grep -rn "getModel(" app lib`) — het is een bewegend doel naarmate de AI-laag
  groeit, en de regressietest in FR-1.2 moet dit aantal dynamisch afdekken, niet hardcoded.

Voor de functies die 403 krijgen en (nog) geen lokaal alternatief hebben (fase 5, "buiten
scope v1" — zie §6), verliest de gebruiker die functionaliteit volledig zolang privé-modus
aan staat: geen AI-chat, geen briefing, geen aanbevelingen, geen abonnement-detectie, etc.

- **Belofte-formulering:** krachtig en samenhangend — "privé-modus" betekent werkelijk
  "geen enkele euro-relevante byte verlaat dit toestel richting een AI-provider", een
  zuivere, goed uit te leggen garantie.
- **UX-impact:** hoog — een gebruiker die AI-chat/briefing waardeert, verliest die functies
  volledig zodra hij de toggle aanzet voor "alleen" lokale categorisatie. Dit vereist zeer
  heldere copy vooraf ("hiermee schakel je ALLE AI-functies uit behalve lokale
  categorisatie") anders voelt het als een bug, niet als een feature.
- **Technische impact:** groter — één centrale guard die ~15-20 routes raakt (zie §4),
  inclusief twee server-geïnitieerde paden (briefing-cron, mogelijk news) die niet
  interactief zijn en dus geen request-time toggle-check "voelen" — de guard moet ook daar
  vóór elke `getModel`-aanroep zitten, niet alleen op user-facing routes.
- **Risico:** grotere kans op een gemiste route (nieuwe AI-functie vergeet de guard) — vandaar
  de eis in §4 voor een centrale, niet-kopieerbare guard + regressietest die alle routes
  afloopt. Ook: de wekelijkse briefing-cron draait server-geïnitieerd — als de guard daar
  vergeten wordt, is de garantie stilzwijgend gebroken zonder dat een gebruiker een 403 ziet.

### Aanbeveling van de requirement-specialist

**Optie A voor v1.** De belofte is klein en 100% waar te maken met het bestaande, al
uitgewerkte plan; Optie B is architectonisch de sterkere lange-termijn-visie (en sluit beter
aan bij "privé-modus" als naam) maar vereist een centrale guard over een dubbelcijferig en
groeiend aantal routes — inclusief twee server-geïnitieerde paden — vóórdat er één regel
lokale-categorisatie-code staat. Dat is een grotere, aparte investering die niet stilzwijgend
in fase 1 hoort te sluipen. **Advies:** bouw fase 1-4 als Optie A onder de naam
"transacties lokaal categoriseren" (niet "privé-modus"); bewaar "privé-modus" als naam voor
een latere, bewust geschaalde uitbreiding (fase 5+) zodra meer functies een lokaal
alternatief hebben en de guard-dekking het waard is om centraal te bouwen.

**Dit is een open beslissing — de business-owner beslist, dit memo beslist niet.** Alle
requirements in §4 zijn geschreven zodat ze **onder beide opties werken**: de guard wordt zo
geschreven dat hij per-route (Optie A: alleen `/api/ai/categorize`) of centraal (Optie B: alle
routes) inzetbaar is zonder herontwerp.

---

## 4. Requirements fase 1-3

### Fase 1 — Migratie + server-side garantie (laag 3, beslissend)

**FR-1.1** Migratie `supabase/migrations/<timestamp>_add_profiles_privacy_mode.sql` voegt
`profiles.privacy_mode boolean not null default false` toe, additief, naar het patroon van
`20260622120000_add_profiles_display_mode.sql`. Geen nieuwe RLS-policy nodig — de bestaande
eigen-rij policy op `profiles` (`USING (auth.uid() = id)`) dekt de nieuwe kolom automatisch.

- Given een ingelogde gebruiker, when die zijn eigen `profiles`-rij update, then slaagt de
  update op `privacy_mode` via dezelfde RLS-regel als `ai_enabled`/`display_mode`.
- Given gebruiker B, when die probeert gebruiker A's `privacy_mode` te lezen/schrijven via de
  anon-client, then weigert RLS dit (bestaand gedrag, alleen te bevestigen met een test, niet
  opnieuw te bouwen).

**FR-1.2** Een centrale guard-functie (bv. `lib/ai/privacy-gate.ts`, naast/aanvullend op
`checkTierGate` in `lib/require-tier.ts:17`) leest `profiles.privacy_mode` voor de
ingelogde gebruiker en retourneert een 403-achtig gate-object wanneer `privacy_mode=true` —
zelfde aanroep-patroon als `checkTierGate(supabase, userId, 'ai')`, dus drop-in naast de
bestaande tier-check in elke route. **Belangrijk:** vandaag wordt `ai_enabled` server-side
**nergens** afgedwongen (alleen client-side gelezen, zie `ai-privacy-settings.tsx:40` en
`dashboard-data-loader.ts:237`) — deze guard is dus de **eerste server-side per-gebruiker
AI-gate** in de codebase, niet slechts een uitbreiding van een bestaand patroon. Dat maakt
zorgvuldige toepassing extra belangrijk.

- Given `privacy_mode=true` op het profiel, when de gebruiker (Optie A) `/api/ai/categorize`
  aanroept, then retourneert de route 403 met een duidelijke, niet-technische foutmelding,
  vóórdat `getModel()` of enige transactiedata de promptopbouw bereikt.
- Given `privacy_mode=false` (default), when dezelfde route wordt aangeroepen, then is het
  gedrag exact ongewijzigd t.o.v. vandaag.
- (Optie B, indien gekozen) Given `privacy_mode=true`, when élke route uit de lijst in §3
  wordt aangeroepen — inclusief het server-geïnitieerde briefing-cron-pad — then retourneert
  elke route 403/slaat de cron-verwerking voor die gebruiker over, zonder dat `getModel()`
  wordt aangeroepen.

**FR-1.3** Regressietest (`tester`-scope, niet dit document) die **alle** bestanden met een
`getModel(...)`-aanroep afloopt (dynamisch via bestandslijst/grep-achtige test, niet een
hardcoded array die kan verouderen) en per route bevestigt dat de guard aanwezig is
(Optie A: alleen op `/api/ai/categorize`; Optie B: op alle). Dit voorkomt dat een
toekomstige, nieuwe AI-route de garantie stilzwijgend omzeilt.

### Fase 2 — Toggle + download-consent-flow

**FR-2.1** Toggle-component naast `AiPrivacySettings` op `/mijn/privacy`
(`app/(app)/mijn/privacy/page.tsx`), zichtbaar en bedienbaar alleen wanneer `ai_enabled=true`
(de bestaande AI-hoofdschakelaar) — lokale categorisatie is een verfijning van AI-gebruik,
geen alternatief voor "AI helemaal uit".

- Given `ai_enabled=false`, when de gebruiker op `/mijn/privacy` komt, then is de nieuwe
  toggle niet bedienbaar (uitgegrijsd of verborgen — implementatiekeuze, maar niet
  onafhankelijk van `ai_enabled` bedienbaar).

**FR-2.2** Capability-check (`navigator.gpu` + adapter-probe + geheugeninschatting) draait
zodra de gebruiker de toggle probeert aan te zetten, vóór er een download start.

- Given een toestel zonder WebGPU-ondersteuning of onvoldoende geheugen, when de gebruiker de
  toggle aanzet, then blijft de toggle uit, verschijnt een eerlijke melding die het concrete
  probleem benoemt (geen WebGPU / te weinig geheugen), en start GEEN download en GEEN
  cloud-fallback wordt aangeboden als vervanging binnen deze toggle-flow.

**FR-2.3** Download-consent-stap toont het gemeten werkelijke aantal GB (uit fase 0, niet de
eerdere aanname), een wifi-aanbeveling, en de zin "data verlaat je toestel nooit" —
consistent met de bestaande transparantie-blokken op dezelfde pagina
(`ai-privacy-settings.tsx:173-206`). Voortgangsbalk tijdens download.

- Given de gebruiker bevestigt de download, when deze voltooit, then wordt
  `navigator.storage.persist()` aangeroepen en is een "model verwijderen /
  opnieuw downloaden"-knop zichtbaar.
- Given de download onderbroken wordt (netwerkfout, tab gesloten), when de gebruiker
  terugkeert, then is de staat "in afwachting" zichtbaar (geen halve, onbruikbare download die
  als "actief" wordt voorgesteld) en kan de download hervat/opnieuw gestart worden.

**FR-2.4** CSP: de model-host wordt toegevoegd aan `connect-src` in `next.config.ts:27`
(vandaag: `"connect-src 'self' https://*.supabase.co wss://*.supabase.co
https://challenges.cloudflare.com https://vitals.vercel-insights.com"`) — één expliciete,
controleerbare toevoeging, geen wildcard.

### Fase 3 — Lokale resolver

**FR-3.1** `lib/ai/local/local-categorize-resolver.ts` implementeert exact het bestaande
`aiResolver`-contract: `(batch: CombinedAiBatchItem[]) => Promise<CombinedAiResult[]>`
(`lib/auto-categorize.ts:358-373`), zodat `runCombinedCategorization` ongewijzigd blijft.

**FR-3.2** De resolver hergebruikt `buildCategorizeSystemPrompt(budgets)`
(`lib/ai/categorize-system-prompt.ts`) en dezelfde slug-validatie-logica als
`resolveSlug`/`buildBudgetOptions` (`app/api/ai/categorize/route.ts:13,155`) — geen tweede,
losstaande promptvariant die kan verwateren.

**FR-3.3** `opts.batchSize` (bestaand veld, plafond 20, `lib/auto-categorize.ts:429-430,444`)
mag lokaal kleiner ingesteld worden dan het cloud-plafond, gebaseerd op fase-0-bevindingen
over TTFT bij lange prompts op mobiel.

- Given fase 0 toont degradatie bij de volledige budgetlijst-prompt op een 2B-model, when
  fase 3 de batchgrootte kiest, then is die keuze een expliciet, gedocumenteerd getal
  (niet het cloud-plafond van 20 zonder heroverweging).

**FR-3.4** De lokale resolver MAG `counterparty_iban` meesturen in de prompt (blijft op het
toestel, verlaat de browser niet) — een uitbreiding t.o.v. het cloud-pad, dat dit bewust
weglaat (`ai-categorize-sheet.tsx:376-378`, IBAN wordt daar juist NIET meegestuurd omdat
`sanitizeForAI` het toch zou maskeren).

- Given de lokale resolver, when een transactie met een bekend `counterparty_iban` wordt
  aangeboden, then staat het IBAN in de lokale prompt-payload (geen maskering nodig, geen
  netwerkverkeer).

**FR-3.5** De lokale resolver roept `sanitizeForAI` NIET aan — dat is een cloud-specifieke
data-minimalisatie-maatregel die bij lokale inferentie geen functie heeft (geen extern
netwerkverkeer om te beschermen).

**FR-3.6** Geen-fallback-gedrag: als lokale inferentie faalt (model niet geladen, WebGPU
device-loss, timeout), blokkeert de resolver de batch met een eerlijke melding. Geen stille
`catch → cloud`-overstap.

- Given lokale inferentie faalt tijdens een batch, when de fout optreedt, then krijgt de
  gebruiker een duidelijke melding ("lokale categorisatie is niet gelukt, probeer opnieuw of
  categoriseer deze handmatig") en wordt de batch NIET alsnog naar `/api/ai/categorize`
  gestuurd.

**FR-3.7** `components/app/ai-categorize-sheet.tsx:379-405` kiest de resolver op basis van
`privacy_mode`: aan → uitsluitend `localAiResolver` (de cloud-`aiResolver` wordt niet
geconstrueerd, laag 1 uit het plan §2); uit → ongewijzigd huidig gedrag.

---

## 5. Guardrail-checklist-mapping (lokale pad t.o.v. de standaard ai-feature-checklist)

| Checklist-punt | Van toepassing op het lokale pad? | Toelichting / equivalent |
|---|---|---|
| Kill-switch (`ai_enabled`) | **Ja, indirect** | Toggle alleen bedienbaar bij `ai_enabled=true` (FR-2.1); geen apart lokaal kill-switch nodig — de bestaande hoofdschakelaar dekt dit. |
| Tier-gate op de route/toggle | **Open productvraag — zie hieronder** | `/api/ai/categorize` heeft vandaag al `checkTierGate(..., 'ai')` (route.ts:43); of de *toggle zelf* een tier vereist is niet vanzelfsprekend gelijk aan de cloud-tier. |
| `getModel()` + provider-config | **Nee** | Geen providerkeuze — het model is vast (Gemma 4 E2B lokaal), geen server-side model-aanroep. |
| Token-/usage-logging (`recordAiUsage`) | **Nee** | Geen API-kosten, geen credit-budget-gate nodig (`checkCreditBudget` in route.ts:50 is cloud-specifiek en irrelevant lokaal). |
| `sanitizeForAI` (PII-maskering vóór verzending) | **Nee (bewust)** | Zie FR-3.5 — er is geen verzending. Vervangend guardrail: geen. |
| `maskPIIInOutput` | **Nee** | Geen provider-respons om te filteren; output is al lokaal. |
| Output-validatie tegen toegestane waarden | **Ja — dít is het lokale equivalent** | Slug-validatie tegen de aangeboden budgetlijst (FR-3.2, hergebruik van `resolveSlug`) is de guardrail die bij een klein/instabiel model onzin-output afvangt — vergelijkbaar met metriek 9 in fase 0. |
| Wft-compliance (geen koop/verkoop/beleggingsadvies) | **Ja, ongewijzigd** | Categorisatie is geen advies; de prompt-DNA-eisen (geen advies-framing) gelden voor elke prompt-variant, lokaal of cloud — geen nieuwe blootstelling, wel te bevestigen door `ai-specialist-prompt-dna` bij het schrijven van de lokale system-prompt-hergebruik. |
| Server-side afdwinging (laag 3) | **Ja — kern van fase 1** | Zie FR-1.2/FR-1.3. |

### Open productvraag: moet lokale categorisatie achter een tier zitten?

> **Beslecht — 17 juli 2026, eigenaar: optie 2.** Lokale categorisatie zit achter de
> bestaande 'ai'-tier. AANzetten gate-t server-side in `POST /api/privacy-mode`
> (`checkTierGate(..., 'ai')`, alleen bij `enabled === true`); UITzetten blijft altijd
> vrij, zodat een verlopen abonnement niemand in privé-modus opsluit. De opties
> hieronder blijven staan als vastlegging van de afweging.

Er zijn geen API-kosten (geen `recordAiUsage`/credit-budget nodig), maar wel
support-/complexiteitskosten (download-grootte, capability-verschillen, devicebugs). Opties
voor de business-owner:

- **Optie 1 — Geen tier-gate op de toggle zelf**, wél behouden dat `/api/ai/categorize` zijn
  bestaande `checkTierGate(..., 'ai')` behoudt voor de *cloud*-weg; lokale categorisatie is
  gratis beschikbaar voor iedereen met `ai_enabled=true` en een geschikt toestel. Argument:
  geen marginale kosten, en het past bij het soevereiniteitsverhaal (niet betalen om je eigen
  data te beschermen).
- **Optie 2 — Achter dezelfde 'ai'-tier** als de rest van de AI-functies (consistent met
  vandaag: elke AI-functie zit achter `checkTierGate(..., 'ai')`). Argument: consistentie,
  en support-last (devicebugs, downloadproblemen) is wel degelijk een kostenpost die een
  betaalde tier rechtvaardigt.
- **Optie 3 — Nieuwe, eigen gate** los van de bestaande tiers (bv. alleen beschikbaar vanaf een
  bepaald sovereignty-niveau i.p.v. commercieel tier). Buiten de huidige `CommercialTier`-opzet
  (`lib/feature-registry.ts`) en dus een grotere ingreep — alleen kiezen met expliciete reden.

**Dit document beveelt geen optie aan** — het is een productvraag met reële trade-offs, geen
requirement die uit techniek volgt.

---

## 6. Niet-functionele requirements

- **Performance:** TTFT en wandkloktijd per batch-van-20 zijn gemeten in fase 0 (§2.2 #6) en
  vormen de basis voor de batchgrootte-keuze in FR-3.3. Geen harde performance-eis vooraf
  buiten wat fase 0 empirisch oplevert.
- **Toegankelijkheid:** de toggle en download-consent-flow volgen de bestaande
  `role="switch"`/`aria-checked`/`aria-label`-conventie zoals in `ai-privacy-settings.tsx:154-166`.
- **Responsive/mobile-first:** de download-voortgangsbalk en capability-melding moeten op
  mobiel (waar het risico het grootst is — TTFT, geheugen) even bruikbaar zijn als op desktop.
- **Security/privacy:** transactiedata verlaat het toestel nooit bij `privacy_mode=true`
  (laag 1+2+3, plan §2); modelgewichten-download bevat geen gebruikersdata (eerlijk
  onderscheid, plan §2, expliciet te communiceren in de consent-copy).
- **RLS/ownership:** `profiles.privacy_mode` is een eigen-rij scalar, own-row read-modify-write
  via de anon-client — nooit service-role (FR-1.1, spiegelt `app/api/display-mode/route.ts`).
- **Gating:** zie §5, open productvraag — tier-beslissing volgt uit de business-owner-keuze,
  niet uit dit document.
- **i18n:** alle nieuwe copy in het Nederlands, informeel je/jij, consistent met de bestaande
  toon op `/mijn/privacy`.

---

## 7. Randgevallen & foutpaden

| Situatie | Verwacht gedrag |
|---|---|
| Toestel zonder WebGPU | Capability-check faalt eerlijk vóór download; toggle blijft uit; geen cloud-fallback binnen deze flow (FR-2.2). |
| Download onderbroken (netwerk, tab dicht) | Staat "in afwachting", geen halve download die als "actief" oogt; hervatbaar (FR-2.3). |
| Model gedownload maar inferentie faalt (device-loss, timeout) | Blokkeer met melding, geen stille cloud-fallback (FR-3.6). |
| `ai_enabled=false` terwijl `privacy_mode=true` stond | Toggle niet bedienbaar/zichtbaar (FR-2.1); bestaande `ai_enabled=false`-gedrag (geen AI, punt) wint — behandel dit als AND, niet als losstaande staat. |
| Gebruiker zet `privacy_mode` aan zonder ooit te downloaden | Categorisatie geblokkeerd ("in afwachting"), nooit stilzwijgend cloud (plan §3, stap 4). |
| Storage-eviction door de browser | `navigator.storage.persist()` (FR-2.3) verkleint het risico; "opnieuw downloaden"-knop is het herstelpad. |
| Nieuwe AI-route toegevoegd na fase 1, guard vergeten | Afgevangen door FR-1.3 (dynamische regressietest over alle `getModel`-consumenten) — dit is precies waarom de test dynamisch moet zijn, niet een hardcoded lijst. |
| iPhone/Safari in v1 | Capability-check faalt naar verwachting (128 MB-1 GB `maxStorageBufferBindingSize`); dit is geen bug maar het verwachte, geaccepteerde resultaat van de scope-beslissing in §8 — geen aparte foutafhandeling nodig buiten de generieke capability-melding. |

---

## 8. Buiten scope v1

- **iPhone/Safari-ondersteuning** — tenzij fase 0 verrassend positief uitpakt (expliciet
  benoemd in de fase-0-DoD als mogelijke, niet verwachte, uitkomst).
- **Andere AI-functies lokaal** (chat, briefing, aanbevelingen, etc.) — dat is fase 5,
  volgend op deze capability, niet onderdeel van dit spec.
- **Automatische her-categorisatie** van reeds gecategoriseerde transacties bij het aanzetten
  van privé-modus — bestaande categorisaties blijven ongewijzigd staan.
- **Optie B (brede privé-modus-paraplu)** — tenzij de business-owner dit in §3 alsnog kiest;
  dan verschuift dit item van "buiten scope" naar "fase 1-scope met uitgebreide guard-dekking".

---

## 9. Afhankelijkheden & aannames

**Afhankelijkheden:**
- `lib/auto-categorize.ts` (`runCombinedCategorization`, het `aiResolver`-contract) — bestaand,
  niet te wijzigen buiten de resolver-injectie.
- `lib/ai/categorize-system-prompt.ts` (`buildCategorizeSystemPrompt`, confidence-conventie).
- `lib/budget-data.ts` (`BUDGET_SLUGS`) als bron voor geldige categorisatiedoelen.
- `app/api/ai/categorize/route.ts` (`resolveSlug`/`buildBudgetOptions`) voor de
  hergebruikte validatielogica.
- `lib/require-tier.ts` (`checkTierGate`) als patroon voor de nieuwe privacy-guard.
- `next.config.ts` CSP `connect-src` voor de model-host-toevoeging.
- Fase-0-meetrapport als harde voorwaarde vóór fase 1 start (geen productiecode zonder GO/
  Voorwaardelijk-uitkomst).

**Aannames (risico's gevlagd):**
- **Risicovol:** het exacte aantal `getModel`-consumenten (~17-21) is een momentopname en
  groeit met elke nieuwe AI-feature — FR-1.3 dwingt af dat dit geen statische aanname blijft.
- **Risicovol:** de TTFT-drempel voor "UX-aanvaardbaar" op mobiel (§2.3) is nog niet door de
  business-owner vastgesteld — fase 0 kan zonder dit getal geen zelfstandig GO/NO-GO op
  snelheid vellen.
- Aangenomen dat Transformers.js + WebGPU de gekozen runtime blijft (plan §1); LiteRT-LM als
  fallback wordt pas relevant als fase 0 structurele problemen met deze stack vindt.
- Aangenomen dat de bestaande `profiles`-RLS-policy (eigen-rij) zonder wijziging volstaat voor
  de nieuwe kolom — bevestigd in FR-1.1, geen aparte policy nodig.

---

## 10. Definition of Done per fase (kort, toetsbaar)

**Fase 0:** zie §2.4 (volledig).

**Fase 1:** migratie toegepast; FR-1.1/1.2 acceptatiecriteria groen; FR-1.3-regressietest
bestaat en loopt dynamisch alle `getModel`-consumenten af; `tsc`/lint/vitest groen; geen
wijziging aan cloud-gedrag bij `privacy_mode=false`.

**Fase 2:** toggle + capability-check + download-consent-flow werkend op minstens desktop +
één mobiele klasse; FR-2.1 t/m FR-2.4 acceptatiecriteria groen; CSP-toevoeging gecontroleerd
(geen wildcard); copy in het Nederlands, je/jij, consistent met bestaande privacy-pagina.

**Fase 3:** lokale resolver voldoet aan het bestaande `aiResolver`-contract zonder wijziging
aan `runCombinedCategorization`; FR-3.1 t/m FR-3.7 acceptatiecriteria groen; geen-fallback
bevestigd met een test die inferentie-falen simuleert; `sanitizeForAI` aantoonbaar niet
aangeroepen in het lokale pad (FR-3.5) — bv. via een grep-test of code-review-checklist-item.

**Alle fasen:** geen Wft-advies geïntroduceerd; vrijheidstijd-/soevereiniteitsframing correct
in nieuwe UI-copy; architectuurdocumentatie (`/beheer/architectuur`) bijgewerkt als deze
capability een nieuw data-object, technologie-laag of externe integratie (de modelhost)
toevoegt — dat is een taak voor `architecture-docs-keeper`, niet dit document, maar wel een
DoD-vinkje bij oplevering.

---

## Open beslissingen voor de business-owner (samenvatting)

1. **Scope A vs. B** (§3) — smalle "transacties lokaal categoriseren" of brede "privé-modus"-
   paraplu. Aanbeveling: A voor v1.
2. **TTFT-drempel** (§2.3) — welk seconden-getal voor batch-van-20 op mid-range Android is
   nog acceptabel? Nodig om fase 0 zelfstandig te laten beslissen.
3. **Tier-gate op de toggle** (§5, open productvraag) — gratis, achter de bestaande 'ai'-tier,
   of een nieuw eigen gate? → **Beslecht 17 juli 2026 (eigenaar): optie 2** — achter de
   bestaande 'ai'-tier. Aanzetten gate-t server-side in `POST /api/privacy-mode`; uitzetten
   blijft vrij.
