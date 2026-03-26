# What-If Scenario Scherm Upgrade + Ghost Overlay

**Datum**: 2026-03-26
**Status**: Goedgekeurd

## Probleem

Het what-if ("Droomscenario") scherm is verouderd en mist:
1. De bronnen-grafiek (IncomeExpenseChart) die wel op de horizon pagina staat
2. AI-gestuurde event-suggesties bij slider-wijzigingen
3. Visuele vergelijking van opgeslagen scenario's als ghost-overlay op de horizon pagina

## Oplossing

### Architectuurbeslissing: Re-compute on demand

Opgeslagen scenario's bewaren alleen `overrides + events + fireAge + colorIndex` (lichtgewicht). Bij overlay-selectie op de horizon pagina wordt `runSimulation()` opnieuw gedraaid met de opgeslagen overrides toegepast op de *huidige* financiele input. Dit garandeert frisheid (~1-5ms, puur en synchroon).

### What-if pagina upgrade

**IncomeExpenseChart** toevoegen onder SimChart in de bestaande ZoomableChartContainer. Toont what-if vermogensstromen als primaire lijnen, baseline als ghost (gestippeld, 35% opacity). Ingeklapt op mobiel, uitgeklapt op desktop.

**AI-suggesties (inline)**: Na 2s slider-stilte, als FIRE-leeftijd >1 jaar verschuift, genereert `/api/whatif/suggest` 1-3 event-suggesties. Verschijnen als zachte kaarten (gestippelde rand, wil-paars) bovenaan het events panel. Logica geextraheerd naar `useWhatIfSuggestions` hook.

**AI-suggesties (chat)**: Bestaande WhatIfChat + `suggest-life-event` tool blijft werken voor diepere suggesties.

### Ghost overlay op horizon pagina

**ScenarioOverlayPicker** dropdown naast bestaande scenario-varianten toggle. Gebruiker selecteert 1 van max 5 opgeslagen scenario's. Overlay verschijnt op alle 3 grafieken:
- SimChart: gekleurde lijn via bestaande `scenarioOverlays` prop
- IncomeExpenseChart: ghost-lijnen via nieuwe `ghostOverlayRows` + `ghostColor` props
- EventsTimeline: scenario events met gestippelde borders in scenario-kleur

**Kleurenpalet**: 5 vaste kleuren (indigo, amber, smaragd, robijn, violet), automatisch toegewezen bij opslaan.

### Cross-cutting

- **Gids**: bestaande "Droomscenario / What-If" topic card aanvullen (geen nieuwe cards)
- **Regressietests**: nieuwe suite `whatif-scenarios.ts` (8 tests)
- **Personas**: sample scenarios voor Lisa en Willem
- **Mobiel**: alle nieuwe UI touch-friendly, BottomSheet dropdowns op mobiel

## Nieuwe bestanden (7)

| Bestand | Doel |
|---|---|
| `lib/whatif-suggestions.ts` | Delta-detectie + suggestie-prompt builder |
| `lib/hooks/use-whatif-suggestions.ts` | Custom hook voor suggestie-lifecycle |
| `lib/whatif-overrides.ts` | Herbruikbare override-toepassing |
| `app/api/whatif/suggest/route.ts` | AI-suggestie API endpoint |
| `components/app/horizon/whatif-suggestion-cards.tsx` | Inline suggestiekaarten |
| `components/app/horizon/scenario-overlay-picker.tsx` | Horizon dropdown picker |
| `lib/regression-tests/suites/whatif-scenarios.ts` | Regressietests |

## Gewijzigde bestanden (9)

| Bestand | Wijziging |
|---|---|
| `app/api/scenarios/route.ts` | colorIndex + kleurenpalet |
| `components/app/horizon/income-expense-chart.tsx` | Ghost-line props |
| `components/app/horizon/events-timeline.tsx` | Scenario events props |
| `components/app/horizon/whatif-events.tsx` | Suggestie-integratie |
| `app/(app)/horizon/whatif/page.tsx` | Bronnen-grafiek + suggesties |
| `components/app/horizon/horizon-client.tsx` | Overlay systeem |
| `app/(app)/identity/gids/page.tsx` | Topic card aanvulling |
| `lib/test-personas.ts` | Sample scenarios |
| `lib/seed-persona.ts` | App_settings seeding |

## Verificatie

1. What-if pagina: sliders → grafiek + bronnen + timeline updaten live + AI-suggesties
2. Scenario opslaan: naam + kleur-indicator in lijst
3. Horizon overlay: picker → ghost-lijn op alle 3 grafieken
4. Isolatie: geen Supabase writes vanuit what-if
5. Mobiel: 360px viewport, touch targets, geen overflow
6. Gids: geen dubbele content
7. Regressietests: alle tests groen
8. Personas: seed → scenario zichtbaar in picker
