---
id: 0091-grafieken-onder-bedragmaskering
title: 'Grafieken onder bedragmaskering: geometrie blijft, bedragen verdwijnen, verhoudingen mogen'
status: aanvaard
date: 2026-08-08
elements: [as-budget, fn-budgetteren]
---

# 0091 — Grafieken onder bedragmaskering

## Context

De app kent een privacy-maskering voor euro-bedragen (`useMaskedAmounts`,
`formatMaskedCurrency`, `<MaskedAmount>`). Wat dat voor een **grafiek** precies
betekent — mag een as-tick een bedrag tonen? een referentielijn? een
percentage? — was tot nu toe niet vastgelegd. ADR 0089 stelde die Y-as-vraag
voor de grenzenpot-prestatieweergave expliciet uit ("bewust nog niet gebouwd").

Het bestaande precedent is aantoonbaar inconsistent:
`components/overview/transacties/category-history-chart.tsx` toont ongemaskeerde
as-waarden náást gemaskeerde tooltips — twee regels in dezelfde grafiek die
elkaar tegenspreken. Dezelfde vraag komt bij **elke** volgende grafiek terug;
dit is dus geen grenzenpot-detail maar een app-brede norm.

## Besluit

Drie lagen, in deze volgorde van "blijft altijd" naar "verdwijnt altijd":

1. **Geometrie/kleur/intensiteit blijft.** Staafhoogtes, celkleuren, lijnvormen,
   de *positie* van een referentielijn (bijvoorbeeld een limietlijn). Die dragen
   verhoudingen, geen bedragen — spiegelt het bestaande, al gedocumenteerde
   principe in `mini-networth-chart.tsx`.
2. **Elk euro-label maskeert.** As-ticks, staaflabels, tooltip-bedragen,
   headlines, legenda-bedragen, het bedrag ín een referentielijn-label. In SVG
   `<text>` via `formatMaskedCurrency(v, masked)`, in HTML via
   `<MaskedAmount>` — óók in `aria-label`/`title`-attributen, niet alleen
   zichtbare tekst. Geen uitzondering "omdat het maar een as is".
3. **Verhoudingen en richting blijven zichtbaar.** Percentages, "3 van de 12
   periodes boven je grens", de trendrichting en het bijbehorende icoon. Een
   percentage is relatief; naast een gemaskeerd absoluut bedrag onthult het
   niets. Zonder deze derde laag wordt een grafiek onder maskering
   betekenisloos en gaan mensen de maskering uitzetten — dat is een slechtere
   privacy-uitkomst dan een iets rijkere maskering.

Uitdrukkelijk: het teken (`signPrefix`) blijft verborgen zoals `MaskedAmount`
al doet; de richting mag alleen via woord/icoon, nooit via een los `−` naast
een gemaskeerd getal.

**Vierde regel, ontdekt tijdens de bouw van de grenzenpot-prestatieweergave:**
een **afgeleide tijdswaarde die lineair is in een gemaskeerd bedrag** (zoals
vrijheidstijd = bedrag ÷ dagtarief) maskeert **mee**. Ze zou laag 2 anders
alsnog uitspellen: uit "3 dagen vrijheid" en een bekend dagtarief is het
onderliggende bedrag terug te rekenen. Deze regel is toegepast op de
vrijheidstijd-regel in `spend-limit-period-chart.tsx`.

### Concreet voor een staafgrafiek met referentielijn

- Maskering aan ⇒ **geen numerieke Y-ticks** (bullets zijn ruis, geen
  informatie). Alleen de nullijn en de referentielijn blijven getekend.
- De referentielijn houdt haar positie én haar tekstlabel, maar het label
  verliest het bedrag (bijvoorbeeld "je grens" i.p.v. "€ 50").
- Maskering uit ⇒ de gebruikelijke ticks plus het bedrag op de referentielijn.
- Tooltips maskeren hun bedragen en tonen wél status, periode en aantal
  transacties.

### Concreet voor een heatmap

Een intensiteitsramp over bedragen (kleur ~ hoogte van het bedrag) is
**verboden onder elke modus**, niet alleen onder maskering: uit de kleur valt
anders een bedrag te reconstrueren. Discrete toestanden (bijvoorbeeld "geen
uitgaven / binnen / boven") zijn wel toegestaan — die coderen status, geen
bedrag, en zijn daardoor maskering-immuun.

### Onderscheid met `profiles.privacy_mode`

`profiles.privacy_mode` (AI-privacy: lokaal vs. cloud-AI) is een **andere
knop** met een verwarrend gelijkende naam. Bedragmaskering
(`useMaskedAmounts`) is een weergavevoorkeur voor wat er op het scherm staat;
AI-privacy bepaalt waar een AI-aanroep draait. Geen van beide schakelt de
ander in of uit.

## Openstaand — gesloten (2026-08-08, zie ADR 0093)

`components/app/horizon/sim-chart.tsx:28-33` (crosshair, geen
`useMaskedAmounts`) was een bekend maskeringslek, hier destijds bewust
uitgesteld omdat dat bestand op het moment van schrijven zwaar werd aangeraakt
door een parallelle euro-weergave-werkstroom (nominaal/reëel, ADR 0090) en een
fix hier gegarandeerd een merge-botsing had opgeleverd.

Gedicht in de euro-weergave-wave-2/3-release (ADR 0093, brok C).
`components/app/horizon/sim-chart.tsx` roept `useMaskedAmounts()` nu zelf aan
(fallback-context, geen prop, `SimChartProps` ongewijzigd); `fmtAbs(val,
masked)` maskeert alle zeven crosshair-bedragen (startPortfolio, liquide
vermogen, elke drijver/drukker, elk scenariopunt, elke wat-als-delta), de
losse `+`/`−` verdwijnen, en `chart-static-layers.tsx` laat de Y-as-ticks weg
terwijl de doellijnen hun woordlabel houden zonder bedrag. Geometrie is
aantoonbaar onveranderd — `components/app/horizon/sim-chart.test.tsx` bewijst
dat lijn- en padposities identiek zijn met en zonder maskering.

## Gevolgen

- `category-history-chart.tsx` (het bestaande, inconsistente precedent) is
  door deze ADR nog niet zelf hersteld — de regel geldt vanaf nu voor nieuwe
  en gewijzigde grafieken; bestaande inconsistenties worden bij hun eerstvolgende
  wijziging gelijkgetrokken.
- De grenzenpot-prestatiegrafiek en -heatmap (`spend-limit-period-chart.tsx`,
  `spend-limit-heatmap.tsx`) zijn de eerste implementatie van deze regel en
  dienen als referentie voor volgende grafieken.
- Het `sim-chart`-crosshair-lek is gedicht (zie "Openstaand — gesloten"
  hierboven); dit is geen openstaand punt meer.
