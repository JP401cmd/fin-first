# Meetrapport v1 — LiteRT-LM JS · Gemma 4 E2B (fase L1)

> Status: CONCEPT — desktop-metingen; Android-matrix (L1.5) volgt met eigenaars-toestel.
> Peildatum: 19 juli 2026 · Harnas: `spikes/litert-lm/` · Runtime: `@litert-lm/core` v0.14.0 (Early Preview) · Bundel: `gemma-4-E2B-it-web.litertlm` (2,01 GB, HF litert-community, Apache-2.0, ongegate).

## Testomgeving

| Onderdeel | Waarde |
|---|---|
| Machine | Zelfde werkstation als fase 0 (RTX PRO 4500 aanwezig) |
| **WebGPU-adapter** | **intel · xe-lpg (iGPU!)** — zie sleutelvondst hieronder |
| Browser | Microsoft Edge (playwright-cli, headed, persistent profiel) |
| Dataset | dev-set-v1 (101 synthetisch, 30% randgevallen) + gouden tijdreis-replay-set (250 échte residu-tx, geregenereerd 19 jul) |

## 🔑 Sleutelvondst — adapter-selectie op Windows-multi-GPU

Chromium's WebGPU kiest op Windows de **default-adapter (iGPU)** en negeert `powerPreference` (crbug 369219127). Geverifieerd niet ombuigbaar via: registry `GpuPreference=2` per exe, noch `--force-high-performance-gpu` (vlag aantoonbaar op het proces). Consequenties:
1. Alle in-browser lokale AI draait op dit werkstation (en vergelijkbare multi-GPU-machines) feitelijk op de **Intel iGPU** — ook het huidige productiepad (verklaart de trage productie-runs van 19 jul: ~18 s/tx via Transformers.js).
2. De iGPU-cijfers hieronder zijn dus het **realistische productie-scenario**; de RTX is best-case en vergt een Windows-instellingen-actie van de gebruiker (Beeldscherm → Graphics → msedge/chrome → Hoge prestaties) — TODO als aparte hermeting.

## Metingen (allemaal op de Intel iGPU — realistisch scenario)

### Laden (metrieken 4-5)
| Meting | LiteRT-LM | Transformers.js (fase 0, RTX) |
|---|---|---|
| Download | **2,01 GB in 35 s** | 3,17 GB |
| Cold init (na download) | **3,3 s** | (in cold load ~55 s totaal) |
| Warm init (uit Cache Storage) | **4,0 s** | **46,5 s** |
| Eigen caching | Cache Storage, put geslaagd (persistent profiel; quota-fout in tijdelijk profiel = harnas-les) | idem CS |

### Dev-set (101 tx, batch 10, 2 runs)
| Metriek | LiteRT (iGPU) run 1 | run 2 (warm) | Transformers.js beste (RTX, run 2) |
|---|---|---|---|
| Accuracy totaal | **79,2%** | 79,2% (identiek!) | 41,6% |
| Accuracy op geldige output | **89,9%** | 89,9% | 80,8% |
| Output-validiteit | **88,1%** | 88,1% | 51,5% |
| Wandklok totaal | 225 s | 249 s | 353 s |
| Per transactie | **2,2-2,5 s** | | ~3,5 s |
| Decode (geschat, chars/4) | ~9-10 tok/s | | 6,7 tok/s (echt) |
| TTFT gem. | ~5 s | | ~3,9 s |
| Fouten/crashes | **0** | 0 | parse-issues; unaligned-crash bekend |

Reproduceerbaarheid: run 1 en 2 accuracy-identiek → default-sampling gedraagt zich effectief deterministisch op deze taak.

### Gouden set (250 échte residu-tx, HERGENEREERD 19 jul — ⚠ andere set dan fase-0!)
De set is opnieuw getrokken uit de actuele accountdata (8.297 tx, incl. recente verbouwperiode: `onderhoud-huis-tuin` nu dominant met 52 labels). Fase-0-cijfers zijn dus een indicatieve, geen exacte vergelijking; de Tfjs-CONTROLE-RUN op dezelfde nieuwe set loopt (zie onder).

**⛔ Controle-run Tfjs op dezelfde set/iGPU: DRIE POGINGEN, DRIE CRASHES.** `OrtRun → '/lm_head/softcap/Div' → "Failed to create a WebGPU compute pipeline: A valid external Instance reference no longer exists"` — device-/instance-loss onder geheugendruk (3,17 GB gewichten op gedeeld iGPU-geheugen), zowel direct na load als mid-run, mét exclusieve GPU. Het huidige productie-pad kan de gouden set op de realistische adapter dus **niet voltooien**; kwaliteits-parity op dezelfde set is daarmee onmeetbaar én irrelevant. Dit crashprofiel matcht bovendien de productie-fout van de eigenaar op 19 jul ("Lokale categorisatie is niet gelukt" na 2× vangnet-poging) — de fragiliteit is geen theoretisch risico maar het live-gedrag. (Tfjs warm-load op de iGPU: 164 s.)

| Metriek | LiteRT (iGPU, nieuwe set) | Tfjs G2 (RTX, oude set) | Tfjs controle (iGPU, nieuwe set) |
|---|---|---|---|
| Accuracy totaal (nulls tellen mee) | 9,2% | 20,4% | ⛔ crasht (3×) |
| Null-antwoorden ("weet ik niet") | **70%** (175/250) — sterke null-discipline | 48% | |
| Dekking (voorstellen) | 30% | 52% | |
| Precisie op voorstellen | 30,7% | 39,2% (@0,5) | |
| **@0,8-drempel (productie-instelling)** | **22% dekking · 31,5% precisie** | 28% · 39,1% | |
| @0,9 | 12% · 23,3% | 12% · 56,7% | |
| vs. menselijke labels (manual) | 11,1% (n=45) | 21,2% (n=33) | |
| Wandklok | **8,2 min (iGPU!)** | 18,1 min (RTX) | |
| Fouten/crashes | **0** | 0 (na batch-10-workaround) | |

Confidence-verdeling LiteRT: 138× <0,5 · 45× 0,5-0,7 · 36× 0,7-0,9 · 31× ≥0,9 — curve is vlak (precisie stijgt niet met confidence): **confidence-signaal zwak informatief, net als bij Tfjs**.

### Stabiliteit (metriek 7) — 5 runs achtereen, schone browser
| Run | Accuracy | Validiteit | Wandklok | tok/s |
|---|---|---|---|---|
| 1 | 79,2% | 88,1% | 188 s | 12,0 |
| 2-5 | **79,2% (identiek)** | 88,1% | 232-235 s | 9,4-9,5 |

**0 errors · 0 uncaught · ~25 min aaneengesloten GPU-last.** Volledig deterministische uitvoer over 5 runs (505 transacties). Warm init deze sessie: 4,7 s.

⚠ Neven-bevinding stabiliteit: na de drie ONNX-crashes van de controle-run was het GPU-proces van de héle browser vergiftigd ("No GPU adapter found" — ook voor LiteRT) tot een browser-herstart. De fragiliteit van het oude pad raakt dus de hele omgeving, niet alleen de eigen sessie.

## Go/no-go-analyse (desktop, fase L1)

Tegen de uitkomstladder (requirements §2.3) en de fase-2-plan-criteria:

**Wat LiteRT wint (alles gemeten, iGPU = realistisch scenario):**
1. **Betrouwbaarheid — de beslissende as.** Het huidige pad kan op deze adapter de gouden set niet eens voltooien (3× device-loss, matcht de productie-fout van 19 jul); LiteRT draaide 7 volledige runs (2× goud, 5× dev) zonder één fout.
2. **Frictie**: sessiestart 3-5 s vs 46-164 s; download 2,0 vs 3,2 GB.
3. **Snelheid**: 2,0-2,5 s/tx vs ~3,5 s/tx (Tfjs op de snellere RTX!) — op de iGPU haalt Tfjs het einde niet eens.
4. **Kwaliteit op brede input** (dev-set): 79/90/88 vs 42/81/52 — zelfde model, officiële bundel.
5. **Determinisme**: identieke uitvoer over 5 runs.

**Wat (nog) niet beter is:**
- Gouden-staart @0,8: 22% dekking · 31,5% precisie (Tfjs-oude-set-RTX: 28% · 39%) — vergelijking is indicatief (andere set) en de staart blijft voor élk klein model bruto moeilijk. Null-discipline is wel sterker (70% eerlijke "weet ik niet").
- Confidence-signaal blijft zwak informatief (vlakke curve) — net als bij Tfjs; drempel-tuning heeft bij deze bundel weinig effect.
- Geen sampling-controle op de web-SDK (Early Preview) — gedraagt zich de facto deterministisch, maar is niet instelbaar.

**Advies: GO voor fase L2 (runtime-swap), desktop-scope** — primair op betrouwbaarheid + frictie + brede kwaliteit; de assistieve belofte (review-UI-only, ADR 0043) blijft ongewijzigd van kracht en dekt de staart-precisie af. Openstaand: L1.5 Android-meting (eigenaars-toestel + latentie-drempel), RTX-best-case (Windows-instellingen, optioneel), Early-Preview-API-risico (versie-pinnen in L2).

## L1.5 — Android-meting (19 juli 2026, eigenaars-toestel)

Toestel: Qualcomm Adreno 7xx (Snapdragon-klasse), Android Chrome, zelfde wifi; secure-context via chrome://flags-workaround (HTTP-LAN-origin — productie draait HTTPS, dus niet-representatief obstakel).

| Metriek | Uitslag |
|---|---|
| Capability-check | ✅ PASS — WebGPU + shader-f16 (tegen fase-0-verwachting in) |
| Model warm-init | 7,5 s (2,01 GB uit Cache Storage) |
| Doorvoer | 8,7-15,8 tok/s · TTFT 4,5-4,8 s · **2,6 s/tx** (tx=30-run, 76,6 s) |
| Lange runs (101 tx) | hang na batch 4 (~3 min GPU-last — thermiek/tab-throttling); korte runs (tx=30) voltooien probleemloos |
| **Output-kwaliteit** | ❌ **0% accuracy / 0% validiteit** — ruwe uitvoer is meertalige token-soep (Engels/Japans/Cyrillisch, herhaallussen, geen JSON) |

**Diagnose:** GPU-rekenfout op het Adreno-WebGPU-pad (f16-precisie/kernel-klasse) — het model genereert snel maar corrupt. Zelfde bundel/prompt haalt op de desktop-iGPU 88% validiteit. Niet app-side fixbaar.

**Verdict L1.5: mobiel-lokaal NO-GO** zolang de LiteRT-LM-web-runtime op Adreno niet rijpt (Early-Preview-concern bevestigd; hermeting ~30 min met dit harnas bij elke runtime-release). Gevolg voor L3: geparkeerd; de mobiele strategie loopt via de import-wizard (#881) met cloud-batches op mobiel (privacy-modus aan ⇒ mobiel eerlijk "niet beschikbaar", eigenaarsbesluit 19 jul). Positief neven-inzicht: snelheid en capability zijn op moderne telefoons ruimschoots voldoende — zodra de kwaliteitsbug upstream gefixt is, ligt mobiel-lokaal open.
