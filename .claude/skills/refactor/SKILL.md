---
name: refactor
effort: high
description: Pijplijn voor VERBOUWEN ZONDER GEDRAGSWIJZIGING in TriFinity — god-components opknippen, code verplaatsen/ontvlechten, hernoemen, lagen herindelen. Gebruik deze skill wanneer de structuur moet veranderen maar de app zich identiek moet blijven gedragen. Niet voor nieuw gedrag (new-feature / extend-feature) en niet voor defecten (bug-fix).
---

# Refactor-pijplijn (gedrag identiek)

Verbouwt code zonder het gedrag te veranderen. Het risico is sluipend: een "kleine verbetering" die meelift, state die van plek verschuift, een dependency-array die nét anders wordt. Daarom is de kern: **elke stap is een aantoonbare pure move** — klein, gecommit, getypecheckt, getest en (bij UI) visueel vergeleken, zodat een afwijking altijd binnen één kleine diff te vinden en terug te draaien is.

Geef mee wát er verbouwd wordt en waarom; check eerst of er al een lopend plan/eerdere extractie bestaat (zie `docs/superpowers/plans/` en de git-log van het doelbestand) — daarop voortbouwen, niet opnieuw beginnen. **Concreet:** een half-af plan in `docs/superpowers/plans/` wordt hervat vanaf de daar vastgelegde checklist-staat — niet opnieuw beginnen bij stap 1, en nooit parallel een tweede plan voor hetzelfde doelwit starten.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

## Proces

### 1. Verkennen — `deep-dive`
Breng het doelwit in kaart: structuurkaart van state/hooks/helpers/types en de grote JSX- of functieblokken; per blok welke state het leest en welke setters het aanroept. Dit levert de **naden** op (blokken met weinig gedeelde state = veilige snijlijnen) en de volgorde van extractie.

### 2. Vangnet — `tester` (vóór één regel verplaatst wordt)
- Baseline groen: `npx tsc --noEmit` + `npm run test:run` (anders weet je later niet of fouten van jou zijn).
- Geen test op het doelwit? Eerst een **characterization-test**: render met representatieve data, assert kernsecties/uitkomsten, dek de hoofdtoestanden (leeg/gevuld, relevante query-params).
- Bij UI: visuele baseline — screenshots van alle relevante toestanden als pixel-referentie.

### 3. Plan — `senior-developer`
Kleinste veilige stappen, van **puur naar stateful**: (1) pure helpers/types/constanten eruit, (2) presentational bladcomponenten, (3) secties, (4) de orchestrator blijft als laatste over (state + compositie). Eén commit per stap; **sequentieel**, nooit parallelle agents op hetzelfde bronbestand.

### 4. De pure-move loop — `coder` / `frontend-ui-builder` / `calc-engine-specialist`
Routeer per doelwit: **UI-componenten** → `frontend-ui-builder`; **pure libs/hooks/utilities** → `coder`; **rekenmotor-code** → `calc-engine-specialist` — daar is de pure-move-eis extra kritiek, want elke "kleine verbetering" in een rekenmotor is per definitie een rekenkundige gedragswijziging.

Per extractie dezelfde cyclus, met deze **harde regels**:
- **Knippen-en-plakken, niet herschrijven.** Geen hernoemingen, geen samengevoegde effects, geen toegevoegde memoization, geen "nette" verbeteringen — die komen in een aparte, latere wijziging.
- **State blijft in de parent**, tenzij aantoonbaar 100% lokaal. State mee verhuizen verandert reset-semantiek bij unmount — dat ís een gedragswijziging.
- **Hooks die onvoorwaardelijk draaiden, blijven onvoorwaardelijk draaien**; props zijn exact wat het blok las (waarden + setters expliciet).
- Per stap: `npx tsc --noEmit` → gerichte tests → **diff-review met de vraag "is elke regel een move, geen edit?"** → (bij UI) visuele vergelijking + interacties doorklikken → commit ("refactor: extract X — pure move, no behavior change").

**Lazy-loading & server-seed valkuilen** (geleerd in de performance-tranche jul 2026):
- **Vóór je een altijd-gemounte modal plat op zijn open-prop gate** (`{flag && …}`): check of hij via `BottomSheet`/overlay een exit-animatie op `open: true→false` draait. Zo ja → mount-latch (chat-panel-lazy-patroon), anders unmount je vóór de animatie en verlies je zichtbaar gedrag.
- **De mount-latch is alléén gratis wanneer het doelcomponent null-rendert zolang het dicht is** (zoals ChatPanel via `isOpen`). Voor een altijd-zichtbaar inline-oppervlak is er geen gratis latch-signaal — kies dan `next/dynamic({ ssr:false })` zónder interactie-gate (chunk uit de First-Load JS is de winst) i.p.v. een persistente placeholder te dupliceren.
- **Server-side seeden van client-fetch-state is alleen een pure win als de pagina de benodigde databron al in zijn eigen SSR laadt** (cache-hit). Zo nee → je verzwaart het SSR-kritieke pad; buiten scope verklaren i.p.v. breed doorduwen.

### 5. Eindverificatie — `tester`
Volledige `npm run test:run` + lint + relevante regressiesuites. Handmatige click-through van alle geraakte oppervlakken incl. deeplinks/modals. Screenshot-vergelijking tegen de baseline. Grep op importers van het verbouwde bestand (geen export-wissels die elders breken).

**Bij verwijderen van een route/module/bestand: grep óók op string-literal-consumenten** — `fetch('/api/...')`-paden, `href`-strings, route-/feature-strings — die tsc én de build NIET vangen. Een verwijderde API-route met een achtergebleven consument compileert en build't probleemloos, maar geeft pas een **runtime-404**. (Zo bleef `/beheer/horizon-tabellen-mij` na de v1-engine-uitfasering een verwijderde `/api/horizon-engine/ledger`-route fetchen → 404; pas een page↔route-contracttest ving het.)

### 6. Review — `code-review`
Met als expliciete reviewvraag: is dit een pure move? Elke inhoudelijke wijziging in de diff is een bevinding, hoe goedbedoeld ook. De gebundelde review draait als **fork-subagent** (zie de gedeelde conventies).

### 7. Opruimen & docs — `architecture-docs-keeper` (indien van toepassing)
Pure herindeling raakt de platen meestal niet, maar: stond er een **aandachtspunt** over dit doelwit in `lib/architecture/archimate-concerns.ts`? Verwijder het zodra opgelost. `npm run arch:diagram` voor de feiten/churn.

## Afronding
Lever op: de nieuwe structuur (welke bestanden ontstonden, hoeveel regels het doelwit nog telt), het vangnet dat nu bestaat, en expliciet **welke verificaties bewijzen dat het gedrag identiek is**. Restpunten (bewust uitgestelde verbeteringen) als aparte lijst — die zijn vervolgwerk, geen onderdeel van deze refactor. De zelfverbeterings-slotstap draait alleen onder de opt-in-condities uit de gedeelde conventies.
