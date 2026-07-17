# Spike — Lokale transactie-categorisatie (fase 0)

Wegwerp-**meetharnas** om te bepalen of we banktransacties lokaal in de browser
kunnen categoriseren met **Gemma via [Transformers.js](https://github.com/huggingface/transformers.js) + WebGPU**,
in plaats van via de server-LLM. Dit is een **spike**, bewust **los van de
TriFinity-app**: geen productie-AI-route, dus de gebruikelijke
`getModel`/`sanitize`/token-logging-checklist geldt hier niet. Enige koppeling
met de app: de spike **importeert** de échte categorisatie-prompt en budgetlijst
als single source of truth.

> ⚠️ **Het primaire model is ~3,1 GB download.** Draai de eerste (cold) meting op
> een desktop met een goede verbinding. Gebruik het smoke-model (Gemma 3 1B,
> ~1 GB) om de harnasmechanica te verifiëren vóór de grote download.

## Wat het meet (metrieken uit het plan)

| # | Metriek | Waar in het harnas |
|---|---------|--------------------|
| 1 | Accuracy vs. ground-truth-label | Rapport-KPI + per-transactie-tabel |
| 2 | (n.v.t. in deze spike) | — |
| 3 | Confidence-kalibratie (correct-% bij confidence ≥0,5 vs <0,5) | Rapport-tabel |
| 4 | Download-omvang (bytes) | Loader-paneel (progress) |
| 5 | Cold load (0→klaar) en warm load (uit cache) | Loader-paneel |
| 6 | Doorvoer: TTFT/prefill + decode tok/s + wandkloktijd/batch | Rapport + per-batch-tabel |
| 7 | Geheugen/stabiliteit (crashes, device-lost-events) | Stabiliteit-regel in rapport |
| 8 | Capability-check-uitslag | Capability-paneel (PASS/WARN/FAIL) |
| 9 | Output-validiteit (% geldige leaf-slugs / parsebare JSON) | Rapport-KPI |

## Runnen

Vereist Node 24+ (voor het dataset-checkscript) en een WebGPU-browser (Chrome/Edge
met WebGPU aan). **WebGPU vereist een secure context** — `http://localhost` telt
als secure, dus de dev-server werkt out of the box.

```bash
cd spikes/lokale-categorisatie
npm install
npm run dev          # open de getoonde http://localhost:5173
```

- `npm run check:dataset` — valideert dat elke `label_slug` bestaat in de
  afgeleide budgetlijst.
- `npm run smoke` — deterministische harnas-smoke (zonder GPU): draait de echte
  runner + parser + metrics tegen een gestubd model, incl. de `kort`-uitvoer en
  de afkap-/salvage-paden.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` / `npm run preview` — productie-build (optioneel; niet nodig om
  te meten).

### Meekijken vanaf een telefoon

`vite.config.ts` zet `server.host = true` (bind op 0.0.0.0). Een LAN-IP is echter
**geen** secure context, dus WebGPU werkt daar niet zonder HTTPS. Gebruik voor een
telefoonmeting een tunnel met TLS (bijv. `cloudflared tunnel --url http://localhost:5173`
of `ngrok http 5173`) en open de `https://…`-URL op het toestel.

## Meetprotocol (knoppen in volgorde)

1. **Capability-check** draait automatisch bij openen. Noteer PASS/WARN/FAIL.
   Kies eerst het model in de dropdown (de checks worden tegen dát model beoordeeld).
2. **Cold load meten:** klik eerst **"Cache wissen"**, dan **"Laad model"**. De
   loader toont downloadbytes/percentage en de laadtijd; omdat de cache leeg was,
   is dit de **cold**-tijd. Noteer download-omvang (metriek 4) en cold-load
   (metriek 5).
3. **Warm load meten:** herlaad de pagina (of laad hetzelfde model nogmaals) —
   nu wordt uit de Cache Storage geladen. De loader labelt dit **warm**. De
   cold/warm-tijden staan naast elkaar in de statusregel.
4. **Dataset draaien:** stel in:
   - **batchgrootte** (default 20 = het productiecontract);
   - **promptvariant** — dit is de *systeem*-as: `full` (echte app-prompt) of
     `compact` (ingekorte budgetlijst);
   - **uitvoer** — een aparte *output*-as: `met reasoning` of `kort`. `kort` laat
     het model per transactie alleen `{budget_slug, confidence}` teruggeven (geen
     reasoning). Omdat **decode de wandkloktijd domineert** (meting v1: 6,6 tok/s)
     is dit de grootste snelheidshefboom.
   - **max_new_tokens** wordt **automatisch** ingevuld per uitvoervariant +
     batchgrootte (kort ≈ 28 tok/tx, reasoning ≈ 80 tok/tx); handmatig te
     overschrijven. Te lage waarde = afkapping = invalide JSON.

   Klik **"Draai dataset"**. Per batch verschijnen TTFT en tok/s.
5. **Rapport lezen:** accuracy, output-validiteit, kalibratie, doorvoer,
   stabiliteit. Klap de per-batch-tabel uit: die toont nu ook `items x/n` en
   **diagnose-vlaggen** (`fence` / `think` / `afgekapt` / `geborgen`) per batch,
   zodat je ziet wáárom een batch invalide was.
6. **Export meetrapport (JSON):** kopieert naar klembord én downloadt een bestand
   met user-agent, adapter-info, modelversie, dtype, prompt- én uitvoervariant,
   batchgrootte, **per-bestand download-bytes**, per-batch-timings + diagnose, en
   per-transactie-uitkomsten (verwacht/gekregen/confidence). De ruwe modeloutput
   per batch (incl. parse-FAILs) zit in `batches[].rawOutput`.
7. Herhaal stap 4–6 voor de andere assen (prompt `full`/`compact` × uitvoer
   `reasoning`/`kort`) en batchgroottes om de afweging context ↔ accuracy ↔
   snelheid te zien.

> **Download-uitsplitsing:** na het laden opent onder de loader een
> "Download-uitsplitsing per bestand" (ook in de console als `[download-dieet]`).
> Zo zie je meteen welke component in welke dtype binnenkwam — de diagnose voor
> het 6,32 GB-probleem (zie onder).

Draai idealiter meerdere keren en op meerdere toestellen; de per-run JSON-rapporten
zijn de meetdata voor de go/no-go.

## Modellen (registry)

| Rol | Repo | API | dtype |
|-----|------|-----|-------|
| **Primair** (productiekandidaat) | `onnx-community/gemma-4-E2B-it-ONNX` | `AutoProcessor` + `Gemma4ForConditionalGeneration` (tekst-only) | per-module `q4f16` |
| **Smoke** (mechanica) | `onnx-community/gemma-3-1b-it-ONNX` | `AutoTokenizer` + `AutoModelForCausalLM` | `q4f16` |

Beide draaien op `device: "webgpu"`. Het primaire model is multimodaal maar wordt
hier **tekst-only** gebruikt (geen beeld/audio meegegeven). Voor het download-dieet
zetten we `dtype` als **per-module object** i.p.v. een string — zie hieronder.
Zie ook *Afwijkingen t.o.v. de modelkaart* onderaan.

## Meting v1 — bevindingen en hefbomen (juli 2026)

Eerste desktopmeting (Edge, NVIDIA RTX PRO 4500): Gemma 4 E2B, full prompt, batch
20, 101 tx → accuracy **27,7%**, output-validiteit **49,5%** (batch 5 parse-FAIL),
accuracy-op-geldige-output 56,0%, TTFT ~3,9 s (prefill ~900 tok/s), decode **6,6
tok/s** (structureel traag, PLE-penalty), totaal ~600 s, 0 crashes, download **6,32
GB** (i.p.v. ~3,1 GB), warm load 46,5 s (init domineert). Drie hefbomen ingebouwd:

### 1. Uitvoervariant "kort" (grootste snelheidshefboom)
Aparte **output-as** (dropdown "uitvoer"). `kort` = per transactie alleen
`{budget_slug, confidence}`, geen reasoning. Decode domineert de wandkloktijd, dus
~3–4× minder tokens/transactie ≈ evenredig sneller. `max_new_tokens` wordt
automatisch passend gezet (kort ≈ 28 tok/tx). De parser accepteert ontbrekend
`reasoning`. Verifieer op de meting of accuracy behouden blijft zonder reasoning.

### 2. Download-dieet — mysterie OPGELOST (dubbeltelling, geen fp16-terugval)
De 6,32 GB was een **meetartefact van de teller, geen echte download**. De
per-bestand-tabel op runs 2/3 toonde **~3,17 GB aan echte bestanden** plus één
**aggregaat-regel** (`onnx-community/gemma-4-E2B-it-ONNX = 3,15 GB`): Transformers.js
vuurt naast de per-bestand progress-events óók een repo-breed aggregaat-event, en
de teller somde beide op → 6,32 = exact **2 × 3,16 GB**. De string-dtype `"q4f16"`
was dus al correct; er was **nooit** een fp16-terugval. De echte tekst-only download
is **~3,2 GB** (embed_tokens_q4f16 ~1,59 GB + decoder_q4f16 ~1,52 GB + kleine
vision/audio q4f16 + tokenizer/config).

**Fix in het harnas:** de download-teller telt nu alleen **echte bestanden**
(unieke basename mét extensie, hoogste `loaded`-waarde) en negeert repo-/aggregaat-
events; het per-bestand-totaal klopt daardoor. Het model laadt ook prima met de
per-module dtype-object-config (nu ingesteld, elke module op `q4f16`); dat is een
expliciete garantie tegen een toekomstige terugval, maar was voor de omvang niet
de oorzaak — de dubbeltelling was dat. De vision/audio-encoders kunnen niet schoon
worden overgeslagen (een ConditionalGeneration-model laadt al zijn sessies), maar
op q4f16 zijn ze klein (~99 + ~171 MB).

### 3. Output-validiteit + decoding (49,5% → doel ~100%)
**Diagnose** (nu in het rapport): elke batch krijgt vlaggen `fence` / `think` /
`afgekapt` / `geborgen` en de ruwe output blijft in `batches[].rawOutput`. Batch 5
(20 tx, reasoning, max_new_tokens 1600) was vrijwel zeker **afkapping**: 20 items ×
reasoning-zin liep over de tokenlimiet. **Gerichte fixes:**
- Auto-`max_new_tokens` per uitvoervariant (voorkomt afkapping);
- Parser strookt nu `<think>…</think>`-preambles én markdown-fences, en **bergt bij
  een afgekapte array de reeds complete objecten** (salvage) i.p.v. de hele batch
  te verwerpen;
- Strakkere JSON-only-instructie als laatste regel van de user-message
  (`Begin je antwoord direct met '[' en eindig met ']'.`);
- Greedy decoding (`do_sample:false`) stond al aan;
- De `kort`-variant verkleint de output en dus de afkapkans verder.

> **Over `enable_thinking:false`:** we geven dit door aan
> `processor.apply_chat_template`, maar of het chat-template het respecteert is
> modelafhankelijk. Daarom detecteert de parser `<think>`-preambles apart (vlag
> `think`); zie je die vlag op de meting, dan lekt thinking ondanks de optie door
> en is dat een aandachtspunt (langere decode + parse-risico).

### 4. Id-echo-mapping (na runs 2/3)
Runs 2/3 gaven 11–25 items terug op 20 inputs; **positionele** mapping verschoof
dan en vervuilde de accuracy. Nu krijgt elke transactie in de user-message een kort
batch-lokaal id (`t1`..`tN` — korte tokens, geen lange hashes) en instrueren we het
model dat id per item terug te geven:

```json
[{"id": "t3", "budget_slug": "…", "confidence": 0.9}]   // + "reasoning" in de reasoning-variant
```

De runner mapt resultaten **op id** i.p.v. positie (net als de cloud-route met
`import_hash`): ontbrekend/onbekend id → die transactie blijft ongedekt (invalid);
**duplicaat-id → eerste telt**. Geldt voor beide uitvoer- én promptvarianten. De
`items x/n`-kolom in de per-batch-tabel toont nu het aantal **gedekte** transacties.

## Dataset

`dataset/dev-set-v1.json` — ±100 synthetische maar realistische NL-banktransacties
met ground-truth leaf-slug uit de standaardboom (`lib/budget-data.ts`). Bewuste
randgevallen zijn gemarkeerd met `edge_case: true` + `edge_note`, o.a.:

- **Picnic/Crisp/Gorillas** → boodschappen (bezorgsupermarkt, **niet** uit-eten);
  **Thuisbezorgd/Uber Eats** → uit-eten.
- **Terminal-prefixes** `CCV*` / `Zettle_*` / `SumUp *` op diverse categorieën.
- **Bedragrichting:** salaris/toeslag/AOW = inkomst; **winkelterugbetaling**
  (positief bedrag) mag **niet** naar een income-budget → `null`.
- Ambigue tegenpartijen (Bol.com, IKEA, Praxis, streaming), zorgpremie vs.
  medische kosten, hypotheektermijn vs. extra aflossing.

> Dit is **dev-set v1** voor harnas-bouw. De echte **gouden set** (150–300
> bevestigde transacties uit de stage-1-residustaart) volgt later en vervangt
> deze voor de go/no-go-beslissing.

### Dataset-bronnen (select "Dataset")

Het harnas kan tegen meerdere bronnen draaien; kies bovenaan sectie 3:

| Bron | Herkomst | Budgetlijst | In repo? |
|------|----------|-------------|----------|
| `dev-set-v1` | synthetisch (~100 tx) | **standaardboom** (afgeleid uit `lib/budget-data.ts`) | ✅ gecommit |
| `goud-set` | echt, ~7 tx (bewust dun) | **`goud-budgets.json`** (echte lijst bron-account) | ⛔ lokaal-only |
| `goud-set-replay` | echt, 150–250 tx | **`goud-budgets.json`** | ⛔ lokaal-only |

**De budgetlijst schakelt mee met de bron.** Bij een goud-set komen de promptlijst
(`buildCategorizeSystemPrompt`-input), de slug-validatie (metriek 9) én de
accuracy-vergelijking allemaal uit `dataset/goud-budgets.json` (30 opties,
`{slug, name, parentName, type, description}[]`) — één actieve bron, overal
consequent. Bij `dev-set-v1` blijft de standaardboom-afleiding gelden.

De goud-bestanden (`goud-set.json`, `goud-set-replay.json`, `goud-budgets.json`)
zijn **gitignored en lokaal-only**; ze worden door een andere agent gegenereerd
(`build:goud`). Ontbreekt een bestand, dan toont het harnas een nette melding
("niet aanwezig; draai eerst build:goud") i.p.v. te crashen. Het actieve
dataset + budgetlijst-label staat in het rapport en in de export-JSON
(`dataset` / `budgetSource`).

Goud-transacties dragen een extra veld **`bron`** (`'manual'` | `'ai'`); het rapport
toont de accuracy **uitgesplitst per bron** (manual = sterkste ground truth). De
randgeval-tegel toont **"n.v.t."** op goud-sets (die hebben geen `edge_case`-markering).

## Go/no-go-tabel (in te vullen per meting)

| Metriek | Drempel (indicatief) | Primair (Gemma 4 E2B) | Oordeel |
|---------|----------------------|-----------------------|---------|
| 1 Accuracy | ≥ server-baseline (streef ~≥85%) | … | ⬜ |
| 3 Kalibratie | hoge-confidence duidelijk correcter dan lage | … | ⬜ |
| 4 Download | acceptabel eenmalig (~3,1 GB) | … | ⬜ |
| 5 Cold / warm load | warm ≪ cold; cold acceptabel | … | ⬜ |
| 6 Doorvoer | batch van 20 binnen redelijke tijd; tok/s bruikbaar | … | ⬜ |
| 7 Stabiliteit | 0 crashes / device-lost over de run | … | ⬜ |
| 8 Capability | PASS op doeltoestellen | … | ⬜ |
| 9 Output-validiteit | ~100% parsebaar + geldige slugs | … | ⬜ |

**Go** = alle metrieken binnen drempel op de doeltoestellen; **no-go** =
structurele mis op 1/3/9 of onacceptabele 4/5/6/7.

## Afwijkingen t.o.v. de modelkaart

De modelkaart van `gemma-4-E2B-it-ONNX` toont een **multimodaal** voorbeeld
(`processor(prompt, image, audio)`) met `AutoProcessor` +
`Gemma4ForConditionalGeneration`, `dtype:"q4f16"`, `device:"webgpu"`,
`processor.apply_chat_template(..., { enable_thinking:false, add_generation_prompt:true })`.
De spike volgt die klasse/opties exact, met twee bewuste, gedocumenteerde keuzes:

1. **Tekst-only pad.** We geven geen beeld/audio mee en tokeniseren via
   `processor.tokenizer(prompt, { add_special_tokens:false })` i.p.v. de
   multimodale `processor(...)`-call. Te verifiëren op de desktop-meting: dat het
   model in dit pad correct tekst-only genereert.
2. **Streamer voor timing.** We gebruiken `TextStreamer` met
   `callback_function`/`token_callback_function` om TTFT en decode-tok/s te meten.

Het **smoke-model** (`gemma-3-1b-it-ONNX`) toont op zijn kaart een
`pipeline("text-generation")`-snippet; wij laden het als
`AutoModelForCausalLM` + `AutoTokenizer` zodat dezelfde streamer-gebaseerde
timing-meting werkt. Dit is puur harnas-verificatie.

`@huggingface/transformers` wordt op `^4.2.0` gepind (nieuwste bij bouw). Als een
class-naam in een latere versie wijzigt, faalt de loader met een duidelijke
melding.
