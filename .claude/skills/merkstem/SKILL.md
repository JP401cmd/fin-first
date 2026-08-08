---
name: merkstem
description: "Gebruik vóór het schrijven of wijzigen van elke tekst die naar buiten gaat of die de app namens ons uitspreekt — landingcopy, /nieuws, de briefing-mail, SEO-pagina's, en elke wijziging aan het prompt-DNA of de on-device prompts. Wijst aan waar de toon en de toegestane claims canoniek staan, welke vier oppervlakken dezelfde stem moeten dragen, in welke volgorde je ze raakt, en hoe je drift tussen die oppervlakken detecteert."
---

# Merkstem — één stem, vier oppervlakken

**Eerste regel — de merkstem heeft één vertrekpunt: _geld is opgeslagen tijd_.** Elke tekst komt daar vandaan, of hij nu door een mens of door het model geschreven is. Vrijheidstijd is de táal van TriFinity, geen optionele opsmuk.

**Tweede harde regel — deze skill is een wegwijzer, geen kopie.** Toon en claims staan al canoniek in de code. Schrijf ze hier nooit over: een tweede exemplaar driftet, en dan heb je precies het probleem dat deze skill moest oplossen.

## Waar de stem canoniek staat

| Wat | Canonieke bron | Nooit |
|---|---|---|
| Toon & framing | `lib/ai/dna/base.ts` — secties `== TOON ==` en `== FRAMING ==` | een eigen toonlijstje elders |
| Toegestane claims | `.claude/skills/compliance-check/SKILL.md` — sectie *De claimlijst* | een tweede claimlijst |
| Rekenregels/getallen | de canonieke engines (CLAUDE.md: *consume, don't recompute*) | zelf een getal noemen |

Kort als geheugensteun — **bij twijfel wint de bron hierboven**: Nederlands, je/jij, empowerend nooit veroordelend, kort en concreet, geen emoji. Bedragen van betekenis ook in vrijheidstijd. "Vrijgekocht", niet "gespaard". Kansen, niet schaarste. Bewuster genieten, niet minder genieten.

## De vier oppervlakken die dezelfde stem dragen

1. **Landingcopy** — `components/landing/**` (hero, secties, FAQ, pricing) en de publieke pagina's daaromheen.
2. **/nieuws en de briefing-mail** — wat de app wekelijks tegen de gebruiker zegt: `app/(app)/nieuws/**` en `lib/briefing/**` (o.a. `email-template.ts`).
3. **Cloud-DNA** — `lib/ai/dna/` (`base.ts` + `kern.ts`/`wil.ts`/`horizon.ts`).
4. **On-device DNA** — de gecondenseerde prompts in `lib/ai/local/` (`LOCAL_CHAT_DNA`, `LOCAL_BRIEFING_DNA`, `LOCAL_NEWS_DNA`, … — het parity-manifest volgt er vandaag tien).

Ze dragen dezelfde filosofie zónder gedeelde bron. Dat loopt onvermijdelijk uit elkaar; deze skill is de plek waar je dat opmerkt.

## Volgorde bij een stemwijziging

1. **Bepaal of het toon of claim is.** Toon → `lib/ai/dna/base.ts`. Claim → eerst `compliance-check` (Wft-grens: inzicht mag, vergunningsplichtig advies niet); een nieuwe claimcategorie gaat nóóit direct de copy in.
2. **Wijzig de canonieke bron eerst**, daarna pas de afgeleide oppervlakken. Andersom bouw je drift in.
3. **Raak je `lib/ai/dna/base.ts` of `wil.ts`?** Dan volgt `lokale-prompt-parity`: `npm run parity:check` valt om zodra de bron-DNA wijzigt zonder dat de on-device varianten mee zijn hercondenseerd.
4. **Raak je publieke tekst?** Dan `compliance-check` vóór publicatie — dat is een poort, geen formaliteit. Voor `/privacy`, `/voorwaarden` en `/wft` is die route verplicht, hoe klein de wijziging ook is.

## Drift detecteren

Het anti-driftmechanisme bestáát al: `lib/ai/local/parity-manifest.json` (per bron een sha256) + `scripts/ai-parity/scan.mjs`, via `npm run parity:scan` (baseline bijwerken) en `npm run parity:check` (rood bij drift).

**Dekking vandaag: alleen `lib/ai/dna/base.ts` en `lib/ai/dna/wil.ts` als bron.** Landingcopy en /nieuws zitten er niet in — drift daar zie je nu alleen met je ogen. Dat uitbreiden is productiewerk (een tweede manifest naar hetzelfde model, zodat landing-drift de lokale-DNA-parity niet vals rood maakt) en staat als aparte kaart. Tot die er is: leg landingcopy-wijzigingen zelf naast `base.ts`.

## Verwijzing

`org_plan/20-skills.md` §merkstem; rollen De Verteller, De Dirigent, De Grenswachter (`org_plan/10-rollen.md`). Verwant: `lokale-prompt-parity`, `compliance-check`, `ai-gedrag`, `frontend-design`.
