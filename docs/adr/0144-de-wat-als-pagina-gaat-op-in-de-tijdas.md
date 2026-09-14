---
id: 0144-de-wat-als-pagina-gaat-op-in-de-tijdas
title: De losse Wat-Als-pagina vervalt — het inline lab op /toekomst is de enige wat-als
status: aanvaard
date: 2026-09-14
elements: [as-planning, fn-toekomstplannen, app-comp, sp-plannen, do-meta]
---

# 0144 — De Wat-Als-pagina gaat op in de tijdas

## Context

Rond de Toekomst-grafiek stonden twee wat-als-oppervlakken op één motor. Het inline lab
onder de grafiek (`components/app/horizon/horizon-client.tsx`, katern II "Verken je
aannames"): vier draaiknoppen, marktbias, een stop-slider en "Maak dit mijn doel". En de
losse pagina `app/(app)/horizon/whatif/whatif-page-client.tsx` (1.941 regels, alleen
bereikbaar via `/toekomst/whatif?via=dreamgate`): presets, dezelfde sliders, een
beslishulp, levensgebeurtenissen in het geheugen, tot vijf bewaarde scenario's
(`app_settings` sleutel `whatif_scenarios:<uid>` — de tabel is authenticated-breed,
isolatie liep alleen via de sleutel) en een eigen Fin-persona ("droomgids zonder rem").
De pagina droeg zelf al de melding "Nog in ontwikkeling".

De twee oppervlakken draaiden niet identiek: de losse pagina ging via een eigen adapter
(`lib/horizon-kernel/adapter/whatif-varianten.ts`) die drie profielvelden bewust wegliet
(`yearly_essential_expenses`, `deficit_loan_rate`, `withdrawal_profile_config`), zodat een
nul-override er al van de basislijn kon afwijken — precies het "Bekende afwijkingen"-punt
in de module-documentatie van dat bestand. Er waren ook operationele sporen van die
divergentie: een React #310-crash en de UR2-11-redirect-geschiedenis liepen beide via de
losse pagina, niet via het lab. De droom-poort (de knop "Scenario's vergelijken →" op de
dream-transitie) was de enige ingang.

De gebruikssignalen wezen dezelfde kant op: alleen het inline-paneel heeft een gemeten
slug (een handvol gebruikers, een enkele hand vol bezoeken); de losse pagina staat op één
bezoek, maanden geleden. De AI-suggestiekaarten op die pagina (`/api/whatif/suggest`,
feature key `whatif_suggesties`) waren al dode code zonder aanroeper.

Marktonderzoek (3 en 13 sep 2026) bevestigt het patroon bij volwassen planners (Boldin,
ProjectionLab, Fidelity, Empower/MoneyGuidePro): een sandbox-slider náást het lopende plan
("Play Zone") — precies ons inline lab — is de norm; bewaarde scenario's zijn daar
volledige plan-kopieën, nooit een aparte pagina met een eigen persona.

## Besluit

1. **De losse Wat-Als-pagina vervalt volledig**: de route, de bewaarde scenario's
   (`/api/scenarios`), de spooklijn-kiezer op de grafiek, de droom-transitie ernaartoe en
   het AI-suggestiepad (`/api/whatif`, feature key `whatif_suggesties`).
2. **Het inline lab op /toekomst is de enige wat-als.** Geen functionaliteit verdwijnt die
   het lab niet al had; wat vervalt zijn de dubbels (presets, een tweede sliderset, een
   tweede persona) en de functionaliteit die zelfverklaard "nog in ontwikkeling" was.
3. **Levensgebeurtenissen blijven** — die horen bij het plan zelf, niet bij de losse
   pagina, en worden door dit besluit niet geraakt.
4. **`context: 'whatif'` blijft** als de interne naam van de gebeurtenis-pane-chat-persona
   (`lib/ai/tools/index.ts`, `event-chat-pane.tsx`). Die naam dateert van vóór dit besluit
   en verwijst inmiddels naar niets meer; hernoemen is een woordkeuze in het prompt-DNA en
   dus een `/ai-gedrag`-besluit, buiten deze ADR.

## Gevolgen

- `/toekomst/whatif`, `/toekomst/whatif?via=dreamgate` en `/horizon/whatif` redirecten
  (307) naar `/toekomst?whatif=open`, dat het lab direct opent.
- De horizon-kernel houdt drie routers over (convergentie, household, scalar) in plaats
  van vier — `whatif-router.ts` en de losse `computeWhatifProjection`/
  `computeWhatifMarktcheck`/`runWhatifMarktcheckAsync`-paden vervallen. De gedeelde
  adapter `whatif-varianten.ts` blijft: het inline lab leunt op dezelfde
  rendement-delta-expansie als de scenario-run, dus zijn functies (`applyReturnDeltasToAssets`
  e.a.) hebben nog een productie-aanroeper.
- De UAT-zone "Rekentools & wat-als" krimpt tot "Rekentools" — de scenario's/wat-als-tak
  van die zone verdwijnt met de pagina.
- Het parity-artefact `whatif` (de on-device-condensatie van `WHATIF_SUGGEST_PROMPT`, de suggestiekaarten; de persona `WHATIF_PROMPT` zelf blijft)
  vervalt uit `lib/ai/local/parity-manifest.json`.
- **Data-opruiming (buiten deze release, via `change-request`)**: de `app_settings`-rijen
  met sleutelprefix `whatif_scenarios:` worden na de deploy verwijderd — die bewaarde
  scenario's hebben geen lezer meer.
- **Bewust buiten scope, eigen restpunten**: `whatif-sliders.tsx` kan zijn niet-bare
  kaartvariant verliezen (alleen nog een a11y-test als caller); `buildBreakdownFromSimRows`
  (`lib/income-expense-breakdown.ts`) verliest zijn enige productie-consument; het
  hernoemen van `ChatContext 'whatif'`; de welkomstgids-stap "Speel met een what-if
  scenario" krijgt op termijn een tekst die niet meer naar de losse pagina verwijst.
- **Geen productiecijfers in deze ADR** (ADR 0111, publieke repo): de gebruikssignalen
  hierboven staan bewust relatief — "een handvol gebruikers", niet de exacte telling uit
  de database.
