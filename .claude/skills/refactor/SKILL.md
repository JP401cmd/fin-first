---
name: refactor
description: Pijplijn voor VERBOUWEN ZONDER GEDRAGSWIJZIGING in TriFinity — god-components opknippen, code verplaatsen/ontvlechten, hernoemen, lagen herindelen. Gebruik deze skill wanneer de structuur moet veranderen maar de app zich identiek moet blijven gedragen. Niet voor nieuw gedrag (new-feature / extend-feature) en niet voor defecten (bug-fix).
---

# Refactor-pijplijn (gedrag identiek)

Verbouwt code zonder het gedrag te veranderen. Het risico is sluipend: een "kleine verbetering" die meelift, state die van plek verschuift, een dependency-array die nét anders wordt. Daarom is de kern: **elke stap is een aantoonbare pure move** — klein, gecommit, getypecheckt, getest en (bij UI) visueel vergeleken, zodat een afwijking altijd binnen één kleine diff te vinden en terug te draaien is.

Geef mee wát er verbouwd wordt en waarom; check eerst of er al een lopend plan/eerdere extractie bestaat (zie `docs/superpowers/plans/` en de git-log van het doelbestand) — daarop voortbouwen, niet opnieuw beginnen.

## Proces

### 1. Verkennen — `deep-dive`
Breng het doelwit in kaart: structuurkaart van state/hooks/helpers/types en de grote JSX- of functieblokken; per blok welke state het leest en welke setters het aanroept. Dit levert de **naden** op (blokken met weinig gedeelde state = veilige snijlijnen) en de volgorde van extractie.

### 2. Vangnet — `tester` (vóór één regel verplaatst wordt)
- Baseline groen: `npx tsc --noEmit` + `npm run test:run` (anders weet je later niet of fouten van jou zijn).
- Geen test op het doelwit? Eerst een **characterization-test**: render met representatieve data, assert kernsecties/uitkomsten, dek de hoofdtoestanden (leeg/gevuld, relevante query-params).
- Bij UI: visuele baseline — screenshots van alle relevante toestanden als pixel-referentie.

### 3. Plan — `senior-developer`
Kleinste veilige stappen, van **puur naar stateful**: (1) pure helpers/types/constanten eruit, (2) presentational bladcomponenten, (3) secties, (4) de orchestrator blijft als laatste over (state + compositie). Eén commit per stap; **sequentieel**, nooit parallelle agents op hetzelfde bronbestand.

### 4. De pure-move loop — `coder` / `frontend-ui-builder`
Per extractie dezelfde cyclus, met deze **harde regels**:
- **Knippen-en-plakken, niet herschrijven.** Geen hernoemingen, geen samengevoegde effects, geen toegevoegde memoization, geen "nette" verbeteringen — die komen in een aparte, latere wijziging.
- **State blijft in de parent**, tenzij aantoonbaar 100% lokaal. State mee verhuizen verandert reset-semantiek bij unmount — dat ís een gedragswijziging.
- **Hooks die onvoorwaardelijk draaiden, blijven onvoorwaardelijk draaien**; props zijn exact wat het blok las (waarden + setters expliciet).
- Per stap: `npx tsc --noEmit` → gerichte tests → **diff-review met de vraag "is elke regel een move, geen edit?"** → (bij UI) visuele vergelijking + interacties doorklikken → commit ("refactor: extract X — pure move, no behavior change").

### 5. Eindverificatie — `tester`
Volledige `npm run test:run` + lint + relevante regressiesuites. Handmatige click-through van alle geraakte oppervlakken incl. deeplinks/modals. Screenshot-vergelijking tegen de baseline. Grep op importers van het verbouwde bestand (geen export-wissels die elders breken).

### 6. Review — `code-review`
Met als expliciete reviewvraag: is dit een pure move? Elke inhoudelijke wijziging in de diff is een bevinding, hoe goedbedoeld ook.

### 7. Opruimen & docs — `architecture-docs-keeper` (indien van toepassing)
Pure herindeling raakt de platen meestal niet, maar: stond er een **aandachtspunt** over dit doelwit in `lib/architecture/archimate-concerns.ts`? Verwijder het zodra opgelost. `npm run arch:diagram` voor de feiten/churn.

## Afronding
Lever op: de nieuwe structuur (welke bestanden ontstonden, hoeveel regels het doelwit nog telt), het vangnet dat nu bestaat, en expliciet **welke verificaties bewijzen dat het gedrag identiek is**. Restpunten (bewust uitgestelde verbeteringen) als aparte lijst — die zijn vervolgwerk, geen onderdeel van deze refactor.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot.
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
