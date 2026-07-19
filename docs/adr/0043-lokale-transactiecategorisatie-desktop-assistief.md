---
id: 0043-lokale-transactiecategorisatie
title: 'Lokale transactiecategorisatie (Gemma 4 E2B / WebGPU) — desktop-only assistief, ondanks NO-GO op de eigen ladder'
status: aanvaard
date: 2026-07-16
elements: [t-aigateway, as-import, do-meta, t-lokale-ai]
---

Fase 0 (POC, `spikes/lokale-categorisatie/meetrapport-v1.md`) meet in-browser Gemma 4 E2B (Transformers.js/WebGPU) op de échte stage-1-residustaart uit op **~39% precisie bij ~52% dekking** (57% bij drempel ≥0,9, dan 12% dekking), 21% tegen menselijke labels, ~6,5 tok/s decode, ~3,2 GB download en één reproduceerbare `unaligned accesses`-crash met sessievergiftiging — formeel **NO-GO** tegen de uitkomstladder (GO ≥85% · NO-GO <70%) voor het vervángen van het cloud-categorisatiepad. De eigenaar besluit tóch te bouwen, maar **niet als cloud-vervanger**: uitsluitend als **desktop-only, assistieve** functie (scope A — toggle "Lokale transactiecategorisatie") waarbij elk modelvoorstel via de bestaande review-UI loopt en niets automatisch wordt toegepast. Dit is een bewuste afwijking van de eigen ladder, gerechtvaardigd door twee dingen die de ladder niet meet: de privacy-garantie (transactiedata verlaat het toestel niet — hard bewijs van het soevereiniteitsverhaal, ADR 0001/0035) en de infrastructuurwaarde voor de fase-5-ambitie (meer lokale AI-functies). Het meetharnas + de tijdreis-replay-gouden-set zijn herbruikbaar en vormen de expliciete heroverwegings-trigger voor toekomstige modellen/runtimes.

## Context

De fase-0-POC was geen productiecode (geïsoleerde spike, wegwerpcode) maar een formele beslispoort met een keiharde go/no-go tegen de uitkomstladder uit `docs/requirements-lokale-categorisatie.md` §2.3. Het meetbeeld op de echte residu-staart (250 bevestigde transacties die stage 1 van `runCombinedCategorization` niet oploste — precies de populatie waarvoor een AI-pad bestaat):

- **Kwaliteit**: beste productie-realistische stand ~39% precisie bij ~52% dekking (run G2, null-discipline aangescherpt); tegen menselijke labels 21%; ≥0,9-confidence haalt 56,7% maar bij slechts 12% dekking. De afstand tot de 70%-grens is een capaciteitsgat van een 2B-model op deze taak, geen tuning-gat. Het confidence-signaal is zwak informatief.
- **Snelheid**: ~18–19 min per 250 transacties op een RTX PRO 4500 (decode-bound op ~6,5 tok/s, PLE-plafond van Transformers.js). Mid-range mobiel wordt een veelvoud — onbruikbaar in de import-flow.
- **Stabiliteit**: reproduceerbare `RuntimeError: operation does not support unaligned accesses` op echte data bij batch 20, in het Gemma-4-PLE-pad; daarna is de sessie vergiftigd tot een paginaherlaad. Batch 10 met een verse sessie omzeilt de crash volledig.
- **Frictie**: ~3,2 GB download + 45–60 s sessiestart per gebruik.

Formele uitkomst fase 0: **NO-GO** voor het vervangen van de cloud-resolver door dit pad. Dat oordeel zegt bewust niets over (a) Gemma 4 voor conversationele taken (fase-5-ambitie, niet getest), (b) toekomstige modellen/runtimes, en (c) de fase-1-architectuur (privacy-gate, scope A), die geldig ontwerp blijft.

Scope-beslispoort A vs. B (requirements §3) is beslecht op **A**: een smalle, 100% waar te maken belofte in plaats van een brede "privé-modus"-paraplu die een centrale guard over ~21 groeiende AI-routes (incl. server-geïnitieerde briefing-cron) zou vergen vóór er één regel lokale code staat. B blijft de sterkere lange-termijnvisie voor fase 5, maar sluipt niet stilzwijgend in fase 1.

## Besluit

**1. NO-GO als cloud-vervanger, bevestigd.** Het lokale pad vervangt het cloud-categorisatiepad niet en wordt geen automatische resolver. `privacy_mode=false` (default) laat het cloud-gedrag exact ongewijzigd.

**2. Tóch bouwen als desktop-only assistieve functie (eigenaarsbesluit 16 jul 2026) — afwijking expliciet benoemd.** De eigenaar bouwt fase 1–3 (scope A). Dit wijkt bewust af van de eigen uitkomstladder, die bij <70% "niet bouwen" voorschrijft. De afwijking is gerechtvaardigd omdat de ladder twee dingen niet weegt die hier de waarde dragen:
- **Privacy-garantie**: bij `privacy_mode=true` bereikt transactiedata voor die gebruiker nooit een externe AI-provider — een concreet, verifieerbaar bewijs van het soevereiniteitsverhaal (ADR 0001) en van de "jij bent eigenaar van je data"-belofte. Dit is precies wat de sanitize-in/mask-out-maatregelen van ADR 0035 met minimalisatie benaderen; lokale inferentie máákt het absoluut.
- **Infrastructuurwaarde**: het lokale-inferentiepad (capability-check, opt-in download-consent, WebGPU-runtime, resolver-injectie) is de fundering voor de fase-5-ambitie van meer lokale AI-functies. De categorisatie is de eerste, best-afgebakende testcase.

De functie is geen cloud-vervanger maar een **opt-in privacy-keuze met assistieve kwaliteit** — geframed als "experimenteel", met eerlijke copy dat andere AI-functies cloud blijven gebruiken.

**3. Harde bouwvoorwaarden / mitigaties (volgen rechtstreeks uit de POC-lessen).**
- **Review-UI-only**: elk voorstel loopt via de bestaande categorisatie-review-UI; niets wordt automatisch toegepast. Bij ~39% precisie is de mens de beslissende laag, niet het model.
- **Hoge confidence-drempel als single-source constante**: lokaal geldt een strengere afkap dan de cloud-conventie van 0,5 (`categorize-system-prompt.ts:59`). Startwaarde **0,9**, vastgelegd als één single-source constante (voorstel: `lib/constants.ts`, bij voorkeur benoemd als AI-/categorisatie-constante), geïmporteerd door zowel de resolver als de UI — geen los magisch getal. Onder de drempel → geen voorstel ("onbekend"), niet een gok.
- **Batch 10 + per-batch-vangnet + automatisch sessieherstel**: batch 10 omzeilt de `unaligned accesses`-crash; het productiepad moet elke batch omhullen met een vangnet dat bij een device-loss/poisoned-session automatisch model + sessie herlaadt en de batch veilig faalt.
- **Desktop-only capability-gate**: `navigator.gpu` + adapter-probe + geheugeninschatting vóór download; mobiel (verwacht: iOS-bufferlimiet, mid-range Android te traag) valt eerlijk buiten v1. Geen cloud-fallback binnen de toggle-flow.
- **"Experimenteel"-labeling** op de toggle en in de consent-flow.
- **Geen-cloud-fallback (privacy-garantie is fail-closed)**: faalt lokale inferentie (model niet geladen, device-loss, timeout), dan blokkeert de batch met een eerlijke melding — nooit een stille `catch → /api/ai/categorize`. Deze fail-closed-regel is architectonisch dragend: één stille fallback breekt de hele belofte.

**4. Scope A, drie garantielagen.** De toggle "Lokale transactiecategorisatie" (`profiles.privacy_mode`) beïnvloedt uitsluitend (laag 1) de resolver-keuze in `runCombinedCategorization` — bij `privacy_mode=true` wordt uitsluitend de lokale resolver geconstrueerd, de cloud-`aiResolver` niet — en (laag 3, beslissend) een server-side 403 op **alleen** `/api/ai/categorize` vóór `getModel()` of enige transactiedata de promptopbouw bereikt. Overige AI-functies blijven cloud.

**5. Meetharnas als expliciete heroverwegings-trigger.** Het spike-harnas + de tijdreis-replay-gouden-set (as-of-context-selectie op de stage-1-residustaart) zijn de canonieke, herbruikbare meetmethode. Een nieuwe modelkandidaat of runtime (bv. LiteRT-LM met native PLE/KV-sharing) wordt hertoetst tegen dezelfde ladder (~30 min hermeting). Haalt een kandidaat wél ≥85% en stabiel/snel op minstens één mobiele klasse, dan heropent dit besluit: het assistieve, review-UI-only model mag dan opschuiven richting hogere autonomie, en scope B (brede privé-modus) komt in beeld. Tot die tijd blijft categorisatie assistief.

## Gevolgen

- **Geen nieuwe rekenmotor, geen nieuwe module.** Categorisatie is classificatie, geen afgeleid kerngetal — de Berekeningen-view blijft ongewijzigd (n.v.t.). Er komt geen nieuwe `MODULE_CATALOG`-entry; dit is een verfijning binnen bestaande categorisatie, geen activeerbare module.
- **Eén manier om te categoriseren blijft geborgd.** De lokale resolver implementeert exact het bestaande `aiResolver`-contract (`(batch) => Promise<CombinedAiResult[]>`) en hergebruikt `buildCategorizeSystemPrompt` + de `resolveSlug`-slugvalidatie — geen tweede promptvariant, geen parallelle validatie. `runCombinedCategorization` blijft de enige motor; additieve scheduling-hooks (`groupOrder`/`onBeforeRound`) zijn toegestaan mits het gedrag voor bestaande callers ongewijzigd blijft (zie ADR 0051). De resolver blijft het enige cloud/lokaal-omschakelpunt.
- **Bewuste uitzondering op de ADR 0035-sanitize-regel.** Het lokale pad roept `sanitizeForAI` NIET aan en mág `counterparty_iban` in de prompt zetten — er is geen egress om tegen te beschermen. Dit is een gemotiveerde afwijking van "sanitize op elke callsite"; de nieuwe generatie-callsite hoort met reden op de allowlist van `lib/ai/ai-callsite-scan.ts`, zodat de uitzondering gedocumenteerd en toekomstbestendig is.
- **Eerste server-side per-gebruiker AI-gate.** `ai_enabled` wordt vandaag nergens server-side afgedwongen; de privacy-gate is de eerste. Hij spiegelt `checkTierGate` in vorm (drop-in naast de tier-check) en wordt gedekt door een dynamische regressietest over alle `getModel`-consumenten (scope A: aanwezig op `/api/ai/categorize`).
- **Datamodel**: `profiles.privacy_mode boolean not null default false`, additief naar het `display_mode`-patroon; own-row read-modify-write via de anon-client, nooit service-role (contrast met ADR 0006, dat over cross-user beheer-inzage gaat). De bestaande eigen-rij RLS-policy op `profiles` dekt de kolom — geen nieuwe policy.
- **Architectuurplaat beweegt gefaseerd mee** (mechanische sync door `architecture-docs-keeper`, per fase):
  - *ArchiMate (Plaat)* — bij fase 3: een **nieuw technologie-element** `t-lokale-ai` ("Lokale AI-runtime — in-browser, WebGPU"): Transformers.js + Gemma 4 E2B, on-device. Signatuur van de privacy-garantie: het element bedient `app-comp` maar heeft **géén externe-partij-relatie** (in tegenstelling tot `ext-claude → t-aigateway`). Plus een `ENRICH`-relatie `t-lokale-ai → app-comp` (payload: lokale categorisatie-voorstellen die het toestel niet verlaten; mechanism compute; on-demand), en lead-tekst-tweaks op `t-aigateway`/`as-import` die het optionele lokale pad benoemen. Deze ADR wordt dan aan `t-lokale-ai` gehangen (frontmatter-`elements` uitbreiden).
  - *Database (ERD)* — `profiles.privacy_mode` verschijnt automatisch uit de fase-1-migratie na `npm run arch:diagram`; geen curatie.
  - *Praatplaat (HLD)* — bij fase 2 (toggle live): een nieuwe capability-item in de Kern-groep "grip", eerlijk gelabeld als experimenteel/desktop, met de Wil-dimensie (vertrouwen, controle: "je transactiedata verlaat je toestel niet"). Niet eerder dan wanneer de gebruiker het echt kan aanzetten.
- **Nieuw aandachtspunt (bij fase 3, samen met `t-lokale-ai`)**: een concern "Fragiele WebGPU-runtime in het lokale AI-pad" zolang de crash-workaround leeft — te verwijderen zodra de runtime gehard/vervangen is (bv. LiteRT-LM-migratie of upstream-fix). Zie de structuurbevindingen bij deze ADR.
- **Wft/AVG**: categorisatie is geen advies (ongewijzigd); lokale inferentie is strikt AVG-gunstiger (geen provider-egress), de modeldownload bevat geen gebruikersdata.
- **Tier-gate beslecht (eigenaarsbesluit 17 juli 2026)**: de open tier-vraag uit requirements §5 is beslecht op **optie 2** — de toggle vereist het 'ai'-abonnement, consistent met de rest van de AI-functies. AANzetten wordt server-side afgedwongen met `checkTierGate(supabase, userId, 'ai')` in `POST /api/privacy-mode`, uitsluitend bij `enabled === true`; UITzetten blijft altijd vrij, zodat een verlopen abonnement niemand in privé-modus opsluit. De toggle-UI op `/mijn/privacy` spiegelt de gate (upsell-blok, uitgegrijsde schakelaar) maar de route is de autoritatieve laag.

## Aanvulling — 19 juli 2026: heroverwegings-trigger geactiveerd, runtime-swap naar LiteRT-LM (GO-L2)

De heroverwegings-trigger uit §Besluit-5 ("een nieuwe modelkandidaat of runtime wordt hertoetst tegen dezelfde ladder") is op 19 juli 2026 geactiveerd voor **LiteRT-LM** (`@litert-lm/core`), gemeten in `spikes/litert-lm/meetrapport-v1.md` (fase L1, desktop).

**Kerncijfers (L1, allemaal op de Intel iGPU — het realistische productiescenario op Windows-multi-GPU, zie sleutelvondst hieronder):**
- **Sessiestart**: cold init 3-5 s vs 46-164 s (Transformers.js/ONNX) — orde van grootte sneller.
- **Kwaliteit dev-set** (101 tx): accuracy totaal 79,2% vs 42% · accuracy op geldige output 89,9% vs 81% · output-validiteit 88,1% vs 52% — zelfde model (Gemma 4 E2B), officiële web-bundel.
- **Betrouwbaarheid — de beslissende as**: LiteRT-LM draaide 7 volledige runs (2× gouden set, 5× dev-set) zonder één fout/crash. Het oude Transformers.js/ONNX-pad crashte op dezelfde adapter **3× op 3 pogingen** op de gouden set (`OrtRun → device-/instance-loss onder geheugendruk`) — matcht de live productiefout van de eigenaar op 19 jul ("Lokale categorisatie is niet gelukt"). Na de crashes was het GPU-proces van de héle browser vergiftigd tot een herstart, óók voor LiteRT — de fragiliteit van het oude pad raakte de hele omgeving.
- **Gouden-staart @0,8-drempel (productie-instelling, indicatief — hergegenereerde set t.o.v. fase-0-referentie)**: 22% dekking · 31,5% precisie (Tfjs-oude-set-referentie: 28% · 39,1%) — nog niet beter; de staart blijft voor élk klein model bruto moeilijk. Null-discipline is wél sterker (70% eerlijke "weet ik niet" tegen 48%).
- **Sleutelvondst**: Chromium's WebGPU kiest op Windows-multi-GPU-machines de default-adapter (iGPU) en negeert `powerPreference` (crbug 369219127, niet ombuigbaar via registry of vlag) — dit geldt voor élke in-browser runtime op dit type werkstation, niet alleen LiteRT-LM.

**Eigenaarsbesluit: GO voor fase L2 (runtime-swap), desktop-scope.** Gemotiveerd primair door betrouwbaarheid + frictie + brede kwaliteit — niet door de gouden-staart-precisie, die onveranderd zwak blijft. De runtime is **`@litert-lm/core` 0.14.0 (Early Preview), exact gepind** (geen versie-range, i.v.m. het API-breukrisico van een Early-Preview-SDK), met web-bundel `gemma-4-E2B-it-web.litertlm` (2,01 GB, HF litert-community, Apache-2.0, ongegate) — dezelfde Gemma 4 E2B als voorheen, andere runtime.

**Wat ONVERANDERD blijft (expliciet, om scope-kruip te voorkomen):**
- Het assistieve model: **review-UI-only**, niets wordt automatisch toegepast. De runtime-swap verandert de kwaliteit van het voorstel, niet de garantie dat een mens beslist.
- **Fail-closed**: geen cloud-fallback bij lokale falen — batch blokkeert eerlijk.
- Desktop-only capability-gate, "experimenteel"-labeling, de hoge confidence-drempel-constante, en alle overige bouwvoorwaarden uit §Besluit-3.
- **Autonomie-verruiming is expliciet NIET besloten.** §Besluit-5 stelt die pas in het vooruitzicht bij ≥85% én stabiel/snel op minstens één mobiele klasse — de staart-precisie (22-31,5% @0,8) zit daar nog ver onder. Scope B (brede privé-modus) blijft dus ook buiten beeld.

**Openstaand na deze aanvulling**: L1.5 Android-meting (eigenaars-toestel, latentie-drempel voor mobiel), optionele RTX-best-case-hermeting (Windows-instellingen), en het Early-Preview-API-risico blijft een actief aandachtspunt zolang `@litert-lm/core` niet stabiel is (zie het herschreven concern bij `t-lokale-ai`).

### Strategische motivatie (eigenaar, 19 juli 2026)

Lokale modellen en lokale compute worden de komende jaren aantoonbaar betrouwbaarder en krachtiger — de L1-meting (zelfde model, betere runtime → 40× snellere start en fors hogere kwaliteit) is daar zelf het bewijs van. TriFinity bouwt de lokale-AI-infrastructuur (runtime-seam, capability-gates, download/cache-beheer, kennisbank, meetharnas) daarom nú, zodat elke volgende generatie modellen direct inplugbaar is. Voor nu geldt: **privacy — AI-functionaliteit gebruiken zonder dat financiële data het toestel verlaat — is een grote meerwaarde voor een financiële app en voor het vertrouwen van de gebruiker.** Dit verankert de fase-5-ambitie uit het oorspronkelijke besluit als expliciete eigenaarskoers: lokaal-eerst waar het kan, eerlijk over de grenzen waar het (nog) niet kan.

Tevens besloten (C1a-kwaliteitspoort doorstaan, 19 jul): **GO voor C1b (lokale Will-chat, POC)** onder drie voorwaarden — (1) de kennisbank (K1) wordt daadwerkelijk in gebruik genomen als uitlegbron, met per-vraag-selectie zodat de injectie het model voorspoedigt en niet belast; (2) nadrukkelijke "experimenteel — lokaal"-labeling; (3) streaming-UX. De C1a-meting toonde: Wft-compliance 3/3 valstrikken doorstaan en sterke filosofie-trouw, maar feitelijke NL-begrippenkennis (Box 3) onvoldoende zonder kennisbank — precies de rol van K1.
