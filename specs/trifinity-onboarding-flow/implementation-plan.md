# Plan: Intentie-gedreven Onboarding Flow voor TriFinity

> **Status:** Ontwerp — nog niet gevalideerd met gebruikers
> **Datum:** 2026-04-13
> **Aanleiding:** Gebruikersfeedback dat de modulaire opzet te weinig richting geeft

## Context

Gebruikers geven aan dat de huidige modulaire opzet te weinig richting geeft. De
oorzaak is niet de architectuur, maar de **framing van de eerste schermen**:

1. Het intro-scherm (`components/onboarding/onboarding-intro.tsx:94-122`)
   introduceert direct de systeemtaal "Kern / Wil / Horizon" voordat de
   gebruiker zijn doel heeft uitgesproken.
2. De persona-stap (`components/onboarding/onboarding-persona.tsx:36-65`)
   gebruikt identiteitslabels ("De Budgetteerder", "De FIRE Fighter") in plaats
   van intenties, en toont op hetzelfde scherm ook nog een toggle-lijst van
   alle 6 modules met dependency-waarschuwingen — dubbele cognitieve belasting.
3. Na onboarding belandt de gebruiker op een dashboard (`getHomePath()` in
   `lib/module-registry.ts:265-270`), maar er is geen "first win": geen
   concrete actie of pagina die direct laat zien waarom de app waardevol is
   voor zijn specifieke doel.

De modulaire architectuur (`docs/superpowers/specs/2026-03-28-module-scheiding-design.md`)
blijft het fundament — we passen alleen de **presentatielaag** aan, conform het
architectuurprincipe in `CLAUDE.md`.

## Gewenste uitkomst

- De allereerste vraag aan een nieuwe gebruiker is een **intentie**, niet een
  module-keuze.
- Op basis van die intentie wordt automatisch de juiste set modules
  geactiveerd, de juiste onboarding-stappen getoond, en — direct na voltooiing
  — een gerichte "first win"-pagina geopend die past bij die intentie.
- Na onboarding begeleidt de app via **module-guide briefing-kaarten** met
  vinkbare stappen per actieve module.
- De stappen zijn **bewerkbaar via een beheer-scherm**.
- Power-users kunnen het modulesysteem nog steeds tunen, maar pas later via
  Instellingen (waar dat al kan).

## Voorgestelde aanpak

### 1. Nieuwe intentie-stap vervangt de huidige persona-stap

Vervang de huidige `OnboardingModules` (`onboarding-persona.tsx`) door een
nieuwe `OnboardingIntent`-component die exact een keuze toont, met
intentie-framing:

| # | Intentie-kaart | Mapt op modules | First-win |
|---|---|---|---|
| 1 | "Ik wil **gecoacht worden** in mijn omgang met geld" | `budgetteren` + `vermogensregistratie` + `inzicht_acties` | `/will` met verse "eerste voorstellen" |
| 2 | "Ik wil **grip op mijn uitgaven**" | `budgetteren` | `/core/budgets` |
| 3 | "Ik wil **overzicht van al mijn geld**" | `vermogensregistratie` + `inzicht_acties` | `/core` (netto-vermogen) |
| 4 | "Ik wil **inzicht in mijn financiele toekomst**" | `vermogensregistratie` + `toekomstplannen` + `inzicht_acties` | `/horizon` |
| 5 | "Ik wil **alles** — maximale vrijheid" | alle modules | `/will` |

De coaching-intentie (rij 1) is bewust de eerste/primaire kaart omdat die de
breedste doelgroep bedient ("ik wil hulp") en het beste gebruikmaakt van wat
de app onderscheidt: het voorstellen-systeem.

De toggle-lijst met losse modules verdwijnt uit dit scherm. Dependency-validatie
en `inDevelopment`-flags zijn niet meer relevant in onboarding omdat de
intent-naar-modules mapping altijd valide is.

**Na selectie van een intentie**: toon onder de kaart een compact overzicht van
welke modules **aan** staan (met vinkje, bv. "Budgetteren", "Inzicht & Acties")
en welke **niet** (gedimde tekst zonder vinkje). Dit is puur informatief, geen
toggles — zodat de gebruiker weet wat hij krijgt. Verwijzing onderaan: "Je kunt
modules later aanpassen in Instellingen."

**Bestand:** nieuwe `components/onboarding/onboarding-intent.tsx` (vervangt
`onboarding-persona.tsx`); de bestaande backwards-compat exports kunnen weg.

**Mapping:** voeg in `lib/module-registry.ts` een nieuwe `IntentId` union toe
met 5 waarden (`coaching`, `grip_uitgaven`, `overzicht_geld`, `toekomst`,
`alles`) en een `INTENT_MODULE_PRESETS` map. Hou `PersonaId` +
`PERSONA_MODULE_PRESETS` als deprecated type-aliases zodat bestaande
database-records en regression-tests blijven werken tijdens de migratie.

### 2. Reframe het intro-scherm

`components/onboarding/onboarding-intro.tsx` toont nu drie module-cards
(Kern/Wil/Horizon). Vervang die door een regel uitleg en een directe stap naar
de intentie-vraag — geen systeemtaal meer op het welkomstscherm. De philosofie-
quote ("Geld is opgeslagen tijd") blijft staan.

### 3. Onboarding-flow vereenvoudigen op basis van intentie

In `app/(onboarding)/onboarding/page.tsx:152-167` werkt `computeStepOrder()`
al op basis van geselecteerde modules. Dat blijft werken zonder wijzigingen —
de intent kiest de modules, de modules bepalen de stappen.

Twee kleine aanpassingen:
- Verwijder de stap `'modules'` uit `Step` union en vervang door `'intent'`
  (`page.tsx:40-50`); update `CANONICAL_STEP_ORDER` (`page.tsx:59-70`) met een
  migratie zodat oude drafts in localStorage gehealed worden via
  `_resolveRestoredStep()`.
- Hernoem `state.persona`/`state.selectedModules` naar `state.intent`/
  `state.activeModules` in de reducer (~`page.tsx:182-196`).

### 4. First-win per intentie + pre-generatie van "eerste voorstellen"

Voeg aan `lib/module-registry.ts` een nieuwe functie `getFirstWinPath(intent)`
toe volgens de mapping in paragraaf 1. Vervang de aanroep van `getHomePath()`
aan het einde van de onboarding (in `page.tsx`, rond waar `router.push()` na
`'success'` staat) door `getFirstWinPath()`. Voor terugkerende sessies blijft
`getHomePath()` de default — de first-win is een eenmalige afslag.

**Kritiek voor de coaching-intentie:** de first-win "je eerste voorstellen"
werkt alleen als er bij aankomst op `/will` daadwerkelijk voorstellen staan —
anders ziet de gebruiker een lege pagina en is de belofte verbroken. Daarom:

- Roep tijdens de `'saving'`-stap van onboarding (waar het profiel, budgets en
  bezittingen al naar Supabase worden weggeschreven) aansluitend
  `POST /api/ai/recommendations/initial` aan. Die endpoint bestaat al
  (`app/api/ai/recommendations/initial/route.ts:45`) en genereert synchroon
  een eerste batch voorstellen op basis van het zojuist opgeslagen profiel.
- Alleen aanroepen wanneer de intentie `coaching` of `alles` is (de enige twee
  die inzicht_acties activeren en naar `/will` routeren). Voor de andere
  intenties is deze stap overbodig en zou het onboarding onnodig vertragen.
- Fout-afhandeling: als de AI-call faalt of de tier-gate blokkeert, log het
  maar blokkeer de onboarding niet — de pagina toont dan de bestaande
  empty-state. Gebruiker kan handmatig genereren via de bestaande knop.

### 5. Module-guide briefing-kaarten als begeleiding

In plaats van losse UI-lagen wordt de begeleiding naar de first-win onderdeel
van de **briefing** — het hart van de DAIshboard. Per actieve module wordt een
deterministische **module-guide-kaart** getoond: een interactieve checklist met
vinkbare stappen en een kruisje om de hele kaart te dismisssen.

**Nieuwe card-type `moduleGuide`:**

Breid `lib/briefing/types.ts` uit met een nieuw spec-type:
```typescript
interface ModuleGuideCardSpec {
  type: 'moduleGuide'
  moduleId: ModuleId
  module: CardModule          // kern | wil | horizon (voor kleuring)
  title: string               // bv. "Budgetteren — eerste stappen"
  steps: { key: string; label: string; href?: string }[]
}
```

De `done`-status per stap en de dismiss-status per kaart worden **niet** in de
card-spec opgeslagen maar gelezen uit een aparte persistentielaag (zie onder).
Hierdoor is de card-spec puur declaratief en hoeft de AI-compositie er niets
van te weten.

**Nieuw component `components/daishboard/cards/module-guide-card.tsx`:**

- Rendert als een `BriefingCard` met de module-accent (kern/wil/horizon)
- Header: titel + kruisje (X) om de hele kaart te dismisssen
- Body: lijst van stappen met klikbare vinkjes (leeg rondje naar groen vinkje)
  en optionele href-link (stap is klikbaar als hij nog niet afgevinkt is)
- Stappen die afgevinkt zijn krijgen doorgestreepte tekst + groen vinkje
  (zelfde styling als bestaande `ChecklistCard`, regels 19-29)
- Wanneer alle stappen zijn afgevinkt: kaart toont kort "Alles afgerond!"
  en verdwijnt na 2 seconden met een fade-out animatie
- Hergebruik het bestaande `BriefingCard`-component als shell

**Persistentie — `profiles.module_guide_state` (JSONB):**

Nieuwe migration voegt toe:
```sql
ALTER TABLE profiles ADD COLUMN module_guide_state jsonb DEFAULT '{}';
```

Structuur:
```json
{
  "budgetteren": { "completedSteps": ["stap_1", "stap_3"], "dismissedAt": null },
  "inzicht_acties": { "completedSteps": [], "dismissedAt": "2026-04-13T..." }
}
```

- Vinkje klikt -> PATCH-request naar `PUT /api/module-guide/progress`
- Kruisje klikt -> zet `dismissedAt` voor die module
- Frontend hook `useModuleGuideState()` leest en muteert met optimistic update

**Injectie in het DAIshboard:**

De module-guide-kaarten worden **voor** de AI-kaarten geplaatst in de
`BriefingCardGrid` (`components/daishboard/briefing-card-grid.tsx:60`). Ze
worden client-side gegenereerd op basis van:
1. `profiles.active_modules` (welke modules zijn actief)
2. `profiles.module_guide_state` (welke stappen zijn klaar / welke kaarten
   zijn gedismisst)
3. De stappencatalogus uit `app_settings` (of defaults)

Kaarten worden **niet** getoond als:
- De module niet actief is
- `dismissedAt` is gezet voor die module
- Alle stappen zijn afgevinkt

**Welkomstscherm na onboarding:**

Pas de bestaande `OnboardingSuccess`-component
(`components/onboarding/onboarding-success.tsx`) aan met een uitleg:

> "Je dashboard staat klaar! Per actieve module vind je een kaart met je
> eerste stappen. Vink ze af terwijl je de app ontdekt, of sluit een kaart
> als je er klaar mee bent."

De CTA-knop stuurt naar de first-win-pagina (via `getFirstWinPath(intent)`).

**Stappen-catalogus — bewerkbaar via beheer:**

De stappen per module worden **niet** hardcoded maar opgeslagen in
`app_settings` (key `'module_guide_steps'`). Het bestand
`lib/briefing/module-guide-steps.ts` bevat:
- Een `ModuleGuideStep`-type: `{ key: string; label: string; href?: string }`
- Een `DEFAULT_MODULE_GUIDE_STEPS: Record<ModuleId, ModuleGuideStep[]>` met
  de onderstaande default-stappen als fallback wanneer er nog geen DB-config is
- Een `getModuleGuideSteps()` functie die eerst `app_settings` leest en
  fallbackt op de defaults

### 6. Voorgestelde stappen per module (defaults, bewerkbaar via beheer)

**Budgetteren** (kern):

| # | Stap-key | Label | href |
|---|---|---|---|
| 1 | `budget_bekijk` | Bekijk je budgetoverzicht | `/core/budgets` |
| 2 | `budget_nibud` | Vergelijk met de Nibud-benchmark | `/core/budgets` |
| 3 | `budget_spaarquote` | Controleer je spaarquote | `/core` |
| 4 | `budget_noodfonds` | Bekijk je noodfonds-status | `/core` |

**Vermogensregistratie** (kern):

| # | Stap-key | Label | href |
|---|---|---|---|
| 1 | `vermogen_netto` | Bekijk je netto vermogen | `/core` |
| 2 | `vermogen_bezittingen` | Controleer of al je bezittingen er staan | `/core/assets` |
| 3 | `vermogen_box3` | Open je Box 3 belastingoverzicht | `/core/tax` |
| 4 | `vermogen_allocatie` | Bekijk je vermogensallocatie | `/core` |

**Inzicht & Acties** (wil):

| # | Stap-key | Label | href |
|---|---|---|---|
| 1 | `inzicht_voorstellen` | Bekijk je eerste voorstellen | `/will` |
| 2 | `inzicht_detail` | Open een voorstel en lees de details | `/will` |
| 3 | `inzicht_besluit` | Neem een besluit: doen, later, of overslaan | `/will` |
| 4 | `inzicht_score` | Bekijk je financiele gezondheidsscore | `/will` |

**Toekomstplannen** (horizon):

| # | Stap-key | Label | href |
|---|---|---|---|
| 1 | `horizon_fire` | Bekijk je FIRE-prognose | `/horizon` |
| 2 | `horizon_params` | Stel je pensioen-parameters in | `/identity/parameters` |
| 3 | `horizon_mijlpalen` | Bekijk je vrijheidsmijlpalen | `/horizon` |
| 4 | `horizon_scenario` | Speel met een toekomstscenario | `/horizon` |

**Nieuws** (cross):

| # | Stap-key | Label | href |
|---|---|---|---|
| 1 | `nieuws_blader` | Blader door het financieel nieuws | `/nieuws` |
| 2 | `nieuws_personaliseer` | Like of dislike een artikel om je feed te personaliseren | `/nieuws` |

**Aandelenregistratie** wordt overgeslagen (in-development).

### 7. Beheer-scherm voor module-guide-stappen

Nieuwe pagina op `/beheer/module-guide/page.tsx`, volgend op het bestaande
patroon van `/beheer/briefing/page.tsx`:

**Functionaliteit:**
- Lijst van alle modules (6 stuks) als collapsible secties
- Per module: geordende lijst van stappen met:
  - Up/down-pijlen voor herordenen
  - Inline edit van label-tekst
  - href-veld (optioneel, link naar app-pagina)
  - Delete-knop per stap
  - "Stap toevoegen"-knop onderaan
- Enable/disable-toggle per module
- "Opslaan"-knop -> `PUT /api/module-guide/steps` schrijft naar
  `app_settings` key `'module_guide_steps'`
- "Reset naar defaults"-knop -> verwijdert de DB-config zodat de hardcoded
  defaults terugkomen

**Data-flow:**
1. Beheer-pagina laadt stappen via `GET /api/module-guide/steps`
2. Endpoint leest `app_settings` key `'module_guide_steps'`; als die niet
   bestaat, returnt het de defaults uit `DEFAULT_MODULE_GUIDE_STEPS`
3. Na opslaan worden wijzigingen direct actief voor alle gebruikers
4. Per-user voortgang (`profiles.module_guide_state`) blijft onafhankelijk

### 8. Module-toggles blijven uit onboarding

De module-toggle UI bestaat al onder `/identity/instellingen`
(`components/app/module-activation-modal.tsx` + `lib/hooks/use-module-toggle.ts`).
Wijziging: **verwijder alle module-toggle-UI uit de onboarding-flow volledig**.
Voor dit experiment is er geen "liever zelf modules kiezen"-uitweg in
onboarding. De succes-stap noemt kort dat je modules later kunt aanpassen in
Instellingen.

## Te wijzigen bestanden

| Bestand | Wijziging |
|---|---|
| `components/onboarding/onboarding-intent.tsx` | NIEUW — 5 intentie-kaarten + module aan/uit-indicatie |
| `components/onboarding/onboarding-persona.tsx` | Verwijderen na migratie |
| `components/onboarding/onboarding-intro.tsx` | Module-cards vervangen |
| `components/onboarding/onboarding-success.tsx` | Uitleg over module-guide-kaarten |
| `app/(onboarding)/onboarding/page.tsx` | Step-rename, state-rename, healing-migratie, AI-call |
| `lib/module-registry.ts` | `IntentId` + `INTENT_MODULE_PRESETS` + `getFirstWinPath()` |
| `lib/briefing/types.ts` | Nieuw `ModuleGuideCardSpec` type |
| `lib/briefing/module-guide-steps.ts` | NIEUW — defaults + DB-lookup |
| `components/daishboard/cards/module-guide-card.tsx` | NIEUW — interactieve checklist |
| `components/daishboard/briefing-card-grid.tsx` | Render-case voor `moduleGuide` |
| `lib/hooks/use-module-guide-state.ts` | NIEUW — hook voor guide-state |
| `app/api/module-guide/progress/route.ts` | NIEUW — PUT voor user voortgang |
| `app/api/module-guide/steps/route.ts` | NIEUW — GET/PUT voor stappen-config |
| `app/(app)/beheer/module-guide/page.tsx` | NIEUW — beheer-scherm |
| `supabase/migrations/` | NIEUW — `profiles.module_guide_state jsonb` |
| `lib/regression-tests/suites/module-nudges.ts` | Tests bijwerken |

## Hergebruikt (niet dupliceren)

- `PERSONA_MODULE_PRESETS` (`module-registry.ts:108-113`) — blijft als legacy
- `validateModules()` (`module-registry.ts:206-236`) — onveranderd
- `computeStepOrder()` (`page.tsx:152-167`) — werkt al op moduleset
- `_resolveRestoredStep()` (`page.tsx:83-132`) — alleen mapping toevoegen
- `module-activation-modal.tsx` & `use-module-toggle.ts` — power-user pad
- `getHomePath()` — voor terugkerende sessies
- `POST /api/ai/recommendations/initial` — bestaande generator
- `BriefingCard` (`components/daishboard/briefing-card.tsx`) — shell
- `ChecklistCard` styling — visueel patroon hergebruiken
- `BriefingCardGrid` (`briefing-card-grid.tsx:60`) — guide-kaarten bovenaan
- `EnableToggle` (`briefing/page.tsx:67-80`) — voor beheer-pagina

## Verificatie

End-to-end testflow (handmatig in browser):
1. Maak een nieuwe testaccount aan en open `/onboarding`
2. Welkomstscherm: geen Kern/Wil/Horizon cards meer
3. Doorloop intro -> identity -> **intent**. Verifieer:
   - Alleen 5 intentie-kaarten, geen module-toggle-lijst
   - Na selectie: module aan/uit-indicatie verschijnt
4. **Coaching-pad**: kies "Ik wil gecoacht worden" ->
   - `bezittingen` + `budgets` als vervolgstappen
   - Saving-stap roept `/api/ai/recommendations/initial` aan
   - Success-scherm toont uitleg over de briefing-kaarten
   - Je belandt op `/will` (first-win)
   - DAIshboard toont module-guide-kaarten bovenaan AI-kaarten
   - Elke kaart heeft stappen met lege vinkjes + klikbare links
5. **Vinkjes testen**:
   - Klik stap -> vinkje wordt groen, tekst doorgestreept
   - Refresh -> vinkje is er nog (DB-persistentie)
   - Vink alle stappen af -> kaart verdwijnt
6. **Dismiss testen**:
   - Klik kruisje -> kaart verdwijnt direct
   - Refresh -> kaart blijft weg
7. **Beheer testen**:
   - Open `/beheer/module-guide/`
   - Wijzig een stap-label, voeg een stap toe, verwijder een stap
   - Opslaan -> wijzigingen direct zichtbaar voor gebruikers
   - Reset naar defaults -> oorspronkelijke stappen terug
8. **Overige paden**: grip -> `/core/budgets`, toekomst -> `/horizon`, etc.
9. Self-healing: `lastStep: 'modules'` in localStorage -> landt op `'intent'`

Geautomatiseerde checks:
- `npm run lint` & `npm run typecheck`
- Regression suite `lib/regression-tests/suites/module-nudges.ts`
- Bestaande onboarding self-healing tests
- Unit-test voor `getFirstWinPath()` (een case per intent)

## Besliste keuzes

1. **Power-user pad**: volledig uit onboarding verwijderd voor dit experiment.
2. **Begeleiding via briefing-kaarten**: module-guide-kaarten in de briefing.
   Een kaart per actieve module met vinkbare stappen + X-dismiss.
3. **Intro-framing**: Kern/Wil/Horizon module-cards weg van welkomstscherm.
4. **Vijfde intentie**: "Ik wil gecoacht worden" met coaching-preset.
5. **Module aan/uit-indicatie**: na intentie-selectie, puur informatief.
6. **Welkomstscherm**: success-stap legt de briefing-kaarten uit.
7. **Beheer-scherm**: stappen per module bewerkbaar via `/beheer/module-guide/`.

## Fasering (aanbevolen build-volgorde)

1. **Plukje 1 — Intentie-stap + first-win:** `IntentId`, `INTENT_MODULE_PRESETS`,
   `getFirstWinPath()`, `onboarding-intent.tsx` (met module-indicatie),
   intro-reframe, step-rename + healing-migratie, success-scherm update.
   **Resultaat:** intentie-vraag met module-indicatie, first-win routing.

2. **Plukje 2 — Module-guide-kaarten + beheer:** DB-migratie, types,
   defaults + DB-lookup, component, hook, API-endpoints, injectie in
   briefing-card-grid, beheer-pagina.
   **Resultaat:** interactieve vinkbare kaarten, bewerkbaar via beheer.

3. **Plukje 3 — Pre-generatie voorstellen:** AI-call in saving-stap voor
   coaching/alles-intentie.
   **Resultaat:** volledige coaching first-win met verse voorstellen.

## Nog te bepalen

- Exacte copy van de 5 intentie-kaarten -> UX-review bij bouw plukje 1
- **Module-stappen**: eerste voorstel staat in paragraaf 6 hierboven.
  Gebruiker geeft aanvullingen voordat dit definitief wordt.
