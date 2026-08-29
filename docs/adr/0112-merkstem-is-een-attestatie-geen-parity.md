---
id: 0112-merkstem-is-een-attestatie-geen-parity
title: 'Merkstem-drift is een attestatie, geen parity — en de poort is gelaagd'
status: aanvaard
date: 2026-08-28
elements: [m-filo, b-bezoeker, as-nieuws, as-coach]
---

# 0112 — Merkstem-drift is een attestatie, geen parity

## Context

De `merkstem`-skill wijst vier oppervlakken aan die dezelfde stem moeten dragen:
landingcopy, /nieuws + de briefing-mail, de cloud-DNA en de on-device DNA's. Van die
vier was er één bewaakt. `lib/ai/local/parity-manifest.json` + `scripts/ai-parity/scan.mjs`
volgen tien afgeleide artefacten met acht bronbestanden — maar uitsluitend in hun rol
als *cloudbron voor on-device condensatie*. Landingcopy zat er niet in; drift daar merk
je met je ogen.

Bij het uitwerken bleken drie dingen niet te kloppen met de aanname "hetzelfde
mechanisme, tweede manifest".

**Het is een andere driftsoort.** DNA-parity is eenzijdige afleiding: `LOCAL_CHAT_DNA`
*ís* een condensatie van `base.ts`. Bron wijzigt → afgeleide is achterhaald → hercondenseren.
Er bestaat één uitvoerbare herstelactie. Landingcopy is géén afgeleide van `base.ts`; er
valt niets te hercondenseren. Wat je wilt vastleggen is dat *deze copy op datum X naast
deze toon- en claimbron is gelegd en akkoord bevonden*. Drift betekent dan: één van beide
kanten is sindsdien bewogen.

**Hele bestanden hashen werkt niet.** Gemeten op commit `394e656f0` (a11y-ronde,
uitsluitend het teksttoken `--ink-4` → `--ink-meta`, nul woorden gewijzigd): zes
landingbestanden, zes gewijzigde bestandshashes, **6 van 6 vals alarm**. Een gate die
bij elke opmaakwijziging piept, is binnen een maand dode tekst. Genormaliseerde
copy-extractie gaf op diezelfde commit 0 van 6 vals alarm, en sloeg op drie échte
copy-commits (`119e674a1`, `03be09dfa`, `f66d5aa3d`) aan op alle geraakte
landing-/publieke bestanden. Dezelfde redenering geldt aan de bronkant: een wijziging in
`== REKENREGELS & BRONGEGEVENS ==` verandert de merkstem niet en mag de copy niet rood maken.

**Er was geen poort.** `npm run parity:check` hing aan niets — CI draait alleen
`arch:check`, de pre-push-hook draaide `tsc`, `check:client-reads` en de latere gates.
Een tweede manifest zonder poort levert precies de bestaande situatie op, met een
JSON-bestand ernaast.

## Besluit

1. **Een apart, tweede mechanisme** — `scripts/merkstem/scan.mjs` +
   `scripts/merkstem/extract-copy.mjs` + `lib/merkstem/merkstem-manifest.json` →
   `docs/merkstem/merkstem.json`, met `npm run merkstem:scan` / `merkstem:check`.
   `scripts/ai-parity/scan.mjs` wordt **niet** uitgebreid: vrijwel zijn hele datamodel
   (`subBudget`, `estimatedTokens`, `withinBudget`, artefact/constante-paren) is
   DNA-specifiek, en zijn rapport heeft een in-app consument — `/beheer/kennisbank`
   importeert `docs/ai-parity/parity.json` statisch via `selectParityFacts`. Merkstem-rijen
   horen daar niet in. Het *patroon* is hergebruikt (pure scanfuncties → gecommitte JSON →
   `--check` op een signatuur zonder scan-tijd), de code niet.

2. **De vocabulaire is die van attestatie**, niet van parity: `attestedAt`,
   `toneSources[].sha256`, `surfaces[].files[].sha256`, `status: attested | drift |
   nieuw | verdwenen | onvindbaar`. Een woordenschat die iets anders belooft dan het
   mechanisme doet, is precies de stille onjuistheid die deze gate moet bestrijden.

3. **Hashen doen we op betekenis, niet op bytes.** Aan de copykant een genormaliseerde
   extractie (JSX-tekstknopen + proza-achtige literals, met `className`/`cn`/SVG/URL-
   contexten eruit); aan de bronkant alleen de secties `== TOON ==` en `== FRAMING ==`
   uit `lib/ai/dna/base.ts` plus de sectie *De claimlijst* uit
   `.claude/skills/compliance-check/SKILL.md` (read-only gelezen; er wordt nooit in
   `.claude/` geschreven). Volgorde telt bewust mee: copy verplaatsen ís een copywijziging.

4. **De poort is gelaagd** (besluit eigenaar 26-08-2026):
   - **hard** — de toon-/claimbron is gewijzigd zonder herattestatie. Daar zit de
     Wft-relevante schade: de copy doet claims die niemand opnieuw naast de bron heeft gelegd.
   - **waarschuwing** — de copy zelf is bewogen, of een oppervlakbestand is nieuw,
     verdwenen, of levert plotseling nul copyregels op. Zichtbaar, niet blokkerend.
   - **`parity:check` wordt in dezelfde stap alsnog hard** aan de pre-push-hook gehangen.
     Die was ongedekt en heeft wél een uitvoerbare herstelactie.

## Gevolgen

- Elke legitieme copywijziging vraagt `npm run merkstem:scan` + commit. Zelfde kostenmodel
  als `arch:diagram` en `parity:scan`. Dat commando is een **handeling met betekenis** —
  "ik heb de copy naast toon en claimlijst gelegd" — geen formaliteit om een waarschuwing
  weg te krijgen.
- Het manifest bewijst dat iemand hééft gekeken, niet dat de copy goed is. De inhoudelijke
  toets blijft `compliance-check` (Wft-grens + claimlijst) en de `merkstem`-skill.
- **`lib/briefing/directives.ts` is gedeeltelijk gedekt.** Het bestand bevat 85 wekelijkse
  zinnen — de grootste tot nu toe onbewaakte stem in de app — maar alleen als
  startwaarden: de draaiende richtlijnen zijn beheer-overschrijfbaar via
  `app_settings.briefing_directives`. Die beperking staat als `caveat` in het manifest zelf,
  zodat de dekking niet als vollediger wordt gelezen dan ze is.
- De extractie is en blijft een heuristiek. `aria-label`- en `alt`-teksten komen mee
  (terecht — het is tekst die de gebruiker bereikt, maar een a11y-wijziging trekt dan wél
  aan de bel), en copy met `${}`-interpolatie wordt tot een placeholder genormaliseerd.
  Daarom rapporteert de scanner het aantal copyregels per bestand: een plotselinge daling
  is zélf een signaal en wordt apart gemeld.
- `/privacy`, `/voorwaarden` en `/wft` vallen **buiten** dit manifest. Die lopen via een
  strengere, eigen route (`juridische-brief` + `compliance-check`) en horen niet onder een
  waarschuwing te vallen. `app/(app)/nieuws/**` valt er ook buiten: die pagina draagt nul
  copy — de redactionele stem van /nieuws zit in `lib/news-system-prompt.ts`, dat al bron is
  in het DNA-parity-manifest.

## Alternatieven

- **`scan.mjs` uitbreiden met meerdere manifesten.** Afgewezen: zie besluit 1.
- **Gemarkeerde copy-secties (`// copy:start` / `copy:end`).** Afgewezen: de copy zit
  verspreid over ruim vijftien bestanden, verweven met JSX. Markers moeten met de hand
  worden meeverhuisd en zijn stil te vergeten — dezelfde faalmodus als de drift die je
  wilt vangen.
- **Hard rood bij élke drift.** Afgewezen door de eigenaar: dat is wrijving op elke
  tekstwijziging, voor de laag waar de schade cosmetisch is.

## Verwijzing

ADR 0062 (lokale chat-DNA als afgeleid artefact) — het mechanisme waar dit bewust naast
staat. Skills: `merkstem`, `compliance-check`, `lokale-prompt-parity`, `content-creation`.
