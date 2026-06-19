---
name: extend-feature
effort: high
description: Pijplijn voor het UITBOUWEN van een BESTAANDE functionaliteit in TriFinity — een delta op iets dat al werkt. Zet de juiste subagents in met nadruk op de huidige werking begrijpen, hergebruik, minimale blast radius en het beschermen van bestaand gedrag (regressie). Gebruik deze skill wanneer een bestaande functie uitgebreid, verdiept of aangepast moet worden (niet nieuw, niet een bug).
---

# Uitbouw-pijplijn (bestaande functie)

Breidt een bestaande functionaliteit uit. Het grote verschil met `new-feature`: je begint vanuit **wat er al is**. De risico's zitten in regressie (bestaand gedrag breken), duplicatie (een tweede manier introduceren) en onbedoelde blast radius. De pijplijn is daarop ingericht.

Geef mee welke functie uitgebreid moet worden en de gewenste uitbreiding; is dat vaag, laat de `business-owner` de waarde van de uitbreiding scherpen.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn. Eindigt een subagent voortijdig (limiet/fout) of zonder bruikbaar rapport, inventariseer dan eerst diens deelstaat (git status/diff op de opdracht-scope) en maak het werk in de hoofdthread af of dispatch gericht het restant — nooit blind opnieuw dispatchen of het rapport als compleet behandelen.

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 1. Huidige werking in kaart — `deep-dive` (of `Explore`)
Laat `deep-dive` de bestaande functie doorgronden: betrokken bestanden, dataobjecten, bronnen-van-waarheid, gating, tests en de aannames waarop het rust. Uitkomst: een accuraat beeld van **wat er is** en waar de uitbreiding op aanhaakt. Zonder dit geen betrouwbare delta.

### 2. Waarde van de uitbreiding — `business-owner`
De `business-owner` weegt de uitbreiding tegen missie/pijlers en Wft-compliance, en werkt de backlog-feature bij. Bewaakt dat het de coherentie versterkt, niet fragmenteert.

### 3. Delta-requirements — `requirement-specialist`
De `requirement-specialist` legt de **delta** vast: wat verandert, wat blijft, en expliciet de **scope in/uit** om scope-creep te voorkomen. Acceptatiecriteria voor het nieuwe gedrag **én** een regressie-eis ("bestaand gedrag X blijft ongewijzigd"). Definition of Done.

### 4. Impact- & fit-review — `architect`
De `architect` beoordeelt de **blast radius**: raakt de uitbreiding een single-source-of-truth, een domeingrens, RLS, of een bestaand ADR? Bepaalt of een besluit gewijzigd/aangevuld moet worden en welke platen mee moeten. Bewaakt: hergebruik bestaande bron, **geen parallelle berekening**.

### 5. Plan met minimale blast radius — `senior-developer`
De `senior-developer` ontwerpt de kleinst mogelijke, veilige wijziging, identificeert de risicovolle naden en dispatcht de specialisten. Voorkeur voor uitbreiden/hergebruiken boven herschrijven.

### 6. Bouwen — specialisten (hergebruik-eerst)
Zelfde routering als bij een nieuwe functie, maar met de opdracht **hergebruik bestaande componenten/bronnen** en raak alleen wat nodig is:
- DB/RLS/migratie (append-only, nooit een gemigreerde migratie editen) → `supabase-db-specialist`
- Rekenmotor/afgeleide cijfers (+ catalogus) → `calc-engine-specialist`
- AI-plumbing → `ai-specialist-general` · Prompts/DNA → `ai-specialist-prompt-dna`
- UI → `frontend-ui-builder` · lijm/overig → `coder`

Raakt de uitbreiding een **rekenmotor of een financiële constante**: grep niet alleen op de canonieke functienaam, maar óók op de rúwe constante-literalen van de oude/bestaande formule (bv. `0.133`, `17_545`) — een tweede surface die de metric volledig herimplementeert met magic numbers verschijnt nooit in een grep op de geëxporteerde functie, en drijft anders verder uit elkaar.

### 7. Testen — bestaand beschermen + nieuw dekken — `tester`
De `tester` voegt tests toe voor het nieuwe gedrag **en** draait de bestaande suites om regressie uit te sluiten; voegt waar nodig een regressiecase toe die het oude gedrag vastpint. `tsc`/lint/tests groen, echte output. Gebruik NOOIT `git stash` om een "schone baseline" te meten wanneer er omvangrijke niet-gecommitte WIP in de working tree staat — dat bundelt vreemde wijzigingen met de jouwe en een mislukte `pop` kan werk in gevaar brengen; bepaal of een fout pre-existing is door het pad/bestand te inspecteren (is het een bestand dat jij aanraakte?).

### 8. Review — `code-review` (+ `ux-review-expert` bij UI, + `security-specialist` bij data/auth/routes)
Beoordeling op correctheid, neveneffecten op bestaand gedrag, en UI-consistentie. Raakt de uitbreiding data-toegang, auth, routes, AI-context of partner-/huishouddata (bij twijfel: ja), dan draait de `security-specialist` zijn ship-gate-checklist — let extra op een tweede datapad dat een privacy-bewuste loader omzeilt; een 🔴-bevinding blokkeert tot opgelost.

### 9. Platen synchroniseren — `architecture-docs-keeper` (indien structureel)
Veranderde de uitbreiding een domein/tabel/rekenmotor/capability? Dan werkt `architecture-docs-keeper` de relevante view(s) bij en regenereert facts; de `architect` bevestigt de fit. Puur additief binnen bestaande grenzen? Sla over.

## Afronding
Lever op: de bijgewerkte feature, de delta-spec met scope in/uit, bewijs dat bestaand gedrag heelblijft (regressietests groen), wat gewijzigd is en eventuele plaat/ADR-updates. Benoem restrisico en next steps.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk daarbij ook expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
