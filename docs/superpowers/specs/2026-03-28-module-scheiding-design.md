# Module-gebaseerde Feature Scheiding

**Datum:** 2026-03-28
**Status:** Ontwerp
**Vervangt:** Sovereignty-level feature gating systeem

## Context

De app gebruikt momenteel een sovereignty-level systeem (-2 tot 6) dat features automatisch ontgrendelt op basis van de financiële situatie van de gebruiker. Dit systeem is krachtig maar maakt de app complex voor gebruikers die maar een deel van de functionaliteit nodig hebben. Door de app op te splitsen in schakelbare modules kan elke gebruikersgroep (persona) een gefocuste, eenvoudige ervaring krijgen die meegroeit met hun behoeften.

### Architectuurprincipe

De module-scheiding is een **functionele presentatielaag** — zij bepaalt welke pagina's, widgets en navigatie-items een gebruiker ziet. De scheiding raakt niet aan de onderliggende datamodellen, berekeningen of gedeelde utilities. Elke module leest uit dezelfde tabellen, gebruikt dezelfde libraries en respecteert dezelfde business rules. Het fundament (assets, schulden, netto vermogen, profieldata) draait altijd en is voor alle modules identiek. Dit garandeert dat het in- of uitschakelen van een module nooit dataverlies, inconsistentie of regressie in een andere module veroorzaakt.

**Richtlijn voor nieuwe functionaliteit:**
> Nieuwe features moeten altijd gebouwd worden op het gedeelde fundament (datamodel, berekeningen, utilities) en mogen alleen in de presentatielaag aan een module gekoppeld worden. Als een feature data nodig heeft die nog niet in het fundament zit, wordt het fundament uitgebreid — niet de module.

**Fallback bij afgesloten modules:**
> Berekeningen die hun primaire databron uit een andere module halen, moeten altijd een fallback hebben voor als die module niet actief is. Voorbeeld: de spaarquote wordt automatisch berekend uit budgetdata, maar als Budgetteren uit staat moet er een alternatief pad zijn (bijv. handmatige invoer via check-in, of schatting op basis van netto-inkomsten en vermogensgroei). Bouw nooit een feature die stilzwijgend breekt of lege data toont omdat een andere module uit staat.

## Ontwerpbeslissingen

### Fundament (altijd actief)

Het fundament is de onzichtbare basis die altijd draait, ongeacht welke modules actief zijn:

- **Profiel & Identity** — persoonlijke gegevens, huishoudtype, geboortedatum
- **Rekeningen als assets** — bankrekeningen en spaarrekeningen worden altijd als assets geregistreerd, zodat bij het inschakelen van Vermogensregistratie de data er al is
- **Netto vermogen berekening** — basisberekening van assets minus schulden
- **App-chrome** — header, navigatie-shell, Identity-module

### 6 Schakelbare Modules

| # | Module | ID | Standalone? | Vereist | Bevat |
|---|--------|----|-------------|---------|-------|
| 1 | **Budgetteren** | `budgetteren` | Ja | — | Transacties, budgetten, categorieën, uitgavenpatronen, budget-rapportage, check-in (budget-deel) |
| 2 | **Vermogensregistratie** | `vermogensregistratie` | Ja | — | Assets (alle types), schulden, netto vermogen detail, Box 3 belasting, check-in (vermogen-deel), valuaties |
| 3 | **Aandelenregistratie** | `aandelenregistratie` | Nee | Module 2 | Holdings-detailpagina's, individuele aandelen/ETFs, koersen, transacties, alerts, rebalancing |
| 4 | **Inzicht & acties** | `inzicht_acties` | Nee | Module 1 of 2 | Dashboard, voorstellen, acties, doelen, vaste lasten analyse, rapportages (excl. budget-rapport), gezondheids-score, trends |
| 5 | **Toekomstplannen** | `toekomstplannen` | Nee | Module 1 of 2 | FIRE-prognose, scenario's, Monte Carlo simulaties, levensgebeurtenissen, onttrekkingsstrategieën, Coast FIRE, backtesting |
| 6 | **Nieuws** | `nieuws` | Ja | — | Briefing/nieuwspagina, contextueel gefilterd op actieve modules (werkt ook zonder andere modules) |

### Dependency-boom

```
Nieuws ─────────────────── (standalone)

Budgetteren ─────────────┐
                         ├──→ Inzicht & acties
Vermogensregistratie ────┤
    └── Aandelenregistratie  ├──→ Toekomstplannen
```

**Validatieregels:**
- `aandelenregistratie` vereist `vermogensregistratie`
- `inzicht_acties` vereist `budgetteren` OF `vermogensregistratie`
- `toekomstplannen` vereist `budgetteren` OF `vermogensregistratie`
- Minimaal 1 basismodule (`budgetteren` of `vermogensregistratie`) moet altijd actief zijn

### Persona → Module Mapping

De vier landingspagina-persona's krijgen elk een voorgeselecteerde startset bij onboarding:

| Persona | Startset | Natuurlijk uitbreidingspad |
|---------|----------|---------------------------|
| **De Budgetteerder** | Budgetteren | → Inzicht & acties → Nieuws → Vermogensregistratie → Toekomstplannen |
| **De Vermogensverdeler** | Vermogensregistratie | → Aandelenregistratie → Inzicht & acties → Nieuws |
| **De Pensioenplanner** | Vermogensregistratie + Toekomstplannen | → Inzicht & acties → Nieuws |
| **De FIRE Fighter** | Alle 6 modules | (alles al actief) |

Gebruikers kunnen ook "Eigen selectie" kiezen en handmatig modules aan/uitzetten.

### Navigatie & UX-gedrag

De navigatie past zich dynamisch aan op basis van actieve modules.

**Kernregels:**
- Zonder Inzicht & acties: **geen dashboard** — de gebruiker landt op de hoofdpagina van de primaire basismodule
- Elke actieve module voegt navigatie-items toe aan de tab-balk
- Check-in banner verschijnt in Kern als Wil uit staat, in Wil als Wil aan staat
- Nieuws verschijnt als eigen item in de navigatie (als actief)
- Widgets op het dashboard tonen alleen content van actieve modules

**Voorbeeld configuraties:**

Alleen Budgetteren:
```
Home: /core/budgets
Navigatie: Budgetten | Transacties
Geen tabs, geen dashboard, geen Wil/Horizon
Check-in banner in Kern
```

Alleen Vermogensregistratie:
```
Home: /core/assets
Navigatie: Assets | Schulden | Box 3
Geen tabs, geen dashboard
Check-in banner in Kern
```

Budgetteren + Inzicht & acties:
```
Home: /dashboard
Tabs: [Kern] [Wil]
Kern: Budgetten, Transacties, Check-in
Wil: Dashboard (budget-widgets), Doelen, Acties, Voorstellen, Rapportages
```

Alles aan (FIRE Fighter):
```
Home: /dashboard
Tabs: [Kern] [Wil] [Horizon]
Volledig zoals de huidige app
```

### Impact op Bestaande Systemen

**Sovereignty systeem → ontkoppelen van gating, behouden als motivatie:**
- `computeSovereigntyLevel()`, `PHASES`, `levelToPhaseId()` blijven bestaan — sovereignty is een motivatie-indicator voor de gebruiker
- Phase transition modal en level-up celebration blijven — tekst aangepast van "nieuwe features ontgrendeld" naar puur viering van financiële voortgang
- Sovereignty widget (jouw_pad, vrijheidsvoortgang) blijft zichtbaar
- `WIDGET_MIN_LEVEL` verdwijnt als gating-mechanisme maar level wordt nog getoond als informatief gegeven
- `compute-feature-access.ts` wordt herschreven: 3-layer check (tier → sovereignty → user override) wordt 2-layer (module actief? → tier check)
- Feature gating verplaatst volledig naar module-systeem — sovereignty beïnvloedt alleen weergave, niet toegang

**Gezondheids-score → adaptief:**
- Score berekent alleen pijlers relevant voor actieve modules
- Alleen Budgetteren: savings rate + budget discipline + noodfonds (3 van 6)
- Budgetteren + Vermogen: + debt ratio + diversificatie (5 van 6)
- Alles: alle 6 pijlers
- Weging herverdeelt zich over actieve pijlers (altijd 100% totaal)

**AI-assistenten → module-gebonden:**
- Kern-AI: beschikbaar bij Budgetteren of Vermogensregistratie
- Wil-AI: beschikbaar bij Inzicht & acties
- Horizon-AI: beschikbaar bij Toekomstplannen

**Widget-catalog → module-gebaseerd:**
- `minLevel` veld wordt vervangen door `requiredModule` veld
- Widget zichtbaarheid = module actief + (optioneel) tier check
- `WIDGET_TO_FEATURE` mapping wordt `WIDGET_TO_MODULE` mapping

**Commercial tiers → ongewijzigd:**
- Connected-tier (bankintegratie) blijft orthogonaal — verrijking binnen Budgetteren
- AI-tier blijft orthogonaal — verrijking binnen elke module
- Modules zijn gratis; tiers zijn de monetisatie

### Datamodel

**Profiles tabel wijzigingen:**

| Huidig | Actie | Nieuw |
|--------|-------|-------|
| `last_known_phase` (text) | Verwijderen | — |
| `feature_preferences` (jsonb) | Vervangen | `active_modules` (text[]) |
| `active_subscriptions` (text[]) | Ongewijzigd | `active_subscriptions` (text[]) |
| `budgeting_active` (boolean) | Opgaan in | `active_modules` |

**`active_modules` formaat:**
```typescript
type ModuleId =
  | 'budgetteren'
  | 'vermogensregistratie'
  | 'aandelenregistratie'
  | 'inzicht_acties'
  | 'toekomstplannen'
  | 'nieuws'

// Voorbeeld: Budgetteerder met Inzicht & acties
active_modules: ['budgetteren', 'inzicht_acties']
```

**Server-side validatie** handhaaft de dependency-regels bij elke wijziging.

### Onboarding-aanpassing

**Huidige flow:** Profiel invullen → budgeting_active → sovereignty berekening → features unlocked

**Nieuwe flow:**
1. Welkom + profiel basics (naam, geboortedatum, huishoudtype)
2. **Persona-keuze**: "Wat past het best bij jou?" — 4 kaarten (Budgetteerder, Vermogensverdeler, Pensioenplanner, FIRE Fighter) + "Eigen selectie"
3. Modules worden voorgeselecteerd op basis van gekozen persona
4. Gebruiker kan modules aanpassen (toggle aan/uit, dependencies gehandhaafd)
5. Module-specifieke setup (bijv. rekeningen toevoegen, budgetten instellen)
6. Land op de juiste home-pagina voor de actieve configuratie

### Strategische module-suggesties

De app kan op strategische momenten modules suggereren:
- Budgetteerder die 3+ maanden spaart → suggereer Vermogensregistratie
- Vermogensverdeler met €50k+ beleggingen → suggereer Aandelenregistratie
- Gebruiker met netto vermogen groei → suggereer Toekomstplannen
- Elke gebruiker na 1 maand actief gebruik → suggereer Nieuws

## Kritieke bestanden

| Doel | Huidig bestand | Actie |
|------|---------------|-------|
| Level & fase berekening | `lib/feature-phases.ts` | Vervangen door module-registry |
| Feature registry (16 features) | `lib/feature-registry.ts` | Herschrijven naar module-registry |
| Feature access logica | `lib/compute-feature-access.ts` | Herschrijven (2-layer) |
| Widget catalog (50+ widgets) | `lib/widget-catalog.ts` | `minLevel` → `requiredModule` |
| Widget renderer | `components/widgets/widget-renderer.tsx` | Module-check i.p.v. feature-check |
| Feature gate UI | `components/app/feature-gate.tsx` | Wordt `ModuleGate` |
| Context provider | `components/app/feature-access-provider.tsx` | Wordt `ModuleAccessProvider` |
| Phase transition modal | `components/app/phase-transition-modal.tsx` | Verwijderen |
| Level-up celebration | `components/app/level-up-celebration.tsx` | Verwijderen |
| Admin controle | `app/(app)/beheer/toegang/page.tsx` | Aanpassen naar module-beheer |
| Instellingen | `app/(app)/identity/instellingen/page.tsx` | Module-toggles i.p.v. feature-toggles |
| App layout | `app/(app)/layout.tsx` | Module-berekening i.p.v. sovereignty |
| Profiles migratie | Nieuwe migratie nodig | `active_modules` kolom |
| Gezondheids-score | `lib/financial-health.ts` | Adaptieve pijlers |
| Navigatie | `components/app/app-header.tsx` + nav componenten | Dynamisch op basis van modules |

## Nog na te kijken

- [ ] Budget-rapportage technisch loskoppelen van overige rapportages (zodat het bij Budgetteren kan draaien zonder Inzicht & acties)
- [ ] Migratiestrategie voor bestaande gebruikers: hoe worden huidige sovereignty levels + feature_preferences omgezet naar active_modules?
- [ ] Landing page aanpassen: persona-kaarten → module-selectie flow
- [ ] Regression tests herschrijven voor module-gebaseerde gating i.p.v. sovereignty-levels
- [ ] Inventariseren welke berekeningen cross-module databronnen gebruiken en per geval een fallback-pad definiëren (bijv. spaarquote, gezondheids-score pijlers, FIRE-projectie uitgaven)
