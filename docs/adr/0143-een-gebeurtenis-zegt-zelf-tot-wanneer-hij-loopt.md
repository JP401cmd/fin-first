---
id: 0143-een-gebeurtenis-zegt-zelf-tot-wanneer-hij-loopt
title: 'Een blijvende gebeurtenis zegt zelf tot wanneer hij loopt: doorlopend of tot het stopmoment'
status: aanvaard
date: 2026-09-13
elements: [as-planning]
---

# 0143 — Een gebeurtenis zegt zelf tot wanneer hij loopt

## Context

De keuzehulp "Wat doe je met extra geld?" slaat de keuze *beleggen*, *aflossen* of
*noodfonds* op als levensgebeurtenis met een maandbedrag en duur 0 (doorlopend). Voor de
horizon-kernel is een doorlopende maandbate een Geb-post zonder eind: hij telt in CF!H tot
leeftijd 100 — óók na het stopmoment. "Extra beleggen €1.700/mnd" leverde bij de eigenaar
zo'n €20k per jaar schijninkomen op in elk onttrekkingsjaar, en verscheen in de grafiek
Inkomen & Uitgaven onder het label "AOW & pensioen" (op leeftijd 58).

Voor de wat-als-schuifjes was hetzelfde lek al gedicht (`SLIDER_WORK_ORIGINS`, guard.ts):
die delta's lopen via het salaris-kanaal en vervallen bij FIRE. De gebeurtenissen hadden
geen manier om dat uit te drukken, en het formulier beloofde bij "Blijvend" letterlijk
"een structurele verandering die niet meer weggaat".

## Besluit

1. **De keuze staat in de gebeurtenis, niet in de rekenmotor.** Het blok "Blijvend" krijgt
   een verplichte keuze *Tot wanneer*: **Blijft doorlopen** of **Tot ik stop met werken**.
   Opgeslagen als `life_events.metadata.tot_stopmoment = true` (geen migratie). De
   rekenmotor classificeert events niet stil op naam of herkomst — eigenaarsbesluit 13 sep
   2026: "niet stilzwijgend in het berekenen".
2. **Eén mechanisme voor berekend én gekozen stopmoment.** De engine krijgt het stopmoment
   per run al als `fireAge` (door de solver gezocht of het vaste stop-anker, ADR 0129).
   `GebPost.eindBijStopmoment` kapt de post af op `min(eigen eind, fireMonth − 1)`; een post
   die pas op of na het stopmoment start vuurt niet.
3. **Hergebruik van de bestaande cashflow-vlag.** `SimCashflow.onlyWhileWorking` betekende
   al "telt alleen mee zolang je werkt"; `lifeEventsToCashflows` zet hem uit de metadata en
   de adapter vertaalt hem naar de post-vlag.
4. **Inert-by-default.** Zonder de sleutel is de kern-invoer letterlijk dezelfde vorm; de
   oracle-fixtures en bestaande events rekenen byte-identiek. Bestaande gebeurtenissen
   worden niet omgezet — de gebruiker ziet de keuze nu en past hem zelf aan.
5. **De levensgebeurtenis-sheet biedt dezelfde keuze**, met *Tot ik stop met werken* als
   zichtbare standaard wanneer de beslishulp hem opent (extra geld per maand komt uit je
   werk) en *Blijft doorlopen* vanuit de rekenhulp.
6. **Het label van CF!H in Inkomen & Uitgaven heet "Inkomsten uit gebeurtenissen"**: het
   is de som van álle positieve gebeurtenis-posten, niet alleen AOW en pensioen.

## Gevolgen

- Een nieuwe beslishulp-keuze verlaagt het plan in de onttrekkingsfase ten opzichte van
  vroeger; het berekende stopmoment kan daardoor gelijk blijven of later komen, nooit eerder
  (eigenschapstest `geb-eind-bij-stopmoment.test.ts`).
- Buiten oracle-domein, zelfde patroon als `potMutaties` (V9) en `stopAnker`: de Excel-export
  kent het veld niet.
- Niet in scope: het blok "Tijdelijk" (eindigt al op een vaste duur) en de eventbalken in de
  grafiek, die een doorlopend event nog tot de eindleeftijd tekenen.
