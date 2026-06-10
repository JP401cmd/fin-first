---
id: 0001-soevereiniteit-is-motivatie
title: Soevereiniteit is motivatie, geen feature-gating
status: aanvaard
date: 2026-03-01
elements: [m-soeverein, app-comp]
---

Soevereiniteitsniveaus (Recovery → Mastery) bepalen niet langer welke functionaliteit zichtbaar is; ze dienen als motivatie- en voortgangsmodel. De gebruiker kiest zelf welke modules actief zijn.

## Context
Het oorspronkelijke ontwerp verborg functionaliteit achter een berekend niveau (FeatureGate met fallback='hidden'). Dat voelde bevoogdend en maakte onduidelijk waaróm iets ontbrak.

## Besluit
`lib/module-registry.ts` verving de niveau-gating door een door de gebruiker te kiezen moduleset. Het niveau blijft bestaan als motivatie en voortgangsindicatie.

## Gevolgen
Zichtbaarheid = module-activatie. Op de plaat is dit zichtbaar als de zes functionele modules die op de applicatie hangen; het soevereiniteitsmodel staat in de motivatielaag.
