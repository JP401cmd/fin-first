---
id: 0162-de-spaardoel-stap-uit-de-onboarding
title: 'De spaardoel-stap gaat uit de onboarding — doelen leven op /toekomst/doelen'
status: aanvaard
date: 2026-09-19
elements: [sp-registreren, as-planning, fn-toekomstplannen]
---

# 0162 — De spaardoel-stap gaat uit de onboarding

Eigenaarsbesluit van 19 september 2026 op Notion-kaart B-056 (optie A).

## Context

De onboarding-wizard vroeg sinds mei 2026 in een eigen stap "Waar wil je voor
sparen?" (groep 6 van 9) om één spaardoel uit zes presets, met een prominente
"Sla over →". De stap legde niets verplichts vast: invullen gaf één optionele
rij in `goals`, overslaan een `'spaardoel'`-deferral in
`profiles.feature_preferences.deferred_onboarding_fields`. Geen later scherm
hing eraan; de noodfonds-marker stuurt de gezondheidsscore sinds 29 juli 2026
niet meer, en de noodfonds-pre-select in de stap was al dode code sinds de
doel-stap in juni 2026 verdween.

De vervangende invoerroute bestond al: `/toekomst/doelen` met "Doel toevoegen"
(`STANDAARD_DOELEN`, dezelfde noodfonds-berekening en marker) en de
welkomstgids-stap "Stel doelen in". Een testgebruiker vroeg de stap te
schrappen; de onboarding wordt er een vraag korter van zonder dat een
functionaliteit verdwijnt.

## Besluit

1. De stap `spaardoel` verdwijnt uit de wizard: `components/onboarding/
   onboarding-spaardoel.tsx` en `lib/onboarding-presets.ts` zijn verwijderd; de
   orchestrator kent geen `SpaardoelState`, `SET_SPAARDOEL` of
   `onboardingGoal`-payload meer. `TOTAL_GROUPS` gaat van 9 naar 8, de
   profiel-compleetheid op het eindscherm van "x van 8" naar "x van 7".
2. **Geen conceptverlies.** Het transport-schema van het concept is
   `strict()`; de sleutel `spaardoel` blijft daarom als optioneel veld in het
   schema staan en wordt in `sanitizeStoredDraft` genegeerd. Een concept dat
   op de stap stond heelt via `LEGACY_STEP_MAP` naar `eindstrategie`;
   `'spaardoel'` blijft als legacy-anker in `CANONICAL_STEP_ORDER`.
3. **Bestaande data blijft geldig.** De enum-waarde `'spaardoel'` in
   `DeferredFieldKey`, de zod-enum van `deferredFields`, de coach-regel
   `deferred_spaardoel` (vier productie-accounts dragen de deferral) en de
   telling op `/beheer/gebruik` blijven staan; alleen wordt de deferral niet
   meer gezet.
4. De server-tak `onboardingGoal`/`insertOnboardingGoal` in
   `app/api/onboarding/save-own-data/route.ts` blijft als
   achterwaarts-compatibele dode tak voor een oudere client-build, tot de
   volgende retrofit van dat schema. Geen migratie, geen API-breuk.
5. `computeNoodfondsTarget` heeft nog één bron: `lib/goals/standaard-doelen.ts`.

## Gevolgen

- Nieuwe accounts maken tijdens de onboarding geen doel meer aan; de
  welkomstgids-stap "Stel doelen in" vangt dat op. De coach-gap `gap_goals`
  doet dat níet betrouwbaar (die leest open acties, niet doelen — een
  bestaande mislabel, apart te agenderen).
- UAT: scenario UAT-START-21/WF-START-21 vervalt, WF-START-18 verliest de
  noodfonds-prefill-component, groepsnummers in de START-teksten lopen van 9
  naar 8.
- Preset "Groei" (€5.000) bestaat niet als standaarddoel op `/toekomst/doelen`;
  vrije invoer kan.
