---
name: bug-fix
effort: high
description: End-to-end bug-fix pijplijn voor TriFinity die de juiste subagents in volgorde inzet — van reproduceerbaar bugrapport naar gefixte, geverifieerde en (indien nodig) architectuur-gereviewde oplossing. Gebruik deze skill wanneer een bug gemeld of waargenomen is en je 'm gestructureerd wilt oplossen in plaats van ad-hoc te patchen.
---

# Bug-fix pijplijn

Lost een bug op via de gespecialiseerde subagents, in een vaste volgorde met conditionele aftakkingen. Doel: niet de eerste-de-beste patch, maar de *juiste* fix met bewijs dat het echte probleem geraakt is en dat bestaande functionaliteit heelblijft.

Geef de bug-omschrijving mee als argument; ontbreekt die, vraag er eerst naar.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn. Eindigt een subagent voortijdig (limiet/fout) of zonder bruikbaar rapport, inventariseer dan eerst diens deelstaat (git status/diff op de opdracht-scope) en maak het werk in de hoofdthread af of dispatch gericht het restant — nooit blind opnieuw dispatchen of het rapport als compleet behandelen. **Toets die deelstaat per TOEGEWEZEN deeltaak, niet alleen of de gewijzigde bestanden compileren: een agent die halverwege sneuvelt kan een vroege deeltaak (bv. een helper of refactor) hebben uitgevoerd maar latere deeltaken (bv. een copy-aanpassing, een test, een tweede bestand) stilzwijgend hebben overgeslagen terwijl de code tóch groen is — compile-clean ≠ taak-compleet. Loop expliciet de oorspronkelijke opdrachtlijst van de agent langs en vink elk punt af tegen de echte diff; een overgeslagen deeltaak die pas in de review opduikt is een gemiste inventarisatie.**

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 0. Fast-path-poort — al firsthand gediagnosticeerd? (zelf, geen agent)
Levert de opdracht de bug al **firsthand gediagnosticeerd** aan — oorzaak, exacte locatie(s) én fix-richting, niet slechts een symptoom — handel stap 1–3 (rapport, verwachting, triage) dan af als een **korte bevestiging in de hoofdthread** i.p.v. drie aparte subagent-runs, en ga direct naar stap 4 (falende test). Dit bespaart 2–3 subagent-runs en context bij een al-doorgrond probleem. Voorwaarden: de **firsthand-verificatieplicht blijft hard** (lees zelf de betrokken regels/diff, draai zelf `tsc`/de relevante tests — vertrouw geen aangeleverde diagnose blind), en blijkt de diagnose bij die verificatie tóch onvolledig of fout, val dan terug op de volledige stappen 1–3. Bij twijfel over de diagnose: niet de fast-path nemen.

### 1. Rapporteren & reproduceren — `bug-reporter`
Zet de `bug-reporter` in voor een volledig rapport: titel, samenvatting, omgeving/context, **deterministische repro-stappen**, verwacht vs. werkelijk gedrag, **geraakte use cases/user journeys**, impact & ernst, vermoedelijke oorzaak/locatie en bewijs. Lever een **minimale repro** op.
- Kun je niet reproduceren? Stop en meld dat terug met de condities — niet blind gaan fixen.

### 2. Verwachting vastleggen — `requirement-specialist`
Laat de `requirement-specialist` definiëren wat "gefixt" betekent: het correcte gedrag met **acceptatiecriteria (Given/When/Then)** en de Definition of Done. Dit is de meetlat voor stap 6.

### 3. Architectuur-impact triage — `architect` (kort)
Laat de `architect` snel bepalen of de bug **structureel** is (raakt domeingrenzen, single-source-of-truth, RLS-model, een ADR). Zo ja: bepaal of de fix een ontwerpkeuze raakt en welke platen/ADR's straks mee moeten. Zo nee: noteer "lokaal, geen architectuurimpact" en ga door.
- **Raakt de fix een functie die een union-type of meerdere modes/varianten bedient** (bv. `DownsizeConfig | ReverseMortgageConfig`, een flag-gated v1/v2-pad, een mode-enum)? Benoem dan expliciet *alle* varianten die die functie bedient en bepaal per variant of het nieuwe gedrag gewenst is — en eis in stap 4/6 een **regressietest per variant**, niet alleen voor de variant uit het bugrapport. Zo voorkom je "de genoemde case gefixt, de zuster-case geregresseerd".

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
Fix bij de **bron** (geen symptoombestrijding, geen duplicatie van een berekening). **Bij een rekenmotor- of constante-correctie: grep niet alleen op de canonieke functienaam, maar óók op de rúwe constante-literalen van de oude/foute formule (bv. `0.133`, `17_545`) — een tweede surface die de metric volledig herimplementeert met magic numbers verschijnt nooit in een grep op de geëxporteerde functie, en blijft anders ongecorrigeerd achter.**

### 6. Verifiëren — `tester`
De `tester` draait de test uit stap 4 (nu **groen**) plus de bredere relevante suites, en voegt een **regressiecase** toe zodat de bug niet terugkomt. Draai `npx tsc --noEmit` en relevante `npm run test:run`-paden. Geen groen-theater: rapporteer echte output. Draaien stap 6 en 7 parallel, dan wijzigt de tester geen productiecode: in-scope defecten meldt hij als bevinding aan de orchestrator, zodat de review geen bewegend doel beoordeelt.

- **Scope-grens bij blootgelegde drift.** Legt een **nieuw toegevoegde CI-wrapper** voor een al-bestaande in-app suite pre-existing drift bloot (asserties die achterlopen op code/types/data), fix dan **alleen** de drift die direct aan de huidige bug verbonden is. Los-staande drift in dezelfde of een ándere suite is een **aparte follow-up** — rek de scope van de bugfix er niet mee op (draai een halve aanzet terug en houd de fix atomair), maar benoem de drift expliciet als aanbeveling in de afronding. Zo voorkom je dat één bug een ongerelateerde suite-opschoning in sleept.

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
