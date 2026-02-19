# TriFinity UX/UI Redesign — Analyse & Plan

## Samenvatting

Na grondige analyse van de codebase (104 componenten, 73 utility-bestanden, 13+ pagina's) en vergelijking met succesvolle financiële apps (Copilot Money, Monarch Money, YNAB, Bunq, Revolut) kom ik tot de conclusie dat TriFinity een **sterke filosofische kern** heeft maar lijdt aan **informatie-overload**, **inconsistente patronen** en **onnodige navigatiediepte**.

---

## 1. GUI & Interface Visueel — Beoordeling

### Wat goed is

- **Modulair kleurenthema** (amber/teal/purple) is herkenbaar en consistent
- **Freedom-time filosofie** is diep geïntegreerd (FreedomTimeBadge, FreedomTimeLabel, eurToFreedomTime)
- **BottomSheet component** is goed gebouwd (responsive, drag-handle, escape-key, backdrop)
- **Lucide icons** geven een schone, moderne look
- **Progressive disclosure** via FeatureGate met spotlight-animatie is slim

### Wat beter kan

| Probleem | Impact | Voorbeeld |
|----------|--------|-----------|
| **Te veel visuele elementen per pagina** | Cognitieve overload | De Kern overview: 12+ secties, 1578 regels code |
| **Inconsistent kleursysteem** | Visuele ruis | BudgetDonut HSL-kleuren vs TrendChart MODULE\_COLORS vs SERIES\_COLORS array |
| **Meerdere progress-bar implementaties** | Gebroken design-systeem | AnimatedProgressBar vs FeatureGate inline progress vs custom divs |
| **Geen duidelijke visuele hiërarchie** | Alles voelt even belangrijk | Hero + 5 KPIs + 4 Mission Cards + sparklines + charts op één scherm |
| **Modal header duplicatie** | Onderhoudslast | RecommendationModal, TargetEditor, BottomSheet — elk eigen header |

### Advies: Visueel Design Systeem

```
HIËRARCHIE (3 niveaus):
┌─────────────────────────────────┐
│  Level 1: HERO METRIC           │  ← 1 getal dat ertoe doet
│  (grote tekst, module-kleur)    │     bijv. "3 jaar en 2 maanden vrijheid"
├─────────────────────────────────┤
│  Level 2: PRIMAIRE KAARTEN      │  ← 3-4 actiebare kaarten
│  (klikbaar, met status-indicator)│     Budgetten / Assets / Schulden
├─────────────────────────────────┤
│  Level 3: VERDIEPING            │  ← On-demand via modals
│  (charts, trends, details)      │     Sparklines, forecasts, projecties
└─────────────────────────────────┘
```

---

## 2. Gebruikerservaring & Flow — De Grote Herstructurering

### Huidige navigatie (te diep)

```
Dashboard
└── De Kern (/core)                    ← 12+ secties, overload
    ├── Budgetten (/core/budgets)      ← apart scherm met 4 viz-modes
    ├── Cash (/core/cash)              ← transacties
    │   └── Import (/core/cash/import) ← 3 niveaus diep!
    ├── Assets (/core/assets)          ← apart scherm
    │   └── Holdings (modal)           ← 4 niveaus diep!
    ├── Schulden (/core/debts)         ← apart scherm
    └── Belasting (/core/belasting)    ← apart scherm
```

### Voorgestelde navigatie (vlak & gefocust)

```
Dashboard (Hub)
└── De Kern (/core)                    ← VEREENVOUDIGD overzicht
    │
    │  ┌──────────────────────────────────────────────┐
    │  │  HERO: Vrijheidstijd + netto vermogen        │
    │  │  (1 metric, groot, amber gradient)           │
    │  ├──────────────────────────────────────────────┤
    │  │  BUDGETTEN SECTIE (primair, altijd zichtbaar)│
    │  │  - Huidige maand donut/tree (switcher)       │
    │  │  - Top 3-5 categorieën met progress bars     │
    │  │  - "Bekijk alles" → BottomSheet/modal        │
    │  ├──────────────────────────────────────────────┤
    │  │  VERMOGEN SECTIE (2-kolom grid)              │
    │  │  ┌─── Assets ────┐  ┌─── Schulden ──┐       │
    │  │  │ Totaal + trend │  │ Totaal + voortg│      │
    │  │  │ Top 3 items    │  │ Top 3 items    │      │
    │  │  │ [Details →]    │  │ [Details →]    │      │
    │  │  └────────────────┘  └────────────────┘      │
    │  ├──────────────────────────────────────────────┤
    │  │  CASHFLOW (compact, 1 regel of mini-chart)   │
    │  │  Inkomen vs uitgaven deze maand              │
    │  ├──────────────────────────────────────────────┤
    │  │  VERDIEPING (on-demand, feature-gated)       │
    │  │  [Trends] [Forecast] [Projecties] [Box 3]   │
    │  │  → Elk opent als BottomSheet modal           │
    │  └──────────────────────────────────────────────┘
    │
    ├── /core/budgets       ← BLIJFT (voor volledige budget management)
    ├── /core/cash          ← BLIJFT (transactiebeheer + import)
    └── /core/belasting     ← BLIJFT (specifiek genoeg voor eigen pagina)
```

### Kernbeslissingen

**A. Budgetten op het overzicht plaatsen (primaire visualisatie)**

- De budget tree/donut visualisatie is de belangrijkste view → toon deze direct op /core
- Met een compacte variant: top 5 categorieën met progress bars
- "Alles bekijken" opent de volledige budget-pagina of een BottomSheet met alle categorieën
- De 4 viz-modes (tree/blob/sankey/donut) blijven beschikbaar op /core/budgets

**B. Assets & Schulden samenvoegen op het overzicht**

- Geen aparte /core/assets en /core/debts pagina's meer als eerste bestemming
- In plaats daarvan: twee naast-elkaar-kaarten op /core met de top 3 items elk
- Klik op een asset/schuld → BottomSheet modal met detail (zoals nu al werkt)
- "Alle assets beheren" → BottomSheet of volledige pagina (voor toevoegen/verwijderen)

**C. Cash wordt een compact element**

- Nu: Mission Control Card met link naar /core/cash
- Beter: Inline inkomen/uitgaven balk op het overzicht
- /core/cash blijft bestaan voor transactiebeheer en import

**D. Geavanceerde charts worden modals**

- Cashflow forecast → BottomSheet modal (knop "Forecast bekijken")
- Net worth projectie → BottomSheet modal (knop "Projectie bekijken")
- Spending patterns → BottomSheet modal
- Snapshot comparison → BottomSheet modal
- Dit verwijdert 4 CollapsibleSections van het overzicht

---

## 3. Modal-patroon — Consequent Toepassen

### Huidige situatie: inconsistent

| Element | Huidig patroon | Probleem |
|---------|---------------|----------|
| Budget detail | BottomSheet op /core/budgets | OK |
| Asset detail | BottomSheet op /core/assets | OK, maar apart scherm |
| Debt detail | BottomSheet op /core/debts | OK, maar apart scherm |
| Cash/transacties | Volledige pagina /core/cash | Inconsistent |
| Cash import | Volledige pagina /core/cash/import | Te diep |
| Charts (forecast) | CollapsibleSection | Niet modal |
| Charts (projectie) | CollapsibleSection | Niet modal |
| Recommendations | Multi-step BottomSheet | Goed |
| Box 3 Belasting | Volledige pagina | OK (complex genoeg) |

### Voorgesteld patroon: 2 niveaus

```
REGEL: "Bekijken = Modal, Beheren = Pagina"

MODALS (BottomSheet) voor:
├── Item details bekijken (asset, schuld, budget, transactie)
├── Charts en visualisaties (forecast, projectie, trends)
├── Snelle acties (herwaarderen, status wijzigen)
└── AI inzichten (spending patterns, recommendations)

PAGINA'S voor:
├── CRUD-intensieve beheerflows (budgets aanmaken/bewerken)
├── Complexe import flows (bank import met preview)
├── Belastingberekeningen (meerdere scenario's)
└── Transactielijst met zoeken/filteren
```

### Technische verbetering: Gestandaardiseerde ModalHeader

Momenteel heeft elk modal een eigen header-implementatie. Extractie naar herbruikbaar component:

```tsx
// components/app/modal-header.tsx
<ModalHeader
  title="Asset Detail"
  subtitle="Beleggingsrekening"       // optioneel
  icon={<PiggyBank />}                // optioneel
  moduleColor="amber"                 // voor kleurthema
  onClose={() => setOpen(false)}
  actions={<Button>Bewerken</Button>}  // optioneel
/>
```

---

## 4. Dubbele Data & Functionaliteiten

### Geïdentificeerde duplicaties

| Data | Waar getoond | Advies |
|------|-------------|--------|
| **Netto vermogen** | Dashboard hero, De Kern hero, De Kern KPI card, De Horizon input | Dashboard: als vrijheidstijd. Kern: als euro. Horizon: als projectie-basis. → **3x is OK maar met andere lens** |
| **Maandelijkse uitgaven** | Dashboard berekening, Kern KPI, Kern budget sparklines, Budgets pagina | **Verwijder uit Kern KPI** → zit al in budget visualisatie |
| **Totaal assets/schulden** | Dashboard, Kern Mission Control cards, Kern "Financiële Kerngetallen" | **Verwijder Financiële Kerngetallen sectie** → dubbel met Mission Control |
| **Freedom percentage** | Dashboard progressbar, Kern hero, Horizon hero | **Houd alleen op Dashboard en Horizon** → Kern toont vrijheidstijd |
| **Savings rate** | Kern KPI card, Dashboard berekening | **Houd op Kern, verwijder uit Dashboard** |
| **Budget sparklines** | Kern overview (CollapsibleSection), Budgets pagina | **Verwijder van Kern overview** → hoort bij budgets deep-dive |
| **Budget overschrijdingen** | Kern alert sectie, Kern Mission Control card status | **Merge**: alert badges OP de budget card |
| **FIRE countdown** | Dashboard, De Horizon hero | **Alleen op Horizon** |
| **Spending insights** | Kern overview sectie, De Wil (SpendingInsightCard, NibbudBenchmark) | **Alleen op De Wil** → hoort bij acties/inzichten |

### Concrete verwijderingen uit De Kern overview

1. ~~Financiële Kerngetallen sectie~~ → gegevens zitten al in hero + cards
2. ~~Budget sparklines CollapsibleSection~~ → verplaats naar budgets modal/pagina
3. ~~Spending patterns CollapsibleSection~~ → verplaats naar De Wil
4. ~~Cashflow forecast CollapsibleSection~~ → maak modal (knop op cash card)
5. ~~Net worth projection CollapsibleSection~~ → maak modal (knop op assets card)
6. ~~Net worth history + snapshot comparison~~ → maak modal (knop op hero)
7. ~~Discover carousel~~ → verplaats naar Dashboard
8. ~~5 KPI stat cards~~ → reduceer naar 3 (vrijheidstijd, spaarquote, trend)

**Resultaat: Van 12+ secties naar 5 secties** (hero, budgetten, vermogen grid, cashflow, verdiepingsknoppen)

---

## 5. Algemeen Advies

### A. "Above the fold" regel

De eerste viewport (zonder scrollen) moet bevatten:

1. **Eén krachtig getal**: vrijheidstijd in jaren/maanden
2. **Eén emotionele indicator**: gaat het goed? (groen/amber/rood)
3. **Drie actiebare kaarten**: budgetten, assets, schulden

Alles daaronder is verdieping. Dit is hoe Copilot Money en Monarch Money het doen — ze tonen 1 hero-metric en 3-5 categorie-kaarten.

### B. Mobile-first denken

De huidige 4-kolom KPI grid breekt op mobile naar een 2x2 of scrollbare rij. Met 5 KPI's + 4 Mission Control cards + sparklines is dat **veel scrollen**. Advies:

- Mobile: Hero + 3 swipeable category cards + "meer" knop
- Desktop: Hero + 3 category cards naast elkaar + verdiepingspaneel

### C. De Dashboard als echte hub

Het huidige Dashboard dupliceert te veel van De Kern. Maak het een echte hub:

```
Dashboard (nieuw):
├── Welkom + Streak indicator
├── Vrijheidskaart (FreedomCard) — het visitekaartje
├── 3 Module-kaarten met 1 key metric elk:
│   ├── De Kern: "Budget status: 2 van 8 over limiet"
│   ├── De Wil: "3 open acties, 14 vrijheidsdagen te winnen"
│   └── De Horizon: "FIRE over 12 jaar en 4 maanden"
├── Jouw Pad widget (sovereignty progress)
└── Discover carousel (verplaatst van Kern)
```

### D. Consistente interactiepatronen

```
TAP INTERACTIONS:
├── Kaart tap → BottomSheet met detail
├── "Bekijk alles" → Volledige pagina of grote BottomSheet
├── Chart segment tap → Tooltip met detail
├── KPI tap → Info tooltip (bestaand patroon, goed!)
└── Long press → Quick actions menu (toekomst)
```

### E. Reduceer state-complexiteit

De Kern overview heeft **27 useState hooks** (regels 33-61). Dit is een teken van te veel verantwoordelijkheid op één pagina. Door secties naar modals te verplaatsen, wordt de state ook verdeeld.

### F. Budget Visualisatie op het overzicht

De 4 budget visualisaties (tree/blob/sankey/donut) zijn een unique selling point. Advies:

- **Op /core overview**: toon de **Tree** view als default (meest scanbaar, toont hiërarchie)
- **Compact formaat**: alleen top-level categorieën, geen kinderen
- **Tap op categorie** → expand of BottomSheet met kinderen + sparkline
- **Volledige 4-mode switcher** blijft op /core/budgets

---

## 6. Implementatie Plan (Fasering)

### Fase 1: De Kern Overzicht Vereenvoudigen

**Impact: Hoog | Risico: Laag**

1. Herschrijf `/core/page.tsx` — reduceer van 12+ secties naar 5
2. Verplaats budget compact-visualisatie (tree) naar het overzicht
3. Creëer assets + schulden side-by-side cards op het overzicht
4. Verplaats geavanceerde charts naar BottomSheet modals
5. Verwijder dubbele secties (Kerngetallen, sparklines)

### Fase 2: Modal Consistentie

**Impact: Midden | Risico: Laag**

1. Creëer `ModalHeader` component
2. Standaardiseer alle BottomSheet gebruiken
3. Verplaats asset/schuld details naar modals vanuit /core (niet aparte pagina's)

### Fase 3: Dashboard als Hub

**Impact: Midden | Risico: Laag**

1. Vereenvoudig Dashboard — 1 metric per module
2. Verplaats Discover carousel van Kern naar Dashboard
3. Verwijder duplicate berekeningen

### Fase 4: Visueel Design Systeem

**Impact: Laag | Risico: Midden**

1. Unificeer kleursysteem (MODULE\_COLORS als single source of truth)
2. Standaardiseer progress bars (1 component, meerdere varianten)
3. Extractie van herbruikbare patronen
