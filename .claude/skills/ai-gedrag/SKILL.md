---
name: ai-gedrag
description: Pijplijn voor het bijsturen van AI-GEDRAG in TriFinity — hoe De Wil (en Kern/Horizon) praat, redeneert, categoriseert en antwoordt. Voor verkeerde categorisaties, toon/lengte-problemen, filosofie-drift, compliance-zorgen of het verfijnen van een bestaande prompt. Werkt als een evaluatie-loop: concrete voorbeelden → diagnose → chirurgische prompt-aanpassing → regressiebewijs. Gebruik /ai-feature wanneer de app iets nieuws met AI moet kunnen; deze skill gaat over hoe de bestaande AI zich gedraagt.
---

# AI-gedrag pijplijn

Stuurt het gedrag van de AI bij via de prompt-DNA. Kern: gedrag verander je met **bewijs** — concrete voor/na-voorbeelden — en met **minimale, chirurgische** prompt-edits die de invarianten intact laten (vrijheidstijd-framing, geen verzonnen cijfers, toonregels, Wft-compliance). Nooit "de prompt wat herschrijven en hopen".

Geef het ongewenste gedrag mee als argument, het liefst met voorbeelden.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn.

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 1. Gedrag vastleggen met voorbeelden — `bug-reporter`
Laat de `bug-reporter` het ongewenste gedrag documenteren als concrete, reproduceerbare gevallen: de exacte input (transactie-omschrijving, chatvraag, context), het werkelijke antwoord/label, het gewenste antwoord/label, en hoe vaak/wanneer het optreedt. Minimaal een handvol voorbeelden — één anekdote is geen patroon.

### 2. Gewenst gedrag definiëren — `requirement-specialist` (kort, bij twijfel)
Is "goed gedrag" niet evident (bv. discussie over wat een categorie hoort te bevatten, of hoe streng een toonregel moet zijn)? Laat de `requirement-specialist` de verwachting scherp vaststellen, met de `business-owner` als eigenaar van de keuze. Evident geval (Picnic = boodschappen)? Sla over.

### 3. Diagnose & aanpassing — `ai-specialist-prompt-dna` (lead)
De `ai-specialist-prompt-dna`:
- Lokaliseert de juiste **prompt-laag**: basis-DNA (`lib/ai/dna/base.ts`), domein-persoonlijkheid (`kern/wil/horizon.ts`), of een taakprompt (`categorize-system-prompt.ts`, extractie, abonnementen, what-if, …).
- Past **minimaal** aan: een concreet voorbeeld of een expliciete tie-break-regel verslaat een vaag bijvoeglijk naamwoord.
- Bewaakt de invarianten: cijfers komen uit het FINANCIEEL OVERZICHT, vrijheidstijd-framing, toon (je/jij, geen emoji, compact), Wft-grenzen. **Versoepelt nooit stilzwijgend een guardrail** — dat is een expliciete keuze van de `business-owner`.
- Checkt neveneffecten: lost de edit de voorbeelden op zónder andere gevallen te breken?

**Escalatie naar `ai-specialist-general`**: blijkt de oorzaak niet de prompt maar de *voeding* — een context-builder die verkeerde/verouderde cijfers levert, een tool die niet gevonden wordt, sanitize die te veel wegstript — dan is het een plumbing-fix; de prompt-specialist draagt over met het bewijs.

### 4. Regressiebewijs — `tester`
De `tester` legt élk voorbeeldgeval uit stap 1 vast als testcase — categorisatie in `lib/parsers/categorize.test.ts` / `lib/auto-categorize.test.ts` en de `categorisatie`-regressiesuite; gedragsregels waar toetsbaar in de relevante suites. Draai de bestaande prompt-gerelateerde tests om te bewijzen dat eerder gefixte gevallen niet terugvallen. Groen met echte output.

### 5. Gedragsreview — `code-review` + steekproef
`code-review` beoordeelt de prompt-diff (before/after geciteerd, redenering erbij). Doe waar mogelijk een steekproef met de echte flow (bv. een categorisatie-run op de voorbeelden) en vergelijk voor/na.

### 6. Borging
- Raakt de wijziging een **aanname die ergens gedocumenteerd is** (bv. categoriedefinities, compliance-formulering)? Laat de `architect` kort toetsen of een ADR/concern bijgewerkt moet worden; meestal niet nodig.
- Vermeld dat beheerders via `ai_system_prompt_override` het volledige prompt kunnen overschrijven — de default moet op zichzelf coherent blijven (admin-auditview).

## Afronding
Lever op: de geciteerde prompt-diff met redenering, de voorbeeldgevallen als regressietests (groen), het bewijs dat de invarianten en eerder gedrag intact zijn, en eventuele overdracht aan plumbing/`ai-feature` als de oorzaak daar lag.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk daarbij ook expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
