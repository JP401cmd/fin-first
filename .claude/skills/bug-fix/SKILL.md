---
name: bug-fix
description: End-to-end bug-fix pijplijn voor TriFinity die de juiste subagents in volgorde inzet — van reproduceerbaar bugrapport naar gefixte, geverifieerde en (indien nodig) architectuur-gereviewde oplossing. Gebruik deze skill wanneer een bug gemeld of waargenomen is en je 'm gestructureerd wilt oplossen in plaats van ad-hoc te patchen.
---

# Bug-fix pijplijn

Lost een bug op via de gespecialiseerde subagents, in een vaste volgorde met conditionele aftakkingen. Doel: niet de eerste-de-beste patch, maar de *juiste* fix met bewijs dat het echte probleem geraakt is en dat bestaande functionaliteit heelblijft.

Geef de bug-omschrijving mee als argument; ontbreekt die, vraag er eerst naar.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn.

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 1. Rapporteren & reproduceren — `bug-reporter`
Zet de `bug-reporter` in voor een volledig rapport: titel, samenvatting, omgeving/context, **deterministische repro-stappen**, verwacht vs. werkelijk gedrag, **geraakte use cases/user journeys**, impact & ernst, vermoedelijke oorzaak/locatie en bewijs. Lever een **minimale repro** op.
- Kun je niet reproduceren? Stop en meld dat terug met de condities — niet blind gaan fixen.

### 2. Verwachting vastleggen — `requirement-specialist`
Laat de `requirement-specialist` definiëren wat "gefixt" betekent: het correcte gedrag met **acceptatiecriteria (Given/When/Then)** en de Definition of Done. Dit is de meetlat voor stap 6.

### 3. Architectuur-impact triage — `architect` (kort)
Laat de `architect` snel bepalen of de bug **structureel** is (raakt domeingrenzen, single-source-of-truth, RLS-model, een ADR). Zo ja: bepaal of de fix een ontwerpkeuze raakt en welke platen/ADR's straks mee moeten. Zo nee: noteer "lokaal, geen architectuurimpact" en ga door.

### 4. Falende test vastleggen — `tester`
Laat de `tester` de minimale repro vastleggen als een **falende** test (Vitest of een regression-suite-case in `lib/regression-tests/suites/*`). Bevestig dat hij **rood** is om de juiste reden — dit pint het echte probleem.

### 5. Fixen via de juiste specialist — orkestratie door `senior-developer`
De `senior-developer` routeert naar het juiste domein en integreert:
- Foute cijfers / rekenfout → `calc-engine-specialist`
- Schema / RLS / migratie / datatoegang → `supabase-db-specialist`
- AI-plumbing (SDK, routes, tools, guardrails) → `ai-specialist-general`
- Prompt/categorisatie/DNA → `ai-specialist-prompt-dna`
- UI/component/scherm → `frontend-ui-builder`
- Overig/cross-cutting → `coder` of de `senior-developer` zelf
Fix bij de **bron** (geen symptoombestrijding, geen duplicatie van een berekening).

### 6. Verifiëren — `tester`
De `tester` draait de test uit stap 4 (nu **groen**) plus de bredere relevante suites, en voegt een **regressiecase** toe zodat de bug niet terugkomt. Draai `npx tsc --noEmit` en relevante `npm run test:run`-paden. Geen groen-theater: rapporteer echte output. Draaien stap 6 en 7 parallel, dan wijzigt de tester geen productiecode: in-scope defecten meldt hij als bevinding aan de orchestrator, zodat de review geen bewegend doel beoordeelt.

### 7. Review — `code-review` (+ conditioneel `ux-review-expert` / `security-specialist`)
`code-review` beoordeelt de fix op correctheid, neveneffecten en kwaliteit. Bij een UI-bug ook `ux-review-expert` voor consistentie/UX. Raakt de fix data-toegang, auth, routes of partner-privacy — of wás de bug zelf een lek — dan draait de `security-specialist` zijn ship-gate-checklist vóór afronding.

### 8. Architectuur-fit & platen — `architect` (+ `architecture-docs-keeper` indien structureel)
Was stap 3 "structureel"? Dan reviewt de `architect` of de fit klopt en zorgt hij dat de vier views van `/beheer/architectuur` meebewegen — gedelegeerd aan `architecture-docs-keeper` (`npm run arch:diagram`, suites groen), inclusief een ADR/concern-update (concern verwíjderen als het risico is opgelost). Lokale bug zonder impact? Sla over.

## Afronding
Sluit af met: het bugrapport, de bron-oorzaak, wat gewijzigd is, het bewijs (groene test + regressiecase) en eventuele architectuur/plaat-updates. Bij restrisico of out-of-scope bevindingen: benoem waar het stokt.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk daarbij ook expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
