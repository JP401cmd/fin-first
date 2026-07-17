# Meetrapport v1 — Lokale categorisatie · Gemma 4 E2B in-browser (fase 0)

> **Status: tussenrapport — desktop-metingen.** Gouden set (stage-1-residu) en mobiele matrix volgen; go/no-go wordt pas ná die stappen uitgesproken.
> Peildatum: 16 juli 2026 · Harnas: `spikes/lokale-categorisatie/` · Dataset: `dev-set-v1.json` (101 synthetische NL-transacties, 30 bewuste randgevallen — **zwaarder dan de echte verdeling**).

## Testomgeving (desktop-referentie)

| Onderdeel | Waarde |
|---|---|
| GPU | NVIDIA RTX PRO 4500 (Blackwell) — WebGPU-adapter `nvidia · blackwell` |
| RAM | 64 GB · deviceMemory-schatting browser: ~32 GB |
| Browser | Microsoft Edge (Chromium), headed, via playwright-cli |
| Verbinding | ~100 MB/s (1,44 GB smoke-model in 15,0 s) |
| Runtime | Transformers.js (`@huggingface/transformers` ^4.2.0), WebGPU, dtype q4f16 per module |
| Model | `onnx-community/gemma-4-E2B-it-ONNX`, tekst-only gebruikt (`AutoProcessor` + `Gemma4ForConditionalGeneration`, `enable_thinking:false`) |

## Capability-check (metriek 8) — PASS op alle punten

`navigator.gpu` ✓ · shader-f16 ✓ · maxStorageBufferBindingSize **2,00 GB** (nodig ~1 GB) ✓ · maxBufferSize 2,00 GB ✓. NB: op iOS Safari ligt deze limiet op ~128 MB–1 GB — dit blijft het verwachte mobiele breekpunt (meting volgt in de mobiele matrix).

## Download & laden (metrieken 4 · 5)

| Meting | Waarde | Opmerking |
|---|---|---|
| Werkelijke download | **~3,17 GB** | embed_tokens q4f16 1,48 GB + decoder q4f16 1,42 GB + audio-enc 163 MB + vision-enc 95 MB + tokenizer 19 MB |
| Eerder gerapporteerde 6,32 GB | **meetfout harnas** | dubbeltelling: per-bestand-events + aggregaat-event beide gesomd (6,32 = exact 2 × 3,16). Tellerfix staat uit. |
| Cold load (download + init) | 57,2 s / 54,6 s (2 runs) | bij deze bandbreedte domineert GPU-init/dequant, niet netwerk |
| Warm load (uit Cache Storage) | **46,5 s** | elke sessiestart kost ±45–60 s vóór eerste categorisatie — UX-gegeven voor fase 2/3 |
| Vision/audio-encoders overslaan | niet mogelijk | ConditionalGeneration laadt alle sessies; op q4f16 samen slechts ~0,26 GB |

**Consent-getal voor fase 2: ~3,2 GB.**

## Kwaliteit & doorvoer (metrieken 1 · 3 · 6 · 7 · 9)

Alle runs: 101 transacties, batch 20, greedy decoding, volledige budgetlijst (30 leaf-slugs) in de systeemprompt.

| | Run 1: reasoning + full | Run 2: **kort** + full | Run 3: kort + compact |
|---|---|---|---|
| Accuracy totaal | 27,7% (28/101) | **41,6%** (42/101) | 34,7% (35/101)¹ |
| **Accuracy op geldige output** | 56,0% | **80,8%** | 38,5% |
| Output-validiteit (dekking) | 49,5% | 51,5% | 90,1% |
| Accuracy randgevallen | 33,3% | 50,0% | 30,0% |
| Kalibratie conf ≥ 0,5 | 32,9% correct (n=73) | 42,4% (n=99) | 38,5% (n=92) |
| Parse-fouten | 1/6 batches (20 tx verloren) | **0/6** (salvage-parser) | 0/6 |
| Item-count-mismatches | n.g. | 3/6 licht (19–22/20) | 3/6 zwaar (11–25/20)¹ |
| TTFT per batch | ~3,9 s | ~3,9 s | ~2,0 s |
| Decode | 6,6 tok/s | 6,7 tok/s | 7,6 tok/s |
| Totale wandkloktijd | 600 s | **353 s** | 265 s |
| Stabiliteit | 0 device-lost · 0 crashes | 0 · 0 | 0 · 0 |

¹ Run-3-accuracy is deels onbetrouwbaar door zware item-count-mismatches (positionele mapping verschuift); id-echo-fix nodig voor zuivere hermeting.

**Conclusie promptmatrix: volle systeemprompt + korte uitvoer wint.** De compacte prompt jaagt de dekking omhoog (90%) maar sloopt de precisie (38,5%): zonder de volledige REGELS ("liever null dan een gok", exact N items, hiërarchie-semantiek) gaat het model gokken. De volle prompt is dragend voor de 80,8%-precisie; de snelheidswinst van compact (−25% wandklok, vooral prefill) weegt daar niet tegenop.

### Run 4 (kort + full + id-echo) — tweemaal onderbroken, mapping wél bewezen

Run 4 is tweemaal afgebroken door een paginaherlaad buiten het harnas om (1× vite-dev-serverval, 1× vite-herstart door parallelle bestandsmutaties in de spike-map — les: geen metingen tegelijk met agent-schrijfwerk in de map). Vóór de tweede afbraak stond de dekking op **100/101 na 5 batches** (run 2: drie batches met 19–22/20-mismatches) — de id-echo-mapping werkt. Kwaliteits-hermeting is bewust verplaatst naar de gouden-set-run (het echte go/no-go-instrument); een derde dev-set-run voegt geen beslisinformatie toe. Doorloopsnelheid run 4 was consistent met run 2 (TTFT ~4,0 s · 6,4 tok/s · id-echo kost ~6 extra uitvoer-tokens per item).

### Duiding

1. **Precisie vs. dekking.** In productietermen: een geldige slug klopt in ~4 van de 5 gevallen (80,8%); ~de helft van de items geeft `null`/ongeldig terug en blijft dan gewoon ongecategoriseerd — het veilige app-gedrag ("liever null dan een gok"). De synthetische set is bewust zwaar (30% randgevallen); de echte lat is de gouden set uit de stage-1-residustaart.
2. **Prefill is géén probleem op desktop** (~900 tok/s; TTFT 3,9 s op ~3,4k input-tokens). De vooraf gevreesde prefill-bottleneck (benchmarkclaim ~65 tok/s) blijkt op deze hardware niet te bestaan.
3. **Decode ≈ 6,6 tok/s is het harde plafond van Transformers.js voor dit model** — onafhankelijk van dtype-pinning en uitvoerlengte (PLE-architectuurpenalty). Gevolg: ~3 s per transactie op een top-GPU, decode-bound. Extrapolatie naar mid-range mobiel (5–20× trager) maakt import-batches op mobiel via dít runtime-pad onwerkbaar.
4. **Batch-groottemismatch gesignaleerd**: één batch retourneerde 22 items op 20 inputs → positionele mapping verschuift. Fix: id-echo per item (zoals de cloud-route met `import_hash` doet) — staat uit als harnas-verbetering.
5. **Stabiliteit uitstekend**: ~20 min aaneengesloten GPU-last zonder device-lost of crash; het Windows-subgroup-corruptierisico uit de review is hier niet opgetreden.

## Gouden-set-meting (echte data — tijdreis-replay, 250 tx)

**Set:** 250 échte transacties van het bron-account die op het moment van binnenkomst NIET door stage 1 oplosbaar waren (as-of-context-replay) en later een bevestigd label kregen. Bron-mix: 33 manual (menselijke waarheid) + 217 ai (≈ agreement met het Claude-cloudpad). Labelruimte: de echte budgetlijst van het account (30 opties). Bijvangst-inzicht: het residu concentreert zich op de **recency-frontier** (nieuwste maanden, nieuw-geziene tegenpartijen), niet bij de accountstart.

### Run G1 — kort + full, batch 10 (na crash-diagnose)

| Metriek | Uitslag |
|---|---|
| Accuracy totaal | **30,0%** (75/250) |
| Accuracy op geldige output | **31,6%** |
| — vs. menselijke labels (manual, n=33) | **21,2%** |
| — vs. Claude-labels (ai, n=217) | 31,3% agreement |
| Output-validiteit (dekking) | 94,8% — null-discipline weggevallen |
| Kalibratie | kapot: 99,6% van de items claimt conf ≥ 0,5 (30,1% daarvan correct) |
| Doorvoer | 6,7 tok/s · TTFT ~3,5 s · **18,9 min voor 250 tx** |
| Parse/mapping | 25/25 batches ok, 10/10 items overal (id-echo vlekkeloos) |
| Stabiliteit run G1 | 0 crashes, 0 device-lost |

### Stabiliteitsincident vóór run G1 (metriek 7)

De eerste gouden-set-poging (batch 20) crashte na ~7 min met `RuntimeError: operation does not support unaligned accesses` in de model-executie (inputs inclusief `per_layer_inputs` — het Gemma-4-specifieke PLE-pad). Daarna was de sessie **vergiftigd**: elke volgende generate faalde direct; alleen een paginaherlaad + modelherlaad herstelde het. Met batch 10 en een verse sessie liep exact dezelfde data probleemloos door — trigger is vorm/toestand-gebonden, niet één specifieke transactie. Productie-implicatie: het lokale pad heeft een per-batch-vangnet + automatisch sessieherstel nodig.

### Duiding gouden set

De kwaliteit valt op de echte residu-staart terug van 80,8% (synthetisch) naar **31,6%** precisie — en tegen menselijke labels zelfs 21,2%. Drie oorzaken tegelijk: (1) dit is per constructie de moeilijkste populatie (obscure tegenpartijen, eenmalige betalingen — precies wat regels niet vangen); (2) de null-discipline viel weg in de kort-uitvoer (94,8% antwoordt, bijna altijd met hoge confidence) — run G2 test een aangescherpte null-instructie; (3) op 217/250 items is de "waarheid" het onweersproken Claude-label — de lage agreement (31%) toont dat de modellen op de moeilijke staart sterk uiteenlopen. Tegen de uitkomstladder (GO ≥ ~85% · NO-GO < 70%) ligt dit diep in NO-GO-gebied voor batch-vervanging van het cloudpad; run G2 (null-discipline) is de laatste kwaliteitshefboom vóór het oordeel.

### Run G2 — kort + full + expliciete null-discipline, batch 10

| Metriek | Run G1 | **Run G2 (null-regel aangescherpt)** |
|---|---|---|
| Accuracy totaal | 30,0% | 20,4% (51/250) |
| Accuracy op geldige output | 31,6% | 21,5% |
| — vs. menselijke labels (manual, n=33) | 21,2% | **21,2%** (identiek) |
| — vs. Claude-labels (ai, n=217) | 31,3% | 20,3% |
| Claims conf ≥ 0,5 | 249/250 | **130/250** (instructie werkte op confidence) |
| Precisie binnen conf ≥ 0,5 | 30,1% | **39,2%** (álle 51 correcte zitten hier) |
| Productie-effectief (alleen ≥ 0,5 telt) | dekking 99% · precisie 30% | **dekking 52% · precisie 39%** |
| Doorvoer | 18,9 min / 250 tx | 18,1 min / 250 tx |
| Stabiliteit | 0 · 0 | 0 · 0 |

**Correctie na drempel-analyse:** de null-regel werkte wél op null-gebruik — G2 gaf 119× `null` (G1: ~1×); de validiteitsmetriek (94,8%) telt nulls als geldig formaat en maskeerde dat. G2 is productie-effectief dus de betere run: 131 voorstellen waarvan 51 correct (39%) i.p.v. 249 waarvan 75 (30%). De confidence-drempelcurve (uit de per-tx-uitkomsten): ≥0,5 → 39,2% precisie (130 voorstellen) · ≥0,6 → 37,1% (116) · ≥0,7 → 38,0% (92) · ≥0,8 → 39,1% (69) · ≥0,9 → **56,7%** (30). Zelfs de strengste drempel blijft onder de 70%-lat bij 12% dekking — het confidence-signaal is zwak informatief. Beste productie-realistische stand op de echte residu-staart: **~39% precisie bij ~52% dekking** (of 57% bij 12%); tegen menselijke waarheid ~21%.

## Go/no-go-oordeel fase 0 (desktop)

Tegen de uitkomstladder uit `docs/requirements-lokale-categorisatie.md` (GO ≥ ~85% · voorwaardelijk 70–85% · NO-GO < 70%):

**NO-GO voor het vervangen van de cloud-resolver door in-browser Gemma 4 E2B (Transformers.js/WebGPU) voor de residu-staart.** Onderbouwing:

1. **Kwaliteit**: beste productie-realistische configuratie haalt ~39% precisie bij 52% dekking op de populatie waarvoor het pad bestaat (stage-1-residu); tegen menselijke labels 21%. De afstand tot de 70%-grens is geen tuning-gat maar een capaciteitsgat van het model op deze taak.
2. **Snelheid**: ~18–19 min per 250 tx op een RTX PRO 4500 (decode-bound op 6,5–6,7 tok/s, PLE-plafond van de runtime); mid-range mobiel wordt een veelvoud — onbruikbaar in de import-flow.
3. **Stabiliteit**: reproduceerbare `unaligned accesses`-crash op echte data (batch 20) met sessievergiftiging tot herlaad; batch 10 omzeilt hem, maar het productie-pad zou vangnet + automatisch sessieherstel vereisen bovenop een verder fragiele runtime.
4. **Frictie**: ~3,2 GB download + 45–60 s sessiestart per gebruik.

**Wat dit oordeel NIET zegt:** (a) niets over Gemma 4 E2B voor conversationele taken (chat/briefing — fase 5-ambitie; niet getest); (b) niets definitiefs over toekomstige modellen/runtimes — het harnas + de gouden-set-methodiek (tijdreis-replay) zijn herbruikbaar en een hermeting van een nieuwe kandidaat kost ~30 min; (c) de fase 1-architectuur (privacy_mode-gate, scope A) blijft geldig ontwerp voor wanneer een lokaal pad wél de lat haalt.

Conform het plan (§6): *"Een no-go is een goedkope, waardevolle uitkomst: bekend vóór er productiecode is."*

## Eigenaarsbesluit (16 juli 2026)

De eigenaar heeft, kennisnemend van bovenstaand meetbeeld, besloten **door te bouwen als desktop-only assistieve functie** (fases 1–3, scope A) — met de POC-lessen als harde bouwvoorwaarden: alle voorstellen via de bestaande review-UI (niets automatisch), confidence-drempel als instelbare precisie-knop, batch 10, per-batch-vangnet + automatisch sessieherstel (unaligned-accesses-les), desktop-only capability-gate, "experimenteel"-labeling en eerlijke toggle-copy. Vastgelegd in de bijbehorende ADR.

## Openstaande fase-0-stappen

1. **Run 3** (kort + compact) — completeert desktop-matrix. _(loopt)_
2. **Id-echo-mapping** in het harnas (+ tellerfix download-aggregatie).
3. **LiteRT-LM-vergelijking** — Google's actuele runtime voor Gemma 4 (native PLE/KV-sharing). Beslissend voor het mobiele pad: is 6,6 tok/s een runtime-artefact of een modelplafond?
4. **Gouden set** — 150–300 bevestigde transacties uit de stage-1-residustaart, geanonimiseerd.
5. **Mobiele matrix** — mid-range Android (Chrome) + iPhone (Safari/iOS 26); verwachting iPhone: bufferlimiet-blokkade.
6. Go/no-go tegen de uitkomstladder in `docs/requirements-lokale-categorisatie.md`.

## Voorlopig beeld (geen besluit)

- **Desktop**: technisch haalbaar en stabiel; kwaliteit veelbelovend op precisie, dekking en snelheid nog onder de lat; grootste kwaliteitshefbomen (id-echo, gouden set i.p.v. zware synthetische set) nog niet verzilverd.
- **Mobiel**: op Transformers.js vrijwel zeker onhaalbaar voor batch-import; LiteRT-LM-meting bepaalt of het mobiele verhaal leeft of dat v1 desktop-only wordt (trede 2 van de uitkomstladder).
- **Download/opslag**: ~3,2 GB en ~45–60 s sessiestart zijn reëel maar communiceerbaar binnen de opt-in-consent-flow van fase 2.
