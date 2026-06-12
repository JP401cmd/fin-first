---
name: kleine-aanpassing
effort: medium
description: Lichte pijplijn voor een KLEINE AANPASSING op verzoek in TriFinity — een wens, geen defect; bijschaven, geen nieuw gedrag van betekenis. Gebruik deze skill vrijwel altijd wanneer de vraag klinkt als "wil je…", "kun je…", "pas … aan", "verander…", "maak … (kleiner/anders/mooier)" — bv. een tekstje, label, marge, kleur, beeld (zoals onboarding-beeld) of kleine gedragstweak op iets dat al werkt. Weinig stappen, één specialist waar het kan, mét vangrails (routering, verificatie, UX-/security-gate, "is dit wel klein?"-poort). NIET voor een defect (→ bug-fix), een functionele delta van betekenis (→ extend-feature), iets nieuws (→ new-feature), pure herstructurering (→ refactor) of AI-gedrag (→ ai-gedrag).
---

# Kleine-aanpassing pijplijn

Voert een klein verzoek tot wijziging uit — de "wens-variant" van een bug-fix. Niet een defect repareren, maar iets bijschaven dat al werkt: een tekst, label, marge, kleur, een onboarding-beeld, een kleine gedragstweak. Bewust **licht**: zo min mogelijk stappen en agents, zodat een vijf-minuten-wens geen negen-staps-orkestratie wordt. Maar de vangrails blijven: juiste specialist, echte verificatie, en bij UI of datatoegang de bijbehorende review.

Geef de gewenste aanpassing mee als argument; ontbreekt die, vraag er eerst naar.

## Rol van de hoofdchat — orchestrator

De hoofdchat voert deze pijplijn uit als **orchestrator**, niet als uitvoerder: hij zet subagents en skills in voor het inhoudelijke werk, bewaakt volgorde, samenhang en kwaliteit tussen de stappen, en beschermt zijn eigen contextvenster door te delegeren. Zelf doet hij alleen triviale lijm en snelle checks; onderzoek, bouw, test en review lopen via de gespecialiseerde agents — parallel waar stappen onafhankelijk zijn. Eindigt een subagent voortijdig (limiet/fout) of zonder bruikbaar rapport, inventariseer dan eerst diens deelstaat (git status/diff op de opdracht-scope) en maak het werk in de hoofdthread af of dispatch gericht het restant — nooit blind opnieuw dispatchen of het rapport als compleet behandelen. Uitzondering in déze lichte pijplijn: de poort (stap 1) en een evidente één-regel-tweak mag de hoofdchat zelf afhandelen — delegeren zodra het meer is dan dat.

**Voortgangsrapportage (verplicht):** houd de gebruiker doorlopend op de hoogte van waar de pijplijn mee bezig is. Meld vóór elke stap in één à twee zinnen wat je gaat doen en welke agent(s) je inzet; meld na elke stap kort het resultaat (klaar / kernbevinding / blokkade) voordat je doorgaat. Duurt een stap naar verwachting langer dan ~5 minuten, draai de agent(s) dan met `run_in_background: true` en rapporteer tussentijds zodra een deelresultaat binnenkomt — laat nooit langer dan ~5 minuten stilte vallen. Stil doorwerken zonder updates is een fout, ook als het eindresultaat goed is.

## Proces

### 1. "Is dit wel klein?" — poort vooraf (zelf, geen agent)
Toets het verzoek tegen deze criteria. **Alle moeten waar zijn** om door te gaan:
- raakt naar verwachting **≤ ~3 bestanden**;
- **geen** Supabase-migratie, **geen** nieuwe tabel/kolom/dataobject, **geen** RLS-wijziging;
- **geen** nieuwe API-route of nieuw UI-oppervlak (bestaand scherm/route bijschaven mag);
- **geen** wijziging aan een rekenmotor of een financiële aanname/constante;
- het is een **wens/bijschaving**, geen defect, en introduceert **geen nieuw gedrag van betekenis**.

Valt het buiten de poort, **escaleer** in plaats van te forceren — meld kort waaróm en wijs door:
- defect / iets werkt niet → **`/bug-fix`**
- functionele delta van betekenis op een bestaande functie → **`/extend-feature`**
- iets dat nog niet bestaat (route/oppervlak/dataobject) → **`/new-feature`**
- structuur veranderen zonder gedragswijziging → **`/refactor`**
- hoe de AI antwoordt/categoriseert → **`/ai-gedrag`** · AI-plumbing → **`/ai-feature`**

Twijfel je of het klein genoeg is? Dan is het dat niet — escaleer.

### 2. Plek & impact lokaliseren — `Explore` (kort, alleen indien nodig)
Weet je al precies welk bestand/regel het betreft (vaak bij een tekst/label/marge)? Sla dit over. Zo niet: laat `Explore` gericht de exacte plek en de directe blast radius vinden (importers, gedeelde component, hergebruik elders). Lees de conclusie, niet de file-dumps. Bevestigt dit alsnog dat het groter is dan gedacht → terug naar de poort (stap 1) en escaleer.

### 3. Aanpassen via de juiste specialist — één agent waar het kan
Routeer naar het domein van de wijziging en zet **één** specialist in; alleen bij een echt cross-cutting tweak (zeldzaam bij "klein") coördineert de `senior-developer`:
- Cijfers/berekening/aanname/constante → eigenlijk geen kleine aanpassing → **escaleer** (de Berekeningen-view is single-source-of-truth; raak dit niet ad hoc aan)
- Schema/RLS/migratie/datatoegang → eigenlijk geen kleine aanpassing → **escaleer**
- AI-plumbing (SDK, routes, tools, guardrails) → `ai-specialist-general`
- Prompt/categorisatie/DNA → `ai-specialist-prompt-dna`
- UI/component/scherm/tekst/marge/kleur/beeld → `frontend-ui-builder`
- Overig (lijm, config, niet-financiële constante, copy in code) → `coder`

Schaaf bij de **bron**, hergebruik bestaande tokens/componenten/helpers; introduceer geen tweede manier van iets doen. Respecteer "Geld is opgeslagen tijd"-framing en de bestaande conventies (design tokens, `font-mono tabular-nums` voor bedragen, vrijheidstijd-framing).

Geef elke bouw-agent expliciet mee dat hij **géén werkboom-muterende git-commando's** draait (stash/checkout/restore/reset) — pre-existing fouten read-only beoordelen (bv. via `git diff`); er kan een parallelle sessie in dezelfde werkboom actief zijn. Git-experimenten alleen in een geïsoleerde worktree.

### 4. Verifiëren — verplicht, geen groen-theater
Altijd: `npx tsc --noEmit` + het **gerichte** `npm run test:run`-pad rond het geraakte bestand (niet de hele suite tenzij nodig). Bij een UI-wijziging ook een **visuele check** van het geraakte scherm in de betrokken toestanden. Echte output rapporteren. Brak een bestaande test door de tweak → fix of pas de test bewust aan met uitleg; nooit wegmoffelen. Een nieuwe (regressie)test is bij een echt kleine aanpassing meestal niet nodig — voeg er één toe als de tweak gedrag raakt dat makkelijk terug kan vallen.

### 5. Conditionele review — alleen wanneer geraakt
- **UI gewijzigd** → `ux-review-expert` voor consistentie met het design-system en de patronen (verplicht bij elke zichtbare UI-tweak).
- **Datatoegang / auth / een route / partner-/huishoudprivacy / AI-context geraakt** (bij twijfel: ja) → `security-specialist` draait zijn ship-gate-checklist; een **🔴-bevinding blokkeert** tot opgelost. (Raakt een kleine tweak dit echt, heroverweeg of het wel "klein" was.)
- Puur tekst/marge/kleur zonder UX- of dataimpact → een lichte `code-review` volstaat; bij een triviale één-regel-copywijziging mag review achterwege blijven.

### 6. Platen-check — benoemen, zelden uitvoeren
Een echt kleine aanpassing raakt de vier views van `/beheer/architectuur` vrijwel nooit. **Benoem** kort dat je dit gecheckt hebt. Veranderde er toch een domein/tabel/rekenmotor/capability-naam → dan was het geen kleine aanpassing; escaleer of laat `architecture-docs-keeper` de betrokken view bijwerken (`npm run arch:diagram`).

## Afronding
Sluit af met: wat de wens was, welk(e) bestand(en) gewijzigd zijn, het bewijs (tsc + gericht testpad groen, visuele check bij UI), de eventuele review-uitkomst, en de platen-check ("geen impact"). Bleek het tóch geen kleine aanpassing? Benoem dat en naar welke zwaardere skill je hebt doorverwezen.

## Slotstap — Zelfverbetering (altijd in overleg met de gebruiker)

Sluit elke run af met een korte retrospectief:

1. **Verzamel** de "Verbetervoorstel"-secties uit de eindrapporten van de ingezette subagents, plus je eigen observaties over deze pijplijn: overbodige of ontbrekende stap, verkeerde routering, onduidelijke instructie, een agent-definitie die tekortschoot. Kijk daarbij ook expliciet naar **token-efficiëntie**: had hetzelfde resultaat gekund met minder gelezen context, minder of kortere agent-runs of compactere rapporten — en welke instructie-aanpassing zou dat de volgende keer afdwingen?
2. **Leg betekenisvolle voorstellen expliciet aan de gebruiker voor** — wat, waarom, en de exacte tekstwijziging in `.claude/skills/*/SKILL.md` of `.claude/agents/*.md` — bij voorkeur als keuzevraag (doorvoeren / aanpassen / afwijzen).
3. **Alleen na expliciet akkoord doorvoeren**, in een aparte commit met prefix `self-improve:`. Geen akkoord of geen voorstel? Niets wijzigen — nooit stilzwijgend aan de eigen definities sleutelen.

Houd het schaars: één scherp voorstel per run is het maximum; geen voorstel is prima.
