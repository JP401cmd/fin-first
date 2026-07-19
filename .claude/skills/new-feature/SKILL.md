---
name: new-feature
effort: high
description: "End-to-end pijplijn voor een NIEUWE functionaliteit in TriFinity. Gebruik deze skill wanneer iets nieuws gebouwd moet worden dat nog niet bestaat. Bouwt het voort op iets bestaands → /extend-feature; kleine bijschaving → /kleine-aanpassing; AI-functionaliteit → /ai-feature."
---

# Nieuwe-functie pijplijn

Bouwt een nieuwe functionaliteit via de gespecialiseerde subagents. Nadruk: eerst *waarom & wat* scherp, dán *hoe het past*, dán pas bouwen — zodat het past binnen één filosofie ("Geld is opgeslagen tijd") en de architectuur coherent blijft.

Geef het idee mee als argument; is het vaag, laat de `business-owner` het eerst scherpen.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

## Proces

### 1. Waarde, scope & prioriteit — `business-owner`
**"Bestaat dit al?"-poort (eerst):** check vóór al het andere of (een deel van) de gevraagde functionaliteit al bestaat — een korte gerichte `Explore` op routes, componenten en libs volstaat. Bestaat er al een fundament dat dit deels doet, verlaat dan deze pijplijn en start **`/extend-feature`** met een verwijzing naar wat er al is; alleen écht nieuw werk gaat hier verder.

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

### 8. Architectuur- & UAT-definities bijwerken — `architecture-docs-keeper` + `uat-docs-keeper` + fit-review `architect`
`architecture-docs-keeper` werkt de vier views van `/beheer/architectuur` bij (ArchiMate-topologie/relaties/flows, HLD-capability, ERD via migraties, Berekeningen) en regenereert facts (`npm run arch:diagram`); suites groen. Parallel landt `uat-docs-keeper` de acceptatiecriteria (Given/When/Then) uit stap 2 in de UAT-definities: een scenario in `lib/uat/catalog.ts` + een `AcceptanceCriterion` in `lib/uat/acceptance/<zone>.ts` + een node in `flows/<zone>.ts`, zodat de nieuwe functie bij ship al in de UAT-plaat staat — **definities vastleggen, niet uitvoeren (dat is `/uat`)**. De `architect` doet de eind-fit-review: past het, klopt de ADR, is een concern nodig of opgelost.

## Afronding
Lever op: de feature(s) in de backlog, het requirement-spec, het architectuurbesluit (ADR), wat gebouwd is, groene tests/reviews en de bijgewerkte platen. Benoem next steps en restrisico. Sluit daarna af met de zelfverbeterings-slotstap uit de gedeelde conventies.
