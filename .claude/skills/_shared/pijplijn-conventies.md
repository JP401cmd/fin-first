# Pijplijn-conventies (gedeeld)

> Gedeelde spelregels voor álle pijplijn-skills in `.claude/skills/*`. Elke pijplijn-skill verwijst hierheen; deze regels gelden onverkort, alsof ze in de skill zelf staan. Skill-specifieke afwijkingen staan in de skill zelf en winnen van dit bestand.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert de pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn.

Eindigt een subagent voortijdig (limiet/fout) of zonder bruikbaar rapport: inventariseer eerst diens deelstaat — `git status`/`git diff` beperkt tot de **toegewezen deeltaak** — en maak het restant in de hoofdthread af, of dispatch gericht opnieuw voor alléén dat restant. Nooit blind opnieuw dispatchen, nooit een half rapport als compleet behandelen, en nooit de deelstaat van een ándere (parallelle) taak aanraken.

## Voortgangsrapportage (verplicht)

Houd de gebruiker doorlopend op de hoogte. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten: draai de agent(s) met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Git-hygiëne in de gedeelde werkboom

Subagents en hoofdchat werken in dezelfde working tree, vaak náást parallelle sessies van de gebruiker. Daarom: nooit `git stash`, `git checkout -- <pad>`, `git reset` of andere tree-brede operaties als onderdeel van bouwen of testen — die vernietigen andermans ongecommitte werk. Alleen gerichte edits binnen de opdracht-scope. De oude staat van een bestand vergelijk je met `git show HEAD:<pad>` of `git diff -- <pad>`, niet door de tree terug te zetten. Bestanden die je niet zelf hebt gewijzigd blijven onaangeraakt.

## Slotstap — zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus eigen observaties over de pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*` of `.claude/agents/*` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan definities sleutelen. Ook het "verheffen van een gevalideerde tweak tot conventie" (vastleggen in een skill/agent-definitie of CLAUDE.md) loopt via dít protocol — nooit mid-run.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.

### Verbetervoorstel-protocol voor subagents

Subagents eindigen hun rapport — alleen wanneer er écht iets is — met één **"Verbetervoorstel"**: bestand + huidige formulering + voorgestelde formulering + één zin waarom. Subagents wijzigen nooit zelf agent-/skill-definities.
