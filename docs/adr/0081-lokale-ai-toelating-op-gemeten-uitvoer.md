---
id: 0081-lokale-ai-toelating-op-gemeten-uitvoer
title: Een toestel wordt tot lokale AI toegelaten op gemeten uitvoer, niet op capaciteit
status: aanvaard
date: 2026-08-04
elements: [t-lokale-ai, as-import, as-coach, as-nieuws]
---

Of een apparaat lokale AI mag draaien, wordt niet meer bepaald door wat het
apparaat *is* (telefoon of desktop) en ook niet door wat de GPU *belooft*
(WebGPU, shader-f16, buffergrootte), maar door wat er daadwerkelijk uit het
model komt: drie korte proefgeneraties ná de download, vóór de privé-modus
aangaat. De lat van die proef is beheer-instelbaar.

## Context

ADR 0043 legde een **desktop-only capability-gate** vast: `navigator.gpu` +
adapter-probe + geheugeninschatting, met de motivering dat mobiel — verwacht de
iOS-bufferlimiet, verwacht een te trage mid-range Android — er eerlijk buiten
zou vallen. Die verwachting is inmiddels op twee manieren onjuist gebleken.

**Eén: de gok als poort sloot geschikte machines buiten.** Het privacy-scherm
leidde uit `(pointer: coarse)` af of dit een telefoon was en gebruikte dat als
harde poort. Een laptop met touchscreen rapporteert zijn primaire aanwijzer
regelmatig als grof; op precies zo'n machine wérkte `/mijn/lokale-chat` (die het
aan de GPU vraagt) terwijl dit scherm "alleen op desktop" toonde. Die poort is
op 3 aug 2026 adviserend gemaakt.

**Twee: de capability-check bewijst het verkeerde.** De L1.5-meting van 19 juli
(`spikes/litert-lm/meetrapport-v1.md`, Adreno 7xx / Android Chrome) liet zien dat
zo'n toestel de hele lat mét gemak haalt — WebGPU ✓, shader-f16 ✓, warm laden in
7,5 s, 8,7–15,8 tok/s, 2,6 s per transactie, sneller dan menige laptop — en
tóch **0% bruikbare uitvoer** levert: meertalige token-soep, herhaallussen, geen
JSON. De oorzaak zit onder de WebGPU-API (Dawn/driver): gewichten raken corrupt
zodra ze één keer door een compute-pass zijn gelezen. Upstream is dat bekend en
open — [LiteRT #8065](https://github.com/google-ai-edge/LiteRT/issues/8065)
(Adreno 830: eerste inferentie klopt, alles daarna stilletjes rommel) en
[LiteRT-LM #3012](https://github.com/google-ai-edge/LiteRT-LM/issues/3012)
(Adreno 750, CPU-backend schoon) — en niet app-side te repareren.

Dat is geen capaciteitsprobleem maar een **correctheidsprobleem**, en dus
onzichtbaar voor élke vorm van capability-check. Met de gok gedegradeerd tot
hint was er daarmee niets meer dat zo'n toestel tegenhield: hint wegklikken →
check haalt het → ~2 GB downloaden → privé-modus aan → onzin.

## Besluit

1. **De uitvoer-toets is de toelatingspoort.** Na de download (en bij aanzetten
   met een al aanwezige bundel) beantwoordt het model drie proefvragen:
   één woord, een vaste JSON-vorm, een korte opsomming. Naast de taak-toets
   gelden twee corruptie-toetsen die exact de gemeten faalvorm vangen —
   niet-Latijns schrift en herhaallussen — plus een harde wachttijdgrens, want
   de meting zag naast corrupte uitvoer ook echte hangs.
2. **Meerdere generaties, geen enkele.** De upstream-bug is nadrukkelijk "de
   eerste inferentie klopt, daarna niet meer". Eén proefgeneratie zou 'm
   structureel missen.
3. **Toestelklasse is nergens meer een poort.** Ook de downloadknop, de
   opnieuw-downloadknop en de ingang naar de lokale chat gaan niet meer op de
   aanwijzer-gok. Een telefoon die de proef haalt, mág lokaal draaien.
4. **Fail-closed blijft.** Zakt de proef, dan gaat `privacy_mode` niet aan en
   volgt er géén cloud-uitwijk — dat blijft een expliciete keuze van de
   gebruiker (eigenaarsbesluit 19 jul, ADR 0043). Het model blijft staan en is
   met één knop op te ruimen.
5. **Het oordeel is een per-apparaat-feit** (localStorage), gekoppeld aan het
   model-URL en een toetsversie: een ander model of een strengere toets maakt
   een oud oordeel vanzelf ongeldig. Een *ontbrekend* oordeel blokkeert bewust
   niet — de poort staat op `/mijn/privacy`, `useExecutionMode` is het vangnet,
   en afwezig-als-blokkade zou elk toestel stilzetten dat het model al had staan
   voordat deze toets bestond.
6. **De lat is beheer-instelbaar** (`app_settings.local_ai_gate`, blok op
   `/beheer/kennisbank`): welk model wordt aangeboden, of de gebruiker zelf mag
   kiezen, hoeveel proefvragen minimaal goed moeten zijn, en de wachttijd per
   antwoord. Reden: de runtime is Early Preview en beweegt, dus de juiste lat kan
   morgen een andere zijn dan vandaag. De poort zélf is niet uit te zetten —
   `minPassed` kent een ondergrens van 1, afgedwongen door zowel het zod-schema
   als de terugvallezing, en een kapotte instelling valt terug op de
   *strengste* stand.
7. **Twee modellen in de catalogus:** Gemma 4 E2B (2,01 GB, de standaard en de
   basis van al onze metingen) en Gemma 4 E4B (2,97 GB). Beide omvangen zijn
   gemeten, niet geschat. Het contextvenster blijft voor allebei 8.192 tokens:
   dat is de maat waarop de gecondenseerde lokale DNA en het parity-manifest
   geschreven zijn, en die mag niet stil met een modelkeuze meebewegen.

## Gevolgen

- ADR 0043's "desktop-only capability-gate" is hiermee **vervangen**. De
  capability-check blijft bestaan en blijft vóóraan staan — hij kost niets en
  voorkomt een kansloze download — maar hij is niet langer het laatste woord.
- Fase L3 uit `docs/plan-lokale-ai-fase2-litert-mobiel-chat-kennis.md` (mobiel,
  geparkeerd op de Adreno-uitslag) heeft hiermee stap 1 gebouwd: de gate is van
  toestelklasse naar gemeten geschiktheid. Wat er nog niet is: de mobiele
  download-UX (wifi-vereiste, opslagcheck vooraf).
- De verwachting blijft **nee** voor de huidige generatie Adreno-telefoons —
  daar is de proef juist voor. Wat verandert, is dat "nee" nu een gemeten
  uitspraak is over dít toestel in plaats van een aanname over een toestelklasse,
  en dat een telefoon die het wél kan er niet langer buiten staat.
- Hermeting blijft goedkoop: het spike-harnas (`spikes/litert-lm/`) draait de
  Android-matrix in ~30 minuten. `@litert-lm/core` 0.15.0 (31 jul) is nog niet
  beproefd; wij pinnen 0.14.0.
