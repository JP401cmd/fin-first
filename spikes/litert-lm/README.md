# Spike — Lokale categorisatie via **LiteRT-LM** (fase 0)

Wegwerp-**meetharnas** om te bepalen of we banktransacties lokaal in de browser
kunnen categoriseren met **Gemma 4 E2B-it in het `.litertlm`-formaat via
[LiteRT-LM](https://www.npmjs.com/package/@litert-lm/core) (`@litert-lm/core`) +
WebGPU**, als alternatief voor de server-LLM én voor de Transformers.js-spike
(`spikes/lokale-categorisatie/`). Dit is een **spike**, bewust **los van de
TriFinity-app**: geen productie-AI-route, dus de gebruikelijke
`getModel`/`sanitize`/token-logging-checklist geldt hier niet.

Dit harnas **spiegelt** de fase-0-opzet en **hergebruikt** die zoveel mogelijk, zodat
de meting appels-met-appels is met de Transformers.js-spike. Enige nieuwe code: de
LiteRT-LM-runtime-facade, een aangepaste runner en de UI.

> ⚠️ **De cold run downloadt ~2,01 GB.** Draai de eerste meting op een desktop met
> een goede verbinding. Het harnas cachet het model daarna zelf (Cache Storage), dus
> volgende runs zijn "warm".

## Wat is hergebruikt vs. nieuw

| Bestand | Herkomst | Hoe |
|---------|----------|-----|
| `../lokale-categorisatie/prompt.ts` | fase-0 | **import** — `buildFullSystemPrompt` (volle budgetlijst), `buildUserMessage(batch,'kort')` (idEcho), `batchItemId` |
| `../lokale-categorisatie/parse.ts` | fase-0 | **import** — `parseCategorizations` (fence/think/salvage) |
| `../lokale-categorisatie/metrics.ts` | fase-0 | **import** — `computeMetrics` (accuracy vs. labels) |
| `../lokale-categorisatie/budget-list.ts` | fase-0 | **import** — `buildDefaultBudgetOptions` (standaardboom) |
| `../lokale-categorisatie/types.ts` | fase-0 | **import** — `DevSet`/`DevTransaction`/`TxResult`/`BatchTiming` |
| `../lokale-categorisatie/dataset/dev-set-v1.json` | fase-0 | **import via relatief pad** — 101 synthetische NL-tx |
| `litert-config.ts` | **nieuw** | model-URL, cachenaam, `maxNumTokens`, defaults |
| `litert-engine.ts` | **nieuw** | download + Cache-Storage-caching + `@litert-lm/core`-facade |
| `runner.ts` | **nieuw** | LiteRT-batchrunner (verse conversatie/​batch, streaming, per-batch/​run-metrieken) |
| `metric.ts` | **nieuw** | `[metric] …`-logregels voor Playwright |
| `main.ts` / `index.html` | **nieuw** | UI + auto-modus |

Er is **niets gekopieerd** uit de fase-0-spike: alle herbruikbare modules zijn puur
(geen Transformers.js-afhankelijkheid) en worden cross-spike geïmporteerd. Hun eigen
`../../lib/*`-imports (prompt + budgetlijst als single source of truth) resolven
relatief t.o.v. hún locatie, dus die blijven kloppen.

## Runnen

Vereist een WebGPU-browser (Chrome/Edge met WebGPU aan). **WebGPU vereist een secure
context** — `http://localhost` telt als secure, dus de dev-server werkt out of the box.

```bash
cd spikes/litert-lm
npm install
npm run dev          # opent http://localhost:5183
```

- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` / `npm run preview` — productie-build (optioneel; niet nodig om te meten).

### Handmatig meten (knoppen)

1. **Download / Init** — cold (download ~2 GB + init) of warm (uit cache + init). De
   voortgangsbalk toont de download; de statusregel toont cold/warm + de tijden.
2. **Aantal runs** + **Batchgrootte** instellen (default 1 run, batch 10).
3. **Draai dataset** — per batch verschijnen TTFT en tok/s; de tabel toont per run
   accuracy/validiteit/doorvoer. De volledige meetdata staat in de console.
4. **Cache wissen** — forceert dat de volgende init weer "cold" is.

### Auto-modus (Playwright)

Navigeer naar één URL; het harnas doet init + N runs zelf en logt alles naar de console:

```
http://localhost:5183/?autorun=1&runs=1&batch=10
```

- `autorun=1` — init + runs automatisch (geen kliks nodig).
- `runs=N` — herhaal de volledige run N× **zonder herlaad** (default 1).
- `batch=10` — batchgrootte (default 10).

Playwright kan op afronding wachten via `body[data-state="done"]` (of `"error"`).

## Metingen aflezen (`[metric]`-regels)

Alle meetdata komt als console-regels die beginnen met `[metric] `. Formaat:

```
[metric] <kind> <JSON>
```

waarbij `<JSON>` een **compleet, geldig** JSON-object is dat zélf ook `kind` bevat.
De payload wordt bewust als reeds-ge-stringify'de string gelogd, zodat Playwright's
`msg.text()` de JSON compleet en parsebaar doorgeeft (een los object zou als
afgekapte, niet-JSON preview verschijnen). Robuuste lezer:

```js
page.on('console', (msg) => {
  const t = msg.text()
  if (!t.startsWith('[metric] ')) return
  const data = JSON.parse(t.slice(t.indexOf('{')))   // data.kind = download|init|batch|run|error|capability|done
})
```

| `kind` | Wanneer | Belangrijkste velden |
|--------|---------|----------------------|
| `capability` | bij openen | `webgpu`, `adapter`, `vendor`, `shaderF16` |
| `download` | alleen cold | `loadedBytes`, `totalBytes`, `ms` |
| `init` | cold én warm | `source` (`cold`/`warm`), `downloadMs`, `initMs` |
| `batch` | per batch | `run`, `index`, `ttftMs`, `wallMs`, `perTxMs`, `outputChars`, `estOutputTokens`, `tokPerSec`, `parseOk`, `items`, `validSlugItems`, `nullSlugItems`, `coveredTx`, `expectedTx`, `diagnostics` |
| `run` | per run | `accuracyPct`, `accuracyOnValidPct`, `validityPct`, `edgeCaseAccuracyPct`, `avgTtftMs`, `avgTokPerSec`, `totalWallMs`, `totalEstTokens` |
| `error` | bij een fout | `where`, `message` (init-fouten incl. `stack`) |
| `done` | einde auto/handmatige run-serie | `runs`, `batchSize`, `uncaughtErrors` |

> **Tokens zijn geschat** (`tekens / 4`): de web-runtime geeft geen exacte
> tokentellingen terug. `tokPerSec` en `estOutputTokens` zijn dus indicatief.

## Integratierecept (geverifieerd 19 jul 2026)

- npm: **`@litert-lm/core@0.14.0`** (ESM; dependency `@litertjs/wasm-utils`; WASM zit
  in de package). WebGPU is default (geen backend-config).
- Model: `https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm`
  (~2,01 GB, ongegate, Apache-2.0).
- API zoals gebruikt in `litert-engine.ts`:
  ```js
  const engine = await Engine.create({ model: <Blob>, mainExecutorSettings: { maxNumTokens: 8192 } })
  const conversation = await engine.createConversation({ preface: { messages: [{ role: 'system', content }] } })
  const stream = conversation.sendMessageStreaming(userMessage)   // for await chunk → chunk.content[].type==='text' → .text
  await engine.delete()
  ```
- **Eigen caching** (niet de package): cold-download met `fetch` + `ReadableStream`-
  byteteller → opslaan in Cache Storage (`litert-lm-spike`, key = model-URL) →
  herstart serveert uit cache als Blob → `Engine.create({ model: blob })`.
- **Geen sampling-parameters** op web (default sampling) — bewust, conform het recept.

### Bekend risico (Windows/NVIDIA)

LiteRT-LM issue #2572: de weight-cache kan met "Access is denied" falen op de native
tak. `litert-engine.ts` vangt init-fouten expliciet en logt ze integraal
(`[metric] error` incl. `stack`) voordat het doorgooit.

### Afwijkingen t.o.v. het recept

1. **`@litert-lm/core` als facade-`any`.** Het pakket levert eigen types, maar de
   exacte signaturen kunnen per patch verschuiven; net als de fase-0-Transformers.js-
   facade benaderen we de runtime via een handgeschreven facade en casten aan de
   rand naar `any`. Dynamische import zodat de WASM-bundle pas bij init binnenkomt.
2. **`[metric]`-payload als string** i.p.v. los object (zie "Metingen aflezen") —
   noodzakelijk om via Playwright's `msg.text()` complete, parsebare JSON te krijgen.
3. **Tokentellingen geschat** (`tekens/4`), zie hierboven.
