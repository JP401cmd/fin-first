---
id: 0094-euro-weergave-status-in-de-sidebar
title: De euro-weergave-status hangt in de sidebar, niet per grafiek
status: aanvaard
date: 2026-08-09
elements: [as-planning, as-vermogen, fn-toekomstplannen, app-comp, do-meta]
---

Vervangt ADR 0090 §8 (badge onzichtbaar in nominaal) en de badge-plaatsing uit ADR 0093 §12.
`EuroViewBadge` is verwijderd; de euro-weergave-status staat voortaan app-breed bovenaan de
sidebar en is in béíde standen zichtbaar — neutraal in de standaardstand, met horizon-accent
zodra de bedragen afwijken. De schakelaar blijft in het zoekscherm (⌘K).

## Context

ADR 0090 voerde één profiel-brede euro-weergave in (`'nominal'` = toekomstige euro's,
`'real'` = huidige euro's) en koos daarbij voor `EuroViewBadge`: een klikbare markering
per grafiek-oppervlak, **onzichtbaar in `'nominal'`** (0090 §8). ADR 0093 §12 legde de
plaatsing vast: op `/toekomst` in de chart-header, op `/overzicht` precies één, inline in
de hero-band van de mini-vermogensgrafiek.

Die opzet lost het gevaar — "welke meetlat lees ik hier?" — op per grafiek. In de
praktijk botste dat op twee dingen.

**De pillenbalk van de Toekomst-grafiek liep vol.** De badge stond daar als elfde pil
naast Scenario's, Marktcheck, Doel, Zonder je huis, Levensgebeurtenissen, Natuurlijke
mijlpalen, Overlays en de weergave-knoppen. Bij normale schermbreedtes viel die rij om in
twee regels — verticale ruimte die de grafiek zelf nodig heeft. De badge is daar het
minst noodzakelijke element: hij is geen grafiek-optie maar een app-brede status die
toevallig boven een grafiek stond.

**Onzichtbaar-in-nominaal beantwoordt de vraag niet.** Wie zich afvraagt "staan deze
bedragen in geld van vandaag?" krijgt in de standaardstand géén antwoord, alleen de
afwezigheid van een badge. Afwezigheid is pas informatie als je wéét dat aanwezigheid
iets betekent — en dat weet je niet zonder de badge ooit gezien te hebben.

De marktvergelijking wijst dezelfde kant op. [ProjectionLab] zet de schakelaar in een
Display-Options-menu boven de grafiek; [Boldin] in het Assumptions-tabblad. Allebei halen
ze de *knop* weg bij de grafiek. Géén van beide toont permanent wélke stand aanstaat —
precies het gat waar iemand een verkeerd getal leest.

[ProjectionLab]: https://projectionlab.com/help/todays-currency
[Boldin]: https://help.boldin.com/en/articles/9524475-new-feature-today-s-future-dollars-toggle

## Besluit

**1. Eén statusplek, app-breed: bovenaan de sidebar.** `SidebarEuroViewBadge` staat in de
weergave-sectie (`components/app/shell/sidebar.tsx`), samen met de perspectief-switcher.
Beide zijn profiel-brede weergavekeuzes die cross-device meereizen; ze horen in één blok
onder één kicker, niet als twee losse "Weergave"-secties boven elkaar.

**2. Altijd zichtbaar — dit vervangt 0090 §8.** De indicator toont in béíde standen welke
meetlat geldt. Dat is de hele reden dat hij bestaat.

**3. Maar niet even luid.** In `'nominal'` (de default, exact het beeld van vandaag) staat
de pill in neutrale ink zonder accent; in `'real'` krijgt hij het horizon-accent. Zo blijft
de geest van 0090 §8 overeind — de standaardstand maakt geen herrie — zonder de status te
verzwijgen. De afwijking springt eruit, de status blijft afleesbaar.

**4. De knop woont in het zoekscherm.** ⌘K → "Toon huidige/toekomstige euro's"
(`action:toggle-euro-view`, ongewijzigd sinds 0090). De sidebar-indicator is óók klikbaar
— een status die je meteen kunt omdraaien is goedkoper dan een status die je alleen mag
aankijken — maar hij is niet de primaire ingang.

**5. Grafieken dragen géén eigen badge meer.** `EuroViewBadge` is verwijderd, inclusief het
component zelf (`components/core/euro-view-badge.tsx`); de twee mounts op `/toekomst` en
`/overzicht` zijn weg. Dit overschrijft de plaatsingsregels in 0093 §12. De rest van 0093
— de deflatieklassen, de render-grens, de exempt-klassen, "geen tweede as-label" — blijft
onverkort gelden.

**6. Geen `calculations.ts`-entry.** Presentatie, geen rekenmotor — zelfde afweging als
0090 §9.

## Gevolgen

**Goed.** De vraag "welke euro's lees ik?" heeft nu één vast antwoord op één vaste plek,
zichtbaar op élk scherm — ook op oppervlakken die nooit een badge kregen. De pillenbalk van
de Toekomst-grafiek houdt alleen nog grafiek-opties over.

**Kosten.** De status staat verder weg van het getal waar hij over gaat. Op een scherm vol
bedragen is de sidebar een blik opzij in plaats van een blik ernaast. Dat is bewust: één
betrouwbare plek weegt zwaarder dan nabijheid die per oppervlak verschilt en op de helft
van de schermen ontbreekt.

**Vangrail.** `components/overview/mini-networth-chart.test.tsx` assert in béíde standen dat
dit oppervlak géén eigen weergave-knop draagt — anders sluipt de per-grafiek-markering
terug.

**Bewust open gelaten.** De Nominaal/Reëel-pill in `phase-detail-table` blijft bestaan.
Die is geen status maar een control óp de globale voorkeur (0090 §7), en staat in een
tabel waar de twee kolommen naast elkaar betekenis hebben.
