---
id: 0062-lokale-chat-dna-afgeleid-artefact
title: Lokale chat-DNA wordt een afgeleid, hash-geverifieerd artefact
status: aanvaard
date: 2026-07-25
elements: [t-lokale-ai]
---

`LOCAL_CHAT_DNA` (`lib/ai/local/local-chat-prompt.ts`) is niet langer een
hand-onderhouden verbatim-kopie van de cloud-prompt-DNA. Het wordt via de
`lokale-prompt-parity`-skill en een gecommit manifest
(`lib/ai/local/parity-manifest.json`) gesynchroniseerd met de cloud-bron
(`lib/ai/dna/base.ts` + `lib/ai/dna/wil.ts`), binnen het bestaande
tokenbudget.

## Context

De lokale Fin-chat draait binnen een hard tokenbudget
(`LOCAL_MODEL_TOKEN_BUDGET`, geëxporteerd uit `lib/ai/local/litert-runtime.ts`)
en kan dus nooit de volledige cloud-DNA laden. Tot nu toe was `LOCAL_CHAT_DNA`
een handmatig ingekorte kopie: elke wijziging aan de cloud-DNA (toon,
filosofie, compliance-regels) moest apart en foutgevoelig worden
overgenomen — met reëel risico op stille drift tussen wat de cloud-Fin en de
lokale Fin beweren te zijn.

## Besluit

- **De cloud-DNA blijft de enige bron.** `lib/ai/dna/base.ts` + `wil.ts` zijn
  canoniek; `LOCAL_CHAT_DNA` is een afgeleide, gecondenseerde projectie
  daarvan.
- **Synchronisatie is op-aanvraag, niet automatisch bij elke build.** De
  `lokale-prompt-parity`-skill (`.claude/skills/lokale-prompt-parity/`) draait
  gericht: detecteert drift via het gecommitte manifest (hash-vergelijking
  tussen de laatst-gesyncte cloud-DNA en de huidige), hercondenseert binnen
  het sub-budget met behoud van de harde invarianten (filosofie, Wft-
  compliance, toon), en shipt pas na eigenaar-review.
- **Het manifest is het contract, niet de code.** `parity-manifest.json` legt
  vast welke cloud-hash het laatst is verwerkt; een mismatch is het
  drift-signaal, geen automatische overschrijving.
- **Curatorschap ligt bij de skill, niet bij losse hand-edits.** Wijzigingen
  aan `LOCAL_CHAT_DNA` horen via de skill te lopen zodat het manifest
  synchroon blijft; een hand-edit zonder manifest-update is per definitie
  toekomstige drift.

## Gevolgen

- Prompt-DNA-wijzigingen in de cloud (via `ai-specialist-prompt-dna`) worden
  pas lokaal zichtbaar na een bewuste parity-sync-ronde — geen automatische
  meesleep, wél een detecteerbare en oplosbare drift.
- `/beheer/kennisbank` toont de parity-status (bronnen, laatste run,
  tokenschatting, in-sync/drift-badge) via het scanscript
  `scripts/ai-parity/scan.mjs` → `docs/ai-parity/parity.json` (P2) — dit is
  puur inzicht, geen aparte bron van waarheid.
