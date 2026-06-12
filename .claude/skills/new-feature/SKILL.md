---
name: new-feature
description: End-to-end pijplijn voor een NIEUWE functionaliteit in TriFinity die de juiste subagents in volgorde inzet — van waarde & scope, via requirements en solution-architectuur, naar parallelle bouw, test, review en het bijwerken van de architectuurplaten. Gebruik deze skill wanneer iets nieuws gebouwd moet worden dat nog niet bestaat.
---

# Nieuwe-functie pijplijn

Bouwt een nieuwe functionaliteit via de gespecialiseerde subagents. Nadruk: eerst *waarom & wat* scherp, dán *hoe het past*, dán pas bouwen — zodat het past binnen één filosofie ("Geld is opgeslagen tijd") en de architectuur coherent blijft.

Geef het idee mee als argument; is het vaag, laat de `business-owner` het eerst scherpen.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn.

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 1. Waarde, scope & prioriteit — `business-owner`
De `business-owner` toetst het idee aan de missie en de pijlers (Kern/Wil/Horizon), bewaakt **Wft-compliance** (geen vergunningsplichtig advies), en zet het om in concrete backlog-feature(s) via de `feature_*`-tools. Verdeel grote ideeën in zelfstandig opleverbare features. Uitkomst: een go + duidelijke waarde-framing.

### 2. Verwachtingen vastleggen — `requirement-specialist`
In opdracht van de `business-owner` schrijft de `requirement-specialist` de **functionele & niet-functionele requirements**, **acceptatiecriteria (Given/When/Then)**, scope (in/uit), randgevallen, afhankelijkheden en de **Definition of Done**. Benoemt expliciet: single-source-of-truth voor elk getal, RLS/eigenaarschap, gating en vrijheidstijd-framing.

### 3. Solution-architectuur — `architect` (aan de start)
De `architect` ontwerpt hoe de functie in de **enterprise-architectuur** past: domein/capability, componenten & dataobjecten, eigenaarschap (gebruiker/huishouden), integratie/datastroom-patroon, welke bestaande bronnen van waarheid het raakt, en de gating. Legt trade-offs en het **besluit (ADR)** vast en specificeert welke **platen** straks mee moeten.

### 4. Technisch plan & dispatch — `senior-developer`
De `senior-developer` maakt het bouwplan, ontleedt het in onafhankelijke werkstromen en dispatcht (waar mogelijk **parallel**) de specialisten. Reserveert de integratie en de risicovolle naden voor zichzelf.

### 5. Bouwen — specialisten (parallel waar mogelijk)
- Tabellen, migraties, RLS, RPC's → `supabase-db-specialist`
- Rekenmotoren/afgeleide cijfers (+ Berekeningen-catalogus) → `calc-engine-specialist`
- AI-plumbing (routes, tools, schemas, context, guardrails) → `ai-specialist-general`
- Prompts/DNA/categorisatie → `ai-specialist-prompt-dna`
- Schermen/componenten in TriFinity-stijl met vrijheidstijd-framing & gating → `frontend-ui-builder`
- Overig/lijm → `coder`
Hergebruik bestaande componenten en bronnen; **geen parallelle berekening of tweede manier om iets te doen**.

### 6. Testen — `tester`
De `tester` schrijft unit-/component-tests en (waar end-to-end) een regression-suite-case, **getoetst aan de acceptatiecriteria** uit stap 2. Dekt randgevallen (nul/negatief inkomen, tekort, oneindige vrijheid, lege/laad-states, rolgrenzen). Draait `tsc`, lint en relevante tests groen — echte output.

### 7. Review — `code-review` + `ux-review-expert` + `security-specialist`
`code-review` voor correctheid/kwaliteit; `ux-review-expert` voor UI-consistentie en gebruikerservaring tegen het designsysteem. Raakt de feature data-toegang, auth, routes, AI-context, secrets of admin-paden (bij twijfel: ja), dan draait de `security-specialist` zijn ship-gate-checklist — een 🔴-bevinding blokkeert tot opgelost.

### 8. Architectuurplaten bijwerken — `architecture-docs-keeper` + fit-review `architect`
`architecture-docs-keeper` werkt de vier views van `/beheer/architectuur` bij (ArchiMate-topologie/relaties/flows, HLD-capability, ERD via migraties, Berekeningen) en regenereert facts (`npm run arch:diagram`); suites groen. De `architect` doet de eind-fit-review: past het, klopt de ADR, is een concern nodig of opgelost.

## Afronding
Lever op: de feature(s) in de backlog, het requirement-spec, het architectuurbesluit (ADR), wat gebouwd is, groene tests/reviews en de bijgewerkte platen. Benoem next steps en restrisico.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk daarbij ook expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
