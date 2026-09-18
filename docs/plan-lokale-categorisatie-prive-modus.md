# Implementatieplan — Lokale categorisatie in privé-modus (Gemma 4 E2B, WebGPU)

> Status: **plan / brainstorm-output — nog niets gebouwd.**
> Doel: transactie-categorisatie optioneel volledig **op het toestel** (in-browser,
> WebGPU) draaien als "privé-modus", zodat transactiedata het apparaat nooit verlaat —
> als bewijs voor het soevereiniteitsverhaal (ADR 0001).

## 0. Kern in één alinea

De pure orkestrator `runCombinedCategorization` (`lib/auto-categorize.ts:424`) krijgt een
**geïnjecteerde `aiResolver`-functie** met een vast contract
(`CombinedAiBatchItem[] → CombinedAiResult[]`, `lib/auto-categorize.ts:357/368`). De
cloud-variant leeft volledig in de client (`components/app/ai-categorize-sheet.tsx:379`,
een `fetch` naar `/api/ai/categorize`). Een lokaal WebGPU/Gemma-pad is dus **een
alternatieve `aiResolver` met dezelfde signatuur** — zonder de server-route, sanitisatie,
credit/tier-gates of token-logging aan te raken. Dat houdt de wijziging klein en additief.

---

## 1. Het model — Gemma 4 E2B

Gemma 4 is uitgebracht op **2 april 2026**. E2B = 2,3 miljard "effectieve" parameters,
tekst + beeld + audio, werkt offline. Beschikbaar op Hugging Face, Kaggle en Ollama.

**Vastgelegde kandidaat-stack (primair):**

| Onderdeel | Keuze |
|---|---|
| Model | `onnx-community/gemma-4-E2B-it-ONNX` |
| Runtime | Transformers.js + WebGPU (`dtype: "q4f16"`, `device: "webgpu"`) |
| Modaliteit | **tekst-only** — beeld/audio-encoders weglaten (categorisatie is tekst) |
| Download | volledig ≈ 3,2 GB **mét** encoders → **tekst-only fors kleiner** (exact meten in fase 0) |

**Alternatief (secundair):** MediaPipe LLM Inference + `google/gemma-4-E2B-it-qat-q4_0-gguf`,
of `onnx-community/gemma-4-E2B-it-qat-mobile-ONNX`.

**Bekende risico's (fase 0 moet ze afvangen):**
- Nieuwe Gemma 4-architectuur (PLE / KV-cache-sharing) nog niet overal volledig ondersteund
  (onnxruntime-genai #2062).
- Bekend q4f16-overflowpatroon op WebGPU bij Gemma-modellen dat foute output kan geven
  (onnxruntime #26732).

Referentie-implementaties: `sacredvoid/onyx` en `kessler/gemma-gem` (Gemma 4 volledig in de
browser via WebGPU).

---

## 2. De harde garantie: privé-modus = lokaal-only, nóóit de API

De client is niet te vertrouwen als _bewijs_. De garantie ligt daarom op **drie lagen** —
laag 3 is beslissend.

| Laag | Mechanisme | Wat het garandeert |
|---|---|---|
| 1. UX-keuze | De categorisatie-flow kiest de resolver op basis van `privacy_mode`. Aan → **alleen** `localAiResolver`; de cloud-resolver wordt niet eens geconstrueerd. | Normale werking stuurt nooit naar de API |
| 2. Geen-fallback-regel | Kan het lokale pad niet draaien (geen WebGPU / model niet gedownload / inferentie faalt) → **blokkeer** de categorisatie met een duidelijke melding. Géén `catch → cloud`. | Een storing lekt niet naar de cloud |
| 3. **Server-side weigering (beslissend)** | `/api/ai/categorize` (`app/api/ai/categorize/route.ts:35`) leest zélf `privacy_mode` van het profiel (RLS, eigen rij) en geeft **403** als die aan staat — vóór er iets naar de provider gaat. | Zelfs bij een client-bug of handmatige request is het **onmogelijk** dat transactiedata de API bereikt |

**Eerlijk onderscheid:**
- **Model-download** = wél netwerk, maar alleen generieke modelgewichten — géén gebruikersdata.
- **Inferentie** = volledig lokaal, geen netwerk, geen transactie verlaat het toestel.

De model-host wordt expliciet toegevoegd aan `connect-src` in de CSP (`next.config.ts:31`) —
één toegevoegde, controleerbare host.

---

## 3. Wanneer wordt de download aangeboden?

**Niet** bij het "installeren" van de webapp. TriFinity is al een PWA (`public/manifest.json`,
Serwist-SW `app/sw.ts` → `public/sw.js`, Android via TWA / ADR 0005), maar de precache is
bewust minimaal (`serwist.config.mjs:28-34`) en er is geen eigen install-prompt. 1–3 GB
opdringen aan iedereen is verkeerd.

**Wél op het moment dat de gebruiker privé-modus expliciet aanzet:**

1. Gebruiker zet de toggle op `/mijn/privacy` aan.
2. **Capability-check** (`navigator.gpu` + adapter-probe + geheugeninschatting). Geen WebGPU /
   te weinig geheugen → toggle wordt niet actief, eerlijke melding, geen cloud-fallback.
3. Wél mogelijk → **download-stap met expliciete consent**: "~X GB, wifi aanbevolen, daarna
   offline, data verlaat je toestel nooit" + voortgangsbalk.
4. Tot de download klaar is: privé-modus "in afwachting" — AI-categorisatie geblokkeerd
   (niet cloud).

**Caching:** gewichten in **Cache Storage / OPFS** (Transformers.js/MediaPipe doen dit
standaard) + `navigator.storage.persist()` tegen evictie. Bewust **buiten** de
Serwist-precache. In `/mijn/privacy` een "model verwijderen / opnieuw downloaden"-knop.

---

## 4. Datamodel & toggle

**Migratie** (additief, patroon `supabase/migrations/20260622120000_add_profiles_display_mode.sql`):

```sql
alter table public.profiles
  add column if not exists privacy_mode boolean not null default false;
```

Valt automatisch onder de bestaande eigen-rij RLS-UPDATE-policy (geen nieuwe policy).

**Verhouding tot bestaande AI-toggle** (`profiles.ai_enabled`,
`components/mijn/ai-privacy-settings.tsx`):

| `ai_enabled` | `privacy_mode` | Gedrag |
|---|---|---|
| `false` | — | Geen AI (bestaand) |
| `true` | `false` | Cloud-AI via Claude (bestaand, ongewijzigd) |
| `true` | `true` | **Lokaal-only AI** (nieuw) |

**Toggle-API:** nieuwe route naar model van `app/api/display-mode/route.ts` (own-row
read-modify-write, anon-client, geen service-role) — of uitbreiden van de bestaande
privacy-route (te bepalen in fase 2).

---

## 5. Fasering & te raken bestanden

**Fase 0 — Modelkeuze-spike** _(los, geen productiecode — zie §6)_
Kies runtime + build op een echte mid-range telefoon; meet download, load, snelheid,
accuracy. **Go/no-go op kwaliteit vóórdat er productiecode komt.**

**Fase 1 — Server-side garantie (laag 3) eerst**
- Migratie `profiles.privacy_mode`.
- `app/api/ai/categorize/route.ts`: lees `privacy_mode`; aan → 403 met duidelijke error-code.
- Test: request met `privacy_mode=true` → 403, transactiedata bereikt de provider niet.

**Fase 2 — Toggle + download-flow**
- Toggle-component naast `components/mijn/ai-privacy-settings.tsx` op `/mijn/privacy`.
- Toggle-API-route (patroon display-mode).
- Capability-check-util (`lib/ai/local/webgpu-capability.ts`).
- Download-/consent-UI met voortgang + `storage.persist()` + "model verwijderen".
- CSP: model-host aan `connect-src` (`next.config.ts`).

**Fase 3 — Lokale resolver**
- `lib/ai/local/local-categorize-resolver.ts` — implementeert het `aiResolver`-contract,
  hergebruikt `buildCategorizeSystemPrompt(budgets)` en de slug-validatie; **geen**
  `sanitizeForAI`.
- `components/app/ai-categorize-sheet.tsx:379`: kies resolver op `privacy_mode`; aan → alleen
  lokaal, geen cloud-fallback, blokkeer met melding als lokaal niet kan.

**Fase 4 — Meten & valideren**
- Intern vergelijkscherm: dezelfde set door beide paden, agreement-% en verschillen.

**Raakt NIET:** de canonieke engines (`lib/horizon-kernel/**`, constants), De Wil-coaching,
extractie/what-if, en de bestaande cloud-categorisatie (default-modus). Alles additief.

---

## 6. Fase 0 — Modelkeuze-spike (volledig uitgewerkt)

**Karakter:** geïsoleerde spike, los van de codebase. Eén losse HTML/Node-map. **Geen**
wijziging aan `app/`, `lib/` of migraties. Wegwerpcode; output = meetrapport + go/no-go.

### Beslisvraag
> Levert Gemma 4 E2B, lokaal in de browser via WebGPU, **goed genoeg** categorisatie op — met
> **acceptabele download + snelheid** op een **relevant deel van (mobiele) toestellen** — om
> fasen 1–4 te rechtvaardigen?

Deelvragen in volgorde van risico: **kwaliteit → bereik → UX/snelheid**.

### Gouden test-set (ground truth)
- 150–300 échte, geanonimiseerde NL-transacties met een **door de gebruiker bevestigd**
  budget (leaf-slug uit `BUDGET_SLUGS`, `lib/budget-data.ts:48`) als correct label.
- Spreiding over rubrieken (boodschappen, horeca, vaste lasten, inkomen, sparen,
  overboekingen) + bewust randgevallen (ambigue tegenpartijen, Picnic/Crisp-verwarring,
  zakelijk vs. privé).
- Anonimiseren via de bestaande `sanitizeForAI` (`lib/ai/sanitize.ts:85`) — dit is een
  wegwerp-testbestand op een dev-machine. (In productie doet het lokale pad dit juist níét.)

### Wat we meten

| # | Metriek | Hoe | Waarom |
|---|---|---|---|
| 1 | Accuracy vs. ground truth | % correcte leaf-slug op de gouden set | Kernvraag kwaliteit |
| 2 | Agreement met Claude | zelfde set door het cloud-pad; overlap-% | Relatieve maat + waar het afwijkt |
| 3 | Confidence-kalibratie | correct% bij confidence ≥0,5 vs. <0,5 (`categorize-system-prompt.ts:59`) | Betrouwbaar `null` teruggeven? |
| 4 | Download-omvang | bytes tekst-only build (vs. 3,2 GB volledig) | UX-drempel mobiel |
| 5 | Cold load | tijd 0 → model klaar (uit cache) | First-use-ervaring |
| 6 | Doorvoer | tokens/s + latency per batch van 20 tx (`auto-categorize.ts:444`) | Bruikbaarheid bij import |
| 7 | RAM/stabiliteit | piekgeheugen, crashes/OOM per toestel | Haalbaarheid mid-range |
| 8 | Bereik | slaagt capability-check + draait zonder crash, per toestel | % gebruikers dat dit haalt |
| 9 | Output-validiteit | geldige slugs of onzin/overflow? | Vangt het #26732-risico |

### Toestel-matrix

| Toestel | Doel |
|---|---|
| Desktop Chrome (referentie) | Baseline + kwaliteit meten |
| Mid-range Android (Chrome) | De échte mobiele lat — RAM/thermal/snelheid |
| iPhone (Safari, recente iOS) | Grootste onzekerheid WebGPU-support |
| Optioneel: ouder Android | Ondergrens van "bereik" |

Kwaliteit (1–3, 9) op desktop; bereik/UX (4–8) op mobiel.

### Prompt in de spike
Hergebruik de structuur van `buildCategorizeSystemPrompt` (`categorize-system-prompt.ts:94`).
Test **twee varianten** — volledige prompt en ingekorte — want een 2B-model kan bij een lange
budgetlijst degraderen. Uitkomst: weten we of we voor kleine modellen moeten
batchen/inkorten (input voor fase 3).

### Go / no-go-drempels (indicatief)

| Uitkomst | Betekenis |
|---|---|
| Accuracy ≥ ~85% leaf-slug **én** iOS+Android stabiel **én** download acceptabel | **GO** — bouw fase 1–4 |
| Accuracy 70–85% óf alleen desktop stabiel | **Voorwaardelijk** — desktop-only PoC, E4B testen, of confidence-drempel op |
| Accuracy < 70% óf structurele overflow/instabiliteit | **NO-GO** — vastleggen waarom, parkeren |

Een no-go is een goedkope, waardevolle uitkomst: bekend vóór er productiecode is.

### Deliverable
Eén kort meetrapport (metingen per toestel, gekozen build, prompt-bevinding, expliciete
go/no-go met onderbouwing). Meer niet.

### Werkdagen — dag-voor-dag

| Dag | Werk |
|---|---|
| **Dag 1** | Spike-map opzetten; Transformers.js + `gemma-4-E2B-it-ONNX` (tekst-only, q4f16, WebGPU) op desktop; download-omvang (4) + cold-load (5) vastleggen. |
| **Dag 2** | Gouden test-set bouwen (150–300 tx uit bevestigde budgetten, geanonimiseerd); harnas dat de set door het lokale model draait en labels vergelijkt. |
| **Dag 3** | Kwaliteit op desktop: accuracy (1), agreement (2), confidence-kalibratie (3), output-validiteit (9); beide prompt-varianten. |
| **Dag 4** | Mobiele matrix: mid-range Android + iPhone Safari — bereik (8), doorvoer (6), RAM/stabiliteit (7); zo nodig secundaire stack (MediaPipe/GGUF). |
| **Dag 5** | Meetrapport, go/no-go, build-keuze, fase 1-scope aanscherpen (batchen/inkorten ja/nee). |

**Raming:** ~5 werkdagen, comprimeerbaar naar ~3 als iOS wegvalt of één stack meteen goed werkt.

---

## 7. Risico's (samengevat)

- **iOS Safari WebGPU wisselvallig** → capability-check blokkeert eerlijk; nooit stille
  cloud-fallback.
- **Model-kwaliteit 2B < Claude** → fase 0 is de go/no-go; blokkeert productiecode bij te lage
  accuracy.
- **Grote download op mobiel** → expliciete consent + wifi-advies + opt-in only.
- **Storage-evictie** → `storage.persist()` + "opnieuw downloaden"-knop.
- **Nieuwe Gemma 4-architectuur nog rijpend in runtimes** → fase 0 verifieert output-validiteit
  expliciet (metriek 9).
