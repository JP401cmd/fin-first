# What-If Net Worth Planner — Implementatieplan

## Concept

Een immersive "What If"-ervaring op `/horizon/whatif` waar de gebruiker in een speculatieve dimensie stapt. De netto-vermogensgrafiek blijft centraal en reageert real-time op schuiven, chat met Will, en levensgebeurtenissen. Onder de grafiek staan voorgestelde acties die de gebruiker kan inplannen en meenemen naar de werkelijkheid.

**Drie pijlers:**
1. **Grafiek + Schuiven** — real-time simulatie met financiële hefbomen
2. **Chat met Will** — AI vertaalt dromen naar levensgebeurtenissen op de grafiek
3. **Acties** — concrete stappen om what-if scenario's werkelijkheid te maken

---

## Fase 1 — Fundament: Pagina + Grafiek + Schuiven

**Doel:** Werkende pagina met de SimChart die real-time reageert op slider-input.

### Nieuwe bestanden

| Bestand | Doel |
|---------|------|
| `app/(app)/horizon/whatif/page.tsx` | Hoofdpagina met data-loading, state, layout |
| `components/app/horizon/whatif-sliders.tsx` | Slider-paneel met financiële hefbomen |
| `components/app/horizon/whatif-header.tsx` | Header met "terug naar werkelijkheid" knop en dimensie-indicatie |

### Wijzigingen bestaande bestanden

| Bestand | Wijziging |
|---------|-----------|
| `app/(app)/horizon/page.tsx` | "Wat als...?" knop toevoegen naast de SimChart |
| `components/app/horizon/sim-chart.tsx` | Props uitbreiden voor ghost-line (baseline overlay) |
| `app/globals.css` | CSS variabelen + keyframes voor dimensie-shift |

### Componenten

**WhatIfPage (`page.tsx`)**
- Laadt dezelfde data als `/horizon` (assets, debts, income, expenses, life events, profile)
- Hergebruikt `useHorizonFireSim` hook voor baseline simulatie
- Tweede simulatie-run met what-if overrides → feed naar SimChart
- State: `whatIfOverrides` object met slider-waarden

**WhatIfSliders**
Vijf schuiven, elk met:
- Label (Inter 11px UPPERCASE)
- Huidige waarde (DM Mono)
- Delta badge ("+€500/mnd" of "-2 dagen")
- Range input met module-kleur accent

| Slider | Property | Range | Stap |
|--------|----------|-------|------|
| Maandinkomen | `monthlyIncome` | 0 – 15.000 | 100 |
| Werkdagen/week | `workDaysPerWeek` | 1 – 5 | 1 |
| Spaarquote | `savingsRate` | 0% – 80% | 1% |
| Beleggingsrendement | `expectedReturn` | 2% – 12% | 0.5% |
| Extra maandelijkse inleg | `extraContribution` | 0 – 5.000 | 50 |

**SimChart uitbreiding: ghost-line**
- Nieuwe optionele prop: `baselineRows?: SimRow[]`
- Rendert een derde pad in `var(--ink-4)` met `strokeDasharray="6 4"` en `opacity={0.4}`
- Toont de baseline (werkelijkheid) als stippellijn achter de what-if projectie

**Dimensie-shift visueel**
- Pagina-achtergrond: `#f5f3ed` (iets warmer/donkerder dan standaard `--bg`)
- Subtiel radial gradient overlay: `radial-gradient(ellipse at 50% 0%, rgba(196,160,107,0.06), transparent 70%)`
- 4px top-border accent in wil-paars i.p.v. horizon-goud
- Kicker: "WAT ALS..." in wil-kleur

**Entrypoint op `/horizon`**
- Button onder de SimChart: `<Link href="/horizon/whatif">`
- Styling: `border border-dashed border-wil-300 bg-wil-50/30 hover:bg-wil-50 text-wil-700`
- Label: *"Wat als...? Speel met je toekomst →"* (Source Serif italic)
- Icoon: `Sparkles` (Lucide)

### Data Flow (Fase 1)

```
Supabase data → loadData()
                    ↓
            baselineInput (HorizonInput)
                    ↓
         ┌─────────┴──────────┐
         │                    │
   runSimulation()      whatIfOverrides (sliders)
   → baselineResult     → mergeOverrides(baselineInput, overrides)
   → ghost-line            → runSimulation()
                           → whatIfResult
                           → active chart line
```

### Verificatiestappen Fase 1
- [ ] Pagina rendert op `/horizon/whatif` binnen de app-layout
- [ ] Alle 5 schuiven werken en tonen delta t.o.v. baseline
- [ ] SimChart toont what-if lijn (actief) + baseline (ghost, gestippeld)
- [ ] Grafiek update binnen 100ms na slider-verandering (debounced)
- [ ] "Wat als...?" knop zichtbaar op `/horizon`
- [ ] Terug-navigatie naar `/horizon` werkt
- [ ] Responsief: werkt op 360px mobiel (schuiven in verticale stack)
- [ ] Dimensie-shift visueel merkbaar maar subtiel

---

## Fase 2 — Chat met Will (What-If modus)

**Doel:** Embedded chat-interface waarin Will dromen vertaalt naar levensgebeurtenissen die de grafiek updaten.

### Nieuwe bestanden

| Bestand | Doel |
|---------|------|
| `components/app/horizon/whatif-chat.tsx` | Embedded chat component (niet-floating) |
| `lib/ai/tools/add-life-event.ts` | AI tool: voeg tijdelijke life event toe aan what-if |
| `lib/ai/dna/whatif-prompt.ts` | Systeem-prompt voor what-if modus |

### Wijzigingen bestaande bestanden

| Bestand | Wijziging |
|---------|-----------|
| `lib/ai/dna/types.ts` | `AIDomain` uitbreiden met `'whatif'` |
| `lib/ai/dna/index.ts` | What-if personality en prompt exporteren |
| `lib/ai/tools/index.ts` | `addLifeEvent` tool toevoegen voor whatif domain |
| `app/api/ai/chat/route.ts` | `'whatif'` als valide domain toevoegen |
| `app/(app)/horizon/whatif/page.tsx` | Chat-component integreren + life event state |

### Componenten

**WhatIfChat**
- Embedded in de pagina (geen floating FAB)
- Compact formaat: max-height 400px, scrollable
- Gebruikt `useChat` van `@ai-sdk/react` met domain `'whatif'`
- Berichtenweergave: hergebruik markdown rendering van `chat-panel.tsx`
- Will-avatar + paarse accent
- Input: single-line met send-button

**Layout integratie:**
```
Desktop (>900px):
┌──────────────────────────────────────────┐
│           HEADER + DIMENSIE-SHIFT        │
├──────────────────────────────────────────┤
│               SIM CHART                  │
│         (what-if + ghost baseline)       │
├──────────────────────────────────────────┤
│           SLIDER PANEEL                  │
├─────────────────────┬────────────────────┤
│     CHAT MET WILL   │  ACTIES (Fase 3)  │
│    (embedded, 60%)  │    (40%)           │
└─────────────────────┴────────────────────┘

Mobiel (<900px):
┌──────────────────────┐
│  HEADER              │
│  SIM CHART           │
│  SLIDERS (collapsed) │
│  CHAT MET WILL       │
│  ACTIES (Fase 3)     │
└──────────────────────┘
```

**AI Tool: `addLifeEvent`**
- Parameters: `name`, `type`, `target_age`, `amount`, `direction`, `duration_type`, `duration_months`
- Voegt een **tijdelijk** life event toe aan de what-if state (niet naar DB)
- Retourneert bevestiging + impact-samenvatting
- De pagina pikt het nieuwe event op en herberekent de simulatie

**What-If systeem-prompt**
- Will in "dromer"-modus: enthousiast, verbeeldend, maar realistisch
- Vertaalt vage wensen ("ik wil een jaar in Spanje wonen") naar concrete financiële events
- Benoemt altijd het vrijheidstijd-effect ("dat kost je 2,3 jaar vrijheid" of "dat brengt je 8 maanden dichterbij")
- Kan meerdere events in één antwoord toevoegen
- Referentiedata: huidige leeftijd, vermogen, inkomen, FIRE-leeftijd

**Tijdelijke life events state**
- `whatIfEvents: LifeEvent[]` — lokale state, niet naar Supabase
- Worden gecombineerd met echte events voor de simulatie
- Visueel onderscheid op de grafiek: what-if event markers met stippel-cirkel
- Verwijderbaar via X-knop in een pill-badge onder de grafiek

### Verificatiestappen Fase 2
- [ ] Chat-component rendert embedded op de pagina
- [ ] Berichten worden verstuurd naar `/api/ai/chat` met domain `'whatif'`
- [ ] Will kan `addLifeEvent` tool aanroepen
- [ ] Toegevoegd life event verschijnt direct op de grafiek
- [ ] Tijdelijke events tonen als pills met X-knop
- [ ] Verwijderen van een event herberekent de grafiek
- [ ] Will benoemt vrijheidstijd-impact in antwoorden
- [ ] Chat scrollt correct en toont streaming-indicatie
- [ ] Mobiel: chat neemt volledige breedte, scrollt onafhankelijk

---

## Fase 3 — Acties: Van Droom naar Werkelijkheid

**Doel:** Voorgestelde acties die het what-if scenario werkelijkheid kunnen maken, inplanbaar door de gebruiker.

### Nieuwe bestanden

| Bestand | Doel |
|---------|------|
| `components/app/horizon/whatif-actions.tsx` | Actieblok met voorgestelde en AI-gegenereerde acties |

### Wijzigingen bestaande bestanden

| Bestand | Wijziging |
|---------|-----------|
| `lib/ai/tools/suggest-action.ts` | Uitbreiden met what-if context (scenario-data meesturen) |
| `app/(app)/horizon/whatif/page.tsx` | Actieblok integreren in layout |

### Componenten

**WhatIfActions**
- Twee secties:
  1. **Door Will voorgesteld** — acties die uit de chat komen (via `suggestAction` tool)
  2. **Automatisch afgeleid** — acties berekend uit slider-deltas

**Automatisch afgeleide acties (zonder AI):**
- Als `monthlyIncome` verhoogd → "Onderhandel salarisverhoging van €X"
- Als `savingsRate` verhoogd → "Verlaag maandelijkse uitgaven met €Y"
- Als `extraContribution` > 0 → "Start automatische beleggingsstorting van €Z/mnd"
- Als `workDaysPerWeek` verlaagd → "Bespreek parttime werken met werkgever"

**Actie-kaart styling:**
- Hergebruik patroon van `ActionSuggestionCard` uit `chat-panel.tsx`
- Wil-paars accent
- Freedom days impact badge
- "Inplannen" knop → opent `ActionEditModal` met week-selector
- Na inplannen: actie naar Supabase `actions` tabel + visuele bevestiging

**"Meenemen naar werkelijkheid" flow:**
1. Gebruiker klikt "Inplannen" op een actie
2. `ActionEditModal` opent (bestaand component)
3. Na opslaan: actie verschijnt in De Wil module op `/will`
4. Optioneel: life events ook opslaan naar DB als de gebruiker dat wil

**Life events persisteren:**
- Onder de tijdelijke events: "Deze plannen opslaan?" knop
- Slaat what-if events op naar `life_events` tabel
- Navigeert terug naar `/horizon` waar ze nu in de echte simulatie staan

### Verificatiestappen Fase 3
- [ ] Automatisch afgeleide acties verschijnen wanneer sliders afwijken van baseline
- [ ] AI-voorgestelde acties (via chat) verschijnen in het actieblok
- [ ] "Inplannen" opent ActionEditModal
- [ ] Ingeplande actie wordt opgeslagen in Supabase
- [ ] "Deze plannen opslaan?" slaat tijdelijke life events op naar DB
- [ ] Na opslaan: bevestigingsmelding en optie om naar `/horizon` te navigeren

---

## Fase 4 — Polish: Animaties, Mobiel & Edge Cases

**Doel:** Ervaring verfijnen met animaties, mobiele optimalisatie en randgevallen.

### Animaties

**Pagina-entree (dimensie-shift):**
- Achtergrond fade van `--bg` naar warmer palet: 600ms ease-out
- SimChart area-fill met draw-animatie (bestaand `useInViewAnimation` patroon)
- Sliders fade-up met 60ms stagger per slider
- Kicker + titel: typewriter-achtig effect (optioneel)

**Slider → grafiek reactie:**
- Debounce: 80ms
- Grafiek-lijn morpht soepel (CSS transition op SVG path niet mogelijk → herberekening met `requestAnimationFrame` voor vloeiend gevoel)
- Delta-badges: `transition: all 0.2s ease` voor waarde-veranderingen

**Ghost-line:**
- Fade-in bij eerste render: `opacity 0 → 0.4`, 400ms
- Subtiel pulseren wanneer what-if lijn er significant van afwijkt

**Life event toevoegen (via chat):**
- Event-marker bounced licht in op de grafiek (scale 0→1.1→1, 300ms)
- Pill-badge slide-in van links, 200ms

### Mobiele optimalisatie

**Slider-paneel op mobiel:**
- Collapsed by default, expandable met chevron
- Samenvatting-regel als collapsed: "Inkomen €4.500 · 5 dagen · 30% spaarquote"
- Expand: verticale stack, touch-friendly range inputs (44px height)

**Chat op mobiel:**
- Volledige breedte
- Max-height: 50vh, scrollable
- Sticky input aan onderkant van het chat-blok
- Keyboard-bewust: verschuift niet achter soft keyboard

**Navigatie op mobiel:**
- Terug-knop bovenaan (chevron-left + "Horizon")
- BottomNav blijft zichtbaar

### Edge cases
- Geen data (geen assets/income): toon lege state met uitleg
- FIRE niet bereikbaar: waarschuwingsbanner (hergebruik van horizon page)
- Geen geboortedatum: redirect naar profiel met melding
- AI niet geconfigureerd: chat-sectie toont fallback met uitleg
- Extreem hoge slider-waarden: clamp op maxima, grafiek Y-as schaalt mee

### Verificatiestappen Fase 4
- [ ] Pagina-entree animatie voelt als "dimensie-shift"
- [ ] Slider-grafiek interactie voelt vloeiend (<100ms response)
- [ ] Mobiel: sliders collapsed, expandable, touch-friendly
- [ ] Mobiel: chat scrollt correct, keyboard blocking opgelost
- [ ] Edge cases: lege state, FIRE onbereikbaar, geen geboortedatum
- [ ] `prefers-reduced-motion` gerespecteerd (minder/geen animaties)
- [ ] Build slaagt (`npm run build:check`)

---

## Samenvatting per fase

| Fase | Scope | Nieuwe bestanden | Geschatte omvang |
|------|-------|-----------------|------------------|
| **1** | Pagina + Grafiek + Schuiven | 3 | Kernfunctionaliteit |
| **2** | Chat met Will + Life Events | 3 | AI-integratie |
| **3** | Acties + Persistentie | 1 | Actie-systeem |
| **4** | Animaties + Mobiel + Polish | 0 | Verfijning |

### Afhankelijkheden
- Fase 2 hangt af van Fase 1 (grafiek moet reageren op events)
- Fase 3 hangt af van Fase 2 (acties komen deels uit chat)
- Fase 4 kan parallel aan Fase 3 gestart worden
