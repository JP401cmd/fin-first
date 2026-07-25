---
name: lokale-prompt-parity
effort: high
description: "Gereedschap om de gecondenseerde lokale Fin-DNA (LOCAL_CHAT_DNA) in sync te houden met de cloud-bron-DNA — drift detecteren via het gecommitte parity-manifest, opnieuw condenseren binnen het sub-budget met behoud van de harde invarianten, en pas na eigenaar-review shippen."
---

# Lokale-prompt-parity

De lokale, on-device Fin-chat draait op een gecondenseerde DNA (`LOCAL_CHAT_DNA` in `lib/ai/local/local-chat-prompt.ts`, ~500 tokens) die is afgeleid van de volledige cloud-DNA (`lib/ai/dna/base.ts` + `lib/ai/dna/wil.ts`). Die twee lopen uit elkaar zodra de cloud-DNA verandert en de lokale niet meebeweegt — **prompt-drift**. Deze skill is het gereedschap om die drift te detecteren en gecontroleerd te dichten: de bron-DNA diffen tegen het gecommitte `parity-manifest.json`, opnieuw condenseren binnen het sub-budget mét behoud van de harde invarianten (vrijheidstijd-framing, geen verzonnen cijfers, Wft-compliance, toon), en het resultaat pas shippen na een verplichte eigenaar-review.

Deze skill wijzigt AI-copy en is daarom eigendom van de prompt-DNA-specialist; de plumbing eromheen (manifest-vorm, runtime-budget) is van de AI-generalist. De skill **shipt nooit automatisch** — er zit een harde eigenaar-gate op.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

## Proces

### 1. Bron diffen tegen de baseline — `ai-specialist-prompt-dna`
Vergelijk de huidige bron-DNA (`lib/ai/dna/base.ts` + `lib/ai/dna/wil.ts`) met de opgeslagen baseline in `lib/ai/local/parity-manifest.json`: bereken de sha256 (raw utf8, `node:crypto` `createHash('sha256')` — **niet** de git-blob-hash) van elk bronbestand en zet die af tegen `sources[].sha256`. Draai `npm run parity:scan` als sluitstuk: dat script leest hetzelfde gecommitte manifest en meldt of de hashes nog kloppen. Klopt alles → geen drift, klaar. Wijkt een hash af → bepaal wélke regels in de bron-DNA veranderd zijn (filosofie, REGELS/COMPLIANCE, TOON) en of dat betekenisdragend is voor de lokale variant.

### 2. Opnieuw condenseren binnen budget — `ai-specialist-prompt-dna`
Herformuleer `LOCAL_CHAT_DNA` zodat de betekenisdragende bron-wijziging is overgenomen, binnen het condensatie-sub-budget: `dnaSubBudget` uit het manifest (≤2000 tokens voor `LOCAL_CHAT_DNA` alléén — bewust losstaand van het volle contextvenster `LOCAL_MODEL_TOKEN_BUDGET` = 8192, dat systeem + overzicht + kennis + vraag + antwoord samen dekt). Bewaak de harde invarianten: vrijheidstijd-framing als dé taal, "verzin nooit zelf cijfers/rekenregels", Wft-compliance (nooit individueel beleggingsadvies), en de toon (Nederlands je/jij, compact ≤120 woorden, geen markdown-headers/emoji). Chirurgisch, niet herschrijven-en-hopen; een concreet voorbeeld of tie-break-regel verslaat een vaag bijvoeglijk naamwoord.

### 3. Manifest + doelbestand schrijven — `ai-specialist-general`
Schrijf de nieuwe `LOCAL_CHAT_DNA` naar `lib/ai/local/local-chat-prompt.ts` en werk `lib/ai/local/parity-manifest.json` bij: verse `generatedAt`, nieuwe bron-hashes (in-sync met de gewijzigde bron) en herberekende `dnaEstimatedTokens` (via de gedeelde `estimateTokens` uit `knowledge-context.ts`). Draai daarna `npm run parity:scan` om te bevestigen dat het manifest weer in-sync is. Genereer de manifest-waarden met een wegwerp-snippet in de scratchpad (niet committen); commit alléén het resulterende JSON-bestand + het gewijzigde promptbestand.

### 4. Kwaliteitspoort — `tester`
Draai de bewaking-tests groen met echte output: `lib/ai/local/local-chat-prompt.test.ts` (assemblage-invarianten) en, waar toetsbaar, de gedeelde C1a-proefset (`PARITY_EVAL_SET` in `lib/ai/local/parity-eval-set.ts`) — de 10 vragen dekken filosofie, data-gebruik, belasting, twee Wft-vallen, een fiscale kans, FIRE-coaching, benchmark, buffer en de 4%-regel-val. Bewijs dat de invarianten intact zijn en dat eerder gedrag niet terugvalt. Draai ook `npx tsc --noEmit`.

### 5. Verplichte eigenaar-review vóór ship
**Harde gate — de skill shipt nooit automatisch.** Elke run eindigt met een expliciete review door de eigenaar (menselijk): de geciteerde before/after van `LOCAL_CHAT_DNA`, de manifest-diff en het bewijs uit stap 4 worden voorgelegd. Pas na expliciet akkoord van de eigenaar mag het werk via de release-skill naar productie. Geen akkoord → niet shippen; het werk blijft in de werkboom staan voor bijstelling.

## Afronding
Lever op: de geciteerde before/after van `LOCAL_CHAT_DNA` met redenering, het bijgewerkte `parity-manifest.json` (hashes in-sync), het groene bewijs uit de kwaliteitspoort (tsc + de twee vitest-bestanden), en de bevestiging dat de eigenaar-review-gate is doorlopen (of dat het werk daarop wacht). Sluit af met de zelfverbeterings-slotstap uit de gedeelde conventies.
