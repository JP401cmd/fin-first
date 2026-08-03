---
name: kleine-aanpassing
effort: medium
description: Lichte pijplijn voor een KLEINE AANPASSING op verzoek in TriFinity — een wens, geen defect; bijschaven, geen nieuw gedrag van betekenis. Gebruik deze skill vrijwel altijd wanneer de vraag klinkt als "wil je…", "kun je…", "pas … aan", "verander…", "maak … (kleiner/anders/mooier)" — bv. een tekstje, label, marge, kleur, beeld (zoals onboarding-beeld) of kleine gedragstweak op iets dat al werkt. NIET voor een defect (→ bug-fix), een functionele delta van betekenis (→ extend-feature), iets nieuws (→ new-feature), pure herstructurering (→ refactor) of AI-gedrag (→ ai-gedrag).
---

# Kleine-aanpassing pijplijn

**Eerste regel — juridische pagina's zijn uitgezonderd:** raakt het verzoek `/privacy`, `/voorwaarden` of `/wft`, stop dan hier — hoe klein de wijziging ook is. Die pagina's wijzigen uitsluitend via de Grenswachter-route (juridische toets), met een aantekening waaróm (brief-formaat). Meld dit en rond de skill af zonder te wijzigen.

Voert een klein verzoek tot wijziging uit — de "wens-variant" van een bug-fix. Niet een defect repareren, maar iets bijschaven dat al werkt: een tekst, label, marge, kleur, een onboarding-beeld, een kleine gedragstweak. Bewust **licht**: zo min mogelijk stappen en agents, zodat een vijf-minuten-wens geen negen-staps-orkestratie wordt. Maar de vangrails blijven: echte verificatie, en bij een nieuw UI-patroon of datatoegang de bijbehorende review.

**Agent-budget: 0–1.** De hoofdchat voert een kleine aanpassing standaard **zelf** uit (tot ~3 bestanden binnen één domein); hooguit één uitvoerende specialist wanneer het domein specialistisch is (AI-prompt, chart-internals). Een review-agent komt er alleen bij op de expliciete triggers van stap 5. Meer dan dat is per definitie geen kleine aanpassing — escaleer dan.

Geef de gewenste aanpassing mee als argument; ontbreekt die, vraag er eerst naar.

## Gedeelde conventies (verplicht)

Lees en volg `.claude/skills/_shared/pijplijn-conventies.md`: orchestrator-rol (hoofdchat delegeert; bij een gestrande subagent eerst diens deelstaat per toegewezen deeltaak inventariseren), voortgangsritme (vóór/na elke stap melden, nooit >5 min stilte), git-hygiëne in de gedeelde werkboom (nooit `git stash`/`checkout --`/`reset`) en de zelfverbeterings-slotstap (definitie-wijzigingen alleen ná expliciet akkoord, aparte `self-improve:`-commit). Deze regels gelden onverkort.

**Afwijking op de orchestrator-rol in déze lichte pijplijn:** de hoofdchat handelt de poort (stap 1) én de uitvoering standaard zelf af (tot ~3 bestanden binnen één domein) — delegeren alleen wanneer het domein specialistisch is of het werk echt parallelliseerbaar uiteenvalt.

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

Twijfel je of het klein genoeg is? **Begin licht.** Behandel het als klein en escaleer op het moment dat je tijdens de uitvoering daadwerkelijk een poortcriterium raakt — een vierde bestand, een migratie, een rekenmotor, een nieuw oppervlak. Dat raken is een observatie, geen inschatting vooraf; preventief opschalen "voor de zekerheid" is precies de overhead die deze pijplijn moet voorkomen. De harde criteria hierboven (migratie, rekenmotor, juridische pagina's) blijven onverkort poortcriteria — daarvoor geldt géén twijfelmarge.

**Uitzondering — gevalideerde tweak verheven tot standaard:** verheft de gebruiker tijdens de run een al op één plek geverifieerde aanpassing expliciet tot app-brede standaard ("maak dit overal zo", "doe dit voor de hele app"), dan mag je in-place doorgaan — ook al raakt dat >3 bestanden: werk het gedeelde component bij, audit de hele app (`Explore`) en rol uit via fan-out naar de juiste specialist(en). De aanpak is immers al bewezen; escaleren voegt dan alleen ceremonie toe. Het **vastleggen van de conventie** in een skill-/agent-definitie of CLAUDE.md gebeurt NIET mid-run: neem het als Verbetervoorstel mee in de zelfverbeterings-slotstap (gedeeld protocol; alleen ná expliciet akkoord, aparte `self-improve:`-commit). De overige vangrails blijven onverkort gelden (verificatie, UX-/security-gate, platen-check).

### 2. Plek & impact lokaliseren — `Explore` (kort, alleen indien nodig)
Weet je al precies welk bestand/regel het betreft (vaak bij een tekst/label/marge)? Sla dit over. Zo niet: laat `Explore` gericht de exacte plek en de directe blast radius vinden (importers, gedeelde component, hergebruik elders). Lees de conclusie, niet de file-dumps. Bevestigt dit alsnog dat het groter is dan gedacht → terug naar de poort (stap 1) en escaleer.

### 3. Aanpassen — zelf waar het kan, anders één specialist
De hoofdchat voert de tweak standaard zelf uit. Is het domein specialistisch, routeer dan naar **één** specialist; alleen bij een echt cross-cutting tweak (zeldzaam bij "klein") coördineert de `senior-developer`:
- Cijfers/berekening/aanname/constante → eigenlijk geen kleine aanpassing → **escaleer** (de Berekeningen-view is single-source-of-truth; raak dit niet ad hoc aan)
- Schema/RLS/migratie/datatoegang → eigenlijk geen kleine aanpassing → **escaleer**
- AI-plumbing (SDK, routes, tools, guardrails) → `ai-specialist-general`
- Prompt/categorisatie/DNA → `ai-specialist-prompt-dna`
- UI/component/scherm/tekst/marge/kleur/beeld → `frontend-ui-builder`
- Overig (lijm, config, niet-financiële constante, copy in code) → `coder`

Schaaf bij de **bron**, hergebruik bestaande tokens/componenten/helpers; introduceer geen tweede manier van iets doen. Respecteer "Geld is opgeslagen tijd"-framing en de bestaande conventies (design tokens, `font-mono tabular-nums` voor bedragen, vrijheidstijd-framing). Git-experimenten alleen in een geïsoleerde worktree, nooit in de gedeelde werkboom (zie de gedeelde conventies).

### 4. Verifiëren — verplicht, geen groen-theater
Altijd: `npx tsc --noEmit` + het **gerichte** `npm run test:run`-pad rond het geraakte bestand (niet de hele suite tenzij nodig). Bij een UI-wijziging ook een **visuele check** van het geraakte scherm in de betrokken toestanden. Echte output rapporteren. Brak een bestaande test door de tweak → fix of pas de test bewust aan met uitleg; nooit wegmoffelen. Een nieuwe (regressie)test is bij een echt kleine aanpassing meestal niet nodig — voeg er één toe als de tweak gedrag raakt dat makkelijk terug kan vallen.

### 5. Conditionele review — alleen op deze expliciete triggers
- **UI gewijzigd bínnen bestaande patronen en tokens** (marge, kleurtoken, bestaand component hergebruikt, copy) → de **visuele check van stap 4 door de uitvoerder volstaat** — geen aparte review-agent.
- **Nieuw patroon geïntroduceerd** — een nieuwe layoutstructuur, een afwijkende token-keuze, een nieuw interactiepatroon of een zelfgebouwd element waar een gedeeld component bestaat → `ux-review-expert`.
- **Datatoegang / auth / een route / partner-/huishoudprivacy / AI-context geraakt** → `security-specialist` draait zijn ship-gate-checklist; een **🔴-bevinding blokkeert** tot opgelost. (Raakt een kleine tweak dit echt, heroverweeg of het wel "klein" was.)
- Puur tekst zonder layout-, kleur- of token-impact → geen review.

### 6. Platen-check — benoemen, zelden uitvoeren
Een echt kleine aanpassing raakt de vier views van `/beheer/architectuur` vrijwel nooit. **Benoem** kort dat je dit gecheckt hebt. Veranderde er toch een domein/tabel/rekenmotor/capability-naam → dan was het geen kleine aanpassing; escaleer of laat `architecture-docs-keeper` de betrokken view bijwerken (`npm run arch:diagram`).

## Afronding
Sluit af met: wat de wens was, welk(e) bestand(en) gewijzigd zijn, het bewijs (tsc + gericht testpad groen, visuele check bij UI), de eventuele review-uitkomst, en de platen-check ("geen impact"). Bleek het tóch geen kleine aanpassing? Benoem dat en naar welke zwaardere skill je hebt doorverwezen. De zelfverbeterings-slotstap draait alleen onder de opt-in-condities uit de gedeelde conventies.
