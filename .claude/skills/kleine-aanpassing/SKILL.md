---
name: kleine-aanpassing
effort: medium
description: Lichte pijplijn voor een KLEINE AANPASSING op verzoek in TriFinity — een wens, geen defect; bijschaven, geen nieuw gedrag van betekenis. Gebruik deze skill vrijwel altijd wanneer de vraag klinkt als "wil je…", "kun je…", "pas … aan", "verander…", "maak … (kleiner/anders/mooier)" — bv. een tekstje, label, marge, kleur, beeld (zoals onboarding-beeld) of kleine gedragstweak op iets dat al werkt. NIET voor een defect (→ bug-fix), een functionele delta van betekenis (→ extend-feature), iets nieuws (→ new-feature), pure herstructurering (→ refactor) of AI-gedrag (→ ai-gedrag).
---

# Kleine-aanpassing pijplijn

**Eerste regel — juridische pagina's zijn uitgezonderd:** raakt het verzoek `/privacy`, `/voorwaarden` of `/wft`, stop dan hier — hoe klein de wijziging ook is. Die pagina's wijzigen uitsluitend via de Grenswachter-route (juridische toets), met een aantekening waaróm (brief-formaat). Meld dit en rond de skill af zonder te wijzigen.

Voert een klein verzoek tot wijziging uit — de "wens-variant" van een bug-fix. Niet een defect repareren, maar iets bijschaven dat al werkt: een tekst, label, marge, kleur, een onboarding-beeld, een kleine gedragstweak. Bewust **licht**: zo min mogelijk stappen en agents, zodat een vijf-minuten-wens geen negen-staps-orkestratie wordt. Maar de vangrails blijven: juiste specialist, echte verificatie, en bij UI of datatoegang de bijbehorende review.

Geef de gewenste aanpassing mee als argument; ontbreekt die, vraag er eerst naar.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

**Afwijking op de orchestrator-rol in déze lichte pijplijn:** de poort (stap 1) en een evidente één-regel-tweak mag de hoofdchat zelf afhandelen — delegeren zodra het meer is dan dat.

## Proces

### 1. "Is dit wel klein?" — poort vooraf (zelf, geen agent)
Toets het verzoek tegen deze criteria. **Alle moeten waar zijn** om door te gaan:
- raakt **géén** juridische pagina (`/privacy`, `/voorwaarden`, `/wft`) — die gaan nooit via deze pijplijn (zie de eerste regel bovenaan);
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

**Uitzondering — gevalideerde tweak verheven tot standaard:** verheft de gebruiker tijdens de run een al op één plek geverifieerde aanpassing expliciet tot app-brede standaard ("maak dit overal zo", "doe dit voor de hele app"), dan mag je in-place doorgaan — ook al raakt dat >3 bestanden: werk het gedeelde component bij, audit de hele app (`Explore`) en rol uit via fan-out naar de juiste specialist(en). De aanpak is immers al bewezen; escaleren voegt dan alleen ceremonie toe. Het **vastleggen van de conventie** in een skill-/agent-definitie of CLAUDE.md gebeurt NIET mid-run: neem het als Verbetervoorstel mee in de zelfverbeterings-slotstap (gedeeld protocol; alleen ná expliciet akkoord, aparte `self-improve:`-commit). De overige vangrails blijven onverkort gelden (verificatie, UX-/security-gate, platen-check).

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

Schaaf bij de **bron**, hergebruik bestaande tokens/componenten/helpers; introduceer geen tweede manier van iets doen. Respecteer "Geld is opgeslagen tijd"-framing en de bestaande conventies (design tokens, `font-mono tabular-nums` voor bedragen, vrijheidstijd-framing). Git-experimenten alleen in een geïsoleerde worktree, nooit in de gedeelde werkboom (zie de gedeelde conventies).

### 4. Verifiëren — verplicht, geen groen-theater
Altijd: `npx tsc --noEmit` + het **gerichte** `npm run test:run`-pad rond het geraakte bestand (niet de hele suite tenzij nodig). Bij een UI-wijziging ook een **visuele check** van het geraakte scherm in de betrokken toestanden. Echte output rapporteren. Brak een bestaande test door de tweak → fix of pas de test bewust aan met uitleg; nooit wegmoffelen. Een nieuwe (regressie)test is bij een echt kleine aanpassing meestal niet nodig — voeg er één toe als de tweak gedrag raakt dat makkelijk terug kan vallen.

### 5. Conditionele review — alleen wanneer geraakt
- **UI gewijzigd** → `ux-review-expert` voor consistentie met het design-system en de patronen (verplicht bij elke zichtbare UI-tweak).
- **Datatoegang / auth / een route / partner-/huishoudprivacy / AI-context geraakt** (bij twijfel: ja) → `security-specialist` draait zijn ship-gate-checklist; een **🔴-bevinding blokkeert** tot opgelost. (Raakt een kleine tweak dit echt, heroverweeg of het wel "klein" was.)
- Puur tekst/marge/kleur zonder UX- of dataimpact → een lichte `code-review` volstaat; bij een triviale één-regel-copywijziging mag review geheel achterwege blijven. Deze uitzondering **overrulet de UX-review-verplichting** uit het eerste punt, maar geldt alléén bij pure tekst zonder layout-, kleur- of token-impact — verandert er méér dan de letters (spacing, kleur, tokens, structuur), dan is het een zichtbare UI-tweak en draait de `ux-review-expert` gewoon.

### 6. Platen-check — benoemen, zelden uitvoeren
Een echt kleine aanpassing raakt de vier views van `/beheer/architectuur` vrijwel nooit. **Benoem** kort dat je dit gecheckt hebt. Veranderde er toch een domein/tabel/rekenmotor/capability-naam → dan was het geen kleine aanpassing; escaleer of laat `architecture-docs-keeper` de betrokken view bijwerken (`npm run arch:diagram`).

## Afronding
Sluit af met: wat de wens was, welk(e) bestand(en) gewijzigd zijn, het bewijs (tsc + gericht testpad groen, visuele check bij UI), de eventuele review-uitkomst, en de platen-check ("geen impact"). Bleek het tóch geen kleine aanpassing? Benoem dat en naar welke zwaardere skill je hebt doorverwezen. Sluit daarna af met de zelfverbeterings-slotstap uit de gedeelde conventies.
