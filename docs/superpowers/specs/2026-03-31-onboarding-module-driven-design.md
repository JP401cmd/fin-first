# Onboarding Module-Driven Redesign

**Datum:** 2026-03-31
**Status:** Ontwerp
**Doel:** De onboarding dynamisch maken op basis van de modulekeuzes van de gebruiker. De huidige flow vraagt eerst om budgetteringsmodus en toont daarna modules — dat moet omgekeerd: eerst modules kiezen, dan alleen de relevante stappen tonen.

---

## Context

De huidige onboarding heeft een vaste flow van 8 stappen waarin budgetteringsmodus, FIRE-parameters en module-selectie door elkaar lopen. Problemen:
- Budgetteringsmodus wordt op de identity-stap gevraagd, maar is eigenlijk een module-keuze
- FIRE-parameters staan op de identity-stap — te veel informatie in één scherm
- Modules zijn alleen vrij aanpasbaar bij "custom" persona, niet bij de 4 presets
- Er is geen pad voor "alleen nieuws"-gebruikers
- De voortgangsindicator is statisch en past zich niet aan op de gekozen modules

## Nieuwe Flow Overzicht

```
Pagina 1: Intro           (altijd)
Pagina 2: Jouw Gegevens   (altijd)
Pagina 3: Modules          (altijd — scharnierpunt)
───── dynamisch op basis van gekozen modules ─────
Pagina 4: Bezittingen & Schulden    (als vermogensregistratie actief)
Pagina 5: Budgetteren               (als budgetteren actief)
Pagina 6: Horizon                   (als toekomstplannen actief)
Pagina 7: Voorkeuren                (als inzicht_acties actief)
Pagina 8: Alleen Nieuws             (als ALLEEN nieuws gekozen)
───── altijd ─────
Pagina N-1: Opslaan
Pagina N: Klaar
```

---

## Pagina 1: Intro (ongewijzigd)

**Component:** `components/onboarding/onboarding-intro.tsx`
**Wijzigingen:** Geen.

---

## Pagina 2: Jouw Gegevens (vereenvoudigd)

**Component:** `components/onboarding/onboarding-identity.tsx`

### Velden (alle zichtbaar, altijd)

| Veld | Verplicht | Validatie |
|------|-----------|-----------|
| Volledige naam | Ja | min 2 tekens |
| Geboortedatum | Ja | leeftijd 18-100 |
| Huishoudtype | Ja | solo / samen / gezin |
| Aantal kinderen | Ja (als gezin) | 1-20 |
| Geschat netto maandinkomen | Ja | > 0 |
| Geschatte maanduitgaven | Nee | optioneel, altijd getoond |

### Verwijderd van deze pagina
- `budgettering_mode` toggle → wordt afgeleid uit modulekeuze op pagina 3
- `expected_return`, `inflation_rate` → blijven op defaults (0.07 / 0.02), aanpasbaar in `/identity/instellingen`
- `retirement_expense_method`, `retirement_custom_amount` → verplaatst naar horizon-stap (pagina 6)
- `fire_end_strategy`, `fire_legacy_amount`, `fire_end_age` → verplaatst naar horizon-stap (pagina 6)
- `temporal_balance` → verplaatst naar horizon-stap (pagina 6)

### Impact op `IdentityData` type
```typescript
// NIEUW — vereenvoudigd
interface IdentityData {
  full_name: string
  date_of_birth: string
  household_type: 'solo' | 'samen' | 'gezin'
  number_of_children: number
  net_monthly_income: string
  estimated_monthly_expenses: string
}
```

---

## Pagina 3: Modules (herontwerp)

**Component:** `components/onboarding/onboarding-modules.tsx` (hernoemd van `onboarding-persona.tsx`)

### Ontwerp

#### Bovenaan: 4 Persona Presets
Vier kaarten in een 2x2 grid (1 kolom mobiel):

| Persona | Modules die geactiveerd worden |
|---------|-------------------------------|
| De Budgetteerder | budgetteren |
| De Vermogensverdeler | vermogensregistratie, inzicht_acties |
| De Pensioenplanner | vermogensregistratie, toekomstplannen, inzicht_acties |
| De FIRE Fighter | alle 6 modules |

Persona-kaarten zijn **shortcuts** — ze pre-selecteren modules, maar de gebruiker kan altijd handmatig aanpassen. Er is geen "custom" persona meer. Een persona selecteren highlightet de kaart, maar het is niet verplicht om een persona te kiezen. De gebruiker mag ook direct modules togglen.

#### Daaronder: 6 Module Kaarten (altijd aanpasbaar)

Elke module wordt getoond als een kaart met:
- Toggle (aan/uit)
- Naam + korte beschrijving (uit `MODULE_CATALOG`)
- Afhankelijkheidsindicatie (bijv. "Vereist Vermogensregistratie")
- Als een module dependency-problemen heeft, toon uitleg maar blokkeer niet — disable de toggle

Wanneer een persona wordt geselecteerd, worden de module-toggles bijgewerkt. Wanneer de gebruiker daarna handmatig een module wijzigt, wordt de persona-highlight verwijderd (de selectie is nu "aangepast").

#### Subtiele stap-indicator
Onder de module-selectie een subtiele tekst die aangeeft hoeveel instapstappen er volgen:

> "Na deze stap volgen nog **3 instapstappen** op basis van jouw keuze."

Dit getal update dynamisch bij het togglen van modules. Bereken het als:
- +1 als `vermogensregistratie` actief (bezittingen)
- +1 als `budgetteren` actief (budgetteren)
- +1 als `toekomstplannen` actief (horizon)
- +1 als `inzicht_acties` actief (voorkeuren)
- Speciaal: als ALLEEN `nieuws` → "Na deze stap volgt nog **1 instapstap**."

#### Validatie
- **Nieuw:** minstens 1 module moet gekozen worden (niet per se budgetteren of vermogensregistratie)
- Dependency-validatie blijft: aandelenregistratie vereist vermogensregistratie, etc.
- Alleen `nieuws` is een geldige selectie

### Module-registry aanpassing (`lib/module-registry.ts`)

Wijzig `validateModules()`:
- **Verwijder** Rule 1: "Kies minstens Budgetteren of Vermogensregistratie als basismodule"
- **Voeg toe:** als `modules.length === 0` → error "Kies minstens één module"
- Behoud Rules 2-4 (dependency checks)

Wijzig `getHomePath()`:
- Als alleen `nieuws` actief → return `'/berichten'`
- Anders: bestaande logica

---

## Pagina 4: Bezittingen & Schulden (conditioneel)

**Conditie:** `vermogensregistratie` is actief
**Component:** `components/onboarding/onboarding-extras.tsx`

### Wijzigingen
- Verwijder `hideBudgets` en `budgetteringMode` props
- Handhaving wordt gedreven door de geselecteerde modules (uit parent state), niet door strings

### Afdwingregels

1. **Als `budgetteren` ook actief is:** minstens 1 bankrekening met `has_budget_tracking = true`. Bestaande modal-logica behouden (auto-creatie van "Lopende rekening" aanbieden).

2. **Als `aandelenregistratie` ook actief is:** minstens 1 asset van type `investment` met `has_holdings_tracking = true`. Toon een vergelijkbare modal die aanbiedt een "Beleggingsrekening" aan te maken met holdings-tracking ingeschakeld.

3. **Edge case: `budgetteren` actief maar `vermogensregistratie` NIET:**
   Dit kan niet voorkomen via de dependency-regels tenzij de gebruiker alleen `budgetteren` kiest. In dat geval wordt deze pagina tóch getoond (want er moet een cashrekening met budget-tracking bestaan). Alternatief: de save-endpoint maakt automatisch een default cashrekening aan. **Keuze: toon de bezittingen-stap ook als alleen `budgetteren` actief is, zodat de gebruiker bewust een rekening aanmaakt.**

### Bug-verificatie: alle 13 asset-types
Controleer dat de save-endpoint correct omgaat met alle types uit `lib/asset-data.ts`:
cash, savings, investment, retirement, eigen_huis, real_estate, crypto, vehicle, physical, deelneming, levensverzekering, vordering, other.

---

## Pagina 5: Budgetteren (conditioneel)

**Conditie:** `budgetteren` is actief
**Component:** `components/onboarding/onboarding-budgets.tsx`

### Wijzigingen
- **Nu optioneel:** de gebruiker hoeft geen template te kiezen. Voeg een "Overslaan" optie toe naast de bestaande keuzes (Nee niet nu / Ja met template / Ja handmatig). Het verschil: "Overslaan" gaat door zonder budget-data, terwijl het bestaande "Nee niet nu" al deze functie had. Verifieer of de huidige "Nee niet nu" al correct werkt als skip.
- Verwijder `StepProgress` referenties naar oude stap-namen → gebruik nieuwe fase-indicator

---

## Pagina 6: Horizon (conditioneel, NIEUW)

**Conditie:** `toekomstplannen` is actief
**Component:** `components/onboarding/onboarding-horizon.tsx` (nieuw bestand)

### Secties

#### A. Eindstrategie
Drie keuzekaarten (zelfde stijl als persona-kaarten):

| Strategie | Uitleg |
|-----------|--------|
| **Vermogen opeten** (`deplete`) | "Je vermogen raakt op bij een gekozen leeftijd. Geschikt als je je geld wilt gebruiken." |
| **Nalatenschap** (`legacy`) | "Je houdt een doelbedrag over om na te laten. Geschikt als je vermogen wilt doorgeven." |
| **Eeuwigdurend** (`perpetual`) | "Je vermogen blijft behouden en groeit mee met inflatie. Maximale zekerheid." |

Conditionele velden:
- Bij `deplete`: leeftijd-input (60-120, default 90)
- Bij `legacy`: bedrag-input + leeftijd-input

Default: `deplete` met eindleeftijd 90.

#### B. Pensioenuitgaven-methode
Drie keuzekaarten met duidelijke toelichting:

| Methode | Uitleg |
|---------|--------|
| **Essentiële budgetten** (`essential_budgets`) | "Uitgaven na pensioen zijn gebaseerd op je budgettemplates (huur, boodschappen, zorg)." |
| **Eigen bedrag** (`custom_amount`) | "Je kiest zelf een maandbedrag dat je na pensioen wilt besteden." |
| **Huidig inkomen** (`current_income`) | "Je huidige netto inkomen wordt als maatstaf gebruikt." |

Conditioneel veld bij `custom_amount`: maandbedrag-input.

> **Let op:** als `budgetteren` niet actief is, toon `essential_budgets` als disabled met uitleg "Activeer de budgetteren-module om deze optie te gebruiken."

#### C. Levensgebeurtenissen
Vooringevulde suggesties:
- **AOW** — berekende leeftijd op basis van geboortedatum (lookup uit `aow_leeftijd` tabel, fallback `NL_AOW_AGE`)
- **Pensioen** — suggestie op basis van AOW-leeftijd minus 2 jaar (aanpasbaar)

Toon als vooringevulde kaarten die de gebruiker kan accepteren, aanpassen of verwijderen. Optie om extra gebeurtenissen toe te voegen (simplified life event form).

Elk event toont: naam, type, doelleeftijd, geschatte maandelijkse impact.

#### D. Temporaal Evenwicht
Dropdown (niet slider) met uitleg per niveau. Data uit `lib/identity-constants.ts`:

| Niveau | Naam | Korte uitleg |
|--------|------|-------------|
| 1 | De Levensgenieter | Comfort boven snelheid. FIRE is een bonus, geen obsessie. |
| 2 | De Reiziger | Ervaringen eerst. Spaar wat overblijft. |
| 3 | De Architect | Bewuste optimalisatie. Balans tussen nu en later. |
| 4 | De Stoïcijn | Discipline is vrijheid. Snelheid boven comfort. |
| 5 | De Essentialist | Pure focus. Alles ten dienste van het doel. |

Default: 3 (De Architect).

### HorizonData type
```typescript
interface HorizonData {
  fire_end_strategy: 'perpetual' | 'legacy' | 'deplete'
  fire_end_age: number              // 60-120, default 90
  fire_legacy_amount: string        // alleen bij legacy
  retirement_expense_method: 'essential_budgets' | 'custom_amount' | 'current_income'
  retirement_custom_amount: string  // alleen bij custom_amount
  temporal_balance: number          // 1-5, default 3
  life_events: LifeEventEntry[]     // vooringevuld met AOW/pensioen
}

interface LifeEventEntry {
  name: string
  event_type: string
  target_age: number
  monthly_income_change?: number
  monthly_cost_change?: number
  one_time_cost?: number
  duration_months?: number
  is_active: boolean
}
```

---

## Pagina 7: Voorkeuren (conditioneel)

**Conditie:** `inzicht_acties` is actief
**Component:** `components/onboarding/onboarding-preferences.tsx`

### Wijzigingen
- Verwijder `hideBudgetFocus` prop
- Filter focus-opties dynamisch op basis van actieve modules:
  - `budget_cashflow` → alleen als `budgetteren` actief
  - `assets_investments` → alleen als `vermogensregistratie` actief
  - `fire_freedom` → alleen als `toekomstplannen` actief
  - `goals_actions` → altijd (want `inzicht_acties` is actief als we hier zijn)
  - `overview` → altijd

Als `inzicht_acties` NIET actief is: deze stap wordt overgeslagen en het dashboard krijgt standaard widget-voorkeuren.

---

## Pagina 8: Alleen Nieuws (conditioneel, NIEUW)

**Conditie:** alleen `nieuws` als module geselecteerd (geen andere modules)
**Component:** `components/onboarding/onboarding-nieuws-only.tsx` (nieuw bestand)

### Ontwerp
- Introductietekst: "Je hebt gekozen voor gepersonaliseerd financieel nieuws. Om relevante berichten te vinden, helpt het als we iets weten over je financiële situatie."
- **Vrij tekstveld** (textarea, max ~500 tekens) waar de gebruiker zijn financiële situatie beschrijft
- Tips als helptekst (uitklapbaar of altijd zichtbaar):
  - "Beschrijf je woonsituatie (huur/koop)"
  - "Noem je belangrijkste spaardoelen"
  - "Heb je beleggingen of schulden?"
  - "Wat is je levensfase? (starter, gezin, bijna pensioen)"
- Overslaan-optie (tekstveld mag leeg zijn)

### Opslag
- Nieuwe kolom `profiles.news_description` (TEXT)
- Wordt gebruikt door de news-personalisatie AI context als aanvulling op het financiële profiel

### Post-onboarding app-ervaring
- Navigatie gestript: geen kern/wil/horizon tabs
- Alleen zichtbaar: Trifinity Post (berichten) + Instellingen
- Instellingen bevatten de mogelijkheid om extra modules te activeren
- `getHomePath(['nieuws'])` → `'/berichten'`

---

## Voortgangsindicator (herontwerp)

**Component:** `components/onboarding/step-progress.tsx`

### Nieuwe opzet: 4 vaste fases

| Fase | Label | Actief bij |
|------|-------|-----------|
| 1 | Gegevens | Pagina 2 |
| 2 | Modules | Pagina 3 |
| 3 | Instellen | Pagina 4-8 (dynamisch) |
| 4 | Klaar | Saving + Success |

### Props
```typescript
interface StepProgressProps {
  currentPhase: 1 | 2 | 3 | 4
  subStep?: { current: number; total: number }  // voor fase 3
}
```

### Visueel
- 4 fase-markers (cirkels) met verbindingslijn
- Fase-labels onder cirkels (verborgen op mobiel)
- Bij fase 3: subtekst "Stap X van Y" onder de fase-indicator
- Voltooide fases: gevuld met vinkje
- Actieve fase: omlijnd met nummer
- Toekomstige fases: licht omlijnd

---

## State Machine & Orchestrator

**Component:** `app/(onboarding)/onboarding/page.tsx`

### Nieuw Step type
```typescript
type Step =
  | 'intro'
  | 'identity'
  | 'modules'        // was 'persona'
  | 'bezittingen'    // was 'extras', conditioneel
  | 'budgets'        // conditioneel
  | 'horizon'        // NIEUW, conditioneel
  | 'preferences'    // conditioneel
  | 'nieuws_only'    // NIEUW, conditioneel
  | 'saving'
  | 'success'
```

### Dynamische step-berekening
```typescript
function computeStepOrder(selectedModules: ModuleId[]): Step[] {
  const steps: Step[] = ['intro', 'identity', 'modules']

  const has = (m: ModuleId) => selectedModules.includes(m)
  const isNewsOnly = selectedModules.length === 1 && has('nieuws')

  if (isNewsOnly) {
    steps.push('nieuws_only')
  } else {
    // Bezittingen tonen als vermogensregistratie OF budgetteren actief
    // (budgetteren vereist een cashrekening met budget-tracking)
    if (has('vermogensregistratie') || has('budgetteren')) {
      steps.push('bezittingen')
    }
    if (has('budgetteren')) {
      steps.push('budgets')
    }
    if (has('toekomstplannen')) {
      steps.push('horizon')
    }
    if (has('inzicht_acties')) {
      steps.push('preferences')
    }
  }

  steps.push('saving', 'success')
  return steps
}
```

### State aanpassingen
```typescript
interface State {
  step: Step
  direction: Direction
  identity: IdentityData           // vereenvoudigd
  persona: PersonaId | null        // geen 'custom' meer
  selectedModules: ModuleId[]
  horizon: HorizonData             // NIEUW
  newsDescription: string          // NIEUW
  budgetAmounts: Record<string, number>
  bankAccounts: BankAccountEntry[]
  assets: AssetEntry[]
  debts: DebtEntry[]
  preferences: PreferencesData
}
```

### Reducer aanpassingen
- `SET_PERSONA`: preload modules, maar sta altijd handmatige wijziging toe
- `TOGGLE_MODULE`: werkt nu altijd, niet alleen bij `persona === 'custom'`. Als de user modules handmatig wijzigt, zet `persona` op `null` (niet meer gemarkeerd)
- **Nieuw:** `SET_HORIZON` action voor horizon data
- **Nieuw:** `SET_NEWS_DESCRIPTION` action
- Verwijder alle `budgettering_mode` logica uit de reducer

### Generieke navigatie
Vervang hardcoded `dispatch({ type: 'SET_STEP', step: 'extras' })` door:
```typescript
const goToNext = () => {
  const order = computeStepOrder(state.selectedModules)
  const idx = order.indexOf(state.step)
  if (idx < order.length - 1) dispatch({ type: 'SET_STEP', step: order[idx + 1] })
}
const goToBack = () => {
  const order = computeStepOrder(state.selectedModules)
  const idx = order.indexOf(state.step)
  if (idx > 0) dispatch({ type: 'SET_STEP', step: order[idx - 1] })
}
```

### localStorage migratie
Bij `loadFromLocalStorage()`: detecteer oud formaat (aanwezigheid van `identity.budgettering_mode`), map naar nieuw formaat, extraheer FIRE-params naar `horizon` indien aanwezig.

---

## Save Endpoint Aanpassingen

**Bestand:** `app/api/onboarding/save-own-data/route.ts`

### Schema-wijzigingen
- `identity`: alleen de 6 basis-velden
- **Nieuw:** `horizonData` optioneel object (fire strategy, retirement method, temporal balance, life events)
- **Nieuw:** `newsDescription` optioneel string
- `budgetteringMode` → afgeleid van `activeModules.includes('budgetteren')`

### Opslaglogica
- FIRE-params uit `horizonData` → `profiles` tabel (bestaande kolommen)
- Life events uit `horizonData` → `life_events` tabel (naast de bestaande AOW auto-creatie)
- `newsDescription` → `profiles.news_description` (nieuwe kolom)
- Als horizon-data ontbreekt: gebruik defaults (deplete/90/current_income/3)
- Conditionele data-opslag: sla geen bezittingen/budgetten op als de module niet actief is

### Nieuwe migratie
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS news_description TEXT;
```

---

## Navigatie-stripping voor Alleen-Nieuws

### Betrokken bestanden
- `components/app/app-header.tsx` — desktop nav verbergt al tabs als `navItems.length <= 1`. Verificatie nodig dat profile-dropdown nog steeds Instellingen toont.
- `components/app/bottom-nav.tsx` — verbergt al bij `visibleTabs.length <= 1`. Mobiel: verificatie dat hamburger-menu of header-link naar Instellingen beschikbaar is.
- `lib/module-registry.ts` — `getActiveNavModules(['nieuws'])` retourneert al `[]` (nieuws heeft geen navModule). `getHomePath` update nodig.
- `app/(app)/layout.tsx` — success redirect moet naar `/berichten` voor nieuws-only users.

### Route-bescherming
Pagina's zoals `/core`, `/will`, `/horizon` moeten voor nieuws-only users een redirect naar `/berichten` tonen of een "activeer module" melding. Controleer of de bestaande `FeatureAccessProvider` dit al afdwingt.

---

## Gids Aanpassingen

**Bestand:** `app/(app)/identity/gids/page.tsx`

### Te controleren
- De gids verwijst naar onboarding-stappen ("Stap 1: Weet waar je staat", "Stap 2: Begrijp je patronen"). Deze nummering kan nu verwarrend zijn omdat de volgorde dynamisch is.
- **Actie:** Verwijder referenties naar onboarding-stappen uit de gids. De gids moet op zichzelf staan, los van de onboarding-volgorde.
- Controleer of gids-secties al module-aware zijn (via `useModuleAccess()`). Zo niet: verberg secties die niet relevant zijn voor de actieve modules.
- **Geen dubbele content:** de horizon-uitleg in de gids en de onboarding-horizon-stap moeten consistent zijn maar niet identiek. De gids is een naslagwerk, de onboarding is een instelpagina.

---

## Regressietests Aanpassingen

**Bestanden:** `lib/regression-tests/suites/onboarding-*.ts` (11 bestanden)

### Aan te passen tests

| Testsuite | Aanpassing |
|-----------|-----------|
| `onboarding-flow.ts` | Vervang `FULL_STEP_ORDER` met `computeStepOrder()`. Test elke persona-preset: correct stap-sequentie. Test nieuws-only pad. |
| `onboarding-identity.ts` | Verwijder tests voor FIRE-params en budgetteringsmodus. Test vereenvoudigd veldset. |
| `onboarding-persona-seed.ts` | Hernoem naar modules. Test dat persona-presets correct modules activeren. Test handmatige module-toggle. |
| `onboarding-extras.ts` | Verwijder `budgetteringMode` referenties. Voeg enforcement-tests toe: budget-tracking account vereist, holdings-tracking asset vereist. |
| `onboarding-budgets.ts` | Test optioneel overslaan (geen template vereist). |
| `onboarding-preferences.ts` | Test conditioneel tonen (alleen bij inzicht_acties). Test focus-filtering op basis van modules. |
| `onboarding-save.ts` | Update payload-structuur. Test horizon-data opslag. Test nieuws-only opslag. |
| `onboarding-api-flow.ts` | Update API payload verwachtingen. |
| `onboarding-reset.ts` | Update voor nieuwe data-structuur. |
| `onboarding-intro.ts` | Minimale wijzigingen. |
| `onboarding-ui.ts` | Update voor fase-indicator i.p.v. stap-cirkels. |

### Nieuwe tests toe te voegen
- **Nieuws-only flow:** modules=['nieuws'], vrij tekstveld, redirect naar /berichten
- **Dynamische stap-berekening:** `computeStepOrder` met alle mogelijke module-combinaties
- **Horizon-stap validatie:** eindstrategie + methode + levensgebeurtenissen
- **Asset-type bug test:** alle 13 asset-types door de save heen
- **Module-wissel terug:** modules kiezen → verder → terug → modules wijzigen → verder → juiste stappen

---

## Persona Seed Data

**Bestanden:** `lib/test-personas.ts`, `lib/seed-persona.ts`

### Te controleren
- Persona-definities gebruiken eigen `PersonaProfile` type dat FIRE-params direct op het profiel zet (niet genest in identity). Dit is compatibel met de wijziging.
- Seed-logica schrijft direct naar de database, onafhankelijk van de onboarding data-structuur. Geen structurele wijziging nodig.
- **Wel controleren:** worden `active_modules` correct gezet per persona? Ja, `seed-persona.ts` zet `active_modules` op basis van persona-keuze. Geen wijziging nodig.

---

## Mobiel-eerst Ontwerp

Alle pagina's volgen de bestaande patronen:
- **Sticky bottom navigation:** vaste balk onderaan met Terug/Verder knoppen, `pb-[env(safe-area-inset-bottom)]`
- **Eén-kolom layout op mobiel:** grid wordt `grid-cols-1` op `< sm`
- **Touch targets:** minimaal 44px hoogte op alle interactieve elementen
- **Fase-indicator:** labels verborgen op mobiel, alleen cirkels + progressbar zichtbaar
- **Scrollbaar:** content past zich aan, geen vaste hoogte containers

---

## Samenvatting Bestandswijzigingen

### Nieuwe bestanden
| Bestand | Doel |
|---------|------|
| `components/onboarding/onboarding-horizon.tsx` | Horizon-instelling (eindstrategie, pensioen, levensgebeurtenissen, temporaal evenwicht) |
| `components/onboarding/onboarding-nieuws-only.tsx` | Vrij tekstveld voor nieuws-only gebruikers |
| `supabase/migrations/YYYYMMDD_add_news_description.sql` | `profiles.news_description` kolom |

### Te wijzigen bestanden
| Bestand | Wijziging |
|---------|----------|
| `app/(onboarding)/onboarding/page.tsx` | State machine, step types, dynamische navigatie, localStorage migratie |
| `components/onboarding/onboarding-identity.tsx` | Vereenvoudiging: strip FIRE-params en budgetteringsmodus |
| `components/onboarding/onboarding-persona.tsx` | Herontwerp naar modules-pagina: altijd togglebaar, geen 'custom', stap-indicator |
| `components/onboarding/onboarding-extras.tsx` | Module-driven enforcement (budget-tracking, holdings-tracking) |
| `components/onboarding/onboarding-budgets.tsx` | Optioneel overslaan toevoegen |
| `components/onboarding/onboarding-preferences.tsx` | Conditioneel tonen, dynamische focus-filtering |
| `components/onboarding/onboarding-success.tsx` | Dynamische content op basis van modules, redirect-pad |
| `components/onboarding/step-progress.tsx` | Herontwerp naar 4 vaste fases met sub-stappen |
| `lib/module-registry.ts` | Relaxeer validatie (sta nieuws-only toe), update `getHomePath` |
| `app/api/onboarding/save-own-data/route.ts` | Nieuw schema, horizon-data, news description |
| `app/(app)/identity/gids/page.tsx` | Verwijder onboarding-stap referenties, module-aware secties |
| `lib/regression-tests/suites/onboarding-*.ts` | Updates + nieuwe tests (11 bestanden) |

### Te verifiëren (geen wijziging verwacht)
| Bestand | Verificatie |
|---------|------------|
| `components/app/app-header.tsx` | Nieuws-only navigatie werkt correct |
| `components/app/bottom-nav.tsx` | Verbergt bij nieuws-only |
| `lib/seed-persona.ts` | Seeding onafhankelijk van onboarding structuur |
| `lib/test-personas.ts` | Persona-definities compatibel |
| `lib/invulfase-items.ts` | Post-onboarding checklist werkt met nieuwe output |
| `app/(app)/layout.tsx` | Redirect-logica bij onboarding_completed |

---

## Verificatieplan

1. **Unit tests:** `computeStepOrder` met alle module-combinaties
2. **Per persona:** doorloop onboarding als budgetteerder, vermogensverdeler, pensioenplanner, fire_fighter
3. **Nieuws-only pad:** doorloop onboarding met alleen nieuws, verifieer redirect naar /berichten en gestripte navigatie
4. **Bezittingen enforcement:** probeer door te gaan zonder budget-tracking account (als budgetteren actief), verifieer blokkade
5. **Holdings enforcement:** probeer door te gaan zonder holdings-tracking asset (als aandelenregistratie actief), verifieer blokkade
6. **13 asset-types:** maak elk type aan in de onboarding, verifieer dat save slaagt
7. **Back-navigatie:** ga heen en weer tussen stappen, verifieer dat data behouden blijft
8. **localStorage restore:** vul gedeeltelijk in, sluit browser, open opnieuw, verifieer herstel met nieuw formaat
9. **Mobiel:** test alle stappen op viewport 375px breed
10. **Regressietests:** voer alle 11+ suites uit na wijzigingen
