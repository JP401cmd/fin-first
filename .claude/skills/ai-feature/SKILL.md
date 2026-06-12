---
name: ai-feature
effort: high
description: Pijplijn voor het bouwen of wijzigen van AI-FUNCTIONALITEIT in TriFinity — nieuwe AI-routes, tools, structured outputs, context-builders of provider/config-wijzigingen. Zet de AI-specialisten en het team in de juiste volgorde in, met de guardrails (sanitize, PII-mask, kill-switch, tier-gate, token-logging) als harde eis. Gebruik deze skill voor "de app moet iets nieuws met AI kunnen"; voor hoe de AI zich gedraagt of antwoordt, gebruik /ai-gedrag.
---

# AI-functionaliteit pijplijn

Bouwt of wijzigt een AI-capability (endpoint, tool, extractie, analyse) via de specialisten. Kern: élke AI-call volgt de TriFinity-patterns — `getModel()` met feature-string, kill-switch & tier-gate, `sanitizeForAI` in, `maskPIIInOutput` uit, token-logging — en geen verzonnen cijfers: het model krijgt kant-en-klare getallen uit de canonieke bronnen via de context-builders.

Geef de gewenste AI-functionaliteit mee als argument.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn. Eindigt een subagent voortijdig (limiet/fout) of zonder bruikbaar rapport, inventariseer dan eerst diens deelstaat (git status/diff op de opdracht-scope) en maak het werk in de hoofdthread af of dispatch gericht het restant — nooit blind opnieuw dispatchen of het rapport als compleet behandelen.

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 1. Waarde & compliance — `business-owner` (kort)
Toets aan de missie en vooral aan **Wft-compliance**: AI mag educatief informeren, nooit vergunningsplichtig advies geven (koop/verkoop/belasting). Twijfel? Herframe of stop hier. Werk de backlog-feature bij.

### 2. Verwachtingen — `requirement-specialist`
Leg vast: het exacte gewenste AI-gedrag met acceptatiecriteria, de **input/output-vorm** (vrije tekst, structured output + zod-schema, streaming, tool-call), welke **gegevens** het model mag zien (en welke niet — PII!), kosten/tier-gating, en de Definition of Done inclusief de guardrail-checklist.

### 3. Architectuur-fit — `architect` (conditioneel)
Nieuwe route, externe integratie of nieuw datadomein in de AI-context? Dan bepaalt de `architect` de plek in de architectuur, het datastroom-patroon en de plaat/ADR-impact. Een extra veld in een bestaande flow? Sla over.

### 4. Bouwen — `ai-specialist-general` (lead)
De `ai-specialist-general` bouwt volgens de referentie (`app/api/ai/chat/route.ts`):
- Route onder `app/api/*` met auth → `checkTierGate` → `getModel(supabase, '<feature>')` → guardrails → nette `AIConfigError`-afhandeling (422) en timeouts.
- Nieuwe capability voor de chat = AI SDK `tool()` in `lib/ai/tools/` + registratie in `index.ts`.
- Structured output = zod-schema in `lib/ai/schemas/` + `generateObject`.
- Nieuwe data voor het model = context-builder in `lib/ai/context/` die **uitsluitend** uit de canonieke rekenbronnen leest.
- SDK-signaturen verifiëren tegen actuele docs (de `ai` v6-API verandert snel).

Parallel waar nodig:
- Nieuwe opslag/tabel (bv. logging, feedback) → `supabase-db-specialist`
- Nieuw afgeleid cijfer dat het model nodig heeft → `calc-engine-specialist` (eerst de motor, dan pas de context-builder)
- UI-oppervlak (chat-kaart, sheet, knop) → `frontend-ui-builder`

### 5. Prompt erbij — `ai-specialist-prompt-dna` (indien nodig)
Heeft de functionaliteit een (nieuw of aangepast) system-/taakprompt nodig? Dan schrijft de `ai-specialist-prompt-dna` die — als apart bestand in `lib/ai/` (single source of truth, nooit inline in de route), conform de basis-DNA en de Wft-regels. De vorm (schema/parsing) stemmen beide AI-specialisten samen af.

### 6. Testen — `tester`
Unit-tests voor de pure delen (schema's, context-builders, tools) en regressiecases waar passend (denk aan de `ai-beveiliging`- en `beheer-ai`-suites). Test expliciet de guardrails: PII gaat er niet in en komt er niet uit, kill-switch en tier-gate blokkeren echt, foutpaden geven nette meldingen. `tsc`/lint/tests groen met echte output.

### 7. Review — `code-review` + `security-specialist`
`code-review` extra scherp op: geen provider-SDK buiten `getModel` om, token-logging aanwezig, nette foutafhandeling. De `security-specialist` draait altijd mee bij AI-functionaliteit: geen API-keys/secrets richting client, sanitize/PII-mask aantoonbaar in het pad, context respecteert het perspectief van de vrager (geen partner-privé data), kill-switch/tier-gate houden stand. Een 🔴-bevinding blokkeert tot opgelost.

### 8. Platen — `architecture-docs-keeper` (indien stap 3 van toepassing was)
Nieuwe service/integratie/datastroom op de ArchiMate-plaat, capability in de HLD, en facts regenereren. `architect` bevestigt de fit.

## Afronding
Lever op: de werkende AI-functionaliteit, de guardrail-checklist afgevinkt, het tokenverbruik gelogd onder de juiste feature-naam (zichtbaar in `/beheer/ai-verbruik`), groene tests en eventuele plaat/ADR-updates.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk daarbij ook expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
