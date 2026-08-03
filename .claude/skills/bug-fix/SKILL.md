---
name: bug-fix
effort: high
description: "Bug-fix pijplijn voor TriFinity. Gebruik wanneer een defect gemeld of waargenomen is — 'werkt niet', 'klopt niet', crash, verkeerd getal. NIET voor AI-gedragsafwijkingen (verkeerde categorisatie, toon of antwoorden van de AI) → /ai-gedrag."
---

# Bug-fix pijplijn

Lost een bug op via de gespecialiseerde subagents, in een vaste volgorde met conditionele aftakkingen. Doel: niet de eerste-de-beste patch, maar de *juiste* fix met bewijs dat het echte probleem geraakt is en dat bestaande functionaliteit heelblijft.

Geef de bug-omschrijving mee als argument; ontbreekt die, vraag er eerst naar.

**Agent-budget:** fast-path 0–1 agents (hooguit een `tester`); volledige pijplijn ≤6 (rapport, verwachting/triage waar structureel, specialist-fix, tester, gebundelde review). Meer alleen met expliciete motivering vooraf (zie de gedeelde conventies).

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

Aanvulling bij het gestrande-subagent-protocol in deze pijplijn: compile-clean ≠ taak-compleet — een agent die halverwege sneuvelt kan een vroege deeltaak (bv. een helper of refactor) hebben uitgevoerd maar latere deeltaken (bv. een copy-aanpassing, een test, een tweede bestand) stilzwijgend hebben overgeslagen terwijl de code tóch groen is. Loop expliciet de oorspronkelijke opdrachtlijst van de agent langs en vink elk punt af tegen de echte diff; een overgeslagen deeltaak die pas in de review opduikt is een gemiste inventarisatie.

## Proces

**Afslag vooraf — AI-gedrag?** Blijkt de gemelde "bug" een AI-gedragsafwijking — verkeerde categorisatie, toon, lengte of antwoorden van de AI — verlaat dan deze pijplijn en start **`/ai-gedrag`**, ook al is het als bug gemeld. Deze pijplijn is voor defecten in code/data/UI, niet voor hoe de bestaande AI zich gedraagt.

### 0. Fast-path-poort — eerst zelf diagnosticeren (zelf, geen agent)
**Dit is de standaard-ingang, niet de uitzondering.** Begin élke bug in de hoofdthread: lees de betrokken code, verifieer gemelde teksten/bedragen met een grep, reproduceer waar dat snel kan. Is de oorzaak daarmee **hard én lokaal** — één bestand (of een strak clusterje), geen gedeeld contract, geen nieuw bundel-/DB-veld, geen rekenmotor — neem dan de fast-path: handel stap 1–3 af als korte bevestiging in de hoofdthread en ga direct naar stap 4 (falende test), fix en verificatie in de hoofdthread. De volledige pijplijn is er voor bugs die een gedeeld contract, een rekenmotor, meerdere surfaces of live accountdata raken. **Bij twijfel over de route: fast-path** — escaleer alsnog op het moment dat je tijdens de uitvoering daadwerkelijk zo'n criterium raakt (dat is een observatie, geen inschatting vooraf).

Levert de opdracht al een diagnose aan, dan blijft de **firsthand-verificatieplicht hard**: lees zelf de betrokken regels/diff en draai zelf `tsc`/de relevante tests vóór je erop bouwt — vertrouw geen aangeleverde diagnose blind. Blijkt de diagnose bij die verificatie onvolledig of fout, val dan terug op de volledige stappen 1–3.

**Omgevingsdefect-afslag.** Blijkt tijdens de snelle checks dat het defect in de **omgeving** zit (dev-server, cache, poort, env-vars) en niet in code of data — bv. routes die 404'en terwijl de bestanden bestaan, `tsc` schoon is en de tests groen zijn: diagnosticeer en herstel dan in de hoofdthread, verifieer firsthand (browser/HTTP, niet alleen een aanname), sla stappen 2–8 over en leg de gotcha vast (memory/docs). Een falende vitest is dan niet van toepassing — het bewijs is het herstelde gedrag in de echte omgeving.

### 1. Rapporteren & reproduceren — `bug-reporter` (alleen op de volledige pijplijn)
Zet de `bug-reporter` in voor een volledig rapport: titel, samenvatting, omgeving/context, **deterministische repro-stappen**, verwacht vs. werkelijk gedrag, **geraakte use cases/user journeys**, impact & ernst, vermoedelijke oorzaak/locatie en bewijs. Lever een **minimale repro** op.
- Kun je niet reproduceren? Stop en meld dat terug met de condities — niet blind gaan fixen.

### 2. Verwachting vastleggen — `requirement-specialist` (alleen wanneer structureel)
Raakt de bug een gedeeld contract, een rekenmotor of meerdere surfaces, laat dan de `requirement-specialist` definiëren wat "gefixt" betekent: het correcte gedrag met **acceptatiecriteria (Given/When/Then)** en de Definition of Done — de meetlat voor stap 6. Bij een lokale bug legt de hoofdthread de verwachting zelf vast, in twee zinnen in de falende test van stap 4 (Given/When/Then in de testnaam/docstring) — geen aparte agent.

### 3. Architectuur-impact triage — `architect` (kort; alleen wanneer structureel)
Bij dezelfde structurele triggers: laat de `architect` snel bepalen of de fix een ontwerpkeuze raakt en welke platen/ADR's straks mee moeten. Bij een lokale bug noteert de hoofdthread zelf "lokaal, geen architectuurimpact" en gaat door.
- **Raakt de fix een functie die een union-type of meerdere modes/varianten bedient** (bv. `DownsizeConfig | ReverseMortgageConfig`, een flag-gated v1/v2-pad, een mode-enum)? Benoem dan expliciet *alle* varianten die die functie bedient en bepaal per variant of het nieuwe gedrag gewenst is — en eis in stap 4/6 een **regressietest per variant**, niet alleen voor de variant uit het bugrapport. Zo voorkom je "de genoemde case gefixt, de zuster-case geregresseerd".

### 4. Falende test vastleggen — `tester`
Laat de `tester` de minimale repro vastleggen als een **falende** test (Vitest of een regression-suite-case in `lib/regression-tests/suites/*`). Bevestig dat hij **rood** is om de juiste reden — dit pint het echte probleem.

### 5. Fixen via de juiste specialist — orkestratie door `senior-developer`
De `senior-developer` routeert naar het juiste domein en integreert:
- Foute cijfers / rekenfout → `calc-engine-specialist`
- Schema / RLS / migratie / datatoegang → `supabase-db-specialist`
- AI-plumbing (SDK, routes, tools, guardrails) → `ai-specialist-general`
- Prompt/categorisatie/DNA → `ai-specialist-prompt-dna` (alleen wanneer prompt-werk deel is van een bredere bug — een puur AI-gedragsprobleem hoort in `/ai-gedrag`, zie de afslag vooraf)
- UI/component/scherm → `frontend-ui-builder`
- Overig/cross-cutting → `coder` of de `senior-developer` zelf
Fix bij de **bron** (geen symptoombestrijding, geen duplicatie van een berekening). **Bij een rekenmotor- of constante-correctie: grep niet alleen op de canonieke functienaam, maar óók op de rúwe constante-literalen van de oude/foute formule (bv. `0.133`, `17_545`) — een tweede surface die de metric volledig herimplementeert met magic numbers verschijnt nooit in een grep op de geëxporteerde functie, en blijft anders ongecorrigeerd achter.**
**Introduceert de fix een gegevensbron voor een "vorige/recentste-vóórgaande" waarde (trend, delta, "was X", laatste-voor-nu): verifieer dat de query-ordening/limit die recente rijen gegarandeerd teruggeeft (`order(desc)` óf een datum-filter) — een `order(asc).limit(N)` levert bij >N rijen juist de OUDSTE N, waardoor het "vorige"-anker structureel verstaalt zonder ooit te falen. Kopieer een bestaand `[len-2]`-patroon niet blind: controleer eerst dát het de recente kant afkapt.**
De fixer levert in zijn rapport een **blast-radius-regel** mee: "gewijzigd veld/symbool X wordt gelezen door: [lijst uit de grep]" — die grep doet hij toch al, en stap 7 valideert dan die lijst i.p.v. hem from scratch op te bouwen.

### 6. Verifiëren — `tester`
De `tester` draait de test uit stap 4 (nu **groen**) plus de bredere relevante suites, en voegt een **regressiecase** toe zodat de bug niet terugkomt. **Zet daarbij de docstring van de stap-4-test om van pre-fix- naar norm-stem**: "verwacht na de fix" / "huidige (onjuiste) aanname" / "FALENDE vastlegging" beschrijft na stap 5 een toestand die niet meer bestaat en leest voor de volgende lezer als een instructie om de fix terug te draaien; vervang daarbij harde regelverwijzingen (`guard.ts:67-71`) door symbolische (`guard.ts#SLIDER_WORK_ORIGINS`). Draai `npx tsc --noEmit` en relevante `npm run test:run`-paden. Geen groen-theater: rapporteer echte output. Draaien stap 6 en 7 parallel, dan wijzigt de tester geen productiecode: in-scope defecten meldt hij als bevinding aan de orchestrator, zodat de review geen bewegend doel beoordeelt.

- **Scope-grens bij blootgelegde drift.** Legt een **nieuw toegevoegde CI-wrapper** voor een al-bestaande in-app suite pre-existing drift bloot (asserties die achterlopen op code/types/data), fix dan **alleen** de drift die direct aan de huidige bug verbonden is. Los-staande drift in dezelfde of een ándere suite is een **aparte follow-up** — rek de scope van de bugfix er niet mee op (draai een halve aanzet terug en houd de fix atomair), maar benoem de drift expliciet als aanbeveling in de afronding. Zo voorkom je dat één bug een ongerelateerde suite-opschoning in sleept.

### 7. Review — één gebundelde `code-review`-run (+ `security-specialist` alleen bij de harde triggers)
Eén `code-review`-agent beoordeelt de fix op correctheid, neveneffecten en kwaliteit, en krijgt in dezelfde opdracht de **UI-consistentie-lens** (bij een UI-bug) en de **security-lens** mee — geen drie aparte review-spawns (zie de gedeelde conventies). Geef hem de blast-radius-regel uit stap 5 mee (welke consumers het gewijzigde veld/symbool lezen) — valideren is goedkoper dan reconstrueren. Eén uitzondering blijft hard: raakt de fix auth, RLS, een migratie, een route met datatoegang of partner-/huishouddata — of wás de bug zelf een lek — dan draait de `security-specialist` zijn ship-gate-checklist als aparte run vóór afronding.

### 8. Architectuur-fit & platen — `architect` (+ `architecture-docs-keeper` indien structureel)
Was stap 3 "structureel"? Dan reviewt de `architect` of de fit klopt en zorgt hij dat de vier views van `/beheer/architectuur` meebewegen — gedelegeerd aan `architecture-docs-keeper` (`npm run arch:diagram`, suites groen), inclusief een ADR/concern-update (concern verwíjderen als het risico is opgelost). Lokale bug zonder impact? Sla over.

## Afronding
Sluit af met: het bugrapport, de bron-oorzaak, wat gewijzigd is, het bewijs (groene test + regressiecase) en eventuele architectuur/plaat-updates. Bij restrisico of out-of-scope bevindingen: benoem waar het stokt. De zelfverbeterings-slotstap draait alleen onder de opt-in-condities uit de gedeelde conventies.
