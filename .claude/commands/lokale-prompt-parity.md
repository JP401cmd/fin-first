---
description: Detecteer en dicht prompt-drift tussen de lokale Fin-DNA en de cloud-bron-DNA — dunne launcher naar de lokale-prompt-parity-skill
argument-hint: "[aanleiding/reden — optioneel]"
---

De volledige pijplijn (bron diffen, gecontroleerd herconderseren binnen budget, kwaliteitspoort, verplichte eigenaar-review-gate) leeft in de **`lokale-prompt-parity`-skill** — niet inline in dit command. Zo geldt de pijplijn ook wanneer de skill via een andere weg wordt aangeroepen, niet alleen via dit command.

**Doe nu:**

1. Laad de `lokale-prompt-parity`-skill via de Skill-tool.
2. Volg de stappen exact:
   - **Diff** — `npm run parity:scan` (leest `lib/ai/local/parity-manifest.json`, herhasht `lib/ai/dna/base.ts` + `lib/ai/dna/wil.ts` live). In sync → meld en stop, geen verdere actie nodig.
   - **Bij drift** — herformuleer `LOCAL_CHAT_DNA` zodat de betekenisdragende bronwijziging is overgenomen, binnen `dnaSubBudget` (≤2000 tokens), met behoud van de harde invarianten (vrijheidstijd-framing, nooit zelf cijfers verzinnen, Wft-compliance, toon).
   - **Schrijf** de nieuwe `LOCAL_CHAT_DNA` naar `lib/ai/local/local-chat-prompt.ts` en werk `lib/ai/local/parity-manifest.json` bij (verse hashes + `dnaEstimatedTokens`); draai `npm run parity:scan` opnieuw ter bevestiging.
   - **Kwaliteitspoort** — `npx tsc --noEmit`, `lib/ai/local/local-chat-prompt.test.ts` en waar toetsbaar de `PARITY_EVAL_SET`-proefset, met echte output.
   - **Verplichte eigenaar-review vóór ship** — presenteer de before/after van `LOCAL_CHAT_DNA`, de manifest-diff en het testbewijs. Shipt **nooit** automatisch; zonder expliciet akkoord blijft het werk in de werkboom staan.
3. Aanleiding/context (optioneel): $ARGUMENTS

**Routering:** copy-wijzigingen binnen `LOCAL_CHAT_DNA` zijn het domein van `ai-specialist-prompt-dna`; manifest-/runtime-plumbing van `ai-specialist-general`; de kwaliteitspoort van `tester`. Sluit af met de zelfverbeterings-slotstap uit `.claude/skills/_shared/pijplijn-conventies.md`.
